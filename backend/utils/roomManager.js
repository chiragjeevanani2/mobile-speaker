export class RoomManager {
  constructor(expirationMs = 900000) {
    this.rooms = new Map();
    this.expirationMs = expirationMs;

    // Periodic cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000);
  }

  createRoom(roomId, senderSocketId) {
    const room = {
      id: roomId,
      senderSocketId,
      receiverSocketId: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      expired: false,
    };
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // Check expiration
    if (Date.now() - room.lastActivity > this.expirationMs) {
      room.expired = true;
      return room;
    }

    room.lastActivity = Date.now();
    return room;
  }

  setReceiver(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.receiverSocketId = socketId;
      room.lastActivity = Date.now();
    }
  }

  clearReceiver(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.receiverSocketId = null;
      room.lastActivity = Date.now();
    }
  }

  deleteRoom(roomId) {
    this.rooms.delete(roomId);
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [roomId, room] of this.rooms) {
      if (now - room.lastActivity > this.expirationMs) {
        this.rooms.delete(roomId);
        console.log(`[Room] Expired room ${roomId} cleaned up`);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.rooms.clear();
  }
}
