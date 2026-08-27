import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../config/constants';
import AudioEngineBridge from '../components/AudioEngineBridge';

export default function ReceiverScreen({ roomId, onNavigate }) {
  // Keep phone screen awake during playback
  useKeepAwake();

  const [state, setState] = useState('connecting');
  const [audioLevel, setAudioLevel] = useState(0);
  const [latency, setLatency] = useState(null);
  const [volume, setVolume] = useState(1.0);
  const [muted, setMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const toggleMute = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMuted(!muted);
  };

  const adjustVolume = (newVol) => {
    Haptics.selectionAsync();
    setVolume(Math.max(0, Math.min(1, newVol)));
  };

  return (
    <View style={styles.container}>
      {/* Headless Audio Engine Bridge */}
      <AudioEngineBridge
        role="receiver"
        roomId={roomId}
        volume={volume}
        muted={muted}
        onAudioLevel={setAudioLevel}
        onLatency={setLatency}
        onStateChange={(s) => setState(s)}
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
        <Text style={styles.topBarTitle}>Wireless Speaker</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          {/* Status Badge */}
          <View style={styles.badgeRow}>
            <View style={[styles.statusBadge, state === 'playing' ? styles.badgePlaying : styles.badgeConnecting]}>
              <View style={[styles.statusDot, state === 'playing' ? styles.dotPlaying : styles.dotConnecting]} />
              <Text style={[styles.statusBadgeText, state === 'playing' ? styles.textPlaying : styles.textConnecting]}>
                {state === 'playing' ? 'STREAMING AUDIO' : 'CONNECTING...'}
              </Text>
            </View>

            {latency !== null && (
              <View style={styles.latencyBadge}>
                <Ionicons name="wifi" size={12} color={COLORS.textMuted} />
                <Text style={styles.latencyText}>{latency} ms</Text>
              </View>
            )}
          </View>

          {/* Speaker Icon Visualizer */}
          <View style={styles.speakerVisualizer}>
            <View
              style={[
                styles.speakerPulseOuter,
                { transform: [{ scale: 1 + audioLevel * 0.4 }] },
              ]}
            >
              <View
                style={[
                  styles.speakerPulseInner,
                  { transform: [{ scale: 1 + audioLevel * 0.2 }] },
                ]}
              >
                <View style={styles.speakerCircle}>
                  <Ionicons
                    name={muted ? 'volume-mute' : 'volume-high'}
                    size={48}
                    color="#ffffff"
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Room Code */}
          <Text style={styles.codeLabel}>CONNECTED TO ROOM</Text>
          <Text style={styles.codeText}>{roomId}</Text>

          {/* Live Audio Level Meter */}
          <View style={styles.meterContainer}>
            <View style={styles.meterBarBackground}>
              <View style={[styles.meterBarFill, { width: `${Math.min(100, audioLevel * 100)}%` }]} />
            </View>
          </View>

          {/* Volume Controls */}
          <View style={styles.volumeCard}>
            <View style={styles.volumeHeader}>
              <Text style={styles.volumeTitle}>Speaker Volume</Text>
              <Text style={styles.volumePercent}>
                {muted ? 'MUTED' : `${Math.round(volume * 100)}%`}
              </Text>
            </View>

            <View style={styles.volumeButtonsRow}>
              <TouchableOpacity
                style={[styles.volBtn, muted && styles.volBtnActive]}
                onPress={toggleMute}
              >
                <Ionicons
                  name={muted ? 'volume-mute' : 'volume-medium'}
                  size={20}
                  color={muted ? COLORS.error : COLORS.textPrimary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.volStepBtn}
                onPress={() => adjustVolume(volume - 0.25)}
              >
                <Ionicons name="remove" size={20} color={COLORS.textPrimary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.volStepBtn}
                onPress={() => adjustVolume(volume + 0.25)}
              >
                <Ionicons name="add" size={20} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Error notice if any */}
          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          {/* Disconnect Button */}
          <TouchableOpacity
            style={styles.disconnectBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onNavigate('home');
            }}
          >
            <Ionicons name="close-circle-outline" size={20} color="#ffffff" />
            <Text style={styles.disconnectBtnText}>Leave Room</Text>
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
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgePlaying: {
    backgroundColor: COLORS.successLight,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderWidth: 1,
  },
  badgeConnecting: {
    backgroundColor: COLORS.warningLight,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotPlaying: {
    backgroundColor: COLORS.success,
  },
  dotConnecting: {
    backgroundColor: COLORS.warning,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  textPlaying: {
    color: COLORS.success,
  },
  textConnecting: {
    color: COLORS.warning,
  },
  latencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.bgPrimary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  latencyText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  speakerVisualizer: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  speakerPulseOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakerPulseInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakerCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginTop: 10,
  },
  codeText: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 4,
    marginBottom: 16,
  },
  meterContainer: {
    width: '100%',
    marginBottom: 20,
  },
  meterBarBackground: {
    width: '100%',
    height: 8,
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 4,
    overflow: 'hidden',
  },
  meterBarFill: {
    height: '100%',
    backgroundColor: COLORS.success,
    borderRadius: 4,
  },
  volumeCard: {
    width: '100%',
    backgroundColor: COLORS.bgPrimary,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  volumeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  volumeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  volumePercent: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
  },
  volumeButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  volBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.border,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 10,
  },
  volBtnActive: {
    borderColor: COLORS.error,
    backgroundColor: COLORS.errorLight,
  },
  volStepBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.border,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 10,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    backgroundColor: COLORS.bgPrimary,
    borderColor: COLORS.border,
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 14,
  },
  disconnectBtnText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
});
