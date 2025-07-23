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
    origin: '*', // Allow all origins for dev; restrict in prod
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Serve static files from current directory (WOVO)
app.use(express.static(__dirname));

// Serve index.html as the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 404 fallback
app.use((req, res) => {
  res.status(404).send('404: Page not found');
});

// Store connected users
const connectedUsers = new Map(); // userId -> socket.id

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // User authentication and mapping
  socket.on('authenticate', (userId) => {
    console.log('User authenticated:', userId);
    connectedUsers.set(userId, socket.id);
    socket.userId = userId; // Store userId in socket for easy access
  });

  // Handle friend request
  socket.on('send_friend_request', (data) => {
    const { toUserId, fromUser } = data;
    const toSocketId = connectedUsers.get(toUserId);
    
    if (toSocketId) {
      io.to(toSocketId).emit('friend_request', {
        type: 'friend_request',
        fromUser: fromUser,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle friend request response
  socket.on('friend_request_response', (data) => {
    const { toUserId, accepted, fromUser } = data;
    const toSocketId = connectedUsers.get(toUserId);
    
    if (toSocketId) {
      io.to(toSocketId).emit('friend_request_response', {
        type: 'friend_request_response',
        fromUser: fromUser,
        accepted: accepted,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Add group member left event handler
  socket.on('group_member_left', async (data) => {
    const { groupId, userId } = data;
    // Broadcast to all connected clients except sender
    socket.broadcast.emit('group_member_left', { groupId, userId });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
}); 