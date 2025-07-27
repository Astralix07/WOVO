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

            if (label === 'friends') {
                selectDefaultFriend();
            }
        });
    });

    function selectDefaultFriend() {
        const friendsList = document.getElementById('realFriendsList');
        if (!friendsList) return;

        // Use a MutationObserver to wait for friends to be loaded if they are added dynamically
        const observer = new MutationObserver((mutationsList, observer) => {
            const firstFriend = friendsList.querySelector('.friend-item');
            if (firstFriend) {
                const friendsTitle = document.getElementById('friends-title');
                
                // Remove active class from any other friend
                document.querySelectorAll('.friend-item.active').forEach(item => item.classList.remove('active'));

                // Activate the first friend and update the header
                firstFriend.classList.add('active');
                const friendName = firstFriend.querySelector('.friend-name')?.textContent;
                const friendAvatarSrc = firstFriend.querySelector('img')?.src;
                const headerAvatar = document.getElementById('friend-header-avatar');

                if (friendName && friendsTitle) {
                    friendsTitle.textContent = friendName;
                }
                if (friendAvatarSrc && headerAvatar) {
                    headerAvatar.src = friendAvatarSrc;
                }
                observer.disconnect(); // We're done, so disconnect
            }
        });

        // Start observing the friends list for child additions
        observer.observe(friendsList, { childList: true, subtree: true });

        // Also, check if the friend is already there
        const firstFriend = friendsList.querySelector('.friend-item');
        if (firstFriend) {
            const friendsTitle = document.getElementById('friends-title');
            document.querySelectorAll('.friend-item.active').forEach(item => item.classList.remove('active'));
            firstFriend.classList.add('active');
            const friendName = firstFriend.querySelector('.friend-name')?.textContent;
            if (friendName && friendsTitle) {
                friendsTitle.textContent = friendName;
            }
            observer.disconnect();
        }
    }

    // --- FRIEND SELECTION LOGIC ---
    const friendsListContainer = document.getElementById('realFriendsList');
    if (friendsListContainer) {
        friendsListContainer.addEventListener('click', (e) => {
            const clickedFriend = e.target.closest('.friend-item');
            if (!clickedFriend) return;

            // Don't do anything if it's already active
            if (clickedFriend.classList.contains('active')) return;

            // Remove active class from all friends
            document.querySelectorAll('.friend-item.active').forEach(item => item.classList.remove('active'));

            // Add active class to clicked friend
            clickedFriend.classList.add('active');

            // Update header
            const friendName = clickedFriend.querySelector('.friend-name')?.textContent;
            const friendAvatarSrc = clickedFriend.querySelector('img')?.src;
            const friendsTitle = document.getElementById('friends-title');
            const headerAvatar = document.getElementById('friend-header-avatar');

            if (friendName && friendsTitle) {
                friendsTitle.textContent = friendName;
            }
            if (friendAvatarSrc && headerAvatar) {
                headerAvatar.src = friendAvatarSrc;
            }
        });
    }

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

    // --- Match Ticket Feature ---
    const showTicketPresetsBtn = document.getElementById('showTicketPresetsBtn');
    const ticketPresetsModal = document.getElementById('ticketPresetsModal');
    const closeButtons = document.querySelectorAll('.close-modal-btn');
    const ticketPresetsGrid = document.querySelector('.ticket-presets-grid');
    const groupMessages = document.getElementById('groupMessages');

    // --- Modal Handling ---
    if (showTicketPresetsBtn) {
        showTicketPresetsBtn.addEventListener('click', () => {
            if (ticketPresetsModal) ticketPresetsModal.style.display = 'flex';
        });
    }

    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.dataset.modalId;
            const modal = document.getElementById(modalId);
            if (modal) modal.style.display = 'none';
        });
    });

    if (ticketPresetsModal) {
        ticketPresetsModal.addEventListener('click', (e) => {
            if (e.target === ticketPresetsModal) {
                ticketPresetsModal.style.display = 'none';
            }
        });
    }

    // --- Sending a Ticket ---
    if (ticketPresetsGrid) {
        ticketPresetsGrid.addEventListener('click', (e) => {
            if (e.target.classList.contains('ticket-preset-btn')) {
                const ticketType = e.target.dataset.ticketType;
                const activeGroupId = document.querySelector('.group-item.active')?.dataset.groupId;
                const currentUser = { id: localUserId, username: localUsername, avatar: localUserAvatar };

                if (activeGroupId && currentUser.id) {
                    socket.emit('create_ticket', {
                        groupId: activeGroupId,
                        ticketType,
                        user: currentUser
                    });
                    ticketPresetsModal.style.display = 'none';
                }
            }
        });
    }

    // --- Receiving a new ticket ---
    socket.on('new_ticket', (ticket) => {
        renderTicketMessage(ticket);
    });

    // --- Handling ticket closure ---
    socket.on('ticket_closed', (data) => {
        const { ticketId, reason, acceptedBy } = data;
        const ticketElement = document.getElementById(ticketId);
        if (ticketElement) {
            const actions = ticketElement.querySelector('.ticket-actions');
            const footer = ticketElement.querySelector('.ticket-footer');
            const timer = ticketElement.querySelector('.ticket-timer');
            if (timer) timer.remove();

            let statusMessage = `Ticket closed. Reason: ${reason}.`;
            if (reason === 'Accepted' && acceptedBy) {
                statusMessage = `Ticket accepted by ${acceptedBy.username}!`;
            }

            if (actions) actions.innerHTML = `<p class="ticket-status">${statusMessage}</p>`;
            if (footer) footer.remove();
        }
    });

    // --- Interacting with a ticket ---
    if (groupMessages) {
        groupMessages.addEventListener('click', (e) => {
            const target = e.target;
            const ticketMessage = target.closest('.ticket-message');
            if (!ticketMessage) return;
            const ticketId = ticketMessage.id;

            const currentUser = { id: localUserId, username: localUsername, avatar: localUserAvatar };

            if (target.classList.contains('btn-accept')) {
                socket.emit('ticket_response', { ticketId, response: 'accept', user: currentUser });
            } else if (target.classList.contains('btn-reject')) {
                target.disabled = true;
                target.textContent = 'Rejected';
            } else if (target.classList.contains('btn-close')) {
                socket.emit('close_ticket', { ticketId, userId: currentUser.id });
            }
        });
    }
});

