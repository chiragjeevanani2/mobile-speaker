import { RoomManager } from '../utils/roomManager.js';
import { generateRoomId } from '../utils/helpers.js';

const roomManager = new RoomManager(
  parseInt(process.env.ROOM_EXPIRATION_MS) || 900000 // 15 minutes
);

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Create a new room (sender/PC)
    socket.on('create-room', (callback) => {
      const roomId = generateRoomId();
      roomManager.createRoom(roomId, socket.id);

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.role = 'sender';

      console.log(`[Room] Created room ${roomId} by ${socket.id}`);

      if (typeof callback === 'function') {
        callback({ success: true, roomId });
      }
    });

    // Join an existing room (receiver/phone)
    socket.on('join-room', ({ roomId }, callback) => {
      const room = roomManager.getRoom(roomId);

      if (!room) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Room not found or expired' });
        }
        return;
      }

      if (room.expired) {
        roomManager.deleteRoom(roomId);
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Room has expired' });
        }
        return;
      }

      if (room.receiverSocketId) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Room is full' });
        }
        return;
      }

      roomManager.setReceiver(roomId, socket.id);

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.role = 'receiver';

      console.log(`[Room] Receiver ${socket.id} joined room ${roomId}`);

      // Notify the sender that a receiver has joined
      io.to(room.senderSocketId).emit('receiver-joined', {
        receiverSocketId: socket.id,
      });

      if (typeof callback === 'function') {
        callback({ success: true, roomId });
      }
    });

    // WebRTC signaling: SDP Offer
    socket.on('offer', ({ to, offer }) => {
      console.log(`[Signaling] Offer from ${socket.id} to ${to}`);
      io.to(to).emit('offer', {
        from: socket.id,
        offer,
      });
    });

    // WebRTC signaling: SDP Answer
    socket.on('answer', ({ to, answer }) => {
      console.log(`[Signaling] Answer from ${socket.id} to ${to}`);
      io.to(to).emit('answer', {
        from: socket.id,
        answer,
      });
    });

    // WebRTC signaling: ICE Candidate
    socket.on('ice-candidate', ({ to, candidate }) => {
      io.to(to).emit('ice-candidate', {
        from: socket.id,
        candidate,
      });
    });

    // Peer disconnected
    socket.on('peer-disconnect', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const peerId =
        socket.data.role === 'sender' ? room.receiverSocketId : room.senderSocketId;

      if (peerId) {
        io.to(peerId).emit('peer-disconnected', {
          role: socket.data.role,
        });
      }

      // If the sender disconnects, destroy the room
      if (socket.data.role === 'sender') {
        roomManager.deleteRoom(roomId);
        console.log(`[Room] Sender disconnected, room ${roomId} destroyed`);
      } else {
        // If receiver disconnects, just clear the receiver slot
        roomManager.clearReceiver(roomId);
        console.log(`[Room] Receiver left room ${roomId}`);

        // Notify sender
        if (room.senderSocketId) {
          io.to(room.senderSocketId).emit('receiver-left');
        }
      }
    });

    // Disconnect event
    socket.on('disconnect', () => {
      const roomId = socket.data.roomId;
      if (!roomId) {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
        return;
      }

      const room = roomManager.getRoom(roomId);
      if (!room) {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
        return;
      }

      if (socket.data.role === 'sender') {
        // Notify any receiver and clean up
        if (room.receiverSocketId) {
          io.to(room.receiverSocketId).emit('peer-disconnected', {
            role: 'sender',
          });
        }
        roomManager.deleteRoom(roomId);
        console.log(`[Room] Sender left, room ${roomId} destroyed`);
      } else {
        // Notify sender
        roomManager.clearReceiver(roomId);
        if (room.senderSocketId) {
          io.to(room.senderSocketId).emit('receiver-left');
        }
        console.log(`[Room] Receiver left room ${roomId}`);
      }

      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
}
