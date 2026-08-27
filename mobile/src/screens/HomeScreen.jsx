import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../config/constants';
import { getServerUrl, setServerUrl } from '../services/socket';

export default function HomeScreen({ onNavigate }) {
  const [roomCode, setRoomCode] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState(getServerUrl());

  const handleJoinByCode = () => {
    const cleanCode = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanCode || cleanCode.length < 4) {
      Alert.alert('Invalid Code', 'Please enter a valid 6-character room code.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onNavigate('receiver', { roomId: cleanCode });
  };

  const handleSaveSettings = () => {
    setServerUrl(customServerUrl);
    setShowSettings(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Saved', 'Server URL updated successfully.');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Ionicons name="volume-high" size={36} color="#ffffff" />
          </View>
          <Text style={styles.title}>Hear This</Text>
          <Text style={styles.subtitle}>
            Turn your phone into a wireless speaker or broadcast internal sound & voice.
          </Text>
        </View>

        {/* Feature Tags */}
        <View style={styles.featureRow}>
          <View style={styles.featureTag}>
            <Ionicons name="flash" size={14} color={COLORS.accent} />
            <Text style={styles.featureText}>Ultra Low Latency</Text>
          </View>
          <View style={styles.featureTag}>
            <Ionicons name="shield-checkmark" size={14} color={COLORS.accent} />
            <Text style={styles.featureText}>Private Stream</Text>
          </View>
        </View>

        {/* Primary Action Card: Listen on Phone */}
        <View style={styles.card}>
          <View style={styles.badgeRow}>
            <View style={styles.greenBadge}>
              <Ionicons name="phone-portrait" size={12} color={COLORS.success} />
              <Text style={styles.greenBadgeText}>SPEAKER MODE</Text>
            </View>
            <Text style={styles.highlightBadge}>✨ Recommended</Text>
          </View>

          <Text style={styles.cardTitle}>Listen to PC Audio</Text>
          <Text style={styles.cardDesc}>
            Join a PC broadcast room to play audio through your phone speaker.
          </Text>

          {/* QR Code Scan Button */}
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onNavigate('scanner');
            }}
          >
            <Ionicons name="qr-code-outline" size={20} color="#ffffff" />
            <Text style={styles.scanBtnText}>Scan QR Code with Camera</Text>
          </TouchableOpacity>

          {/* Code Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="ENTER 6-DIGIT CODE"
              placeholderTextColor={COLORS.textMuted}
              value={roomCode}
              onChangeText={(t) => setRoomCode(t.toUpperCase().slice(0, 8))}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.joinBtn, (!roomCode || roomCode.length < 4) && styles.joinBtnDisabled]}
              disabled={!roomCode || roomCode.length < 4}
              onPress={handleJoinByCode}
            >
              <Text style={styles.joinBtnText}>Join</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Action Card: Broadcast from Android */}
        <View style={styles.card}>
          <View style={styles.badgeRow}>
            <View style={styles.purpleBadge}>
              <Ionicons name="radio" size={12} color={COLORS.accent} />
              <Text style={styles.purpleBadgeText}>BROADCASTER</Text>
            </View>
          </View>

          <Text style={styles.cardTitle}>Broadcast from this Phone</Text>
          <Text style={styles.cardDesc}>
            Stream internal system sound (YouTube, Spotify, Games) or microphone to other devices.
          </Text>

          {/* Button 1: Internal System Audio */}
          <TouchableOpacity
            style={styles.broadcastOptionBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onNavigate('systemSender');
            }}
          >
            <View style={styles.optionIconCircle}>
              <Ionicons name="tv-outline" size={20} color={COLORS.accent} />
            </View>
            <View style={styles.optionInfo}>
              <View style={styles.optionTitleRow}>
                <Text style={styles.optionTitle}>Internal Screen Sound</Text>
                <Text style={styles.androidPill}>Android 10+</Text>
              </View>
              <Text style={styles.optionDesc}>
                Stream audio from YouTube, Spotify, games, or apps directly to PC.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>

          {/* Button 2: Microphone Broadcaster */}
          <TouchableOpacity
            style={[styles.broadcastOptionBtn, { marginTop: 10 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onNavigate('micSender');
            }}
          >
            <View style={styles.optionIconCircle}>
              <Ionicons name="mic-outline" size={20} color={COLORS.accent} />
            </View>
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>Phone Microphone</Text>
              <Text style={styles.optionDesc}>
                Broadcast live voice / walkie-talkie audio to connected speakers.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Server Config & Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.serverSettingsBtn}
            onPress={() => setShowSettings(!showSettings)}
          >
            <Ionicons name="server-outline" size={14} color={COLORS.textMuted} />
            <Text style={styles.serverSettingsText}>
              Backend: {getServerUrl().replace(/^https?:\/\//, '')}
            </Text>
            <Ionicons name="settings-outline" size={14} color={COLORS.textMuted} />
          </TouchableOpacity>

          {showSettings && (
            <View style={styles.settingsBox}>
              <Text style={styles.settingsLabel}>Signaling Server URL:</Text>
              <TextInput
                style={styles.settingsInput}
                value={customServerUrl}
                onChangeText={setCustomServerUrl}
                placeholder="http://192.168.1.X:10000"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.saveSettingsBtn} onPress={handleSaveSettings}>
                <Text style={styles.saveSettingsText}>Save Server URL</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 40,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 320,
    lineHeight: 20,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  featureTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  featureText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  card: {
    width: '100%',
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    marginBottom: 18,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  greenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.successLight,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  greenBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
    letterSpacing: 0.5,
  },
  highlightBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
  },
  purpleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.accentLight,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  purpleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 16,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  scanBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgPrimary,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 10,
    letterSpacing: 1,
  },
  joinBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  joinBtnDisabled: {
    opacity: 0.5,
  },
  joinBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  broadcastOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgPrimary,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  optionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.bgCardHover,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionInfo: {
    flex: 1,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  androidPill: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
    backgroundColor: COLORS.accentLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  optionDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 6,
  },
  serverSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  serverSettingsText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  settingsBox: {
    width: '100%',
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
  },
  settingsLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 6,
    fontWeight: '600',
  },
  settingsInput: {
    backgroundColor: COLORS.bgPrimary,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: COLORS.textPrimary,
    fontSize: 13,
    marginBottom: 10,
  },
  saveSettingsBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveSettingsText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
