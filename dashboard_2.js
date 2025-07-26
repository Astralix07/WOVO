// dashboard_2.js - New features, including media sharing.

// --- Cloudinary Configuration ---
// Note: This must be an UNSIGNED upload preset. 
// Please ensure you have a preset named 'wovo_user' in your Cloudinary account,
// or change the name here to match your preset.
const CLOUDINARY_CLOUD_NAME = 'dxsvbes6q'; // Replace with your cloud name
const CLOUDINARY_UPLOAD_PRESET = 'wovo_user'; // Replace with your unsigned upload preset

document.addEventListener('DOMContentLoaded', () => {
    // --- CONTENT SWITCHING LOGIC ---
    const mainSections = {
        groups: document.getElementById('groups-content'),
        friends: document.getElementById('friends-content'),
        tournaments: document.getElementById('tournaments-content'),
        rooms: document.getElementById('rooms-content'),
    };
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active from all
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Hide all main sections
            Object.values(mainSections).forEach(sec => sec && (sec.style.display = 'none'));

            // Show the correct section
            const label = item.querySelector('.nav-label')?.textContent?.toLowerCase();
            if (label && mainSections[label]) {
                mainSections[label].style.display = '';
                mainSections[label].classList.add('active');
            } else if (label === 'groups') {
                mainSections.groups.style.display = '';
                mainSections.groups.classList.add('active');
            }
        });
    });

    // --- MEDIA SHARING LOGIC ---
    const addAttachmentBtn = document.getElementById('addAttachmentBtn');
    const mediaFileInput = document.getElementById('mediaFileInput');
    const mediaUploadModal = document.getElementById('mediaUploadModal');
    const closeMediaUploadModal = document.getElementById('closeMediaUploadModal');
    const cancelMediaUpload = document.getElementById('cancelMediaUpload');
    const sendMediaBtn = document.getElementById('sendMediaBtn');
    const filePreviewContainer = document.getElementById('filePreviewContainer');
    const mediaCaptionInput = document.getElementById('mediaCaptionInput');

    let selectedFile = null;

    if (addAttachmentBtn) {
        addAttachmentBtn.addEventListener('click', () => {
            mediaFileInput.click();
        });
    }

    if (mediaFileInput) {
        mediaFileInput.addEventListener('change', handleFileSelect);
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        // --- File validation ---
        if (file.size > 30 * 1024 * 1024) { // 30MB limit
            showNotification('File is too large (max 30MB)', 'error');
            return;
        }

        selectedFile = file;
        showPreview(file);
        mediaUploadModal.style.display = 'flex';
    }

    function showPreview(file) {
        filePreviewContainer.innerHTML = '';
        const fileType = file.type.split('/')[0];
        const reader = new FileReader();

        reader.onload = function(e) {
            let previewElement;
            if (fileType === 'image') {
                previewElement = document.createElement('img');
            } else if (fileType === 'video') {
                previewElement = document.createElement('video');
                previewElement.controls = true;
            }
            previewElement.src = e.target.result;
            filePreviewContainer.appendChild(previewElement);
        };

        reader.readAsDataURL(file);
    }

    function closeModal() {
        mediaUploadModal.style.display = 'none';
        filePreviewContainer.innerHTML = '';
        mediaCaptionInput.value = '';
        mediaFileInput.value = '';
        selectedFile = null;
    }

    if (closeMediaUploadModal) closeMediaUploadModal.addEventListener('click', closeModal);
    if (cancelMediaUpload) cancelMediaUpload.addEventListener('click', closeModal);

    if (sendMediaBtn) {
        sendMediaBtn.addEventListener('click', handleSendMedia);
    }

    function handleSendMedia() {
        if (!selectedFile) return;

        // Keep local references to the file and caption
        const fileToSend = selectedFile;
        const caption = mediaCaptionInput.value.trim();
        const tempId = `temp_${Date.now()}`;
        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));

        // 1. Show instant preview using a local URL
        const previewUrl = URL.createObjectURL(fileToSend);
        const tempMessage = {
            id: tempId,
            client_temp_id: tempId,
            created_at: new Date().toISOString(),
            content: caption,
            users: currentUser,
            media_url: previewUrl,
            media_type: fileToSend.type.split('/')[0],
            is_uploading: true
        };
        renderGroupMessage(tempMessage, true);
        
        // 2. Close the modal immediately
        closeModal();

        // 3. Upload to Cloudinary with progress
        try {
            const formData = new FormData();
            formData.append('file', fileToSend);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

            const xhr = new XMLHttpRequest();
            xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, true);

            xhr.upload.onprogress = function(e) {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    const progressBar = document.querySelector(`.group-message[data-message-id="${tempId}"] .progress-bar`);
                    if (progressBar) {
                        progressBar.style.width = percentComplete + '%';
                    }
                }
            };
            
            xhr.onload = function() {
                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);
                    URL.revokeObjectURL(previewUrl); // Clean up the object URL

                    // 4. Send final message data to server
                    const messagePayload = {
                        groupId: joinedGroupRoom,
                        user_id: currentUser.id,
                        content: caption,
                        media_url: data.secure_url,
                        media_type: data.resource_type,
                        client_temp_id: tempId
                    };
                    
                    socket.emit('group_message_send', messagePayload, (response) => {
                        if (response.status === 'error') {
                            showNotification(`Server Error: ${response.message}`, 'error');
                            const tempMsgEl = document.querySelector(`.group-message[data-message-id="${tempId}"]`);
                            if (tempMsgEl) tempMsgEl.remove();
                        }
                    });
                } else {
                    const data = JSON.parse(xhr.responseText);
                    throw new Error(data.error?.message || `Upload failed with status ${xhr.status}`);
                }
            };

            xhr.onerror = function() {
                throw new Error('Network error during upload');
            };

            xhr.send(formData);

        } catch (error) {
            showNotification(`Upload Error: ${error.message}`, 'error');
            const tempMsgEl = document.querySelector(`.group-message[data-message-id="${tempId}"]`);
            if (tempMsgEl) tempMsgEl.remove();
            URL.revokeObjectURL(previewUrl);
        }
    }

    // --- USER MENTIONS LOGIC ---
    const userMentionsPopup = document.getElementById('userMentionsPopup');
    let groupMembers = [];
    let mentionQuery = '';
    let selectedMentionIndex = 0;

    if (groupMessageInput) {
        groupMessageInput.addEventListener('input', handleMentionInput);
    }

    async function handleMentionInput(e) {
        const text = e.target.value;
        const cursorPos = e.target.selectionStart;
        const atMatch = text.slice(0, cursorPos).match(/@(\w*)$/);

        if (atMatch) {
            mentionQuery = atMatch[1].toLowerCase();
            if (groupMembers.length === 0) {
                await fetchGroupMembers();
            }
            const filteredMembers = groupMembers.filter(m => 
                m.users.username.toLowerCase().includes(mentionQuery)
            );
            renderMentionPopup(filteredMembers);
        } else {
            userMentionsPopup.style.display = 'none';
        }
    }

    async function fetchGroupMembers() {
        if (!joinedGroupRoom) return;
        const { data, error } = await supabase
            .from('group_members')
            .select('users(id, username, avatar_url)')
            .eq('group_id', joinedGroupRoom);
        if (!error) {
            groupMembers = data;
        }
    }

    function renderMentionPopup(members) {
        if (members.length === 0) {
            userMentionsPopup.style.display = 'none';
            return;
        }
        userMentionsPopup.innerHTML = members.map((m, index) => `
            <div class="mention-item ${index === selectedMentionIndex ? 'selected' : ''}" data-user-id="${m.users.id}" data-username="${m.users.username}">
                <img src="${m.users.avatar_url || DEFAULT_AVATAR}" alt="avatar">
                <span class="username">${m.users.username}</span>
            </div>
        `).join('');
        userMentionsPopup.style.display = 'block';

        // Add click listeners to items
        userMentionsPopup.querySelectorAll('.mention-item').forEach(item => {
            item.addEventListener('click', () => selectMention(item));
        });
    }

    function selectMention(selectedItem) {
        const username = selectedItem.dataset.username;
        const userId = selectedItem.dataset.userId;
        const currentText = groupMessageInput.value;
        const cursorPos = groupMessageInput.selectionStart;
        
        const textBefore = currentText.slice(0, cursorPos).replace(/@(\w*)$/, '');
        const textAfter = currentText.slice(cursorPos);
        
        // Format: @[Username](userId)
        const mentionText = `@[${username}](${userId}) `;
        
        groupMessageInput.value = textBefore + mentionText + textAfter;
        userMentionsPopup.style.display = 'none';
        groupMessageInput.focus();
    }

    // Handle keyboard navigation for mentions
    if (groupMessageInput) {
        groupMessageInput.addEventListener('keydown', (e) => {
            const isMentionPopupVisible = userMentionsPopup.style.display === 'block';

            if (isMentionPopupVisible) {
                const items = userMentionsPopup.querySelectorAll('.mention-item');
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    selectedMentionIndex = (selectedMentionIndex + 1) % items.length;
                    renderMentionPopup(Array.from(items).map(i => groupMembers.find(m => m.users.id === i.dataset.userId)));
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    selectedMentionIndex = (selectedMentionIndex - 1 + items.length) % items.length;
                    renderMentionPopup(Array.from(items).map(i => groupMembers.find(m => m.users.id === i.dataset.userId)));
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    selectMention(items[selectedMentionIndex]);
                }
            } else {
                // This is the logic from the other file, now integrated
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            }
        });
    }

    // --- FRIENDS SECTION LOGIC ---
    // Remove demo sidebar logic
    // Use real friends list from details section
    const realFriendsList = document.getElementById('realFriendsList');
    const friendChatHeader = document.getElementById('friendChatHeader');
    const friendAvatar = document.getElementById('friendAvatar');
    const friendName = document.getElementById('friendName');
    const friendMessages = document.getElementById('friendMessages');
    const friendMessageForm = document.getElementById('friendMessageForm');
    const friendMessageInput = document.getElementById('friendMessageInput');
    const sendFriendMessageBtn = document.getElementById('sendFriendMessageBtn');
    const emojiPickerContainer = document.getElementById('emojiPickerContainer');
    const emojiPicker = document.getElementById('emojiPicker');

    let selectedFriend = null;
    let friendChats = {};

    // Attach click listeners to real friends list
    function attachRealFriendsListeners() {
        if (!realFriendsList) return;
        realFriendsList.querySelectorAll('.friend-item').forEach(item => {
            item.addEventListener('click', async () => {
                const friendId = item.dataset.userId;
                const friendUsername = item.querySelector('.friend-name')?.textContent || 'Friend';
                const friendAvatarUrl = item.querySelector('img')?.src || 'assets/default-avatar.png';
                selectFriend(friendId, friendUsername, friendAvatarUrl);
            });
        });
    }

    async function selectFriend(friendId, username, avatarUrl) {
        selectedFriend = { id: friendId, username, avatar_url: avatarUrl };
        // Update header
        friendAvatar.src = avatarUrl;
        friendName.textContent = username;
        // Load chat
        await loadFriendChat(friendId);
        renderFriendMessages();
    }

    async function loadFriendChat(friendId) {
        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
        const { data, error } = await supabase
            .from('friend_messages')
            .select('*')
            .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
            .or(`sender_id.eq.${friendId},receiver_id.eq.${friendId}`)
            .order('created_at', { ascending: true });
        if (!error) {
            friendChats[friendId] = (data || []).filter(m =>
                (m.sender_id === currentUser.id && m.receiver_id === friendId) ||
                (m.sender_id === friendId && m.receiver_id === currentUser.id)
            ).map(m => ({
                id: m.id,
                text: m.content,
                isOwn: m.sender_id === currentUser.id,
                username: m.sender_id === currentUser.id ? currentUser.username : selectedFriend.username,
                avatar_url: m.sender_id === currentUser.id ? currentUser.avatar_url : selectedFriend.avatar_url,
                created_at: m.created_at
            }));
        }
    }

    // Update renderFriendMessages to show reactions
    function renderFriendMessages() {
        const chat = friendChats[selectedFriend.id] || [];
        friendMessages.innerHTML = chat.length === 0
            ? '<div class="coming-soon">No messages yet. Start the conversation!</div>'
            : chat.map(msg => {
                let reactionsHTML = '';
                if (msg.reactions) {
                    reactionsHTML = Object.entries(msg.reactions).map(([emoji, userIds]) => {
                        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
                        const reacted = userIds.includes(currentUser.id);
                        return `<span class="reaction${reacted ? ' reacted' : ''}" data-emoji="${emoji}">${emoji} <span class="count">${userIds.length}</span></span>`;
                    }).join('');
                }
                let replyContextHTML = '';
                if (msg.reply_to) {
                    replyContextHTML = `<div class="reply-context"><span class="reply-username">@${escapeHtml(msg.reply_to.username)}</span>: <span class="reply-text">${escapeHtml(msg.reply_to.text)}</span></div>`;
                }
                let editInputHTML = '';
                if (editingDMMessageId === msg.id) {
                    editInputHTML = '';
                }
                return `
                <div class="group-message${msg.isOwn ? ' own' : ''} new-message-animation" data-message-id="${msg.id}">
                    <div class="group-message-avatar">
                        <img src="${msg.avatar_url || selectedFriend.avatar_url || 'assets/default-avatar.png'}" alt="avatar">
                    </div>
                    <div class="group-message-content">
                        ${replyContextHTML}
                        <div class="group-message-header">
                            <span class="group-message-username">${escapeHtml(msg.username || selectedFriend.username)}</span>
                            <span class="group-message-timestamp">${msg.created_at ? formatTimestamp(msg.created_at) : ''}</span>
                        </div>
                        <div class="group-message-text">${escapeHtml(msg.text)}</div>
                        ${editInputHTML}
                        <div class="message-actions">
                            <button class="action-btn-icon reply" title="Reply"><i class="fas fa-reply"></i></button>
                            <button class="action-btn-icon edit" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                            <button class="action-btn-icon delete" title="Delete"><i class="fas fa-trash-alt"></i></button>
                            <button class="action-btn-icon add-reaction" title="Add Reaction"><i class="fas fa-smile"></i></button>
                        </div>
                        <div class="message-reactions-container" data-message-id="${msg.id}">${reactionsHTML}</div>
                    </div>
                </div>
                `;
            }).join('');
        friendMessages.scrollTop = friendMessages.scrollHeight;
    }

    if (friendMessageForm) {
        friendMessageForm.addEventListener('submit', e => {
            e.preventDefault();
            sendFriendMessage();
        });
        sendFriendMessageBtn.addEventListener('click', sendFriendMessage);
    }

    // --- DM MESSAGE ACTIONS (REPLY, EDIT, DELETE, REACTIONS) ---
    let currentDMReplyTo = null;
    let editingDMMessageId = null;
    let currentDMReactionMsgId = null;
    let replyPreviewBar = null;

    // Send DM message (with reply support)
    function sendFriendMessage() {
        const text = friendMessageInput.value.trim();
        if (!text && !selectedFile) return;
        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
        const payload = {
            content: text,
            sender_id: currentUser.id,
            receiver_id: selectedFriend.id,
            reply_to: currentDMReplyTo, // send reply_to if replying
            // add media fields if needed
        };
        socket.emit('friend_message_send', payload, (ack) => {
            // Optionally handle server ack
        });
        // Optimistically add message for sender
        if (!friendChats[selectedFriend.id]) friendChats[selectedFriend.id] = [];
        friendChats[selectedFriend.id].push({
            id: 'temp_' + Date.now(),
            text,
            isOwn: true,
            username: currentUser.username,
            avatar_url: currentUser.avatar_url,
            created_at: new Date().toISOString(),
            reply_to: currentDMReplyTo ? getDMMessageById(currentDMReplyTo) : null
        });
        renderFriendMessages();
        friendMessageInput.value = '';
        removeDMReplyPreview();
    }

    function getDMMessageById(id) {
        const chat = friendChats[selectedFriend.id] || [];
        return chat.find(m => m.id === id) || null;
    }

    // Handle message actions
    if (friendMessages) {
        friendMessages.addEventListener('click', function(e) {
            const messageEl = e.target.closest('.group-message');
            if (!messageEl) return;
            const messageId = messageEl.dataset.messageId;
            // Reply
            if (e.target.closest('.action-btn-icon.reply')) {
                currentDMReplyTo = messageId;
                showDMReplyPreview(messageEl);
            }
            // Edit
            else if (e.target.closest('.action-btn-icon.edit')) {
                if (!messageEl.classList.contains('own')) return;
                startDMEditing(messageEl, messageId);
            }
            // Delete
            else if (e.target.closest('.action-btn-icon.delete')) {
                if (!messageEl.classList.contains('own')) return;
                socket.emit('friend_message_delete', { message_id: messageId });
            }
            // Reaction
            else if (e.target.closest('.action-btn-icon.add-reaction')) {
                currentDMReactionMsgId = messageId;
                // --- FIX: Null check for emojiPickerContainer ---
                if (emojiPickerContainer) {
                    const rect = e.target.getBoundingClientRect();
                    emojiPickerContainer.style.top = `${rect.top - 360}px`;
                    emojiPickerContainer.style.left = `${rect.left - 300}px`;
                    emojiPickerContainer.style.display = 'block';
                }
            }
        });
    }

    function showDMReplyPreview(messageEl) {
        removeDMReplyPreview();
        const text = messageEl.querySelector('.group-message-text')?.textContent || '';
        const username = messageEl.querySelector('.group-message-username')?.textContent || '';
        replyPreviewBar = document.createElement('div');
        replyPreviewBar.className = 'reply-preview';
        replyPreviewBar.innerHTML = `
            <div class="reply-preview-content">
                Replying to <strong>${escapeHtml(username)}</strong>: <span>${escapeHtml(text)}</span>
            </div>
            <button class="cancel-reply-btn">&times;</button>
        `;
        friendMessageForm.prepend(replyPreviewBar);
        replyPreviewBar.querySelector('.cancel-reply-btn').onclick = removeDMReplyPreview;
    }
    function removeDMReplyPreview() {
        if (replyPreviewBar) replyPreviewBar.remove();
        replyPreviewBar = null;
        currentDMReplyTo = null;
    }

    function startDMEditing(messageEl, messageId) {
        // Remove any other edit input
        const existingEdit = friendMessages.querySelector('.dm-edit-input-row');
        if (existingEdit) existingEdit.remove();
        editingDMMessageId = messageId;
        const text = messageEl.querySelector('.group-message-text')?.textContent || '';
        const editRow = document.createElement('div');
        editRow.className = 'dm-edit-input-row';
        editRow.innerHTML = `
            <input class="dm-edit-input" type="text" value="${escapeHtml(text)}" />
            <button class="save-edit">Save</button>
            <button class="cancel-edit">Cancel</button>
        `;
        messageEl.querySelector('.group-message-content').appendChild(editRow);
        const input = editRow.querySelector('.dm-edit-input');
        input.focus();
        editRow.querySelector('.save-edit').onclick = () => {
            socket.emit('friend_message_edit', {
                message_id: messageId,
                new_content: input.value
            });
            editingDMMessageId = null;
            editRow.remove();
        };
        editRow.querySelector('.cancel-edit').onclick = () => {
            editingDMMessageId = null;
            editRow.remove();
        };
    }

    // Handle emoji selection for DM reactions
    emojiPicker?.addEventListener('emoji-click', async e => {
        if (!currentDMReactionMsgId) return;
        const emoji = e.detail.unicode;
        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
        socket.emit('friend_message_reaction', {
            message_id: currentDMReactionMsgId,
            user_id: currentUser.id,
            emoji,
            action: 'add'
        });
        emojiPickerContainer.style.display = 'none';
        currentDMReactionMsgId = null;
    });

    // Real-time receive and update
    if (window.socket) {
        socket.off('friend_message');
        socket.on('friend_message', data => {
            const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
            const friendId = data.sender_id === currentUser.id ? data.receiver_id : data.sender_id;
            if (!friendChats[friendId]) friendChats[friendId] = [];
            // Prevent duplicate messages
            if (!friendChats[friendId].some(m => m.id === data.id)) {
                friendChats[friendId].push({
                    id: data.id,
                    text: data.content,
                    isOwn: data.sender_id === currentUser.id,
                    username: data.sender_id === currentUser.id ? currentUser.username : selectedFriend.username,
                    avatar_url: data.sender_id === currentUser.id ? currentUser.avatar_url : selectedFriend.avatar_url,
                    created_at: data.created_at,
                    reply_to: data.reply_to ? getDMMessageById(data.reply_to) : null
                });
            }
            if (selectedFriend && selectedFriend.id === friendId) {
                renderFriendMessages();
            }
        });
        socket.off('friend_message_update');
        socket.on('friend_message_update', data => {
            const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
            const friendId = data.sender_id === currentUser.id ? data.receiver_id : data.sender_id;
            // Update the message in chat
            if (friendChats[friendId]) {
                const idx = friendChats[friendId].findIndex(m => m.id === data.id);
                if (idx !== -1) {
                    friendChats[friendId][idx] = {
                        ...friendChats[friendId][idx],
                        text: data.content,
                        isOwn: data.sender_id === JSON.parse(localStorage.getItem('wovo_user')).id,
                        is_edited: data.is_edited,
                        is_deleted: data.is_deleted
                    };
                }
            }
            renderFriendMessages();
        });
        socket.off('friend_message_reaction_update');
        socket.on('friend_message_reaction_update', ({ message_id, emoji, user_id, action }) => {
            // Track reactions per message
            if (!friendChats[selectedFriend.id]) return;
            const msg = friendChats[selectedFriend.id].find(m => m.id === message_id);
            if (!msg) return;
            msg.reactions = msg.reactions || {};
            msg.reactions[emoji] = msg.reactions[emoji] || [];
            if (action === 'add') {
                if (!msg.reactions[emoji].includes(user_id)) msg.reactions[emoji].push(user_id);
            } else if (action === 'remove') {
                msg.reactions[emoji] = msg.reactions[emoji].filter(id => id !== user_id);
            }
            renderFriendMessages();
        });
    }

    // Animate input and send button on focus
    if (friendMessageInput) {
        friendMessageInput.addEventListener('focus', () => {
            friendMessageForm.classList.add('active');
        });
        friendMessageInput.addEventListener('blur', () => {
            friendMessageForm.classList.remove('active');
        });
    }

    // Attach listeners when entering Friends section
    document.querySelector('.nav-item .fa-user-friends')?.closest('.nav-item')?.addEventListener('click', () => {
        setTimeout(() => {
            attachRealFriendsListeners();
            // Select the first real friend by default
            const firstFriend = realFriendsList?.querySelector('.friend-item');
            if (firstFriend) firstFriend.click();
        }, 300);
    });
}); 