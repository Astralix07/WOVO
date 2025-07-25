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

            // Show/hide sidebars
            const label = item.querySelector('.nav-label')?.textContent?.toLowerCase();
            const friendSidebar = document.getElementById('friendProfileSidebar');
            const groupSidebar = document.getElementById('groupMembersSidebar');
            if (label === 'friends') {
                if (friendSidebar) friendSidebar.style.display = '';
                if (groupSidebar) groupSidebar.style.display = 'none';
                selectDefaultFriend();
            } else {
                if (friendSidebar) friendSidebar.style.display = 'none';
                if (groupSidebar) groupSidebar.style.display = '';
            }

            // Show the correct section
            if (label && mainSections[label]) {
                mainSections[label].style.display = '';
                mainSections[label].classList.add('active');
            } else if (label === 'groups') {
                mainSections.groups.style.display = '';
                mainSections.groups.classList.add('active');
            }
        });
    });

    // Update friend profile sidebar when a friend is selected
    function updateFriendProfileSidebar(friendItem) {
        if (!friendItem) return;
        const name = friendItem.querySelector('.friend-name')?.textContent || 'Friend';
        const avatar = friendItem.querySelector('img')?.src || 'assets/default-avatar.png';
        const id = friendItem.dataset.userId || '-';
        const banner = friendItem.dataset.bannerUrl || '';

        // Get all required elements
        const nameEl = document.getElementById('friendProfileName');
        const avatarEl = document.getElementById('friendProfileAvatar');
        const idEl = document.getElementById('friendProfileId');
        const bannerDiv = document.getElementById('friendBanner');

        // Guard: Only update if all elements exist
        if (!nameEl || !avatarEl || !idEl || !bannerDiv) return;

        nameEl.textContent = name;
        avatarEl.src = avatar;
        idEl.textContent = id;
        if (banner && bannerDiv) {
            bannerDiv.style.backgroundImage = `url('${banner}')`;
        } else if (bannerDiv) {
            bannerDiv.style.background = 'var(--bg-tertiary)';
        }
    }

    // Also update sidebar on default friend selection
    function selectDefaultFriend() {
        const friendsList = document.getElementById('realFriendsList');
        if (!friendsList) return;
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
                updateFriendProfileSidebar(firstFriend);
                // --- Ensure sidebar is correct ---
                const friendSidebar = document.getElementById('friendProfileSidebar');
                const groupSidebar = document.getElementById('groupMembersSidebar');
                if (friendSidebar) friendSidebar.style.display = '';
                if (groupSidebar) groupSidebar.style.display = 'none';
                observer.disconnect();
            }
        });
        observer.observe(friendsList, { childList: true, subtree: true });
        const firstFriend = friendsList.querySelector('.friend-item');
        if (firstFriend) {
            const friendsTitle = document.getElementById('friends-title');
            document.querySelectorAll('.friend-item.active').forEach(item => item.classList.remove('active'));
            firstFriend.classList.add('active');
            const friendName = firstFriend.querySelector('.friend-name')?.textContent;
            if (friendName && friendsTitle) {
                friendsTitle.textContent = friendName;
            }
            updateFriendProfileSidebar(firstFriend);
            // --- Ensure sidebar is correct ---
            const friendSidebar = document.getElementById('friendProfileSidebar');
            const groupSidebar = document.getElementById('groupMembersSidebar');
            if (friendSidebar) friendSidebar.style.display = '';
            if (groupSidebar) groupSidebar.style.display = 'none';
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
            updateFriendProfileSidebar(clickedFriend);
            // --- Ensure sidebar is correct ---
            const friendSidebar = document.getElementById('friendProfileSidebar');
            const groupSidebar = document.getElementById('groupMembersSidebar');
            if (friendSidebar) friendSidebar.style.display = '';
            if (groupSidebar) groupSidebar.style.display = 'none';
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
}); 