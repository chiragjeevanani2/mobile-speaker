import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { AudioPlaybackCapture } = NativeModules;

const isAndroid = Platform.OS === 'android';
export const isNativeCaptureAvailable = !!AudioPlaybackCapture;

const eventEmitter = AudioPlaybackCapture ? new NativeEventEmitter(AudioPlaybackCapture) : null;

/**
 * Start native Android internal system audio capture (YouTube, Spotify, Games, etc.)
 * @param {string} roomId
 * @param {string} serverUrl
 */
export async function startNativeSystemCapture(roomId, serverUrl) {
  if (!isAndroid) {
    throw new Error('System audio capture is only available on Android devices.');
  }

  if (!AudioPlaybackCapture) {
    throw new Error(
      'Native AudioPlaybackCapture module is not linked in this build. Please run via "npx expo run:android" or install the standalone APK.'
    );
  }

  return await AudioPlaybackCapture.startCapture(roomId, serverUrl);
}

/**
 * Stop native system audio capture
 */
export async function stopNativeSystemCapture() {
  if (AudioPlaybackCapture) {
    return await AudioPlaybackCapture.stopCapture();
  }
}

/**
 * Subscribe to native audio events (audio-chunk, audio-level, error, state-change)
 */
export function addNativeAudioListener(eventName, callback) {
  if (eventEmitter) {
    return eventEmitter.addListener(eventName, callback);
  }
  return { remove: () => {} };
}
