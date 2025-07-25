// dashboard_2.js - New features, including media sharing.

// --- Cloudinary Configuration ---
// Note: This must be an UNSIGNED upload preset. 
// Please ensure you have a preset named 'wovo_user' in your Cloudinary account,
// or change the name here to match your preset.
const CLOUDINARY_CLOUD_NAME = 'dxsvbes6q'; // Replace with your cloud name
const CLOUDINARY_UPLOAD_PRESET = 'wovo_user'; // Replace with your unsigned upload preset

document.addEventListener('DOMContentLoaded', () => {
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

    // --- DIRECT MESSAGING LOGIC ---
    const dmChatContainer = document.getElementById('dmChatContainer');
    const dmMessages = document.getElementById('dmMessages');
    const dmMessageForm = document.getElementById('dmMessageForm');
    const dmMessageInput = document.getElementById('dmMessageInput');
    const sendDmMessageBtn = document.getElementById('sendDmMessageBtn');
    let currentDmSubscription = null;
    let currentDmFriend = null;

    // --- FRIEND SWITCHING LOGIC ---
    function setupFriendsListForDMs() {
        const friendItems = document.querySelectorAll('.friend-item');
        friendItems.forEach(item => {
            item.onclick = async () => {
                // Remove active class from all
                friendItems.forEach(f => f.classList.remove('active'));
                item.classList.add('active');
                const username = item.querySelector('.friend-name').textContent;
                const { data: friendData } = await supabase.from('users').select('*').eq('username', username).single();
                if (friendData) {
                    enterDmChat(friendData);
                }
            };
        });
    }
    document.addEventListener('DOMContentLoaded', setupFriendsListForDMs);
    document.addEventListener('friendsListUpdated', setupFriendsListForDMs);

    async function enterDmChat(friend) {
        if (!friend) return;
        currentDmFriend = friend;
        updateHeaderInfo(friend.username, 'Direct Message');
        dmChatContainer.style.display = 'flex';
        placeholderContent.style.display = 'none';
        groupChatContainer.style.display = 'none';
        // Unsubscribe from previous
        if (currentDmSubscription) {
            currentDmSubscription.unsubscribe();
            currentDmSubscription = null;
        }
        // Show skeleton loader
        let loaderHTML = '';
        for (let i = 0; i < 5; i++) {
            loaderHTML += `
                <div class="skeleton-message">
                    <div class="skeleton-avatar"></div>
                    <div class="skeleton-content">
                        <div class="skeleton-line short"></div>
                        <div class="skeleton-line long"></div>
                    </div>
                </div>
            `;
        }
        dmMessages.innerHTML = loaderHTML;
        // Load messages
        await loadDms(friend.id);
        // Subscribe to new DMs
        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
        currentDmSubscription = supabase
            .channel(`dms_${currentUser.id}_${friend.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'direct_messages',
                filter: `or(and(sender_id.eq.${currentUser.id},receiver_id.eq.${friend.id}),and(sender_id.eq.${friend.id},receiver_id.eq.${currentUser.id}))`
            }, payload => {
                renderDm(payload.new);
            })
            .subscribe();
    }

    async function loadDms(friendId) {
        dmMessages.innerHTML = 'Loading...';
        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
        // Correct .or() syntax for Supabase
        const { data, error } = await supabase
            .from('direct_messages')
            .select('*, sender:sender_id(*), receiver:receiver_id(*)')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });
        dmMessages.innerHTML = '';
        if (!error && data) {
            data.forEach(msg => renderDm(msg));
            dmMessages.scrollTop = dmMessages.scrollHeight;
        }
    }

    function renderDm(msg, isNew = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'dm-message group-message'; // Re-use styling
        msgDiv.dataset.messageId = msg.id;
        if (isNew) msgDiv.classList.add('new-message-animation');

        // Build reply context if present
        let replyContextHtml = '';
        if (msg.reply_to && msg.reply_to.sender) {
            replyContextHtml = `
                <div class="reply-context">
                    <img src="${msg.reply_to.sender.avatar_url || DEFAULT_AVATAR}" alt="avatar">
                    <span class="reply-username">${escapeHtml(msg.reply_to.sender.username)}</span>
                    <span class="reply-text">${escapeHtml(msg.reply_to.content)}</span>
                </div>
            `;
        }

        // Message actions (reply, edit, delete, react)
        const currentUser = JSON.parse(localStorage.getItem('wovo_user') || '{}');
        const isOwner = msg.sender_id === currentUser.id;
        const messageActions = `
            <div class="message-actions">
                <button class="action-btn-icon add-reaction" title="Add Reaction"><i class="fas fa-smile"></i></button>
                <button class="action-btn-icon reply" title="Reply"><i class="fas fa-reply"></i></button>
                ${isOwner ? `
                    <button class="action-btn-icon edit" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                    <button class="action-btn-icon delete" title="Delete"><i class="fas fa-trash-alt"></i></button>
                ` : ''}
            </div>
        `;

        // Headings
        let contentHtml = '';
        if (msg.content) {
            if (msg.content.startsWith('# ')) {
                contentHtml = `<h1 class="message-heading">${formatMessageContent(msg.content.substring(2))}</h1>`;
            } else {
                contentHtml = `<div class="group-message-text">${formatMessageContent(msg.content)}</div>`;
            }
        }

        // Media
        let mediaHtml = '';
        if (msg.media_url) {
            if (msg.media_type === 'image') {
                mediaHtml = `<div class="group-message-media"><img src="${msg.media_url}" alt="Shared image" loading="lazy"></div>`;
            } else if (msg.media_type === 'video') {
                mediaHtml = `<div class="group-message-media"><video src="${msg.media_url}" controls></video></div>`;
            }
        }

        msgDiv.innerHTML = `
            <div class="group-message-avatar">
                <img src="${msg.sender.avatar_url || DEFAULT_AVATAR}" alt="avatar">
            </div>
            <div class="group-message-content">
                ${replyContextHtml}
                <div class="group-message-header">
                    <span class="group-message-username">${escapeHtml(msg.sender.username)}</span>
                    <span class="group-message-timestamp">${formatTimestamp(msg.created_at)}</span>
                    ${msg.is_edited ? '<span class="message-edited-tag">(edited)</span>' : ''}
                </div>
                ${contentHtml}
                ${mediaHtml}
            </div>
            ${messageActions}
        `;
        dmMessages.appendChild(msgDiv);
        // TODO: Add reactions rendering and event listeners for actions
    }

    if (sendDmMessageBtn) {
        sendDmMessageBtn.addEventListener('click', sendDm);
    }
    if (dmMessageInput) {
        dmMessageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendDm();
            }
        });
    }

    // --- DM REACTIONS LOGIC ---
    async function renderDmReactions(messageId, container) {
        const currentUser = JSON.parse(localStorage.getItem('wovo_user') || '{}');
        const { data: reactions, error } = await supabase
            .from('dm_message_reactions')
            .select('emoji, user_id')
            .eq('message_id', messageId);
        if (error) return;
        // Group reactions by emoji
        const grouped = (reactions || []).reduce((acc, r) => {
            acc[r.emoji] = acc[r.emoji] || [];
            acc[r.emoji].push(r.user_id);
            return acc;
        }, {});
        container.innerHTML = '';
        for (const [emoji, userIds] of Object.entries(grouped)) {
            const reactionEl = document.createElement('div');
            reactionEl.className = 'reaction';
            if (userIds.includes(currentUser.id)) {
                reactionEl.classList.add('reacted');
            }
            reactionEl.dataset.emoji = emoji;
            reactionEl.innerHTML = `<span class="emoji">${emoji}</span><span class="count">${userIds.length}</span>`;
            container.appendChild(reactionEl);
        }
    }

    // Real-time subscription for DM reactions
    let dmReactionsSubscription = null;
    function subscribeDmReactions(friendId) {
        if (dmReactionsSubscription) dmReactionsSubscription.unsubscribe();
        dmReactionsSubscription = supabase
            .channel(`dm_reactions_${friendId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_message_reactions' }, payload => {
                const messageId = payload.new?.message_id || payload.old?.message_id;
                const container = document.querySelector(`.dm-message[data-message-id="${messageId}"] .message-reactions-container`);
                if (container) renderDmReactions(messageId, container);
            })
            .subscribe();
    }

    // --- DM MEDIA UPLOAD LOGIC ---
    const addDmAttachmentBtn = document.getElementById('addDmAttachmentBtn');
    const dmFileInput = document.createElement('input');
    dmFileInput.type = 'file';
    dmFileInput.accept = 'image/*,video/*';
    let dmSelectedFile = null;

    if (addDmAttachmentBtn) {
        addDmAttachmentBtn.addEventListener('click', () => {
            dmFileInput.click();
        });
    }
    dmFileInput.addEventListener('change', handleDmFileSelect);

    function handleDmFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 30 * 1024 * 1024) {
            showNotification('File is too large (max 30MB)', 'error');
            return;
        }
        dmSelectedFile = file;
        sendDmMedia();
    }

    async function sendDmMedia() {
        if (!dmSelectedFile || !currentDmFriend) return;
        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
        const tempId = `temp_${Date.now()}`;
        // 1. Show instant preview
        const previewUrl = URL.createObjectURL(dmSelectedFile);
        renderDm({
            id: tempId,
            sender: currentUser,
            created_at: new Date().toISOString(),
            media_url: previewUrl,
            media_type: dmSelectedFile.type.split('/')[0],
            is_uploading: true
        }, true);
        // 2. Upload to Cloudinary
        try {
            const formData = new FormData();
            formData.append('file', dmSelectedFile);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, true);
            xhr.upload.onprogress = function(e) {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    const progressBar = document.querySelector(`.dm-message[data-message-id="${tempId}"] .progress-bar`);
                    if (progressBar) progressBar.style.width = percentComplete + '%';
                }
            };
            xhr.onload = async function() {
                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);
                    URL.revokeObjectURL(previewUrl);
                    await supabase.from('direct_messages').insert({
                        sender_id: currentUser.id,
                        receiver_id: currentDmFriend.id,
                        media_url: data.secure_url,
                        media_type: data.resource_type,
                        client_temp_id: tempId
                    });
                } else {
                    showNotification('Upload failed', 'error');
                }
            };
            xhr.onerror = function() {
                showNotification('Network error during upload', 'error');
            };
            xhr.send(formData);
        } catch (error) {
            showNotification('Failed to send media', 'error');
        }
    }

    // --- DM MESSAGE ACTIONS (continued) ---
    dmMessages.addEventListener('click', async (e) => {
        const msgDiv = e.target.closest('.dm-message');
        if (!msgDiv) return;
        const messageId = msgDiv.dataset.messageId;
        // Add Reaction
        if (e.target.closest('.action-btn-icon.add-reaction')) {
            // Show emoji picker
            currentMessageForReaction = messageId;
            const rect = e.target.getBoundingClientRect();
            emojiPickerContainer.style.top = `${rect.top - 360}px`;
            emojiPickerContainer.style.left = `${rect.left - 300}px`;
            emojiPickerContainer.style.display = 'block';
            emojiPickerContainer.dataset.dm = 'true';
            return;
        }
        // Reaction click
        if (e.target.closest('.reaction')) {
            const emoji = e.target.closest('.reaction').dataset.emoji;
            toggleDmReaction(messageId, emoji);
            return;
        }
    });

    // Emoji picker for DMs
    emojiPicker.addEventListener('emoji-click', async e => {
        if (emojiPickerContainer.dataset.dm === 'true' && currentMessageForReaction) {
            const emoji = e.detail.unicode;
            await toggleDmReaction(currentMessageForReaction, emoji);
            emojiPickerContainer.style.display = 'none';
            emojiPickerContainer.dataset.dm = '';
        }
    });

    async function toggleDmReaction(messageId, emoji) {
        const currentUser = JSON.parse(localStorage.getItem('wovo_user') || '{}');
        const { data: existing } = await supabase
            .from('dm_message_reactions')
            .select('id')
            .eq('message_id', messageId)
            .eq('user_id', currentUser.id)
            .eq('emoji', emoji)
            .single();
        if (existing) {
            await supabase.from('dm_message_reactions').delete().eq('id', existing.id);
        } else {
            await supabase.from('dm_message_reactions').insert({
                message_id: messageId,
                user_id: currentUser.id,
                emoji
            });
        }
    }

    // --- DM MESSAGE ACTIONS ---
    let currentDmReplyTo = null;
    let currentDmEditId = null;

    // Send DM (with reply/edit logic)
    async function sendDm() {
        const content = dmMessageInput.value.trim();
        if (!content || !currentDmFriend) return;
        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
        if (currentDmEditId) {
            await supabase.from('direct_messages').update({ content, is_edited: true }).eq('id', currentDmEditId);
            currentDmEditId = null;
            dmMessageInput.value = '';
            return;
        }
        let reply_to_message_id = null;
        if (currentDmReplyTo) {
            reply_to_message_id = currentDmReplyTo;
            currentDmReplyTo = null;
        }
        const { error } = await supabase.from('direct_messages').insert({
            sender_id: currentUser.id,
            receiver_id: currentDmFriend.id,
            content,
            reply_to_message_id
        });
        if (!error) {
            renderDm({
                sender: currentUser,
                created_at: new Date().toISOString(),
                content
            }, true);
            dmMessageInput.value = '';
            dmMessages.scrollTop = dmMessages.scrollHeight;
        }
    }

    // --- NAVIGATION INTEGRATION ---
    // Make all friends clickable for DMs
    function setupFriendsListForDMs() {
        const friendItems = document.querySelectorAll('.friend-item');
        friendItems.forEach(item => {
            item.addEventListener('click', async () => {
                const username = item.querySelector('.friend-name').textContent;
                // Fetch user by username (assuming usernames are unique)
                const { data: friendData } = await supabase.from('users').select('*').eq('username', username).single();
                if (friendData) {
                    enterDmChat(friendData);
                }
            });
        });
    }

    // Call this after the friends list is rendered
    document.addEventListener('DOMContentLoaded', setupFriendsListForDMs);
    // Also call after any dynamic update to the friends list
    document.addEventListener('friendsListUpdated', setupFriendsListForDMs);

    // Patch the navigation to show placeholder only if no friends
    const friendsNavBtn = Array.from(document.querySelectorAll('.nav-item .nav-label'))
        .find(el => el.textContent === 'Friends')?.parentElement;

    if (friendsNavBtn) {
        friendsNavBtn.addEventListener('click', async () => {
            // Fetch all friends
            const { data: friends, error } = await supabase
                .from('friends')
                .select('user_id_1, user_id_2');

            if (!error && friends.length > 0) {
                // Automatically open DM with the first friend
                const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
                const friendId = friends[0].user_id_1 === currentUser.id ? friends[0].user_id_2 : friends[0].user_id_1;
                const { data: friendData } = await supabase.from('users').select('*').eq('id', friendId).single();
                if (friendData) {
                    showMainContent({ dm: true });
                    enterDmChat(friendData);
                }
            } else {
                showMainContent({ placeholder: true });
                updateHeaderInfo('Friends', 'No friends yet');
            }
        });
    }
}); 