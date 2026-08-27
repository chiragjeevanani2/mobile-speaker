import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from './src/config/constants';
import HomeScreen from './src/screens/HomeScreen';
import ReceiverScreen from './src/screens/ReceiverScreen';
import SystemAudioSenderScreen from './src/screens/SystemAudioSenderScreen';
import MicSenderScreen from './src/screens/MicSenderScreen';
import QrScanScreen from './src/screens/QrScanScreen';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [screenParams, setScreenParams] = useState({});

  const navigate = (screenName, params = {}) => {
    setScreenParams(params);
    setCurrentScreen(screenName);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return <HomeScreen onNavigate={navigate} />;
      case 'receiver':
        return <ReceiverScreen roomId={screenParams.roomId} onNavigate={navigate} />;
      case 'systemSender':
        return <SystemAudioSenderScreen onNavigate={navigate} />;
      case 'micSender':
        return <MicSenderScreen onNavigate={navigate} />;
      case 'scanner':
        return <QrScanScreen onNavigate={navigate} />;
      default:
        return <HomeScreen onNavigate={navigate} />;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor={COLORS.bgPrimary} />
      {renderScreen()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
});
