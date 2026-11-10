package de.liveoverlay.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import android.util.Base64
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import org.json.JSONObject

/**
 * Hülle für Weg 1: zeigt die Tablet-App (derselbe TypeScript-Code wie im Browser) als WebView und
 * reicht den Ton des Bedienungshilfe-Dienstes an sie weiter. Die App erkennt die Hülle an
 * window.OverlayNative und nutzt dann NativeAudio statt getUserMedia.
 */
class MainActivity : Activity(), AudioBus.Listener {
    private lateinit var web: WebView
    private val prefs by lazy { getSharedPreferences("overlay", MODE_PRIVATE) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        web = WebView(this)
        setContentView(web)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.mediaPlaybackRequiresUserGesture = false
        web.webViewClient = WebViewClient()
        web.webChromeClient = object : WebChromeClient() {
            // Falls die App doch das Browser-Mikrofon nutzt (Weg 2 in der Hülle).
            override fun onPermissionRequest(request: PermissionRequest) {
                request.grant(request.resources)
            }
        }
        web.addJavascriptInterface(Bridge(), "OverlayNative")
        AudioBus.setListener(this)
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        }
        val url = prefs.getString("url", null)
        if (url.isNullOrBlank()) askUrl() else web.loadUrl(url)
    }

    private fun askUrl() {
        val input = EditText(this).apply { setText(prefs.getString("url", "https://")) }
        AlertDialog.Builder(this)
            .setTitle(R.string.enter_url)
            .setView(input)
            .setPositiveButton(android.R.string.ok) { _, _ ->
                val u = input.text.toString().trim()
                prefs.edit().putString("url", u).apply()
                web.loadUrl(u)
            }
            .setCancelable(false)
            .show()
    }

    override fun onDestroy() {
        AudioBus.setListener(null)
        AudioBus.stop()
        web.destroy()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- Ton → WebView

    override fun onPcm(pcm: ByteArray, length: Int) {
        // Sofort kodieren: Der Dienst benutzt den Puffer für das nächste Paket wieder.
        val b64 = Base64.encodeToString(pcm, 0, length, Base64.NO_WRAP)
        web.post { web.evaluateJavascript("window.__overlayNative&&window.__overlayNative.pcm('$b64')", null) }
    }

    override fun onStatus(status: String) {
        val js = JSONObject.quote(status)
        web.post { web.evaluateJavascript("window.__overlayNative&&window.__overlayNative.status($js)", null) }
    }

    inner class Bridge {
        @JavascriptInterface
        fun start() {
            runOnUiThread {
                if (!AudioBus.serviceConnected()) {
                    // Dienst einmalig in den Bedienungshilfen einschalten (bei Installation außerhalb
                    // des Play Store vorher in den App-Infos „eingeschränkte Einstellungen" erlauben).
                    startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                    onStatus("error")
                } else {
                    AudioBus.start()
                }
            }
        }

        @JavascriptInterface
        fun stop() {
            AudioBus.stop()
        }

        @JavascriptInterface
        fun changeUrl() {
            runOnUiThread { askUrl() }
        }
    }
}
