plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "de.liveoverlay.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "de.liveoverlay.app"
        // Android 10: AudioRecordingConfiguration.isClientSilenced() und geteilte Audioaufnahme.
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

// Keine Bibliotheken nötig: WebView, AudioRecord und AccessibilityService kommen aus der Plattform.
