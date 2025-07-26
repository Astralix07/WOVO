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
    const friendMessageForm = document.getElementById('friendMessageForm');
    const friendMessageInput = document.getElementById('friendMessageInput');
    const sendFriendMessageBtn = document.getElementById('sendFriendMessageBtn');

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
        renderFriendMessages(friendId);
    }

    async function getFriendMessages(friendId) {
        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
        if (!currentUser) return [];
        try {
            const response = await fetch(`/api/friends/${friendId}/messages?include_reactions=true`, {
                headers: {
                    'x-user-id': currentUser.id
                }
            });
            if (!response.ok) {
                throw new Error('Failed to fetch messages');
            }
            return await response.json();
        } catch (error) {
            console.error('Error getting friend messages:', error);
            return [];
        }
    }

    async function loadFriendChat(friendId) {
        const messages = await getFriendMessages(friendId);
        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));

        friendChats[friendId] = messages.map(msg => {
            const sender = msg.sender_id === currentUser.id ? msg.sender : msg.receiver;
            return {
                id: msg.id,
                text: msg.content,
                isOwn: msg.sender_id === currentUser.id,
                username: sender.username,
                avatar_url: sender.avatar_url,
                created_at: msg.created_at,
                is_edited: msg.is_edited,
                reply_to: msg.reply_to,
                reactions: msg.friend_message_reactions || []
            };
        });
    }

    function renderFriendMessages(friendId) {
        const friendMessagesContainer = document.getElementById('friendMessages');
        friendMessagesContainer.innerHTML = ''; // Clear previous messages

        const messages = friendChats[friendId] || [];
        if (messages.length === 0) {
            friendMessagesContainer.innerHTML = '<div class="coming-soon">This is the beginning of your conversation.</div>';
            return;
        }

        messages.forEach(msg => {
            renderSingleFriendMessage(msg);
            if (msg.reactions && msg.reactions.length > 0) {
                renderFriendMessageReactions(msg.id, msg.reactions);
            }
        });
        friendMessagesContainer.scrollTop = friendMessagesContainer.scrollHeight;
    }

    function renderSingleFriendMessage(msg, prepend = false) {
        const friendMessages = document.getElementById('friendMessages');
        if (!friendMessages) return;

        const comingSoon = friendMessages.querySelector('.coming-soon');
        if (comingSoon) comingSoon.remove();

        const reply = msg.reply_to;
        const replyHtml = reply ? `
            <div class="reply-context-container">
                <div class="reply-context-bar"></div>
                <div class="reply-context-content">
                    <span class="reply-context-username">${escapeHtml(reply.sender.username)}</span>
                    <span class="reply-context-text">${escapeHtml(reply.content)}</span>
                </div>
            </div>
        ` : '';

        const editedTag = msg.is_edited ? ' <span class="edited-tag">(edited)</span>' : '';

        const msgHtml = `
            <div class="group-message${msg.isOwn ? ' own' : ''}" data-message-id="${msg.id}" style="animation: fadeIn 0.3s ease-out forwards;">
                ${replyHtml}
                <div class="group-message-body">
                    <div class="group-message-avatar">
                        <img src="${msg.avatar_url || 'assets/default-avatar.png'}" alt="avatar">
                    </div>
                    <div class="group-message-content">
                        <div class="group-message-header">
                            <span class="group-message-username">${escapeHtml(msg.username)}</span>
                            <span class="group-message-timestamp">${msg.created_at ? formatTimestamp(msg.created_at) : ''}</span>
                        </div>
                        <div class="group-message-text">${escapeHtml(msg.text)}${editedTag}</div>
                    </div>
                    <div class="message-actions">
                         <button class="action-btn more-options-btn"><i class="fas fa-ellipsis-h"></i></button>
                         <div class="message-options-menu">
                            <div class="menu-item react-message-btn"><i class="fas fa-smile"></i> React</div>
                             <div class="menu-item reply-message-btn">Reply</div>
                             ${msg.isOwn ? `
                             <div class="menu-item edit-message-btn">Edit</div>
                             <div class="menu-item delete-message-btn">Delete</div>
                             ` : ''}
                         </div>
                     </div>
                </div>
                <div class="message-reactions" data-message-id="${msg.id}"></div>
            </div>
        `;
        
        if (prepend) {
            friendMessages.insertAdjacentHTML('afterbegin', msgHtml);
        } else {
            friendMessages.insertAdjacentHTML('beforeend', msgHtml);
            friendMessages.scrollTop = friendMessages.scrollHeight;
        }
    }

    function renderFriendMessages() {
        if (!selectedFriend || !friendMessages) return;
        const chat = friendChats[selectedFriend.id] || [];
        friendMessages.innerHTML = '';

        if (chat.length === 0) {
            friendMessages.innerHTML = '<div class="coming-soon">No messages yet. Start the conversation!</div>';
            return;
        }

        chat.forEach(msg => renderSingleFriendMessage(msg));
        friendMessages.scrollTop = friendMessages.scrollHeight;
    }

    document.addEventListener('click', (e) => {
        const moreOptionsBtn = e.target.closest('.more-options-btn');
        if (moreOptionsBtn) {
            const menu = moreOptionsBtn.nextElementSibling;
            document.querySelectorAll('.message-options-menu').forEach(m => {
                if (m !== menu) m.style.display = 'none';
            });
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
            return;
        }

        if (!e.target.closest('.message-actions')) {
            document.querySelectorAll('.message-options-menu').forEach(m => m.style.display = 'none');
        }

        const deleteBtn = e.target.closest('.delete-message-btn');
        if (deleteBtn) {
            const messageEl = deleteBtn.closest('.group-message');
            const messageId = messageEl.dataset.messageId;
            if (confirm('Are you sure you want to delete this message?')) {
                socket.emit('friend_message_delete', { messageId }, (response) => {
                    if (response && response.status === 'error') {
                        showNotification(response.message, 'error');
                    }
                });
            }
        }

        const replyBtn = e.target.closest('.reply-message-btn');
        if (replyBtn) {
            const messageEl = replyBtn.closest('.group-message');
            const messageId = messageEl.dataset.messageId;
            const username = messageEl.querySelector('.group-message-username').textContent;
            const text = messageEl.querySelector('.group-message-text').textContent;
            createReplyBanner(messageId, username, text);
            document.querySelectorAll('.message-options-menu').forEach(m => m.style.display = 'none');
        }

        const editBtn = e.target.closest('.edit-message-btn');
        if (editBtn) {
            const messageEl = editBtn.closest('.group-message');
            if (messageEl.querySelector('.edit-textarea')) return;
            const messageId = messageEl.dataset.messageId;
            const messageTextElement = messageEl.querySelector('.group-message-text');
            promptForFriendMessageEdit(messageId, messageTextElement);
        }

        const reactBtn = e.target.closest('.react-message-btn');
        if (reactBtn) {
            const messageEl = reactBtn.closest('.group-message');
            const pickerContainer = document.getElementById('dm-reaction-picker-container');
            
            // Position and show picker
            const rect = reactBtn.getBoundingClientRect();
            pickerContainer.style.top = `${rect.top - pickerContainer.offsetHeight - 10}px`;
            pickerContainer.style.left = `${rect.left - (pickerContainer.offsetWidth / 2)}px`;
            pickerContainer.style.display = 'block';

            // Store message ID on the picker for the event listener
            pickerContainer.dataset.messageId = messageEl.dataset.messageId;

            // Hide other menus
            document.querySelectorAll('.message-options-menu').forEach(m => m.style.display = 'none');
        } else {
            // Hide picker if clicking outside
            const picker = document.getElementById('dm-reaction-picker-container');
            if (picker && !picker.contains(e.target)) {
                picker.style.display = 'none';
            }
        }
    });

    let currentReplyInfo = null;

    function createReplyBanner(messageId, username, text) {
        const container = document.querySelector('.friend-chat-footer');
        if (!container) return;
        const existingBanner = container.querySelector('.reply-banner');
        if (existingBanner) existingBanner.remove();

        currentReplyInfo = { messageId, username, text };

        const banner = document.createElement('div');
        banner.className = 'reply-banner';
        banner.innerHTML = `
            <div class="reply-banner-content">
                Replying to <strong>${escapeHtml(username)}</strong>: 
                <span class="reply-text">${escapeHtml(text)}</span>
            </div>
            <button class="cancel-reply-btn">&times;</button>
        `;
        container.insertBefore(banner, friendMessageForm);

        banner.querySelector('.cancel-reply-btn').addEventListener('click', () => {
            banner.remove();
            currentReplyInfo = null;
        });
    }

    function promptForFriendMessageEdit(messageId, messageTextElement) {
        const originalText = messageTextElement.textContent.replace(/\s*\(edited\)$/, '');
        messageTextElement.innerHTML = `
            <textarea class="edit-textarea">${originalText}</textarea>
            <div class="edit-actions">
                <button class="save-edit-btn">Save</button>
                <button class="cancel-edit-btn">Cancel</button>
            </div>
        `;
        const textarea = messageTextElement.querySelector('.edit-textarea');
        const saveBtn = messageTextElement.querySelector('.save-edit-btn');
        const cancelBtn = messageTextElement.querySelector('.cancel-edit-btn');

        textarea.focus();
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight) + 'px';

        const handleSave = () => {
            const newContent = textarea.value.trim();
            if (newContent && newContent !== originalText) {
                socket.emit('friend_message_edit', { messageId, newContent }, (response) => {
                    if (response && response.status === 'error') {
                        showNotification(response.message, 'error');
                        messageTextElement.innerHTML = escapeHtml(originalText);
                    }
                });
            } else {
                messageTextElement.innerHTML = escapeHtml(originalText);
            }
        };

        const handleCancel = () => {
            messageTextElement.innerHTML = escapeHtml(originalText);
        };

        saveBtn.addEventListener('click', handleSave);
        cancelBtn.addEventListener('click', handleCancel);
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
            if (e.key === 'Escape') { e.preventDefault(); handleCancel(); }
        });
    }

    if (friendMessageForm) {
        friendMessageForm.addEventListener('submit', e => { e.preventDefault(); sendFriendMessage(); });
        sendFriendMessageBtn.addEventListener('click', sendFriendMessage);
    }

    function sendFriendMessage() {
        const text = friendMessageInput.value.trim();
        if (!text || !selectedFriend) return;
        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
        
        const tempId = `temp_${Date.now()}`;
        const optimisticMessage = {
            id: tempId,
            text: text,
            isOwn: true,
            username: currentUser.username,
            avatar_url: currentUser.avatar_url,
            created_at: new Date().toISOString(),
            reply_to: currentReplyInfo ? {
                content: currentReplyInfo.text,
                sender: { username: currentReplyInfo.username }
            } : null
        };
        renderSingleFriendMessage(optimisticMessage);

        socket.emit('friend_message_send', {
            sender_id: currentUser.id,
            receiver_id: selectedFriend.id,
            content: text,
            client_temp_id: tempId,
            reply_to_message_id: currentReplyInfo ? currentReplyInfo.messageId : null
        });

        if (currentReplyInfo) {
            const banner = document.querySelector('.reply-banner');
            if (banner) banner.remove();
            currentReplyInfo = null;
        }

        friendMessageInput.value = '';
        sendFriendMessageBtn.classList.add('sent');
        setTimeout(() => sendFriendMessageBtn.classList.remove('sent'), 300);
    }

    // --- REACTION PICKER EVENT LISTENER ---
    const reactionPicker = document.querySelector('#dm-reaction-picker-container emoji-picker');
    if (reactionPicker) {
        reactionPicker.addEventListener('emoji-click', event => {
            const messageId = reactionPicker.parentElement.dataset.messageId;
            const emoji = event.detail.unicode;
            console.log(`Reacting with ${emoji} to message ${messageId}`);
            
            // TODO: Emit socket event here
            const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
            socket.emit('friend_message_react', {
                messageId: messageId,
                emoji: emoji,
                // No need to send userId, server gets it from socket context
            }, (response) => {
                if (response && response.status === 'error') {
                    showNotification(response.message, 'error');
                }
            });
            reactionPicker.parentElement.style.display = 'none'; // Hide picker
        });
    }

    function renderFriendMessageReactions(messageId, reactions) {
        const reactionsContainer = document.querySelector(`.message-reactions[data-message-id="${messageId}"]`);
        if (!reactionsContainer) return;

        reactionsContainer.innerHTML = ''; // Clear existing reactions

        if (!reactions || reactions.length === 0) return;

        const groupedReactions = reactions.reduce((acc, reaction) => {
            if (!acc[reaction.emoji]) {
                acc[reaction.emoji] = { count: 0, users: [], user_ids: [] };
            }
            acc[reaction.emoji].count++;
            acc[reaction.emoji].users.push(reaction.users.username);
            acc[reaction.emoji].user_ids.push(reaction.user_id);
            return acc;
        }, {});

        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));

        for (const [emoji, data] of Object.entries(groupedReactions)) {
            const reactionEl = document.createElement('div');
            reactionEl.className = 'reaction-item';
            // Add 'reacted' class if current user has reacted with this emoji
            if (currentUser && data.user_ids.includes(currentUser.id)) {
                reactionEl.classList.add('reacted');
            }
            reactionEl.textContent = `${emoji} ${data.count}`;
            reactionEl.title = data.users.join(', '); // Show who reacted on hover
            
            reactionEl.addEventListener('click', () => {
                 socket.emit('friend_message_react', { messageId, emoji });
            });

            reactionsContainer.appendChild(reactionEl);
        }
    }

    // --- REAL-TIME LISTENER FOR FRIEND MESSAGES ---
    if (socket) {
        // Ensure we don't attach the listener multiple times
        socket.off('friend_message');
        socket.off('friend_message_deleted');
        socket.off('friend_message_reaction_update');
        socket.on('friend_message_reaction_update', ({ messageId, reactions }) => {
            renderFriendMessageReactions(messageId, reactions);
        });

        socket.off('friend_message_edited');
        socket.on('friend_message_edited', (payload) => {
            const messageEl = document.querySelector(`.group-message[data-message-id="${payload.messageId}"]`);
            if (messageEl) {
                const textEl = messageEl.querySelector('.group-message-text');
                if (textEl) {
                    textEl.innerHTML = `${escapeHtml(payload.newContent)} <span class="edited-tag">(edited)</span>`;
                }
            }
        });

        socket.on('friend_message_deleted', ({ messageId }) => {
            const messageEl = document.querySelector(`.group-message[data-message-id="${messageId}"]`);
            if (messageEl) {
                messageEl.style.transition = 'opacity 0.3s ease';
                messageEl.style.opacity = '0';
                setTimeout(() => messageEl.remove(), 300);
            }
        });

        socket.on('friend_message_edited', ({ messageId, newContent }) => {
            const messageEl = document.querySelector(`.group-message[data-message-id="${messageId}"]`);
            if (messageEl) {
                const messageTextElement = messageEl.querySelector('.group-message-text');
                if (messageTextElement) {
                    // Update the text and add the (edited) tag
                    messageTextElement.innerHTML = escapeHtml(newContent) + ' <span class="edited-tag">(edited)</span>';
                }
            }
        });

        socket.on('friend_message', (newMessage) => {
            const currentUser = JSON.parse(localStorage.getItem('wovo_user'));

            // Determine the other user in the chat
            const isSender = newMessage.sender_id === currentUser.id;
            const otherUserId = isSender ? newMessage.receiver_id : newMessage.sender_id;

            // Update the local cache for this chat
            if (!friendChats[otherUserId]) {
                friendChats[otherUserId] = [];
            }
            const formattedMessage = {
                id: newMessage.id,
                text: newMessage.content,
                isOwn: isSender,
                username: isSender ? currentUser.username : (friendChats[otherUserId]?.username || 'Friend'),
                avatar_url: isSender ? currentUser.avatar_url : (friendChats[otherUserId]?.avatar_url || 'assets/default-avatar.png'),
                created_at: newMessage.created_at
            };
            friendChats[otherUserId].push(formattedMessage);


            // If the message belongs to the currently active chat, render it
            if (selectedFriend && otherUserId === selectedFriend.id) {
                // If it was an optimistically sent message, update it in the DOM
                const tempMsgEl = document.querySelector(`.group-message[data-message-id="${newMessage.client_temp_id}"]`);
                if (tempMsgEl) {
                    tempMsgEl.dataset.messageId = newMessage.id; // Update the ID to the real one
                    const timestampEl = tempMsgEl.querySelector('.group-message-timestamp');
                    if (timestampEl) timestampEl.textContent = formatTimestamp(newMessage.created_at);
                } else {
                    // Otherwise, it's a new incoming message from the other user
                    renderSingleFriendMessage(formattedMessage);
                }
            } else {
                // TODO: Show a notification for a message from an inactive chat
                showNotification(`New message from another user!`);
            }
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