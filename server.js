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

  app.get('/api/friends/:friendId/messages', async (req, res) => {
    const { friendId } = req.params;
    const { include_reactions } = req.query;
    const currentUserId = req.headers['x-user-id']; // Assume user ID is sent in headers

    if (!currentUserId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    let query = supabase
        .from('friend_messages')
        .select(`
            *,
            reply_to:reply_to_message_id(*, sender:sender_id(username)),
            sender:sender_id(username, avatar_url),
            receiver:receiver_id(username, avatar_url)
            ${include_reactions ? ', friend_message_reactions(*, users(username))' : ''}
        `)
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
        .order('created_at', { ascending: true });

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching friend messages:', error);
        return res.status(500).json({ error: error.message });
    }
    res.json(data);
});

// --- FRIENDS REAL-TIME MESSAGING ---
  socket.on('friend_message_send', async (msg, callback) => {
    // msg: { sender_id, receiver_id, content, client_temp_id, reply_to_message_id }
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
          content: msg.content,
          client_temp_id: msg.client_temp_id,
          reply_to_message_id: msg.reply_to_message_id
        }
      ])
      // Fetch the message we just inserted, and if it's a reply,
      // also fetch the original message it replies to, and the original sender's username.
      .select('*, reply_to:reply_to_message_id(*, sender:sender_id(username))')
      .single();

    if (error) {
      console.error('Error saving friend message:', error);
      if (callback) callback({ status: 'error', message: error.message });
      return;
    }

    // 'data' now contains the new message, and a 'reply_to' object if it was a reply.
    
    // Emit to sender to confirm
    socket.emit('friend_message', data);

    // Emit to receiver if they are online
    const receiverSocketId = connectedUsers.get(msg.receiver_id);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('friend_message', data);
    }

    if (callback) callback({ status: 'ok' });
  });

  // Handle deleting a friend message
  socket.on('friend_message_delete', async (data, callback) => {
    const { messageId } = data;
    const userId = socket.userId;

    if (!messageId || !userId) {
      if (callback) callback({ status: 'error', message: 'Missing data' });
      return;
    }

    // First, verify the user owns the message
    const { data: message, error: fetchError } = await supabase
      .from('friend_messages')
      .select('sender_id, receiver_id')
      .eq('id', messageId)
      .single();

    if (fetchError || !message) {
      if (callback) callback({ status: 'error', message: 'Message not found' });
      return;
    }

    if (message.sender_id !== userId) {
      if (callback) callback({ status: 'error', message: 'You are not authorized to delete this message' });
      return;
    }

    // Proceed with deletion
    const { error: deleteError } = await supabase
      .from('friend_messages')
      .delete()
      .eq('id', messageId);

    if (deleteError) {
      if (callback) callback({ status: 'error', message: 'Failed to delete message' });
      return;
    }

    // Notify both sender and receiver
    const receiverSocketId = connectedUsers.get(message.receiver_id);
    socket.emit('friend_message_deleted', { messageId });
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('friend_message_deleted', { messageId });
    }

    if (callback) callback({ status: 'ok' });
  });

  // Handle editing a friend message
  socket.on('friend_message_edit', async (data, callback) => {
    const { messageId, newContent } = data;
    const userId = socket.userId;

    if (!messageId || !newContent || !userId) {
      if (callback) callback({ status: 'error', message: 'Missing data' });
      return;
    }

    // First, verify the user owns the message
    const { data: message, error: fetchError } = await supabase
      .from('friend_messages')
      .select('sender_id, receiver_id')
      .eq('id', messageId)
      .single();

    if (fetchError || !message) {
      if (callback) callback({ status: 'error', message: 'Message not found' });
      return;
    }

    if (message.sender_id !== userId) {
      if (callback) callback({ status: 'error', message: 'You are not authorized to edit this message' });
      return;
    }

    // Proceed with the update
    const { data: updatedMessage, error: updateError } = await supabase
      .from('friend_messages')
      .update({ content: newContent, is_edited: true })
      .eq('id', messageId)
      .select()
      .single();

    if (updateError) {
      if (callback) callback({ status: 'error', message: 'Failed to edit message' });
      return;
    }

    // Notify both sender and receiver
    const receiverSocketId = connectedUsers.get(message.receiver_id);
    const payload = { 
        messageId: updatedMessage.id, 
        newContent: updatedMessage.content, 
        is_edited: updatedMessage.is_edited 
    };
    socket.emit('friend_message_edited', payload);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('friend_message_edited', payload);
    }

    if (callback) callback({ status: 'ok' });
  });

  socket.on('friend_message_react', async (data, callback) => {
    const { messageId, emoji } = data;
    const userId = socket.userId;

    if (!messageId || !emoji || !userId) {
      if (callback) callback({ status: 'error', message: 'Missing data' });
      return;
    }

    const { data: message, error: fetchError } = await supabase
      .from('friend_messages')
      .select('sender_id, receiver_id')
      .eq('id', messageId)
      .single();

    if (fetchError || !message) {
      if (callback) callback({ status: 'error', message: 'Message not found' });
      return;
    }
    
    const otherUserId = message.sender_id === userId ? message.receiver_id : message.sender_id;

    const { data: existingReaction, error: findError } = await supabase
      .from('friend_message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji)
      .single();

    if (findError && findError.code !== 'PGRST116') { // PGRST116 means no rows found
        console.error('Error finding reaction:', findError);
        if (callback) callback({ status: 'error', message: 'Database error while finding reaction' });
        return;
    }

    if (existingReaction) {
      await supabase.from('friend_message_reactions').delete().eq('id', existingReaction.id);
    } else {
      await supabase.from('friend_message_reactions').insert({ message_id: messageId, user_id: userId, emoji });
    }

    const { data: reactions, error: fetchReactionsError } = await supabase
      .from('friend_message_reactions')
      .select('emoji, user_id, users(username)')
      .eq('message_id', messageId);

    if (fetchReactionsError) {
      console.error('Error fetching reactions:', fetchReactionsError);
      if (callback) callback({ status: 'error', message: 'Database error while fetching reactions' });
      return;
    }

    const payload = { messageId, reactions };

    // Emit to both users
    socket.emit('friend_message_reaction_update', payload);
    const otherUserSocketId = connectedUsers.get(otherUserId);
    if (otherUserSocketId) {
      io.to(otherUserSocketId).emit('friend_message_reaction_update', payload);
    }

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