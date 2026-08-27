# Hear This Mobile App (React Native Android)

A standalone React Native mobile app for **Hear This**, built with native Android **`AudioPlaybackCapture` & `MediaProjection`** support (Android 10+) to broadcast internal device sound, microphone audio, and act as a wireless speaker.

---

## Features

1. **Internal Screen / System Audio Broadcaster (Android 10+)**:
   - Streams audio from **YouTube, Spotify, games, or any app** on your phone directly to your PC or other phones in real-time.
   - Uses native Android `AudioPlaybackCaptureConfiguration` and `MediaProjection` foreground service.
2. **Microphone / Voice Broadcaster**:
   - Streams your voice live to all connected devices.
3. **Wireless Speaker (Receiver)**:
   - Connects to any PC broadcast room to play audio through your phone speakers with low-latency synchronization and visualizer.
4. **QR Code Scanner**:
   - Instant camera scanner to scan the room QR code displayed on the PC screen.
5. **Wake Lock Support**:
   - Keeps your phone screen active during audio streaming so playback is never interrupted.

---

## How to Run & Build

### 1. Prerequisites
- Node.js (v18+)
- Android SDK (installed via Android Studio) with `ANDROID_HOME` configured.

### 2. Install Dependencies
```bash
cd mobile
npm install
```

### 3. Run on Connected Android Phone or Emulator
Connect your Android phone with USB debugging enabled, then run:
```bash
npx expo run:android
# or
npm run android
```

### 4. Build Standalone Android APK
To generate a release APK:
```bash
cd android
./gradlew assembleRelease
```
The compiled APK will be located at:
`mobile/android/app/build/outputs/apk/release/app-release.apk`

---

## Architecture

```
mobile/
├── android/
│   └── app/src/main/
│       ├── AndroidManifest.xml                        # Declares FOREGROUND_SERVICE_MEDIA_PROJECTION
│       └── java/com/hearthis/
│           ├── AudioPlaybackCaptureService.kt        # Android 10+ AudioPlaybackCapture foreground service
│           ├── AudioPlaybackCaptureModule.kt         # React Native bridge & MediaProjection intent handler
│           └── MainApplication.kt                    # Registers native package
├── src/
│   ├── components/
│   │   └── AudioEngineBridge.jsx                     # WebRTC / Audio playback bridge
│   ├── config/
│   │   └── constants.js                              # Theme colors & backend URLs
│   ├── screens/
│   │   ├── HomeScreen.jsx                            # Mode selection & Room code entry
│   │   ├── SystemAudioSenderScreen.jsx               # Internal system audio broadcaster
│   │   ├── MicSenderScreen.jsx                       # Microphone broadcaster
│   │   ├── ReceiverScreen.jsx                        # Wireless speaker receiver
│   │   └── QrScanScreen.jsx                          # Camera QR code scanner
│   └── services/
│       ├── nativeAudio.js                            # JS wrapper for native Android module
│       └── socket.js                                 # Socket.IO connection manager
├── App.js                                            # Main screen router
└── package.json
```
