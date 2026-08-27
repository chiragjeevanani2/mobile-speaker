import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../config/constants';
import AudioEngineBridge from '../components/AudioEngineBridge';

export default function MicSenderScreen({ onNavigate }) {
  const [roomId, setRoomId] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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
        message: `Join my live phone voice broadcast on Hear This! Room Code: ${roomId}\nhttps://mobile-speaker-cj.vercel.app/speaker/${roomId}`,
      });
    } catch {}
  };

  return (
    <View style={styles.container}>
      {/* Headless Audio Engine Bridge */}
      <AudioEngineBridge
        role="sender"
        audioMode="mic"
        onAudioLevel={setAudioLevel}
        onStateChange={(state, details) => {
          if (state === 'active' && details?.roomId) {
            setRoomId(details.roomId);
          }
        }}
        onError={(err) => setErrorMsg(err)}
      />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => onNavigate('home')}
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Phone Microphone</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.liveStatusRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>MICROPHONE ACTIVE</Text>
          </View>

          <View style={styles.micCircle}>
            <Ionicons name="mic" size={48} color="#ffffff" />
          </View>

          {roomId ? (
            <>
              <View style={styles.codeContainer}>
                <Text style={styles.codeLabel}>ROOM CODE</Text>
                <Text style={styles.codeText}>{roomId}</Text>
              </View>

              {/* Audio VU Meter */}
              <View style={styles.meterContainer}>
                <Text style={styles.meterLabel}>Microphone Input Level</Text>
                <View style={styles.meterBarBackground}>
                  <View style={[styles.meterBarFill, { width: `${Math.min(100, audioLevel * 100)}%` }]} />
                </View>
              </View>

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
            </>
          ) : (
            <Text style={styles.connectingText}>Creating broadcast room...</Text>
          )}

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <TouchableOpacity
            style={styles.stopBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onNavigate('home');
            }}
          >
            <Ionicons name="stop-circle-outline" size={20} color="#ffffff" />
            <Text style={styles.stopBtnText}>Stop Microphone Broadcast</Text>
          </TouchableOpacity>
        </View>
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
  card: {
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
    backgroundColor: COLORS.accentLight,
    borderColor: 'rgba(99, 102, 241, 0.3)',
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
    backgroundColor: COLORS.accent,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 0.5,
  },
  micCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  codeContainer: {
    alignItems: 'center',
    marginBottom: 20,
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
  connectingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginVertical: 20,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
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
