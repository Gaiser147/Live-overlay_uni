package de.liveoverlay.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

/**
 * Phase 0, Spike Mikrofon: Nimmt über den Bedienungshilfe-Dienst auf und zeigt den Pegel.
 * Bestanden, wenn TwinMind gleichzeitig 10 Minuten aufnimmt und beide vollständigen Ton haben,
 * auch bei ausgeschaltetem Bildschirm und im Splitscreen. Die Statistik unten hilft beim Prüfen:
 * Lücken = Sekunden ohne Pegel über der Stille-Schwelle, „stumm" = Android hat die Aufnahme stumm geschaltet.
 */
class SpikeActivity : Activity(), AudioBus.Listener {
    private lateinit var level: ProgressBar
    private lateinit var info: TextView
    private lateinit var stats: TextView
    private var started = 0L
    private var frames = 0
    private var quietFrames = 0
    private var silencedEvents = 0
    private var lastStatus = "–"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            setBackgroundColor(Color.rgb(15, 22, 38))
        }
        fun label(size: Float) = TextView(this).apply {
            setTextColor(Color.rgb(237, 230, 214))
            textSize = size
            typeface = Typeface.DEFAULT
        }
        root.addView(label(24f).apply { text = getString(R.string.spike_name) })
        info = label(18f)
        root.addView(info)
        level = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100 }
        root.addView(level, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (24 * resources.displayMetrics.density).toInt()))
        stats = label(16f)
        root.addView(stats)
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.START }
        row.addView(Button(this).apply { text = "Start"; setOnClickListener { start() } })
        row.addView(Button(this).apply { text = "Stopp"; setOnClickListener { AudioBus.stop() } })
        row.addView(Button(this).apply {
            text = "Bedienungshilfen"
            setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        })
        root.addView(row)
        setContentView(root)
        AudioBus.setListener(this)
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        }
        render()
    }

    private fun start() {
        started = SystemClock.elapsedRealtime()
        frames = 0
        quietFrames = 0
        silencedEvents = 0
        if (!AudioBus.start()) info.text = "Dienst nicht aktiv: in den Bedienungshilfen „Live-Overlay Ton“ einschalten."
    }

    override fun onDestroy() {
        AudioBus.setListener(null)
        AudioBus.stop()
        super.onDestroy()
    }

    override fun onPcm(pcm: ByteArray, length: Int) {
        var sum = 0.0
        var i = 0
        while (i + 1 < length) {
            val s = (pcm[i].toInt() and 0xff) or (pcm[i + 1].toInt() shl 8)
            val v = s.toShort() / 32768.0
            sum += v * v
            i += 2
        }
        val rms = sqrt(sum / max(1, length / 2))
        val db = 20 * log10(max(rms, 1e-6))
        frames++
        // Unter −60 dBFS gilt als Stille (stumm geschaltete Aufnahmen liefern exakt 0).
        if (db < -60) quietFrames++
        runOnUiThread {
            level.progress = ((db + 60) / 60 * 100).toInt().coerceIn(0, 100)
            render()
        }
    }

    override fun onStatus(status: String) {
        if (status == "silenced") silencedEvents++
        lastStatus = status
        runOnUiThread { render() }
    }

    private fun render() {
        val secs = if (started > 0) (SystemClock.elapsedRealtime() - started) / 1000 else 0
        info.text = "Dienst: ${if (AudioBus.serviceConnected()) "aktiv" else "aus"} · Status: $lastStatus"
        stats.text = "Laufzeit: ${secs / 60} min ${secs % 60} s\n" +
            "Pakete (100 ms): $frames · davon still: $quietFrames\n" +
            "Stumm geschaltet: $silencedEvents×"
    }
}
