import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../config/constants';
import { connectSocket, disconnectSocket, getServerUrl } from '../services/socket';
import {
  startNativeSystemCapture,
  stopNativeSystemCapture,
  addNativeAudioListener,
  isNativeCaptureAvailable,
} from '../services/nativeAudio';

export default function SystemAudioSenderScreen({ onNavigate }) {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [connectedPhones, setConnectedPhones] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [copied, setCopied] = useState(false);

  const socketRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    // Listen for native audio level updates
    const levelSub = addNativeAudioListener('audio-level', (event) => {
      if (event && event.level !== undefined) {
        setAudioLevel(event.level);
      }
    });

    const stateSub = addNativeAudioListener('state-change', (event) => {
      if (event?.state === 'stopped') {
        setIsBroadcasting(false);
      }
    });

    return () => {
      levelSub.remove();
      stateSub.remove();
      handleStopBroadcast();
    };
  }, []);

  const handleStartBroadcast = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      // 1. Connect to signaling server & create room
      const socket = await connectSocket();
      socketRef.current = socket;

      const newRoomId = await new Promise((resolve, reject) => {
        socket.emit('create-room', (res) => {
          if (res?.success) resolve(res.roomId);
          else reject(new Error(res?.error || 'Failed to create room'));
        });
      });

      setRoomId(newRoomId);

      socket.on('receiver-joined', ({ totalReceivers }) => {
        setConnectedPhones(totalReceivers || 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      });

      socket.on('receiver-left', ({ totalReceivers }) => {
        setConnectedPhones(totalReceivers || 0);
      });

      // 2. Start Native Android System Audio Capture
      const serverUrl = getServerUrl();
      if (isNativeCaptureAvailable) {
        await startNativeSystemCapture(newRoomId, serverUrl);
      } else {
        Alert.alert(
          'Native Module Required',
          'To capture system audio, this app must be built with Android native code (run via "npx expo run:android" or install the standalone APK).'
        );
      }

      setIsBroadcasting(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('Start error:', err);
      Alert.alert('Broadcast Error', err.message || 'Failed to start system audio capture.');
      handleStopBroadcast();
    }
  };

  const handleStopBroadcast = async () => {
    try {
      await stopNativeSystemCapture();
    } catch {}

    if (socketRef.current) {
      socketRef.current.emit('peer-disconnect');
      disconnectSocket();
      socketRef.current = null;
    }

    setIsBroadcasting(false);
    setRoomId(null);
    setConnectedPhones(0);
    setAudioLevel(0);
  };

  const handleCopyLink = async () => {
    if (!roomId) return;
    const url = `https://mobile-speaker-cj.vercel.app/speaker/${roomId}`;
    try {
      await Share.share({ message: url });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleShare = async () => {
    if (!roomId) return;
    try {
      await Share.share({
        message: `Join my live phone audio broadcast on Hear This! Room Code: ${roomId}\nhttps://mobile-speaker-cj.vercel.app/speaker/${roomId}`,
      });
    } catch {}
  };

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            handleStopBroadcast();
            onNavigate('home');
          }}
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Internal Screen Sound</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!isBroadcasting ? (
          /* Pre-broadcast setup card */
          <View style={styles.setupCard}>
            <View style={styles.iconCircle}>
              <Ionicons name="tv-outline" size={40} color="#ffffff" />
            </View>

            <Text style={styles.setupTitle}>Stream Phone Audio</Text>
            <Text style={styles.setupDesc}>
              Stream sound from YouTube, Spotify, games, or any app on this phone to your PC or other phones in real-time.
            </Text>

            <View style={styles.infoBanner}>
              <Ionicons name="information-circle-outline" size={20} color={COLORS.accent} />
              <Text style={styles.infoBannerText}>
                Android will prompt for screen recording consent. Select <Text style={{ fontWeight: 'bold' }}>"Start now"</Text> to allow capturing internal sound.
              </Text>
            </View>

            <TouchableOpacity style={styles.startBtn} onPress={handleStartBroadcast}>
              <Ionicons name="radio" size={22} color="#ffffff" />
              <Text style={styles.startBtnText}>Start Audio Broadcast</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Live broadcasting screen */
          <View style={styles.liveCard}>
            {/* Live Indicator */}
            <View style={styles.liveStatusRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE BROADCASTING</Text>
            </View>

            {/* Room Code Display */}
            <View style={styles.codeContainer}>
              <Text style={styles.codeLabel}>ROOM CODE</Text>
              <Text style={styles.codeText}>{roomId}</Text>
            </View>

            {/* Connected Speakers */}
            <View style={styles.speakersPill}>
              <Ionicons name="people-outline" size={16} color={COLORS.success} />
              <Text style={styles.speakersText}>
                {connectedPhones} Wireless Speaker{connectedPhones !== 1 ? 's' : ''} Connected
              </Text>
            </View>

            {/* Audio VU Meter */}
            <View style={styles.meterContainer}>
              <Text style={styles.meterLabel}>System Audio Level</Text>
              <View style={styles.meterBarBackground}>
                <View style={[styles.meterBarFill, { width: `${Math.min(100, audioLevel * 100)}%` }]} />
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                <Ionicons name="share-social-outline" size={18} color="#ffffff" />
                <Text style={styles.shareBtnText}>Share Link</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.copyBtn} onPress={handleCopyLink}>
                <Ionicons
                  name={copied ? 'checkmark-circle-outline' : 'copy-outline'}
                  size={18}
                  color={copied ? COLORS.success : COLORS.textPrimary}
                />
                <Text style={[styles.copyBtnText, copied && { color: COLORS.success }]}>
                  {copied ? 'Copied' : 'Copy Code'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Stop Button */}
            <TouchableOpacity style={styles.stopBtn} onPress={handleStopBroadcast}>
              <Ionicons name="stop-circle-outline" size={20} color="#ffffff" />
              <Text style={styles.stopBtnText}>Stop Broadcasting</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  setupCard: {
    width: '100%',
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  setupTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  setupDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.bgPrimary,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  liveCard: {
    width: '100%',
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  liveStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.successLight,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.success,
    letterSpacing: 0.5,
  },
  codeContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: 4,
  },
  codeText: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 6,
  },
  speakersPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.bgPrimary,
    borderColor: COLORS.border,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 24,
  },
  speakersText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  meterContainer: {
    width: '100%',
    marginBottom: 24,
  },
  meterLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 6,
    fontWeight: '600',
  },
  meterBarBackground: {
    width: '100%',
    height: 10,
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 5,
    overflow: 'hidden',
  },
  meterBarFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 5,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginBottom: 16,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    borderRadius: 12,
  },
  shareBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  copyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.bgCardHover,
    borderColor: COLORS.border,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
  },
  copyBtnText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    backgroundColor: COLORS.error,
    paddingVertical: 14,
    borderRadius: 14,
  },
  stopBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
