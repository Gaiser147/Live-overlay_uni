package de.liveoverlay.app

import android.accessibilityservice.AccessibilityService
import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioRecordingConfiguration
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent

/**
 * Weg 1: Bedienungshilfe-Dienst, der nur Ton aufnimmt.
 *
 * Laut Android-Kompatibilitätsregeln (CDD 5.4.5) darf ein AccessibilityService, der mit
 * VOICE_RECOGNITION aufnimmt, gleichzeitig mit mindestens einer weiteren App aufnehmen.
 * TwinMind nimmt also weiter auf. Ob One UI das auf dem Tab S9 genauso umsetzt, prüft der
 * Spike in Phase 0 (SpikeActivity).
 *
 * Der Dienst wertet keine Bildschirm-Ereignisse aus und öffnet keine Netzwerkverbindung.
 * Der Ton geht nur an die WebView im selben Prozess.
 */
class AudioCaptureService : AccessibilityService() {
    private var record: AudioRecord? = null
    private var thread: Thread? = null
    @Volatile private var running = false
    private val main = Handler(Looper.getMainLooper())
    private var callback: AudioManager.AudioRecordingCallback? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        AudioBus.service = this
        Log.i(TAG, "Dienst verbunden")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Absichtlich leer: keine Bildschirm-Ereignisse auswerten.
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        stopCapture()
        if (AudioBus.service === this) AudioBus.service = null
        super.onDestroy()
    }

    @SuppressLint("MissingPermission") // RECORD_AUDIO fragt MainActivity / SpikeActivity vorher ab.
    fun startCapture() {
        if (running) return
        val minBuf = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val rec = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                maxOf(minBuf, FRAME_BYTES * 4),
            )
        } catch (e: Exception) {
            Log.e(TAG, "AudioRecord", e)
            AudioBus.status("error")
            return
        }
        if (rec.state != AudioRecord.STATE_INITIALIZED) {
            AudioBus.status("error")
            rec.release()
            return
        }
        record = rec
        watchSilencing(rec)
        AudioBus.status("starting")
        rec.startRecording()
        running = true
        thread = Thread({
            val buf = ByteArray(FRAME_BYTES)
            AudioBus.status("running")
            while (running) {
                var off = 0
                while (off < FRAME_BYTES && running) {
                    val n = rec.read(buf, off, FRAME_BYTES - off)
                    if (n <= 0) break
                    off += n
                }
                if (off > 0) AudioBus.emit(buf, off)
            }
        }, "overlay-audio").also { it.start() }
    }

    fun stopCapture() {
        running = false
        thread?.join(500)
        thread = null
        record?.let {
            try {
                it.stop()
            } catch (_: IllegalStateException) {
            }
            it.release()
        }
        record = null
        callback?.let { getSystemService(AudioManager::class.java).unregisterAudioRecordingCallback(it) }
        callback = null
        AudioBus.status("stopped")
    }

    /**
     * Warnt, wenn Android unsere Aufnahme stumm schaltet (z. B. weil eine andere App den Ton bekommt).
     * Umgekehrt sieht man so auch, ob TwinMind stumm geschaltet würde: Dann bekäme nur diese App Ton.
     */
    private fun watchSilencing(rec: AudioRecord) {
        val am = getSystemService(AudioManager::class.java)
        val cb = object : AudioManager.AudioRecordingCallback() {
            override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
                val mine = configs.firstOrNull { it.clientAudioSessionId == rec.audioSessionId } ?: return
                AudioBus.status(if (mine.isClientSilenced) "silenced" else "running")
            }
        }
        am.registerAudioRecordingCallback(cb, main)
        callback = cb
    }

    companion object {
        private const val TAG = "OverlayAudio"
        const val RATE = 16_000
        /** 100 ms PCM16 mono. */
        const val FRAME_BYTES = RATE / 10 * 2
    }
}
