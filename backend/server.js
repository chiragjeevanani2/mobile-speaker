import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupSocketHandlers } from './socket/handlers.js';

const app = express();

const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '');

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return origin.replace(/\/+$/, '') === CORS_ORIGIN;
}

app.use(cors({
  origin: isAllowedOrigin,
  credentials: true,
}));

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'hear-this' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/api/config', (_req, res) => {
  let iceServers;
  try {
    iceServers = JSON.parse(process.env.ICE_SERVERS || '[]');
  } catch (err) {
    iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  }
  res.json({ iceServers });
});

const port = parseInt(process.env.PORT, 10) || 3001;

// Create HTTP server and bind to all interfaces (required by Render)
const server = createServer(app);
server.listen(port, '0.0.0.0', () => {
  console.log('Hear This server running on port ' + port);
  console.log('CORS origin: ' + CORS_ORIGIN);
});

const io = new Server(server, {
  cors: {
    origin: isAllowedOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 10000,
});

setupSocketHandlers(io);

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
