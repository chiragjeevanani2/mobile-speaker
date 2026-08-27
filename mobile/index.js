import { AppRegistry } from 'react-native';
import App from './App';

// Register all possible root component names to prevent launch crashes
AppRegistry.registerComponent('main', () => App);
AppRegistry.registerComponent('Hear This', () => App);
AppRegistry.registerComponent('HearThis', () => App);
AppRegistry.registerComponent('hear-this', () => App);
