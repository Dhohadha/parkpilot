let ioInstance = null;

function initSocket(io) {
  ioInstance = io;

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on('join_lot', (lotId) => {
      socket.join(`lot_${lotId}`);
      console.log(`[Socket.IO] Client ${socket.id} joined room lot_${lotId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });
}

function broadcastSlotUpdate(lotId, slotData) {
  if (ioInstance) {
    ioInstance.to(`lot_${lotId}`).emit('slot:updated', slotData);
    ioInstance.emit('slot:updated', slotData); // also broadcast globally to all admin listeners
  }
}

function broadcastSessionCreated(lotId, sessionData) {
  if (ioInstance) {
    ioInstance.to(`lot_${lotId}`).emit('session:created', sessionData);
    ioInstance.emit('session:created', sessionData);
  }
}

function broadcastSessionCompleted(lotId, sessionData) {
  if (ioInstance) {
    ioInstance.to(`lot_${lotId}`).emit('session:completed', sessionData);
    ioInstance.emit('session:completed', sessionData);
  }
}

function broadcastStats(lotId, statsData) {
  if (ioInstance) {
    ioInstance.to(`lot_${lotId}`).emit('dashboard:stats', statsData);
    ioInstance.emit('dashboard:stats', statsData);
  }
}

module.exports = {
  initSocket,
  broadcastSlotUpdate,
  broadcastSessionCreated,
  broadcastSessionCompleted,
  broadcastStats
};
