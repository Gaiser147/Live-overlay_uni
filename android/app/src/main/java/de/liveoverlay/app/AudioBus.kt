package de.liveoverlay.app

/**
 * Verbindet den Bedienungshilfe-Dienst (nimmt auf) mit der Oberfläche (WebView oder Spike).
 * Beide leben im selben Prozess.
 */
object AudioBus {
    interface Listener {
        /** PCM16, 16 kHz, mono, 100 ms je Paket. */
        fun onPcm(pcm: ByteArray, length: Int)

        /** "starting", "running", "silenced", "stopped", "error" */
        fun onStatus(status: String)
    }

    @Volatile
    var service: AudioCaptureService? = null
        internal set

    @Volatile
    private var listener: Listener? = null

    fun setListener(l: Listener?) {
        listener = l
    }

    fun serviceConnected(): Boolean = service != null

    fun start(): Boolean {
        val s = service ?: run {
            listener?.onStatus("error")
            return false
        }
        s.startCapture()
        return true
    }

    fun stop() {
        service?.stopCapture()
    }

    internal fun emit(pcm: ByteArray, length: Int) {
        listener?.onPcm(pcm, length)
    }

    internal fun status(s: String) {
        listener?.onStatus(s)
    }
}
