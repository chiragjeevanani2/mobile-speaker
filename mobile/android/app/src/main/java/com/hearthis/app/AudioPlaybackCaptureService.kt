package com.hearthis.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.Base64
import androidx.core.app.NotificationCompat
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.sqrt

class AudioPlaybackCaptureService : Service() {

    private var mediaProjection: MediaProjection? = null
    private var audioRecord: AudioRecord? = null
    private val isRecording = AtomicBoolean(false)
    private var recordThread: Thread? = null
    private var socket: Socket? = null

    companion object {
        const val ACTION_START = "com.hearthis.ACTION_START"
        const val ACTION_STOP = "com.hearthis.ACTION_STOP"
        const val EXTRA_RESULT_CODE = "EXTRA_RESULT_CODE"
        const val EXTRA_DATA = "EXTRA_DATA"
        const val EXTRA_ROOM_ID = "EXTRA_ROOM_ID"
        const val EXTRA_SERVER_URL = "EXTRA_SERVER_URL"
        const val NOTIFICATION_CHANNEL_ID = "hear_this_capture_channel"
        const val NOTIFICATION_ID = 9021

        var onAudioLevelListener: ((Float) -> Unit)? = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action

        if (action == ACTION_STOP) {
            stopCapture()
            stopForeground(true)
            stopSelf()
            return START_NOT_STICKY
        }

        if (action == ACTION_START && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
            val data = intent.getParcelableExtra<Intent>(EXTRA_DATA)
            val roomId = intent.getStringExtra(EXTRA_ROOM_ID) ?: ""
            val serverUrl = intent.getStringExtra(EXTRA_SERVER_URL) ?: "https://mobile-speaker-backend.onrender.com"

            if (resultCode == Activity.RESULT_OK && data != null) {
                startForegroundServiceNotification()
                startCapture(resultCode, data, roomId, serverUrl)
            }
        }

        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Screen Audio Capture",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Broadcasting internal phone sound"
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun startForegroundServiceNotification() {
        val notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Hear This: Broadcasting Audio")
            .setContentText("Streaming internal phone sound live to connected devices...")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startCapture(resultCode: Int, data: Intent, roomId: String, serverUrl: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return

        val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = projectionManager.getMediaProjection(resultCode, data)

        val config = AudioPlaybackCaptureConfiguration.Builder(mediaProjection!!)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .addMatchingUsage(AudioAttributes.USAGE_GAME)
            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
            .build()

        val sampleRate = 48000
        val channelConfig = AudioFormat.CHANNEL_IN_STEREO
        val audioFormat = AudioFormat.ENCODING_PCM_16BIT
        val minBufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
        val bufferSize = minBufferSize * 2

        try {
            audioRecord = AudioRecord.Builder()
                .setAudioPlaybackCaptureConfig(config)
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(audioFormat)
                        .setSampleRate(sampleRate)
                        .setChannelMask(channelConfig)
                        .build()
                )
                .setBufferSizeInBytes(bufferSize)
                .build()

            // Initialize Socket.IO connection for real-time PCM transmission
            val opts = IO.Options().apply {
                transports = arrayOf("websocket", "polling")
            }
            socket = IO.socket(serverUrl, opts).apply {
                connect()
            }

            audioRecord?.startRecording()
            isRecording.set(true)

            recordThread = Thread {
                val buffer = ShortArray(1024) // 1024 stereo frames
                val byteBuffer = ByteArray(buffer.size * 2)

                while (isRecording.get()) {
                    val readCount = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                    if (readCount > 0) {
                        // Compute RMS audio level
                        var sum = 0.0
                        for (i in 0 until readCount) {
                            val sample = buffer[i]
                            byteBuffer[i * 2] = (sample.toInt() and 0xFF).toByte()
                            byteBuffer[i * 2 + 1] = ((sample.toInt() shr 8) and 0xFF).toByte()
                            sum += (sample * sample).toDouble()
                        }
                        val rms = sqrt(sum / readCount)
                        val normalizedLevel = (rms / 32768.0).toFloat().coerceIn(0f, 1f)
                        onAudioLevelListener?.invoke(normalizedLevel)

                        // Send audio chunk to room over WebSocket
                        val base64Chunk = Base64.encodeToString(byteBuffer, 0, readCount * 2, Base64.NO_WRAP)
                        val payload = JSONObject().apply {
                            put("roomId", roomId)
                            put("chunk", base64Chunk)
                        }
                        socket?.emit("audio-chunk", payload)
                    }
                }
            }.apply {
                priority = Thread.MAX_PRIORITY
                start()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun stopCapture() {
        isRecording.set(false)
        try {
            recordThread?.join(500)
        } catch (e: InterruptedException) {}
        recordThread = null

        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (e: Exception) {}
        audioRecord = null

        try {
            mediaProjection?.stop()
        } catch (e: Exception) {}
        mediaProjection = null

        try {
            socket?.disconnect()
            socket?.close()
        } catch (e: Exception) {}
        socket = null
    }

    override fun onDestroy() {
        stopCapture()
        super.onDestroy()
    }
}
