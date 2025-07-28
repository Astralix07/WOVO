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

// Map to track connected users: userId -> socket.id
const connectedUsers = new Map();

// Track typing users per group
const typingUsers = new Map();

app.use(cors());
app.use(express.json());

// Serve static files from current directory (WOVO)
app.use(express.static(__dirname));

// Serve index.html as the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Group Messaging API ---
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Get messages for a group
app.get('/api/groups/:groupId/messages', async (req, res) => {
  const { groupId } = req.params;
  const { data, error } = await supabase
    .from('group_messages')
    .select('*, users(username, avatar_url), reply_to:reply_to_message_id(*, users(username, avatar_url))')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Post a new message to a group
app.post('/api/groups/:groupId/messages', async (req, res) => {
  const { groupId } = req.params;
  const { user_id, content } = req.body;
  if (!user_id || !content) return res.status(400).json({ error: 'Missing user_id or content' });
  const { data, error } = await supabase
    .from('group_messages')
    .insert([{ group_id: groupId, user_id, content }])
    .select('*, users(username, avatar_url)')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// --- Socket.IO for group messaging ---
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

  // Join group room
  socket.on('join_group', (groupId) => {
    socket.join(`group_${groupId}`);
  });
  // Leave group room
  socket.on('leave_group', (groupId) => {
    socket.leave(`group_${groupId}`);
  });

  // Handle typing indicator events
  socket.on('typing_start', (data) => {
    const { groupId, userId, username } = data;
    if (!groupId || !userId || !username) return;
    
    // Broadcast to other users in the group (excluding sender)
    socket.to(`group_${groupId}`).emit('user_typing_start', {
      userId,
      username,
      groupId
    });
  });

  socket.on('typing_stop', (data) => {
    const { groupId, userId } = data;
    if (!groupId || !userId) return;
    
    // Broadcast to other users in the group (excluding sender)
    socket.to(`group_${groupId}`).emit('user_typing_stop', {
      userId,
      groupId
    });
  });

  socket.on('typing', (groupId) => {
      if (!typingUsers.has(groupId)) {
          typingUsers.set(groupId, new Set());
      }
      typingUsers.get(groupId).add(socket.userId);

      // Broadcast to others in the group
      socket.to(groupId).emit('user_typing', {
          userId: socket.userId,
          groupId,
      });

      // Stop typing after 3 seconds of inactivity
      setTimeout(() => {
          if (typingUsers.has(groupId) && typingUsers.get(groupId).has(socket.userId)) {
              typingUsers.get(groupId).delete(socket.userId);
              socket.to(groupId).emit('user_stop_typing', {
                  userId: socket.userId,
                  groupId,
              });
          }
      }, 3000);
  });

  // Handle sending a message
  socket.on('group_message_send', async (msg, callback) => {
    // msg: { groupId, user_id, content, ... }
    if (!msg.groupId || !msg.user_id) {
        if (callback) callback({ status: 'error', message: 'Missing data' });
        return;
    }

    // --- Extract mentions from content ---
    const mentioned_users = [];
    if (msg.content) {
        const mentionRegex = /@\[(.+?)\]\((.+?)\)/g;
        let match;
        while ((match = mentionRegex.exec(msg.content)) !== null) {
            mentioned_users.push(match[2]);
        }
    }
    
    // Just save to DB. Real-time will handle broadcasting.
    const { error } = await supabase
      .from('group_messages')
      .insert([{ 
        group_id: msg.groupId, 
        user_id: msg.user_id, 
        content: msg.content || null, // Allow empty caption
        reply_to_message_id: msg.reply_to_message_id,
        media_url: msg.media_url,
        media_type: msg.media_type,
        client_temp_id: msg.client_temp_id,
        mentioned_users: mentioned_users.length > 0 ? mentioned_users : null
      }]);

    if (error) {
        console.error('Error saving message:', error);
        if (callback) callback({ status: 'error', message: error.message });
    } else {
        if (callback) callback({ status: 'ok' });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
    }
    // Clean up typing users on disconnect
    typingUsers.forEach((users, groupId) => {
        if (users.has(socket.userId)) {
            users.delete(socket.userId);
            socket.to(groupId).emit('user_stop_typing', {
                userId: socket.userId,
                groupId,
            });
        }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// 404 fallback (must be last)
app.use((req, res) => {
  res.status(404).send('404: Page not found');
}); 