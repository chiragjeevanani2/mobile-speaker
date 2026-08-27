package com.hearthis.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class AudioPlaybackCaptureModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var pendingPromise: Promise? = null
    private var targetRoomId: String = ""
    private var targetServerUrl: String = ""

    companion object {
        const val REQUEST_MEDIA_PROJECTION = 9021
    }

    init {
        reactContext.addActivityEventListener(this)
        AudioPlaybackCaptureService.onAudioLevelListener = { level ->
            sendEvent("audio-level", Arguments.createMap().apply {
                putDouble("level", level.toDouble())
            })
        }
    }

    override fun getName(): String = "AudioPlaybackCapture"

    private fun sendEvent(eventName: String, params: WritableMap) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    @ReactMethod
    fun startCapture(roomId: String, serverUrl: String, promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            promise.reject("UNSUPPORTED", "Internal system audio capture requires Android 10 (API Level 29) or higher.")
            return
        }

        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Activity is null")
            return
        }

        targetRoomId = roomId
        targetServerUrl = serverUrl
        pendingPromise = promise

        val projectionManager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val captureIntent = projectionManager.createScreenCaptureIntent()
        activity.startActivityForResult(captureIntent, REQUEST_MEDIA_PROJECTION)
    }

    @ReactMethod
    fun stopCapture(promise: Promise) {
        val intent = Intent(reactContext, AudioPlaybackCaptureService::class.java).apply {
            action = AudioPlaybackCaptureService.ACTION_STOP
        }
        reactContext.startService(intent)
        sendEvent("state-change", Arguments.createMap().apply {
            putString("state", "stopped")
        })
        promise.resolve(true)
    }

    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQUEST_MEDIA_PROJECTION) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                val serviceIntent = Intent(reactContext, AudioPlaybackCaptureService::class.java).apply {
                    action = AudioPlaybackCaptureService.ACTION_START
                    putExtra(AudioPlaybackCaptureService.EXTRA_RESULT_CODE, resultCode)
                    putExtra(AudioPlaybackCaptureService.EXTRA_DATA, data)
                    putExtra(AudioPlaybackCaptureService.EXTRA_ROOM_ID, targetRoomId)
                    putExtra(AudioPlaybackCaptureService.EXTRA_SERVER_URL, targetServerUrl)
                }

                ContextCompat.startForegroundService(reactContext, serviceIntent)
                pendingPromise?.resolve(true)
            } else {
                pendingPromise?.reject("PERMISSION_DENIED", "Screen capture permission was denied by the user.")
            }
            pendingPromise = null
        }
    }

    override fun onNewIntent(intent: Intent?) {}
}
