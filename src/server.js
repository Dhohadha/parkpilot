const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/db');
const socketService = require('./services/socketService');

const publicRoutes = require('./routes/publicRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const server = http.createServer(app);

// Socket.IO Setup with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Static files for Public Web App UI
app.use(express.static(path.join(__dirname, '../public')));

// Initialize Socket.IO event handler
socketService.initSocket(io);

// API Routes
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    system: 'ParkPilot Smart QR Parking Backend',
    timestamp: new Date().toISOString()
  });
});

// Fallback route to serve public web app SPA
app.use((req, res) => {
  if (!req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, '../public/index.html'));
  }
  return res.status(404).json({ success: false, message: 'API Endpoint Not Found' });
});

// Start Server
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🚀 [ParkPilot Backend] Server running on http://localhost:${PORT}`);
    console.log(`📱 [Public Web Portal] http://localhost:${PORT}`);
    console.log(`🔌 [Socket.IO Hub] WebSocket listening on ws://localhost:${PORT}\n`);
  });
});

module.exports = { app, server };