function renderTicketMessage(ticket) {
    const groupMessages = document.getElementById('groupMessages');
    if (!groupMessages) return;

    const isSender = ticket.sender.id === localUserId;

    let actionsHtml = '';
    if (isSender) {
        actionsHtml = `<button class="btn btn-close">Close Ticket</button>`;
    } else {
        actionsHtml = `
            <button class="btn btn-accept">Accept</button>
            <button class="btn btn-reject">Reject</button>
        `;
    }

    const ticketHtml = `
        <div class="group-message" data-message-id="${ticket.id}">
            <div class="group-message-avatar">
                <img src="${ticket.sender.avatar || 'assets/default-avatar.png'}" alt="${ticket.sender.username}">
            </div>
            <div class="group-message-content">
                 <div class="group-message-header">
                    <span class="group-message-username">${ticket.sender.username}</span>
                    <span class="group-message-timestamp">${new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="ticket-message" id="${ticket.id}">
                    <div class="ticket-header">
                        <span class="ticket-title">${ticket.type}</span>
                        <span class="ticket-timer">2:00</span>
                    </div>
                    <div class="ticket-body">
                        <p>${ticket.sender.username} has started a match ticket.</p>
                    </div>
                    <div class="ticket-actions">
                        ${actionsHtml}
                    </div>
                    <div class="ticket-footer">
                        <span>Waiting for players...</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    groupMessages.insertAdjacentHTML('beforeend', ticketHtml);
    groupMessages.scrollTop = groupMessages.scrollHeight;
    startTicketTimer(ticket.id);
}

function startTicketTimer(ticketId) {
    const ticketElement = document.getElementById(ticketId);
    if (!ticketElement) return;
    const timerElement = ticketElement.querySelector('.ticket-timer');
    if (!timerElement) return;

    let duration = 120; // 2 minutes in seconds
    const interval = setInterval(() => {
        // If the ticket element is gone or closed, stop the timer
        const currentTicketElement = document.getElementById(ticketId);
        if (!currentTicketElement || currentTicketElement.querySelector('.ticket-status')) {
            clearInterval(interval);
            return;
        }

        duration--;
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        if (duration <= 0) {
            clearInterval(interval);
        }
    }, 1000);
} 