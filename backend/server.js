const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 10000;

const rawOrigins = process.env.CORS_ORIGIN || 'https://mobile-speaker-cj.vercel.app,http://localhost:5173';
const configuredOrigins = rawOrigins
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

function isAllowedOrigin(origin, callback) {
  // Allow requests with no origin (like health checks, server-to-server)
  if (!origin) {
    return callback(null, true);
  }

  const cleanOrigin = origin.replace(/\/+$/, '');

  const isAllowed =
    configuredOrigins.includes('*') ||
    configuredOrigins.includes(cleanOrigin) ||
    cleanOrigin.endsWith('.vercel.app') ||
    cleanOrigin.startsWith('http://localhost:') ||
    cleanOrigin.startsWith('http://127.0.0.1:');

  if (isAllowed) {
    return callback(null, true);
  }

  // Allow dynamically so WebRTC signaling does not get blocked by minor origin mismatches
  return callback(null, true);
}

app.use(
  cors({
    origin: isAllowedOrigin,
    credentials: true,
  })
);

app.use(express.json());

// === ROOM STATE (in-memory, no external imports) ===
const rooms = new Map();
const crypto = require('crypto');

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
}

// === ROUTES ===
app.get('/', (_req, res) => {
  res.send('Hear This server is running');
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), rooms: rooms.size });
});

app.get('/api/config', (_req, res) => {
  let iceServers;
  try {
    iceServers = JSON.parse(process.env.ICE_SERVERS || '[]');
  } catch (_err) {
    iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  }
  res.json({ iceServers });
});

// === HTTP SERVER & SOCKET.IO ===
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: isAllowedOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 10000,
});

const port = parseInt(process.env.PORT, 10) || 10000;

server.listen(port, '0.0.0.0', () => {
  console.log(`Hear This server listening on port ${port}`);
  console.log('CORS origins: ' + configuredOrigins.join(', '));
});

io.on('connection', (socket) => {
  console.log('Client connected: ' + socket.id);

  socket.on('create-room', (callback) => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      id: roomId,
      senderSocketId: socket.id,
      receiverSocketId: null,
      createdAt: Date.now(),
    });
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = 'sender';
    console.log('Created room ' + roomId);
    if (typeof callback === 'function') callback({ success: true, roomId });
  });

  socket.on('join-room', ({ roomId }, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
      return;
    }
    if (room.receiverSocketId) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room is full' });
      return;
    }
    room.receiverSocketId = socket.id;
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = 'receiver';
    io.to(room.senderSocketId).emit('receiver-joined', { receiverSocketId: socket.id });
    if (typeof callback === 'function') callback({ success: true, roomId });
  });

  socket.on('offer', ({ to, offer }) => {
    io.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  socket.on('peer-disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const peerId = socket.data.role === 'sender' ? room.receiverSocketId : room.senderSocketId;
    if (peerId) io.to(peerId).emit('peer-disconnected', { role: socket.data.role });
    if (socket.data.role === 'sender') {
      rooms.delete(roomId);
    } else {
      room.receiverSocketId = null;
      if (room.senderSocketId) io.to(room.senderSocketId).emit('receiver-left');
    }
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    if (socket.data.role === 'sender') {
      if (room.receiverSocketId) io.to(room.receiverSocketId).emit('peer-disconnected', { role: 'sender' });
      rooms.delete(roomId);
    } else {
      room.receiverSocketId = null;
      if (room.senderSocketId) io.to(room.senderSocketId).emit('receiver-left');
    }
  });
});

// Cleanup expired rooms every 60s
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.createdAt > 900000) {
      rooms.delete(id);
      console.log('Cleaned up expired room ' + id);
    }
  }
}, 60000);

server.on('error', (err) => {
  console.error('Server error: ' + err.message);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught: ' + err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled: ' + String(reason));
});
