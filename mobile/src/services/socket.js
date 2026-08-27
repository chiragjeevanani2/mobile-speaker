import { io } from 'socket.io-client';
import { DEFAULT_SERVER_URL, DEFAULT_ICE_SERVERS } from '../config/constants';

let socket = null;
let currentServerUrl = DEFAULT_SERVER_URL;

export function setServerUrl(url) {
  if (url && url !== currentServerUrl) {
    currentServerUrl = url.trim().replace(/\/+$/, '');
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  }
}

export function getServerUrl() {
  return currentServerUrl;
}

export function getSocket() {
  if (!socket || socket.disconnected) {
    socket = io(currentServerUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 30,
      reconnectionDelay: 1000,
      timeout: 60000,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function connectSocket() {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (s.connected) {
      resolve(s);
      return;
    }

    const onConnect = () => {
      s.off('connect_error', onError);
      resolve(s);
    };

    const onError = (err) => {
      s.off('connect', onConnect);
      reject(err);
    };

    s.once('connect', onConnect);
    s.once('connect_error', onError);
    s.connect();
  });
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export async function fetchIceServers() {
  try {
    const res = await fetch(`${currentServerUrl}/api/config`);
    const data = await res.json();
    return data.iceServers || DEFAULT_ICE_SERVERS;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
}
