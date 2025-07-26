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
// Get messages for a friend
app.get('/api/friends/:userId/messages', async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.query.currentUserId; // Passed from client

  const { data, error } = await supabase
    .from('friend_messages')
    .select('*, sender:sender_id(username, avatar_url), reply_to:reply_to_message_id(*, sender:sender_id(username, avatar_url))')
    .or(`(sender_id.eq.${currentUserId},receiver_id.eq.${userId}),(sender_id.eq.${userId},receiver_id.eq.${currentUserId})`)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

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

  // --- FRIENDS REAL-TIME MESSAGING ---
  socket.on('friend_message_send', async (msg, callback) => {
    // msg: { sender_id, receiver_id, content }
    if (!msg.sender_id || !msg.receiver_id || !msg.content) {
      if (callback) callback({ status: 'error', message: 'Missing data' });
      return;
    }
    const { data, error } = await supabase
      .from('friend_messages')
      .insert([
        {
          sender_id: msg.sender_id,
          receiver_id: msg.receiver_id,
          content: msg.content
        }
      ])
      .select('*, sender:sender_id(username, avatar_url)')
      .single();
    if (error) {
      if (callback) callback({ status: 'error', message: error.message });
      return;
    }

    // Emit to receiver if online
    const toSocketId = connectedUsers.get(msg.receiver_id);
    if (toSocketId) {
      io.to(toSocketId).emit('friend_message', data);
    }
    if (callback) callback({ status: 'ok' });
  });

  // --- DM EDIT ---
  socket.on('friend_message_edit', async (msg, callback) => {
    // msg: { message_id, new_content }
    const { message_id, new_content } = msg;
    if (!message_id || !new_content) {
      if (callback) callback({ status: 'error', message: 'Missing data' });
      return;
    }
    const { data, error } = await supabase
      .from('friend_messages')
      .update({ content: new_content, is_edited: true })
      .eq('id', message_id)
      .select('*')
      .single();
    if (error) {
      if (callback) callback({ status: 'error', message: error.message });
      return;
    }
    // Notify both users
    socket.emit('friend_message_update', data);
    const toSocketId = connectedUsers.get(data.receiver_id);
    if (toSocketId) io.to(toSocketId).emit('friend_message_update', data);
    if (callback) callback({ status: 'ok' });
  });

  // --- DM DELETE ---
  socket.on('friend_message_delete', async (msg, callback) => {
    // msg: { message_id }
    const { message_id } = msg;
    if (!message_id) {
      if (callback) callback({ status: 'error', message: 'Missing data' });
      return;
    }
    const { data, error } = await supabase
      .from('friend_messages')
      .update({ is_deleted: true, content: '(message deleted)' })
      .eq('id', message_id)
      .select('*')
      .single();
    if (error) {
      if (callback) callback({ status: 'error', message: error.message });
      return;
    }
    socket.emit('friend_message_update', data);
    const toSocketId = connectedUsers.get(data.receiver_id);
    if (toSocketId) io.to(toSocketId).emit('friend_message_update', data);
    if (callback) callback({ status: 'ok' });
  });

  // --- DM REACTION ---
  socket.on('friend_message_reaction', async (msg, callback) => {
    // msg: { message_id, user_id, emoji, action: 'add' | 'remove' }
    const { message_id, user_id, emoji, action } = msg;
    if (!message_id || !user_id || !emoji || !action) {
      if (callback) callback({ status: 'error', message: 'Missing data' });
      return;
    }
    let data, error;
    if (action === 'add') {
      ({ data, error } = await supabase
        .from('friend_message_reactions')
        .insert([{ message_id, user_id, emoji }])
        .select('*')
        .single());
    } else if (action === 'remove') {
      ({ data, error } = await supabase
        .from('friend_message_reactions')
        .delete()
        .eq('message_id', message_id)
        .eq('user_id', user_id)
        .eq('emoji', emoji)
        .select('*')
        .single());
    }
    if (error) {
      if (callback) callback({ status: 'error', message: error.message });
      return;
    }
    // Notify both users
    socket.emit('friend_message_reaction_update', { message_id, emoji, user_id, action });
    // Find the other user (sender or receiver)
    const { data: msgData } = await supabase.from('friend_messages').select('sender_id, receiver_id').eq('id', message_id).single();
    const otherUserId = msgData && (msgData.sender_id === user_id ? msgData.receiver_id : msgData.sender_id);
    const toSocketId = connectedUsers.get(otherUserId);
    if (toSocketId) io.to(toSocketId).emit('friend_message_reaction_update', { message_id, emoji, user_id, action });
    if (callback) callback({ status: 'ok' });
  });

  // --- DM REPLY ---
  socket.on('friend_message_reply', async (msg, callback) => {
    // msg: { sender_id, receiver_id, content, reply_to_message_id }
    if (!msg.sender_id || !msg.receiver_id || !msg.content || !msg.reply_to_message_id) {
      if (callback) callback({ status: 'error', message: 'Missing data' });
      return;
    }
    const { data, error } = await supabase
      .from('friend_messages')
      .insert([
        {
          sender_id: msg.sender_id,
          receiver_id: msg.receiver_id,
          content: msg.content,
          reply_to_message_id: msg.reply_to_message_id
        }
      ])
      .select('*, sender:sender_id(username, avatar_url), reply_to:reply_to_message_id(*, sender:sender_id(username, avatar_url))')
      .single();
    if (error) {
      if (callback) callback({ status: 'error', message: error.message });
      return;
    }
    const toSocketId = connectedUsers.get(msg.receiver_id);
    if (toSocketId) io.to(toSocketId).emit('friend_message', data);
    if (callback) callback({ status: 'ok' });
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

// 404 fallback (must be last)
app.use((req, res) => {
  res.status(404).send('404: Page not found');
}); 