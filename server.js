// Basic Express + Socket.IO server for WOVO
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

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

// Basic test route
app.get('/', (req, res) => {
  res.send('WOVO Socket.IO server running!');
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Example: handle a custom event
  socket.on('test', (data) => {
    console.log('Test event received:', data);
    socket.emit('test-reply', { msg: 'Hello from server!' });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
}); 