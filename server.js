// Basic Express + Socket.IO server for WOVO
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'https://wovo.onrender.com',
      'http://localhost:5500', // For local development
      'http://127.0.0.1:5500'  // For local development
    ],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000, // How long to wait before considering connection closed
  pingInterval: 25000 // How often to ping the client
});

// Enable CORS for Express routes
app.use(cors({
  origin: [
    'https://wovo.onrender.com',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ],
  credentials: true
}));

app.use(express.json());

// Serve static files from current directory (WOVO)
app.use(express.static(__dirname));

// Serve index.html as the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).send('404: Page not found');
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Store user ID when they connect
  socket.on('user_connected', (userId) => {
    console.log('User identified:', userId);
    socket.userId = userId;
    socket.join(`user_${userId}`); // Join a room specific to this user
  });

  // Handle friend request
  socket.on('send_friend_request', async (data) => {
    const { fromUserId, toUserId, fromUsername, fromAvatarUrl } = data;
    
    // Emit to the specific user's room
    io.to(`user_${toUserId}`).emit('friend_request_received', {
      fromUserId,
      fromUsername,
      fromAvatarUrl,
      timestamp: new Date().toISOString()
    });
  });

  // Handle friend request response
  socket.on('friend_request_response', (data) => {
    const { fromUserId, toUserId, accepted } = data;
    
    // Notify the original sender about the response
    io.to(`user_${fromUserId}`).emit('friend_request_responded', {
      fromUserId,
      toUserId,
      accepted,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
}); 