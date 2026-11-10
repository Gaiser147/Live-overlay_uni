# Android-Hülle (Weg 1)

Kleine native App für das Galaxy Tab S9. Darin:

- **AudioCaptureService**, ein Bedienungshilfe-Dienst, der nur Ton aufnimmt (`VOICE_RECOGNITION`, 16 kHz mono). Laut Android-Kompatibilitätsregeln (CDD 5.4.5) darf so ein Dienst gleichzeitig mit einer weiteren App aufnehmen. TwinMind bleibt also das Archiv. Der Dienst wertet keine Bildschirm-Ereignisse aus und hat keinen eigenen Netzwerkzugriff.
- **MainActivity**: WebView mit der Overlay-App. Der Ton geht über `window.OverlayNative` / `window.__overlayNative` an die App. Mit `isClientSilenced()` warnt die App, falls Android die Aufnahme stumm schaltet.
- **SpikeActivity** („Overlay Mikro-Test“): Spike für Phase 0. Zeigt den Pegel, die Zahl stiller Pakete und wie oft Android stumm geschaltet hat.

## Phase-0-Spike

1. APK bauen (`gradle assembleDebug`, Android-SDK 35) und installieren (`adb install app/build/outputs/apk/debug/app-debug.apk`).
2. Einstellungen → Apps → Live-Overlay → ⋮ → **Eingeschränkte Einstellungen zulassen**. Das ist nötig, weil die App nicht aus dem Play Store kommt.
3. Bedienungshilfen → Installierte Apps → **Live-Overlay Ton** einschalten.
4. TwinMind starten und aufnehmen lassen, dann „Overlay Mikro-Test“ öffnen und auf **Start** tippen.
5. 10 Minuten laufen lassen: einmal mit ausgeschaltetem Bildschirm, einmal im Splitscreen.
6. Bestanden, wenn das TwinMind-Transkript keine Lücken hat, der Spike kaum stille Pakete zählt und „Stumm geschaltet: 0×“ anzeigt.

Klappt das nicht zuverlässig, gilt Weg 2: In der App die Tonquelle „Mikrofon im Browser“ wählen und „Ton zusätzlich speichern“ einschalten. Die Datei lädst du nach der Vorlesung bei TwinMind hoch.

## Bauen

`local.properties` mit `sdk.dir=…` anlegen, dann `gradle assembleDebug`. Mindestversion ist Android 10 (API 29).
