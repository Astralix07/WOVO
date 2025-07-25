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

// Get members for a group
app.get('/api/groups/:groupId/members', async (req, res) => {
    const { groupId } = req.params;
    const { data, error } = await supabase
        .from('group_members')
        .select('users(id, username, avatar_url)')
        .eq('group_id', groupId);

    if (error) {
        console.error('Error fetching group members:', error);
        return res.status(500).json({ error: error.message });
    }

    const members = data.map(item => item.users).filter(Boolean); // filter out null users if any
    res.json(members);
});

// --- Friends API ---

// Get friends for a user
app.get('/api/friends/:userId', async (req, res) => {
    const { userId } = req.params;

    // 1. Fetch friends
    const { data: friendsData, error: friendsError } = await supabase
        .from('friends')
        .select(`
            status,
            user1:user_id_1(id, username, avatar_url, online_status),
            user2:user_id_2(id, username, avatar_url, online_status)
        `)
        .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
        .eq('status', 'accepted');

    if (friendsError) {
        console.error('Error fetching friends:', friendsError);
        return res.status(500).json({ error: friendsError.message });
    }

    const friends = friendsData.map(friendship => {
        return friendship.user1.id === userId ? friendship.user2 : friendship.user1;
    });

    // 2. Fetch unread message counts
    const { data: unreadMessages, error: unreadError } = await supabase
        .from('direct_messages')
        .select('sender_id')
        .eq('receiver_id', userId)
        .is('read_at', null);

    if (unreadError) return res.status(500).json({ error: unreadError.message });

    // 3. Aggregate unread counts
    const unreadCounts = unreadMessages.reduce((acc, msg) => {
        acc[msg.sender_id] = (acc[msg.sender_id] || 0) + 1;
        return acc;
    }, {});

    // 4. Combine friend data with unread counts
    const friendsWithUnread = friends.map(friend => ({
        ...friend,
        unread_count: unreadCounts[friend.id] || 0
    }));

    res.json(friendsWithUnread);
});

// Get direct messages between two users
app.get('/api/dm/:user1Id/:user2Id', async (req, res) => {
    const { user1Id, user2Id } = req.params;

    // Fetch messages
    const { data: messages, error: messagesError } = await supabase
        .from('direct_messages')
        .select('*, sender:sender_id(username, avatar_url)')
        .or(`(sender_id.eq.${user1Id}, receiver_id.eq.${user2Id}),(sender_id.eq.${user2Id}, receiver_id.eq.${user1Id})`)
        .order('created_at', { ascending: true });

    if (messagesError) return res.status(500).json({ error: messagesError.message });

    // Fetch reactions for these messages
    const messageIds = messages.map(m => m.id);
    const { data: reactions, error: reactionsError } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', messageIds);

    if (reactionsError) return res.status(500).json({ error: reactionsError.message });

    // Aggregate reactions by message
    const messagesWithReactions = messages.map(message => {
        const messageReactions = reactions.filter(r => r.message_id === message.id);
        const aggregatedReactions = messageReactions.reduce((acc, reaction) => {
            const existing = acc.find(a => a.emoji === reaction.emoji);
            if (existing) {
                existing.count++;
                existing.users.push(reaction.user_id);
            } else {
                acc.push({ emoji: reaction.emoji, count: 1, users: [reaction.user_id] });
            }
            return acc;
        }, []);
        return { ...message, reactions: aggregatedReactions };
    });

    res.json(messagesWithReactions);
});

// Edit a direct message
app.put('/api/dm/messages/:messageId', async (req, res) => {
    const { messageId } = req.params;
    const { content } = req.body;
    const { data, error } = await supabase
        .from('direct_messages')
        .update({ content, edited: true })
        .eq('id', messageId)
        .select('*, sender:sender_id(username, avatar_url)')
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Delete a direct message
app.delete('/api/dm/messages/:messageId', async (req, res) => {
    const { messageId } = req.params;
    const { data, error } = await supabase
        .from('direct_messages')
        .delete()
        .eq('id', messageId);

    if (error) return res.status(500).json({ error: error.message });
    res.status(204).send();
});

// Add a reaction to a message
app.post('/api/dm/messages/:messageId/reactions', async (req, res) => {
    const { messageId } = req.params;
    const { userId, emoji } = req.body;

    const { data, error } = await supabase
        .from('message_reactions')
        .insert({ message_id: messageId, user_id: userId, emoji })
        .select()
        .single();

    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.status(201).json(data);
});

// Remove a reaction from a message
app.delete('/api/dm/messages/:messageId/reactions', async (req, res) => {
    const { messageId } = req.params;
    const { userId, emoji } = req.body;

    const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('emoji', emoji);

    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.status(204).send();
});

// Mark messages as read
app.post('/api/dm/messages/read', async (req, res) => {
    const { messageIds, userId } = req.body;
    if (!messageIds || !userId || messageIds.length === 0) {
        return res.status(400).json({ error: 'Missing messageIds or userId' });
    }

    const { error } = await supabase
        .from('direct_messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', messageIds)
        .eq('receiver_id', userId); // Only mark messages received by the user as read

    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.status(204).send();
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
  // Handle sending a direct message
  socket.on('direct_message_send', async (msg, callback) => {
    const { toUserId, fromUserId, content } = msg;
    if (!toUserId || !fromUserId || !content) {
        if (callback) callback({ status: 'error', message: 'Missing data' });
        return;
    }

    // Save message to the database
    const { data, error } = await supabase
        .from('direct_messages')
        .insert([{ sender_id: fromUserId, receiver_id: toUserId, content }])
        .select('*, sender:sender_id(username, avatar_url)')
        .single();

    if (error) {
        console.error('Error saving DM:', error);
        if (callback) callback({ status: 'error', message: error.message });
        return;
    }

    // If recipient is online, send the message in real-time
    const toSocketId = connectedUsers.get(toUserId);
    if (toSocketId) {
        io.to(toSocketId).emit('direct_message_receive', data);
    }

    if (callback) callback({ status: 'ok', message: data });
  });

  // Handle message editing
  socket.on('direct_message_edit', ({ message, toUserId }) => {
      const toSocketId = connectedUsers.get(toUserId);
      if (toSocketId) {
          io.to(toSocketId).emit('direct_message_edited', message);
      }
  });

  // Handle message deletion
  socket.on('direct_message_delete', ({ messageId, toUserId }) => {
      const toSocketId = connectedUsers.get(toUserId);
      if (toSocketId) {
          io.to(toSocketId).emit('direct_message_deleted', { messageId });
      }
  });

  // Handle message reaction
  socket.on('direct_message_react', ({ toUserId, reactionData }) => {
    const toSocketId = connectedUsers.get(toUserId);
    if (toSocketId) {
        io.to(toSocketId).emit('direct_message_reacted', reactionData);
    }
  });

  // Handle read receipts
  socket.on('mark_messages_read', ({ toUserId, messageIds }) => {
      const toSocketId = connectedUsers.get(toUserId);
      if (toSocketId) {
          io.to(toSocketId).emit('messages_read', { messageIds });
      }
  });

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

  // Handle typing indicators
  socket.on('user_typing_start', ({ toUserId, fromUserId }) => {
    const toSocketId = connectedUsers.get(toUserId);
    if (toSocketId) {
      io.to(toSocketId).emit('user_typing_start', { fromUserId });
    }
  });

  socket.on('user_typing_stop', ({ toUserId, fromUserId }) => {
    const toSocketId = connectedUsers.get(toUserId);
    if (toSocketId) {
      io.to(toSocketId).emit('user_typing_stop', { fromUserId });
    }
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