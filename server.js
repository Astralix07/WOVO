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