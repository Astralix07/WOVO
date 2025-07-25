// Default avatar path
const DEFAULT_AVATAR = './assets/default-avatar.png';

// Initialize Supabase client
const SUPABASE_URL = 'https://mygdcrvbrqfxudvxrwpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15Z2RjcnZicnFmeHVkdnhyd3BxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3NjQ1MzIsImV4cCI6MjA2ODM0MDUzMn0.5Wavk9j2oZ2BbBqeULr5TSYcQMWk_PFJAbP9RYxNAiU';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Mentions state
let currentGroupMembers = [];
let mentionQuery = '';
let isMentionPopupOpen = false;

// --- BROWSER NOTIFICATIONS ---
function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('This browser does not support desktop notification');
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

function showBrowserNotification(title, body, icon) {
    if (document.hidden && Notification.permission === 'granted') {
        new Notification(title, { body, icon: icon || './assets/wovo-logo-small.png' });
    }
}

// DOM Elements - Global
const sidebar = document.getElementById('sidebar');
const hamburgerBtn = document.getElementById('hamburger-btn');
const themeToggle = document.getElementById('theme-toggle');
const html = document.documentElement;
const emojiPicker = document.querySelector('emoji-picker');

// Initialize theme from localStorage
const savedTheme = localStorage.getItem('theme') || 'dark';
html.setAttribute('data-theme', savedTheme);
if (emojiPicker) {
    emojiPicker.className = savedTheme;
}
updateThemeIcon(savedTheme);

// Initialize all DOM elements and event listeners when document is ready
document.addEventListener('DOMContentLoaded', () => {
    requestNotificationPermission();

    // Initialize DOM elements
    const logoutBtn = document.getElementById('logout-btn');
    const settingsBtn = document.querySelector('.user-settings-btn');
    const sidebarSettingsBtn = document.querySelector('.nav-item[data-section="settings"]');
    const settingsPage = document.getElementById('settings-page');
    const closeSettingsBtn = document.querySelector('.close-settings');
    const defaultContent = document.getElementById('default-content');
    const settingsCategories = document.querySelectorAll('.settings-category');
    const settingsSections = document.querySelectorAll('.settings-section');

    // Toggle Members Sidebar
    const toggleMembersBtn = document.getElementById('toggleMembersBtn');
    const appContainer = document.querySelector('.app');

    if (toggleMembersBtn && appContainer) {
        toggleMembersBtn.addEventListener('click', () => {
            appContainer.classList.toggle('members-sidebar-hidden');
            toggleMembersBtn.classList.toggle('active');
            localStorage.setItem('membersSidebarHidden', appContainer.classList.contains('members-sidebar-hidden'));
        });

        if (localStorage.getItem('membersSidebarHidden') === 'true') {
            appContainer.classList.add('members-sidebar-hidden');
            toggleMembersBtn.classList.add('active');
        }
    }

    // Main sidebar navigation
    const navItems = document.querySelectorAll('.sidebar-top .nav-item');
    const detailSections = document.querySelectorAll('.details-sidebar .details-section');
    const mainContent = document.getElementById('default-content');
    const contentTitle = document.getElementById('content-title');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.target;

            // Update nav item active state
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Update details sidebar sections
            detailSections.forEach(section => {
                if (section.id === target) {
                    section.classList.add('active');
                } else {
                    section.classList.remove('active');
                }
            });

            // Update main content area
            const groupChatContainer = document.getElementById('groupChatContainer');
            const dmChatSection = document.getElementById('dm-chat-section');

            // Hide all main content sections first
            document.querySelectorAll('.main-content-section').forEach(s => s.classList.remove('active'));

            if (target === 'groups-section') {
                document.getElementById('default-content').classList.add('active');
            } else if (target === 'friends-section') {
                // When friends tab is clicked, we don't show a chat window yet.
                // We just show the friends list. The main content can be a placeholder.
                document.getElementById('default-content').classList.add('active'); // Or a new friends placeholder section
                renderFriendsList();
            } else {
                // Handle other sections by showing a placeholder
                const placeholder = document.getElementById('default-content');
                placeholder.classList.add('active');
                placeholder.querySelector('.content-container').innerHTML = `<div style="padding: 20px;">${item.querySelector('.nav-label').textContent} content goes here.</div>`;
            }
        });
    });

    // DM form submission
    const dmForm = document.getElementById('dm-message-form');
    const dmInput = document.getElementById('dm-message-input');
    if (dmForm && dmInput) {
        dmForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const content = dmInput.value.trim();
            const currentUser = JSON.parse(localStorage.getItem('wovo_user'));

            if (content && currentDmFriend && currentUser) {
                const message = {
                    toUserId: currentDmFriend.id,
                    fromUserId: currentUser.id,
                    content: content
                };

                // Emit to server
                socket.emit('direct_message_send', message, (response) => {
                    if (response.status === 'ok') {
                        // Optimistically add to UI
                        appendDmMessage(response.message, document.getElementById('dm-messages'), currentUser.id);
                    } else {
                        showNotification('Failed to send message', 'error');
                    }
                });

                dmInput.value = '';
            }
        });
    }

    // Listen for incoming DMs
    socket.on('direct_message_receive', (message) => {
        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
        if (currentDmFriend && message.sender_id === currentDmFriend.id) {
            // If the DM is for the currently open chat, append it
            appendDmMessage(message, document.getElementById('dm-messages'), currentUser.id);
        } else {
            // Otherwise, update the unread count and re-render the list
            const friend = friends.find(f => f.id === message.sender_id);
            if (friend) {
                friend.unread_count = (friend.unread_count || 0) + 1;
                renderFriendsList(); // Re-render to show the badge
            }
            showNotification(`New message from ${message.sender.username}`, 'info');
            if (document.hidden) { // Only show browser notification if tab is not active
                showBrowserNotification(`New message from ${message.sender.username}`, message.content, message.sender.avatar_url);
            }
        }
    });

    // Typing indicator logic
    let typingTimer;
    const doneTypingInterval = 1500; // 1.5 seconds

    if (dmInput) {
        dmInput.addEventListener('input', () => {
            const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
            if (currentDmFriend && currentUser) {
                clearTimeout(typingTimer);
                socket.emit('user_typing_start', {
                    toUserId: currentDmFriend.id,
                    fromUserId: currentUser.id
                });
                typingTimer = setTimeout(() => {
                    socket.emit('user_typing_stop', {
                        toUserId: currentDmFriend.id,
                        fromUserId: currentUser.id
                    });
                }, doneTypingInterval);
            }
        });
    }

    socket.on('user_typing_start', ({ fromUserId }) => {
        const typingIndicator = document.getElementById('typing-indicator');
        if (currentDmFriend && fromUserId === currentDmFriend.id) {
            typingIndicator.textContent = `${currentDmFriend.username} is typing...`;
            typingIndicator.classList.add('active');
        }
    });

    socket.on('user_typing_stop', ({ fromUserId }) => {
        const typingIndicator = document.getElementById('typing-indicator');
        if (currentDmFriend && fromUserId === currentDmFriend.id) {
            typingIndicator.classList.remove('active');
            typingIndicator.textContent = '';
        }
    });

    // Edit/Delete Message Logic
    const dmMessagesContainer = document.getElementById('dm-messages');
    const dmMessageForm = document.getElementById('dm-message-form');
    const emojiPicker = document.querySelector('emoji-picker');
    const editModal = document.getElementById('edit-message-modal');
    const edit_textarea = document.getElementById('edit-message-textarea');
    const saveEditBtn = document.getElementById('save-edit-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    let messageToEditId = null;
    let activeReactionMessageId = null;
    let readReceiptObserver;

    dmMessagesContainer.addEventListener('click', async (e) => {
        const messageEl = e.target.closest('.message-item');
        if (!messageEl) return;

        const messageId = messageEl.dataset.messageId;
        const reactBtn = e.target.closest('.react-btn');
        const reactionItem = e.target.closest('.reaction-item');
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');

        if (reactBtn) {
            activeReactionMessageId = messageId;
            const rect = reactBtn.getBoundingClientRect();
            emojiPicker.style.top = `${window.scrollY + rect.top - emojiPicker.offsetHeight - 10}px`;
            emojiPicker.style.left = `${window.scrollX + rect.left - (emojiPicker.offsetWidth / 2) + (rect.width / 2)}px`;
            emojiPicker.style.display = 'block';
            e.stopPropagation();
        } else if (reactionItem) {
            const emoji = reactionItem.dataset.emoji;
            await handleReaction(messageId, emoji);
        } else if (editBtn) {
            const messageText = messageEl.querySelector('.message-text').textContent.replace('(edited)', '').trim();
            messageToEditId = messageId;
            edit_textarea.value = messageText;
            editModal.style.display = 'flex';
        } else if (deleteBtn) {
            if (confirm('Are you sure you want to delete this message?')) {
                handleDeleteMessage(messageId);
            }
        }
    });

    emojiPicker.addEventListener('emoji-click', async (e) => {
        if (activeReactionMessageId) {
            await handleReaction(activeReactionMessageId, e.detail.unicode);
        }
        emojiPicker.style.display = 'none';
    });

    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target.closest('.react-btn') === null) {
            emojiPicker.style.display = 'none';
        }
    });

    async function handleReaction(messageId, emoji) {
        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
        const messageElement = document.getElementById(`message-${messageId}`);
        const existingReaction = messageElement.querySelector(`.reaction-item[data-emoji="${emoji}"]`);
        let hasReacted = false;

        if (existingReaction) {
            // This is a simplified check. A real implementation would need to know if the *current user* has reacted.
            // For now, we'll assume clicking an existing reaction is a toggle by the current user.
            // A more robust solution would fetch reaction users from the backend.
            hasReacted = true; // Simplified assumption
        }

        try {
            let reactionData;
            if (hasReacted) {
                // --- Remove Reaction ---
                await fetch(`/api/dm/messages/${messageId}/reactions`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: currentUser.id, emoji })
                });
                reactionData = { messageId, emoji, userId: currentUser.id, type: 'remove' };
            } else {
                // --- Add Reaction ---
                const response = await fetch(`/api/dm/messages/${messageId}/reactions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: currentUser.id, emoji })
                });
                const newReaction = await response.json();
                reactionData = { ...newReaction, type: 'add' };
            }

            // Update UI locally and emit socket event
            updateReactionUI(reactionData);
            socket.emit('direct_message_react', { toUserId: activeDmFriend.id, reactionData });

        } catch (error) {
            console.error('Failed to update reaction:', error);
        }
    }

    function updateReactionUI({ messageId, emoji, userId, type }) {
        const messageElement = document.getElementById(`message-${messageId}`);
        if (!messageElement) return;

        const reactionsContainer = messageElement.querySelector('.message-reactions');
        let reactionItem = reactionsContainer.querySelector(`.reaction-item[data-emoji="${emoji}"]`);

        if (type === 'add') {
            if (reactionItem) {
                const countSpan = reactionItem.querySelector('.reaction-count');
                countSpan.textContent = parseInt(countSpan.textContent) + 1;
            } else {
                const newReaction = document.createElement('div');
                newReaction.classList.add('reaction-item');
                newReaction.dataset.emoji = emoji;
                newReaction.innerHTML = `${emoji} <span class="reaction-count">1</span>`;
                reactionsContainer.appendChild(newReaction);
            }
        } else if (type === 'remove') {
            if (reactionItem) {
                const countSpan = reactionItem.querySelector('.reaction-count');
                const currentCount = parseInt(countSpan.textContent);
                if (currentCount > 1) {
                    countSpan.textContent = currentCount - 1;
                } else {
                    reactionItem.remove();
                }
            }
        }
    }

    cancelEditBtn.addEventListener('click', () => {
        editModal.style.display = 'none';
        messageToEditId = null;
    });

    saveEditBtn.addEventListener('click', async () => {
        const newContent = edit_textarea.value.trim();
        if (!newContent || !messageToEditId) return;

        try {
            const response = await fetch(`/api/dm/messages/${messageToEditId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newContent })
            });

            if (!response.ok) throw new Error('Failed to save message');

            const updatedMessage = await response.json();

            // Update UI
            const messageEl = document.getElementById(`message-${messageToEditId}`);
            messageEl.querySelector('.message-text').innerHTML = `${updatedMessage.content} <span class="edited-indicator">(edited)</span>`;

            // Notify other user
            socket.emit('direct_message_edit', { message: updatedMessage, toUserId: currentDmFriend.id });

            // Close modal
            editModal.style.display = 'none';
            messageToEditId = null;

        } catch (error) {
            console.error('Error saving message:', error);
            showNotification('Failed to save message', 'error');
        }
    });

    async function handleDeleteMessage(messageId) {
        try {
            const response = await fetch(`/api/dm/messages/${messageId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete message');

            document.getElementById(`message-${messageId}`).remove();
            socket.emit('direct_message_delete', { messageId, toUserId: currentDmFriend.id });
        } catch (error) {
            console.error('Error deleting message:', error);
            showNotification('Failed to delete message', 'error');
        }
    }

    // Socket listeners for real-time updates
    socket.on('direct_message_reacted', (reactionData) => {
        updateReactionUI(reactionData);
    });

    socket.on('messages_read', ({ messageIds }) => {
        messageIds.forEach(id => {
            const receipt = document.querySelector(`#message-${id} .read-receipt`);
            if (receipt) {
                receipt.classList.add('read');
            }
        });
    });

    function setupReadReceiptObserver(currentUserId) {
        if (readReceiptObserver) {
            readReceiptObserver.disconnect();
        }

        const options = { root: dmMessagesContainer, rootMargin: '0px', threshold: 1.0 };

        readReceiptObserver = new IntersectionObserver(async (entries, observer) => {
            const messagesToMarkAsRead = [];

            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const messageEl = entry.target;
                    messagesToMarkAsRead.push(messageEl.dataset.messageId);
                    observer.unobserve(messageEl); // Stop observing once it's marked
                }
            });

            if (messagesToMarkAsRead.length > 0) {
                await fetch('/api/dm/messages/read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messageIds: messagesToMarkAsRead, userId: currentUserId })
                });

                socket.emit('mark_messages_read', {
                    toUserId: activeDmFriend.id,
                    messageIds: messagesToMarkAsRead
                });
            }
        }, options);

        // Observe all unread, received messages
        const unreadMessages = dmMessagesContainer.querySelectorAll('.message-item.received');
        unreadMessages.forEach(messageEl => {
            const receipt = messageEl.querySelector('.read-receipt');
            if (receipt && !receipt.classList.contains('read')) {
                 readReceiptObserver.observe(messageEl);
            }
        });
    }

    socket.on('direct_message_edited', (message) => {
        const messageEl = document.getElementById(`message-${message.id}`);
        if (messageEl) {
            messageEl.querySelector('.message-text').innerHTML = `${message.content} <span class="edited-indicator">(edited)</span>`;
        }
    });

    socket.on('direct_message_deleted', ({ messageId }) => {
        const messageEl = document.getElementById(`message-${messageId}`);
        if (messageEl) {
            messageEl.remove();
        }
    });

    // Initialize section toggles
    const toggleButtons = document.querySelectorAll('.toggle-section');
    if (toggleButtons) {
        toggleButtons.forEach(button => {
            button.addEventListener('click', () => {
                const sectionId = button.id.replace('toggle', '');
                const section = document.getElementById(sectionId);
                if (section) {
                    // Toggle the collapsed state
                    button.classList.toggle('collapsed');
                    section.classList.toggle('collapsed');
                }
            });
        });
    }

    // Initialize settings functionality
    if (settingsBtn) {
        settingsBtn.addEventListener('click', openSettings);
    }
    if (sidebarSettingsBtn) {
        sidebarSettingsBtn.addEventListener('click', openSettings);
    }
    if (closeSettingsBtn && defaultContent) {
        closeSettingsBtn.addEventListener('click', () => {
            if (settingsPage) {
                settingsPage.classList.remove('active');
                defaultContent.classList.add('active');
            }
        });
    }

    // Initialize settings categories
    if (settingsCategories.length && settingsSections.length) {
        settingsCategories.forEach(category => {
            category.addEventListener('click', () => {
                const sectionName = category.dataset.section;
                if (!sectionName) return;
                
                // Update active category
                settingsCategories.forEach(c => c.classList.remove('active'));
                category.classList.add('active');
                
                // Show corresponding section
                settingsSections.forEach(section => section.classList.remove('active'));
                const activeSection = document.getElementById(`${sectionName}-section`);
                if (activeSection) {
                    activeSection.classList.add('active');
                }
            });
        });
    }

    // Initialize logout functionality
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                localStorage.removeItem('wovo_user');
                window.location.href = 'index.html';
            } catch (error) {
                showNotification('Failed to log out', 'error');
            }
        });
    }

    // Friend list filter controls
    const friendFilters = document.querySelectorAll('.friends-list-controls .control-btn');
    friendFilters.forEach(button => {
        button.addEventListener('click', () => {
            friendFilters.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            const filter = button.dataset.filter;
            renderFriendsList(filter);
        });
    });

    // Initialize logout functionality
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                localStorage.removeItem('wovo_user');
                window.location.href = 'index.html';
            } catch (error) {
                showNotification('Failed to log out', 'error');
            }
        });
    }

    // Load public groups on startup
    loadPublicGroups();

    // Add click handlers to default groups
    const defaultGroups = document.querySelectorAll('.group-item');
    if (defaultGroups) {
        defaultGroups.forEach(groupItem => {
            groupItem.addEventListener('click', () => handleGroupSelection(groupItem));
        });
    }

    // Initialize header with active group
    const activeGroup = document.querySelector('.group-item.active');
    if (activeGroup) {
        handleGroupSelection(activeGroup);
    }

    // Initialize font size slider
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    if (fontSizeSlider) {
        fontSizeSlider.addEventListener('input', function(e) {
            document.documentElement.style.setProperty('--chat-font-size', `${e.target.value}px`);
        });
    }

    // Initialize delete account confirmation
    const deleteConfirm = document.getElementById('deleteConfirm');
    const deleteConfirmText = document.getElementById('deleteConfirmText');
    const deleteBtn = document.querySelector('.delete-account-btn');

    if (deleteConfirm && deleteConfirmText && deleteBtn) {
        function checkDeleteConfirmation() {
            const isChecked = deleteConfirm.checked;
            const confirmText = deleteConfirmText.value;
            deleteBtn.disabled = !(isChecked && confirmText === 'DELETE MY ACCOUNT');
        }

        deleteConfirm.addEventListener('change', checkDeleteConfirmation);
        deleteConfirmText.addEventListener('input', checkDeleteConfirmation);

        // Remove any existing click listeners
        deleteBtn.replaceWith(deleteBtn.cloneNode(true));
        const newDeleteBtn = document.querySelector('.delete-account-btn');

        if (newDeleteBtn) {
            newDeleteBtn.addEventListener('click', async function(e) {
                e.preventDefault();
                if (deleteConfirmText.value === 'DELETE MY ACCOUNT' && deleteConfirm.checked) {
                    try {
                        // Show final confirmation modal
                        const finalConfirmed = await showFinalDeleteConfirmation();
                        if (finalConfirmed) {
                            // Show progress modal
                            showDeletionProgress();
                            await deleteUserAccount();
                        }
                    } catch (error) {
                        showNotification('An error occurred during account deletion', 'error');
                    }
                } else {
                    showNotification('Please type "DELETE MY ACCOUNT" and check the confirmation box', 'error');
                }
            });
        }
    }

    // Initialize delete confirmation modal close button
    const cancelDeleteBtn = document.querySelector('.cancel-delete-btn');
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', function() {
            const modal = document.querySelector('.final-delete-modal');
            if (modal) modal.style.display = 'none';
        });
    }

    // Save settings changes
    const toggleSwitches = document.querySelectorAll('.toggle-switch input[type="checkbox"]');
    if (toggleSwitches) {
        toggleSwitches.forEach(toggle => {
            toggle.addEventListener('change', function() {
                const settingName = this.closest('.option-details')?.querySelector('.option-title')?.textContent || 'Setting';
                showNotification(`${settingName} ${this.checked ? 'enabled' : 'disabled'}`);
            });
        });
    }

    // Refresh groups button logic
    const refreshBtn = document.querySelector('.refresh-groups-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            if (refreshBtn.disabled) return;
            refreshBtn.disabled = true;
            const originalHtml = refreshBtn.innerHTML;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            try {
                await loadPublicGroups();
                showNotification('Groups refreshed!', 'success');
            } catch (e) {
                showNotification('Failed to refresh groups', 'error');
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = originalHtml;
            }
        });
    }
});

// Sidebar Toggle
hamburgerBtn.addEventListener('click', () => {
    sidebar.classList.toggle('expanded');
    // Update hamburger icon
    const icon = hamburgerBtn.querySelector('i');
    if (sidebar.classList.contains('expanded')) {
        icon.classList.remove('fa-bars');
        icon.classList.add('fa-times');
    } else {
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
    }
});

// Theme Toggle
themeToggle.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    if (emojiPicker) {
        emojiPicker.className = newTheme;
    }
    updateThemeIcon(newTheme);
    
    // Update theme toggle label
    const label = themeToggle.querySelector('.nav-label');
    label.textContent = `${newTheme === 'dark' ? 'Dark' : 'Light'} Mode`;
});

// Update theme icon and label
function updateThemeIcon(theme) {
    const icon = themeToggle.querySelector('i');
    const label = themeToggle.querySelector('.nav-label');
    
    icon.classList.remove('fa-sun', 'fa-moon');
    icon.classList.add(theme === 'dark' ? 'fa-moon' : 'fa-sun');
    label.textContent = `${theme === 'dark' ? 'Dark' : 'Light'} Mode`;
}

// Close sidebar when clicking outside
document.addEventListener('click', (e) => {
    if (!sidebar.contains(e.target) && sidebar.classList.contains('expanded')) {
        sidebar.classList.remove('expanded');
        const icon = hamburgerBtn.querySelector('i');
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
    }
});

// Update header info function
function updateHeaderInfo(name, onlineCount) {
    const titleElement = document.querySelector('#content-title');
    const countElement = document.querySelector('.active-count');
    
    if (titleElement) {
        titleElement.textContent = name;
    }
    
    if (countElement) {
        countElement.textContent = onlineCount;
    }
}

// Function to check if user is member of group
async function checkGroupMembership(groupId) {
    const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
    if (!currentUser) return false;

    try {
        const { data, error } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', currentUser.id)
            .single();

        if (error) {
            return false;
        }

        return data ? data.role : null;
    } catch (error) {
        return false;
    }
}

// Function to join group
async function joinGroup(groupId) {
    const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
    if (!currentUser) {
        showNotification('Please log in to join groups', 'error');
        return;
    }

    try {
        // First check if user is already a member
        const { data: memberData, error: memberError } = await supabase
            .from('group_members')
            .select('id')
            .eq('group_id', groupId)
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (memberError) {
            showNotification('Failed to check membership', 'error');
            return;
        }

        if (memberData) {
            showNotification('You are already a member of this group', 'error');
            return;
        }

        // Add user to group_members
        const { error: joinError } = await supabase
            .from('group_members')
            .insert([{
                group_id: groupId,
                user_id: currentUser.id,
                role: 'member'
            }]);

        if (joinError) {
            showNotification('Failed to join group', 'error');
            return;
        }

        // Get current members array
        const { data: groupData, error: groupError } = await supabase
            .from('groups')
            .select('members')
            .eq('id', groupId)
            .single();

        if (groupError) {
            showNotification('Failed to update group members', 'error');
            return;
        }

        // Create new members array without duplicates
        const currentMembers = groupData?.members || [];
        const newMembers = [...new Set([...currentMembers, currentUser.id])];

        // Update groups members array
        const { error: updateError } = await supabase
            .from('groups')
            .update({ members: newMembers })
            .eq('id', groupId);

        if (updateError) {
            showNotification('Failed to update group members', 'error');
            return;
        }

        showNotification('Successfully joined the group!', 'success');
        
        // Refresh the group display
        loadPublicGroups();
        
        // Hide join button
        const joinBtn = document.getElementById('joinBtn');
        if (joinBtn) {
            joinBtn.style.display = 'none';
        }
        // Instantly update members-sidebar
        renderGroupMembersSidebar(groupId);

    } catch (error) {
        showNotification('Failed to join group', 'error');
    }
}

// Render the friends list
async function renderFriendsList(filter = 'all') {
    const friendsListContainer = document.getElementById('realFriendsList');
    const currentUser = JSON.parse(localStorage.getItem('wovo_user'));

    if (!friendsListContainer || !currentUser) {
        if(friendsListContainer) friendsListContainer.innerHTML = '<div>Please log in to see your friends.</div>';
        return;
    }

    friendsListContainer.innerHTML = '<div><i class="fas fa-spinner fa-spin"></i> Loading friends...</div>';

    try {
        const response = await fetch(`/api/friends/${currentUser.id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch friends');
        }
        const friends = await response.json();

        const filteredFriends = friends.filter(friend => {
            if (filter === 'all') return friend.status === 'accepted';
            if (filter === 'online') return friend.status === 'accepted' && friend.online_status === 'online';
            if (filter === 'pending') return friend.status === 'pending';
            if (filter === 'blocked') return friend.status === 'blocked';
            return false;
        });

        if (filteredFriends.length === 0) {
            friendsListContainer.innerHTML = `<div>No ${filter} friends found.</div>`;
            return;
        }

        friendsListContainer.innerHTML = filteredFriends.map(friend => {
            const unreadBadge = friend.unread_count > 0 ? `<span class="unread-badge">${friend.unread_count}</span>` : '';
            return `
                <div class="friend-item" data-user-id="${friend.id}">
                    <div class="friend-avatar">
                        <img src="${friend.avatar_url || DEFAULT_AVATAR}" alt="Avatar">
                        <div class="status-indicator ${friend.online_status === 'online' ? 'online' : 'offline'}"></div>
                    </div>
                    <div class="friend-info">
                        <span class="friend-name">${friend.username}</span>
                        <span class="friend-status-text">${friend.status === 'pending' ? 'Incoming Request' : (friend.online_status || 'Offline')}</span>
                        ${unreadBadge}
                    </div>
                </div>
            `;
        }).join('');

        // Add event listeners to new friend items
        document.querySelectorAll('.friend-item').forEach(item => {
            item.addEventListener('click', async () => {
                const userId = item.dataset.userId;
                const friendData = filteredFriends.find(f => f.id == userId);
                await openDirectMessage(friendData);
            });
        });

    } catch (error) {
        console.error('Error rendering friends list:', error);
        friendsListContainer.innerHTML = '<div>Error loading friends.</div>';
    }
}

let currentDmFriend = null;

async function openDirectMessage(friend) {
    if (!friend) return;
    currentDmFriend = friend;

    const defaultContent = document.getElementById('default-content');
    const dmChatSection = document.getElementById('dm-chat-section');
    const dmChatHeader = document.getElementById('dm-chat-header');
    const dmMessagesContainer = document.getElementById('dm-messages');

    // Switch view
    defaultContent.classList.remove('active');
    dmChatSection.classList.add('active');

    // Populate DM header
    dmChatHeader.innerHTML = `
        <div class="header-left">
            <img src="${friend.avatar_url || DEFAULT_AVATAR}" alt="Avatar" class="header-avatar">
            <h3>${friend.username}</h3>
        </div>
    `;

    // Clear unread count and re-render friends list
    if (friend.unread_count > 0) {
        friend.unread_count = 0;
        renderFriendsList();
    }

    // Fetch and render message history
    dmMessagesContainer.innerHTML = '<div><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>';
    const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
    try {
        const response = await fetch(`/api/dm/${currentUser.id}/${friend.id}`);
        const messages = await response.json();
        renderDmMessages(messages, dmMessagesContainer, currentUser.id);

        // Setup Intersection Observer for read receipts
        setupReadReceiptObserver(currentUser.id);
    } catch (error) {
        console.error('Failed to fetch DM history:', error);
        dmMessagesContainer.innerHTML = '<div>Error loading messages.</div>';
    }
}

function renderDmMessages(messages, container, currentUserId) {
    if (!messages || messages.length === 0) {
        container.innerHTML = '<div class="chat-start">This is the beginning of your conversation.</div>';
        return;
    }
    container.innerHTML = messages.map(msg => createMessageHTML(msg, currentUserId)).join('');
    container.scrollTop = container.scrollHeight;
}

function appendDmMessage(message, container, currentUserId) {
    const messageEl = document.createElement('div');
    // Set attributes for the wrapper div
    messageEl.className = `message-item ${message.sender_id === currentUserId ? 'sent' : 'received'}`;
    messageEl.id = `message-${message.id}`;
    messageEl.dataset.messageId = message.id;

    messageEl.innerHTML = createMessageHTML(message, currentUserId, true);
    container.appendChild(messageEl);
    container.scrollTop = container.scrollHeight;
}

function createMessageHTML(msg, currentUserId, isInner = false) {
    const isSent = msg.sender_id === currentUserId;
    const reactionsHTML = (msg.reactions || []).map(reaction => 
        `<div class="reaction-item" data-emoji="${reaction.emoji}">${reaction.emoji} <span class="reaction-count">${reaction.count}</span></div>`
    ).join('');

    const html = `
        <img src="${msg.sender.avatar_url || DEFAULT_AVATAR}" alt="Avatar" class="message-avatar">
        <div class="message-content">
            <div class="message-sender">${msg.sender.username}</div>
            <div class="message-text">${msg.content} <span class="edited-indicator">${msg.edited ? '(edited)' : ''}</span></div>
            <div class="message-reactions">${reactionsHTML}</div>
            <div class="read-receipt ${isSent ? '' : 'hidden'} ${msg.read_at ? 'read' : ''}" data-message-id="${msg.id}">
                <i class="fas fa-check-double"></i>
            </div>
        </div>
        <div class="message-actions">
            <button class="react-btn"><i class="far fa-smile"></i></button>
            ${isSent ? `
            <button class="edit-btn"><i class="fas fa-pencil-alt"></i></button>
            <button class="delete-btn"><i class="fas fa-trash"></i></button>
            ` : ''}
        </div>
    `;
    if (isInner) return html;
    return `<div class="message-item ${isSent ? 'sent' : 'received'}" id="message-${msg.id}" data-message-id="${msg.id}">${html}</div>`;
}

// Helper: Render members in the members-sidebar
async function renderGroupMembersSidebar(groupId) {
    const sidebar = document.querySelector('.members-sidebar');
    if (!sidebar || !groupId) return;

    // Show loading state
    sidebar.innerHTML = `
        <div class="members-header"><h3>MEMBERS</h3></div>
        <div class="member-category"><h4>Loading...</h4></div>
    `;

    try {
        // Get group details for owner info
        const { data: group, error: groupError } = await supabase
            .from('groups')
            .select('*')
            .eq('id', groupId)
            .single();
        if (groupError) throw groupError;

        // Get all members with user details using a join
        const { data: members, error: membersError } = await supabase
            .from('group_members')
            .select(`
                id,
                user_id,
                role,
                joined_at,
                users (
                  username,
                  avatar_url
                )
            `)
            .eq('group_id', groupId);
        if (membersError) throw membersError;

        // Get owner details
        const { data: ownerData, error: ownerError } = await supabase
            .from('users')
            .select('username, avatar_url, id')
            .eq('id', group.owner_id)
            .single();
        if (ownerError) throw ownerError;

        // Add owner to members list
        const allMembers = [
            {
                id: null,
                user_id: ownerData.id,
                role: 'owner',
                joined_at: group.created_at,
                users: {
                    username: ownerData.username,
                    avatar_url: ownerData.avatar_url
                }
            },
            ...(members || [])
        ];

        // For demo: randomly assign online/offline (replace with real status if available)
        const onlineMembers = allMembers.filter((_, i) => i % 2 === 0);
        const offlineMembers = allMembers.filter((_, i) => i % 2 !== 0);

        let html = `<div class="members-header"><h3>MEMBERS</h3></div>`;
        if (onlineMembers.length) {
            html += `<div class="member-category"><h4>ONLINE — ${onlineMembers.length}</h4><div class="member-list">`;
            onlineMembers.forEach(member => {
                html += `
                    <div class="member-item" data-user-id="${member.user_id}">
                        <div class="member-avatar">
                            <div class="status-indicator online"></div>
                            <img src="${member.users?.avatar_url || 'assets/default-avatar.png'}" alt="${member.users?.username}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
                        </div>
                        <span class="member-name">${member.users?.username || 'Unknown User'}</span>
                        <span class="member-role ${member.role}">${member.role.charAt(0).toUpperCase() + member.role.slice(1)}</span>
                    </div>
                `;
            });
            html += `</div></div>`;
        }
        if (offlineMembers.length) {
            html += `<div class="member-category"><h4>OFFLINE — ${offlineMembers.length}</h4><div class="member-list">`;
            offlineMembers.forEach(member => {
                html += `
                    <div class="member-item" data-user-id="${member.user_id}">
                        <div class="member-avatar">
                            <div class="status-indicator offline"></div>
                            <img src="${member.users?.avatar_url || 'assets/default-avatar.png'}" alt="${member.users?.username}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
                        </div>
                        <span class="member-name">${member.users?.username || 'Unknown User'}</span>
                        <span class="member-role ${member.role}">${member.role.charAt(0).toUpperCase() + member.role.slice(1)}</span>
                    </div>
                `;
            });
            html += `</div></div>`;
        }
        if (!onlineMembers.length && !offlineMembers.length) {
            html += `<div class="member-category"><h4>No members found</h4></div>`;
        }
        sidebar.innerHTML = html;
        attachMemberItemClickHandlers();
    } catch (error) {
        sidebar.innerHTML = `<div class="members-header"><h3>MEMBERS</h3></div><div class="member-category"><h4 style="color:#f23f42;">Failed to load members</h4></div>`;
    }
}

// Patch handleGroupSelection to show members in sidebar
async function handleGroupSelection(groupElement) {
    if (!groupElement) {
        console.error('No group element provided');
        return;
    }
    // Remove active class from all groups
    document.querySelectorAll('.group-item').forEach(item => item.classList.remove('active'));
    // Add active class to clicked group
    groupElement.classList.add('active');
    try {
        let groupData = {};
        try {
            groupData = JSON.parse(groupElement.dataset.groupData || '{}');
        } catch (e) {
            console.warn('Failed to parse group data:', e);
        }
        const groupName = groupData.name || groupElement.querySelector('.group-name')?.textContent || 'Unknown Group';
        const onlineCount = groupData.members?.length || parseInt(groupElement.querySelector('.group-meta')?.textContent) || 0;
        const groupId = groupData.id || groupElement.getAttribute('data-group-id');
        if (!groupId) {
            console.error('No group ID found');
            return;
        }
        // Update header
        updateHeaderInfo(groupName, `${onlineCount} online`);
        // If default group, show placeholder and skip DB fetch
        if (groupId.toString().startsWith('default-')) {
            const sidebar = document.querySelector('.members-sidebar');
            if (sidebar) {
                sidebar.innerHTML = `
                    <div class="members-header"><h3>MEMBERS</h3></div>
                    <div class="member-category"><h4>This is a default group.<br>No member list available.</h4></div>
                `;
            }
            return;
        }
        // Show group members in sidebar
        renderGroupMembersSidebar(groupId);
        // Get buttons
        const joinBtn = document.getElementById('joinBtn');
        const settingsBtn = document.getElementById('groupSettingsBtn');

        if (!joinBtn || !settingsBtn) {
            console.warn('Join or Settings button not found');
            return;
        }

        // Hide buttons by default
        joinBtn.style.display = 'none';
        settingsBtn.style.display = 'none';

        // For default groups, keep buttons hidden
        if (groupId.toString().startsWith('default-')) {
            return;
        }

        const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
        if (!currentUser) {
            console.warn('No user logged in');
            return;
        }

        // Check if this is a public group
        const isPublicGroup = groupElement.closest('#publicGroups') !== null;
        if (!isPublicGroup) {
            return;
        }

        // Get fresh group data from Supabase
        const { data: groupDetails, error: groupError } = await supabase
            .from('groups')
            .select('*')
            .eq('id', groupId)
            .single();

        if (groupError || !groupDetails) {
            console.error('Failed to fetch group details:', groupError);
            return;
        }

        // Check if user is owner
        const isOwner = groupDetails.owner_id === currentUser.id;
        if (isOwner) {
            settingsBtn.style.display = 'flex';
            settingsBtn.onclick = () => showGroupSettings(groupId);
            return;
        }

        // Check if user is already a member
        const { data: memberData, error: memberError } = await supabase
            .from('group_members')
            .select('id, role')
            .eq('group_id', groupId)
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (memberError) {
            console.error('Failed to check membership:', memberError);
            return;
        }

        // Show appropriate buttons based on membership and role
        if (!memberData) {
            // Not a member - show join button
            joinBtn.style.display = 'flex';
            joinBtn.onclick = () => joinGroup(groupId);
        } else if (memberData.role === 'admin') {
            // Admin - show settings button
            settingsBtn.style.display = 'flex';
            settingsBtn.onclick = () => showGroupSettings(groupId);
        } else { // 'member' or any other role
            // Member - show leave button
            let leaveBtn = document.getElementById('leaveBtn');
            if (!leaveBtn) {
                leaveBtn = document.createElement('button');
                leaveBtn.className = 'action-btn leave-btn';
                leaveBtn.id = 'leaveBtn';
                leaveBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i><span>Leave</span>';
                const headerActions = document.querySelector('.header-actions');
                if (headerActions) {
                    headerActions.insertBefore(leaveBtn, headerActions.firstChild);
                }
            } else {
                leaveBtn.style.display = 'flex';
            }
            leaveBtn.onclick = async () => {
                await leaveGroup(groupId);
            };
        }
        // Hide leave button for owner or non-members or admins
        if (!memberData || memberData.role !== 'member') {
            const leaveBtn = document.getElementById('leaveBtn');
            if (leaveBtn) leaveBtn.style.display = 'none';
        }

    } catch (error) {
        console.error('Error in handleGroupSelection:', error);
        const joinBtn = document.getElementById('joinBtn');
        const settingsBtn = document.getElementById('groupSettingsBtn');
        if (joinBtn) joinBtn.style.display = 'none';
        if (settingsBtn) settingsBtn.style.display = 'none';
    }
}

// Function to show group settings
async function showGroupSettings(groupId) {
    try {
        // Fetch initial messages and members
        fetchGroupMessages(groupId);
        fetchGroupMembers(groupId);
        const { data: group, error } = await supabase
            .from('groups')
            .select('*')
            .eq('id', groupId)
            .single();

        if (error) throw error;

        // Open the group settings modal in full screen
        const modal = document.getElementById('groupSettingsModal');
        if (modal) {
            // Update preview elements
            const namePreview = modal.querySelector('#groupNamePreview');
            const nameInput = modal.querySelector('#groupSettingsName');
            const idDisplay = modal.querySelector('#groupIdDisplay');
            const bannerPreview = modal.querySelector('#groupBannerPreview');
            const bannerPlaceholder = modal.querySelector('.banner-placeholder');
            const avatarPreview = modal.querySelector('#groupAvatarPreview');
            const gameCards = modal.querySelectorAll('.game-card');

            if (namePreview) namePreview.textContent = group.name;
            if (nameInput) nameInput.value = group.name;
            if (idDisplay) idDisplay.textContent = group.id;
            
            // Update banner if exists
            if (bannerPreview && bannerPlaceholder) {
                if (group.banner_url) {
                    bannerPreview.src = group.banner_url;
                    bannerPreview.style.display = 'block';
                    bannerPlaceholder.style.display = 'none';
                } else {
                    bannerPreview.src = '';
                    bannerPreview.style.display = 'none';
                    bannerPlaceholder.style.display = 'flex';
                }
            }

            // Update avatar if exists
            if (avatarPreview) {
                avatarPreview.src = group.avatar_url || 'assets/default-avatar.png';
            }

            // Select the current game
            if (gameCards && group.game) {
                gameCards.forEach(card => {
                    if (card.dataset.game === group.game) {
                        card.classList.add('selected');
                    } else {
                        card.classList.remove('selected');
                    }
                });
            }

            // Store group ID for later use
            modal.dataset.groupId = group.id;

            // Show modal
            modal.style.display = 'flex';
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    } catch (error) {
        showNotification('Failed to load group settings', 'error');
    }
}

// Handle navigation item clicks
document.querySelectorAll('.nav-item:not(.theme-toggle)').forEach(item => {
    item.addEventListener('click', () => {
        // Remove active class from all items
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        // Add active class to clicked item
        item.classList.add('active');

        // Get the section name
        const sectionName = item.querySelector('.nav-label').textContent;
        
        // Show corresponding details section
        document.querySelectorAll('.details-section').forEach(section => {
            section.classList.remove('active');
        });
        
        const sectionId = `${sectionName.toLowerCase()}-section`;
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');

            // Hide all content sections first
            document.querySelectorAll('.section-content').forEach(content => {
                content.style.display = 'none';
            });

            // Show corresponding content section
            let contentClass = '';
            switch(sectionName.toLowerCase()) {
                case 'groups':
                    contentClass = 'groups-content';
                    break;
                case 'friends':
                    contentClass = 'friends-content';
                    break;
                case 'tournaments':
                    contentClass = 'tournaments-content';
                    break;
                case 'custom rooms':
                    contentClass = 'rooms-content';
                    break;
            }

            if (contentClass) {
                const contentSection = document.querySelector(`.${contentClass}`);
                if (contentSection) {
                    contentSection.style.display = 'flex';
                }
            }

            // Update header based on the section type
            switch(sectionName.toLowerCase()) {
                case 'groups':
                    const defaultGroup = targetSection.querySelector('.group-item');
                    if (defaultGroup) {
                        const groupName = defaultGroup.querySelector('.group-name').textContent;
                        const groupMeta = defaultGroup.querySelector('.group-meta').textContent;
                        const onlineCount = groupMeta.match(/(\d+)\s+online/)[1];
                        updateHeaderInfo(groupName, onlineCount);
                        
                        // Set this group as active
                        document.querySelectorAll('.group-item').forEach(g => g.classList.remove('active'));
                        defaultGroup.classList.add('active');
                    }
                    break;

                case 'friends':
                    const defaultFriend = targetSection.querySelector('.friend-item');
                    if (defaultFriend) {
                        const friendName = defaultFriend.querySelector('.friend-name').textContent;
                        const isOnline = defaultFriend.querySelector('.status-indicator.online');
                        updateHeaderInfo(friendName, isOnline ? 'Online' : null);
                        
                        // Set this friend as active
                        document.querySelectorAll('.friend-item').forEach(f => f.classList.remove('active'));
                        defaultFriend.classList.add('active');
                    }
                    break;

                case 'tournaments':
                    const defaultTournament = targetSection.querySelector('.tournament-item');
                    if (defaultTournament) {
                        const tournamentName = defaultTournament.querySelector('.tournament-name').textContent;
                        const teamsCount = defaultTournament.querySelector('.tournament-meta').textContent.match(/(\d+)\s+Teams/)[1];
                        updateHeaderInfo(tournamentName, `${teamsCount} Teams`);
                        
                        // Set this tournament as active
                        document.querySelectorAll('.tournament-item').forEach(t => t.classList.remove('active'));
                        defaultTournament.classList.add('active');
                    }
                    break;

                case 'custom rooms':
                    const defaultRoom = targetSection.querySelector('.room-item');
                    if (defaultRoom) {
                        const roomName = defaultRoom.querySelector('.room-name').textContent;
                        const playerCount = defaultRoom.querySelector('.room-meta').textContent.match(/(\d+)\/(\d+)/);
                        updateHeaderInfo(roomName, `${playerCount[1]}/${playerCount[2]} Players`);
                        
                        // Set this room as active
                        document.querySelectorAll('.room-item').forEach(r => r.classList.remove('active'));
                        defaultRoom.classList.add('active');
                    }
                    break;

                case 'settings':
                    updateHeaderInfo('User Settings', null);
                    break;

                default:
                    updateHeaderInfo(sectionName, null);
                    break;
            }
        }

        // On mobile/tablet, close sidebar after navigation
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('expanded');
            const icon = hamburgerBtn.querySelector('i');
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
    });
});

// Initialize with default group content
// document.querySelector('.groups-content').style.display = 'flex';

// Handle group item clicks
document.querySelectorAll('.group-item').forEach(group => {
    group.addEventListener('click', () => {
        // Remove active class from all groups
        document.querySelectorAll('.group-item').forEach(g => g.classList.remove('active'));
        // Add active class to clicked group
        group.classList.add('active');
        
        // Update header with group info
        const groupName = group.querySelector('.group-name').textContent;
        const groupMeta = group.querySelector('.group-meta').textContent;
        const onlineCount = groupMeta.match(/(\d+)\s+online/)[1];
        updateHeaderInfo(groupName, onlineCount);
    });
});

// Handle friend item clicks
document.querySelectorAll('.friend-item').forEach(friend => {
    friend.addEventListener('click', () => {
        // Remove active class from all friends
        document.querySelectorAll('.friend-item').forEach(f => f.classList.remove('active'));
        // Add active class to clicked friend
        friend.classList.add('active');
        
        // Update header with friend info
        const friendName = friend.querySelector('.friend-name').textContent;
        const isOnline = friend.querySelector('.status-indicator.online');
        updateHeaderInfo(friendName, isOnline ? 'Online' : null);
    });
});

// Handle tournament item clicks
document.querySelectorAll('.tournament-item').forEach(tournament => {
    tournament.addEventListener('click', () => {
        // Remove active class from all tournaments
        document.querySelectorAll('.tournament-item').forEach(t => t.classList.remove('active'));
        // Add active class to clicked tournament
        tournament.classList.add('active');
        
        // Update header with tournament info
        const tournamentName = tournament.querySelector('.tournament-name').textContent;
        const teamsCount = tournament.querySelector('.tournament-meta').textContent.match(/(\d+)\s+Teams/)[1];
        updateHeaderInfo(tournamentName, `${teamsCount} Teams`);
    });
});

// Handle custom room item clicks
document.querySelectorAll('.room-item').forEach(room => {
    room.addEventListener('click', () => {
        // Remove active class from all rooms
        document.querySelectorAll('.room-item').forEach(r => r.classList.remove('active'));
        // Add active class to clicked room
        room.classList.add('active');
        
        // Update header with room info
        const roomName = room.querySelector('.room-name').textContent;
        const playerCount = room.querySelector('.room-meta').textContent.match(/(\d+)\/(\d+)/);
        updateHeaderInfo(roomName, `${playerCount[1]}/${playerCount[2]} Players`);
    });
});

// Initialize with default group
const defaultGroup = document.querySelector('.group-item.active');
if (defaultGroup) {
    const groupName = defaultGroup.querySelector('.group-name').textContent;
    const groupMeta = defaultGroup.querySelector('.group-meta').textContent;
    const onlineCount = groupMeta.match(/(\d+)\s+online/)[1];
    updateHeaderInfo(groupName, onlineCount);
}

// Search functionality
document.querySelectorAll('.search-bar input').forEach(input => {
    input.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const parentSection = e.target.closest('.details-section');
        
        // Get all items in the current section
        const items = parentSection.querySelectorAll('.group-item, .friend-item, .tournament-item, .room-item');
        
        items.forEach(item => {
            const name = item.querySelector('.group-name, .friend-name, .tournament-name, .room-name').textContent.toLowerCase();
            if (name.includes(searchTerm)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    });
});

// Handle add button clicks
document.querySelectorAll('.add-new-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const section = btn.closest('.details-section');
        if (section && section.id === 'groups-section') {
            showCreateGroupModal();
        }
    });
});

// Item click handlers
document.querySelectorAll('.group-item, .friend-item, .tournament-item, .room-item').forEach(item => {
    item.addEventListener('click', () => {
        // Remove active class from all items in the same list
        const list = item.closest('.groups-list, .friends-list, .tournaments-list, .rooms-list');
        list.querySelectorAll('.active').forEach(active => active.classList.remove('active'));
        
        // Add active class to clicked item
        item.classList.add('active');
    });
}); 

// Handle default groups toggle (robust null checks)
function initializeDefaultGroupsToggle() {
  const toggleDefaultGroups = document.getElementById('toggleDefaultGroups');
  const defaultGroups = document.getElementById('defaultGroups');

  if (!toggleDefaultGroups || !defaultGroups) {
    // Silently do nothing if elements are missing
    return;
  }

  toggleDefaultGroups.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    toggleDefaultGroups.classList.toggle('collapsed');
    if (defaultGroups) {
      defaultGroups.classList.toggle('collapsed');
      localStorage.setItem('defaultGroupsCollapsed', defaultGroups.classList.contains('collapsed'));
    }
    // No console.warn if defaultGroups is missing
    const arrowIcon = toggleDefaultGroups.querySelector('.fa-chevron-down, .fa-chevron-right');
    if (arrowIcon) {
      arrowIcon.classList.toggle('fa-chevron-down');
      arrowIcon.classList.toggle('fa-chevron-right');
    }
  });

  // Restore collapsed state from localStorage
  const isCollapsed = localStorage.getItem('defaultGroupsCollapsed') === 'true';
  if (isCollapsed) {
    toggleDefaultGroups.classList.add('collapsed');
    if (defaultGroups) {
      defaultGroups.classList.add('collapsed');
    }
    const arrowIcon = toggleDefaultGroups.querySelector('.fa-chevron-down');
    if (arrowIcon) {
      arrowIcon.classList.remove('fa-chevron-down');
      arrowIcon.classList.add('fa-chevron-right');
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeCollapsibleSections();
  initializeDefaultGroupsToggle();
});

// Update user profile in sidebar
function updateUserProfile() {
    const userData = localStorage.getItem('wovo_user');
    const sidebarUsername = document.getElementById('sidebarUsername');
    
    if (userData && sidebarUsername) {
        const user = JSON.parse(userData);
        sidebarUsername.textContent = user.username;
    }
}

// Run on page load
updateUserProfile(); 

// Settings Page Functionality
const settingsBtn = document.querySelector('.user-settings-btn');
const sidebarSettingsBtn = document.querySelector('.nav-item:not(.theme-toggle) i.fa-cog').parentElement;
const settingsPage = document.getElementById('settings-page');
const closeSettingsBtn = document.querySelector('.close-settings');
const defaultContent = document.getElementById('default-content');
const settingsCategories = document.querySelectorAll('.settings-category');
const settingsSections = document.querySelectorAll('.settings-section');

// Function to open settings
function openSettings() {
    defaultContent.classList.remove('active');
    settingsPage.classList.remove('closing');
    settingsPage.classList.add('active');
    // Update username in settings
    const userData = localStorage.getItem('wovo_user');
    if (userData) {
        const user = JSON.parse(userData);
        document.getElementById('settings-username').textContent = user.username;
    }
}

// Open Settings from user profile button
if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettings);
}

// Open Settings from sidebar button
if (sidebarSettingsBtn) {
    sidebarSettingsBtn.addEventListener('click', openSettings);
}

// Close Settings with animation
if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
        // Start closing animation
        settingsPage.classList.add('closing');
        settingsPage.classList.remove('active');
        
        // Wait for animation to complete before showing default content
        setTimeout(() => {
            defaultContent.classList.add('active');
        }, 300); // Match the CSS transition duration
    });
}

// Handle ESC key to close settings
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsPage.classList.contains('active')) {
        closeSettingsBtn.click();
    }
});

// Switch Settings Sections
settingsCategories.forEach(category => {
    category.addEventListener('click', () => {
        const sectionName = category.getAttribute('data-section');
        
        // Update active category
        settingsCategories.forEach(cat => cat.classList.remove('active'));
        category.classList.add('active');
        
        // Show corresponding section
        settingsSections.forEach(section => {
            section.classList.remove('active');
            if (section.id === `${sectionName}-section`) {
                section.classList.add('active');
            }
        });
    });
});

// Theme Selection in Appearance
const themeOptions = document.querySelectorAll('.theme-option');
themeOptions.forEach(option => {
    option.addEventListener('click', () => {
        const theme = option.getAttribute('data-theme');
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        // Update theme toggle icon
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            const icon = themeToggle.querySelector('i');
            const label = themeToggle.querySelector('.nav-label');
            icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
            label.textContent = `${theme === 'dark' ? 'Dark' : 'Light'} Mode`;
        }
    });
});

// Delete Account
const deleteAccountBtn = document.querySelector('.delete-account-btn');
if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', () => {
        const confirm = window.confirm('Are you sure you want to delete your account? This action cannot be undone.');
        if (confirm) {
            // Clear user data
            localStorage.removeItem('wovo_user');
            // Redirect to login
            window.location.href = 'index.html';
        }
    });
} 

// Username editing functions
function toggleUsernameEdit() {
    const editContainer = document.querySelector('.username-edit-container');
    const usernameContainer = document.getElementById('username-container');
    const usernameInput = document.getElementById('username-edit-input');
    const currentUsername = document.getElementById('settings-username').textContent;

    if (editContainer && usernameContainer && usernameInput) {
        editContainer.style.display = 'block';
        usernameContainer.style.display = 'none';
        usernameInput.value = currentUsername;
        usernameInput.focus();
    }
}

function cancelUsernameEdit() {
    const editContainer = document.querySelector('.username-edit-container');
    const usernameContainer = document.getElementById('username-container');
    
    if (editContainer && usernameContainer) {
        editContainer.style.display = 'none';
        usernameContainer.style.display = 'block';
    }
}

// Cloudinary configuration
const CLOUDINARY_CONFIG = {
    cloud_name: 'dxsvbes6q',
    api_key: '142796392847558',
    api_secret: '4p1SZ9kvxgEVPNk7-0_L_-EN0sQ',
    upload_preset: 'wovo_user',
    folder: 'user_profiles'
};

// Cropper instance and current upload type
let cropper = null;
let currentUploadType = null;

// Show crop modal
function showCropModal(file, uploadType) {
    const reader = new FileReader();
    currentUploadType = uploadType;

    reader.onload = function(e) {
        const cropModal = document.querySelector('.crop-modal');
        const cropImage = document.getElementById('crop-image');
        
        // Set image source
        cropImage.src = e.target.result;
        
        // Show modal
        cropModal.style.display = 'flex';
        
        // Initialize cropper
        if (cropper) {
            cropper.destroy();
        }
        
        cropper = new Cropper(cropImage, {
            aspectRatio: uploadType === 'avatar' ? 1 : 16/9,
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 1,
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
        });
    };

    reader.readAsDataURL(file);
}

// Close crop modal
function closeCropModal() {
    const cropModal = document.querySelector('.crop-modal');
    cropModal.style.display = 'none';
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
}

// Save cropped image
async function saveCroppedImage() {
    if (!cropper) return;

    const canvas = cropper.getCroppedCanvas({
        width: currentUploadType === 'avatar' ? 400 : 1200,
        height: currentUploadType === 'avatar' ? 400 : 675,
    });

    canvas.toBlob(async (blob) => {
        const file = new File([blob], `${currentUploadType}.jpg`, { type: 'image/jpeg' });
        
        if (currentUploadType === 'avatar') {
            await handleAvatarUpload(file);
        } else {
            await handleBannerUpload(file);
        }
        
        closeCropModal();
    }, 'image/jpeg', 0.9);
}

// Show notification function
function showNotification(message, type = 'success') {
    const container = document.querySelector('.notification-container');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icon = document.createElement('i');
    icon.className = `fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'notification-message';
    messageDiv.textContent = message;
    
    notification.appendChild(icon);
    notification.appendChild(messageDiv);
    container.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.classList.add('hide');
        setTimeout(() => {
            container.removeChild(notification);
        }, 300);
    }, 3000);
}

// Handle avatar upload
async function handleAvatarUpload(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_CONFIG.upload_preset);
        formData.append('folder', CLOUDINARY_CONFIG.folder);
        formData.append('api_key', CLOUDINARY_CONFIG.api_key);
        formData.append('timestamp', Math.floor(Date.now() / 1000));

        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloud_name}/image/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Upload failed');

        // Update avatar URL in Supabase
        const userData = JSON.parse(localStorage.getItem('wovo_user'));
        const { error } = await supabase
            .from('users')
            .update({ avatar_url: data.secure_url })
            .eq('username', userData.username);

        if (error) throw error;

        // Update UI - both in settings and sidebar
        document.getElementById('user-avatar').src = data.secure_url;
        const sidebarAvatar = document.querySelector('.user-profile .user-avatar img');
        if (sidebarAvatar) {
            sidebarAvatar.src = data.secure_url;
        }
        showNotification('Avatar updated successfully!');
    } catch (error) {
        showNotification('Failed to upload avatar. Please try again.', 'error');
    }
}

// Handle banner upload
async function handleBannerUpload(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_CONFIG.upload_preset);
        formData.append('folder', CLOUDINARY_CONFIG.folder);
        formData.append('api_key', CLOUDINARY_CONFIG.api_key);
        formData.append('timestamp', Math.floor(Date.now() / 1000));

        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloud_name}/image/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Upload failed');

        // Update banner URL in Supabase
        const userData = JSON.parse(localStorage.getItem('wovo_user'));
        const { error } = await supabase
            .from('users')
            .update({ banner_url: data.secure_url })
            .eq('username', userData.username);

        if (error) throw error;

        // Update UI
        document.querySelector('.profile-banner').style.backgroundImage = `url(${data.secure_url})`;
        showNotification('Banner updated successfully!');
    } catch (error) {
        showNotification('Failed to upload banner. Please try again.', 'error');
    }
}

// Add event listeners for file uploads
document.addEventListener('DOMContentLoaded', function() {
    const avatarInput = document.getElementById('avatar-upload');
    const bannerInput = document.getElementById('banner-upload');
    const changeBannerBtn = document.querySelector('.change-banner');

    if (avatarInput) {
        avatarInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 10 * 1024 * 1024) { // 10MB limit
                    alert('File size too large. Please choose an image under 10MB.');
                    return;
                }
                showCropModal(file, 'avatar');
            }
        });
    }

    if (bannerInput) {
        bannerInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 10 * 1024 * 1024) { // 10MB limit
                    alert('File size too large. Please choose an image under 10MB.');
                    return;
                }
                showCropModal(file, 'banner');
            }
        });
    }

    // Ensure banner button is clickable
    if (changeBannerBtn) {
        changeBannerBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            document.getElementById('banner-upload').click();
        });
    }
});

// Load user ID and profile
async function loadUserProfile() {
    try {
        // Get username from localStorage
        const userData = JSON.parse(localStorage.getItem('wovo_user'));
        if (!userData || !userData.username) {
            window.location.href = 'index.html';
            return;
        }

        // Get user profile from Supabase - properly handle usernames with spaces
        const { data, error } = await supabase
            .from('users')
            .select('id, avatar_url, banner_url')
            .eq('username', userData.username.trim()) // Trim any extra spaces
            .single();

        if (error) {
            showNotification('Error loading profile. Please try logging in again.', 'error');
            localStorage.removeItem('wovo_user');
            window.location.href = 'index.html';
            return;
        }

        if (!data) {
            showNotification('User profile not found. Please try logging in again.', 'error');
            localStorage.removeItem('wovo_user');
            window.location.href = 'index.html';
            return;
        }

        // Update user ID
        const userIdElement = document.getElementById('settings-userid');
        if (userIdElement) {
            userIdElement.textContent = data.id;
        }

        // Update UI with user data
        const userAvatar = document.getElementById('user-avatar');
        const sidebarAvatar = document.querySelector('.user-profile .user-avatar img');
        
        if (data?.avatar_url) {
            if (userAvatar) userAvatar.src = data.avatar_url;
            if (sidebarAvatar) sidebarAvatar.src = data.avatar_url;
        } else {
            const defaultAvatar = './assets/default-avatar.png';
            if (userAvatar) userAvatar.src = defaultAvatar;
            if (sidebarAvatar) sidebarAvatar.src = defaultAvatar;
        }

        // Update username
        const displayName = document.querySelector('.profile-name');
        const sidebarUsername = document.getElementById('sidebarUsername');
        const settingsUsername = document.getElementById('settings-username');
        if (displayName) displayName.textContent = userData.username;
        if (sidebarUsername) sidebarUsername.textContent = userData.username;
        if (settingsUsername) settingsUsername.textContent = userData.username;

        // Update banner if available
        const userBanner = document.querySelector('.profile-banner');
        if (userBanner && data?.banner_url) {
            userBanner.style.backgroundImage = `url(${data.banner_url})`;
        }

    } catch (error) {
        showNotification('Error loading profile. Please try logging in again.', 'error');
        localStorage.removeItem('wovo_user');
        window.location.href = 'index.html';
    }
}

// Copy user ID to clipboard
async function copyUserId() {
    const userIdElement = document.getElementById('settings-userid');
    if (!userIdElement) return;

    try {
        await navigator.clipboard.writeText(userIdElement.textContent);
        showNotification('User ID copied to clipboard!');
    } catch (err) {
        showNotification('Failed to copy User ID', 'error');
    }
}

// Check authentication status on page load
document.addEventListener('DOMContentLoaded', function() {
    const userData = localStorage.getItem('wovo_user');
    if (!userData) {
        // Redirect to login page if not logged in
        window.location.href = 'index.html';
        return;
    }
    
    // Load user profile if logged in
    loadUserProfile();
}); 

// Extract public ID from Cloudinary URL
function getCloudinaryPublicId(url) {
    if (!url) return null;
    // URL format: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/public_id.extension
    const matches = url.match(/\/upload\/.*?\/(.*?)\./);
    return matches ? matches[1] : null;
}

// Delete media from Cloudinary
async function deleteFromCloudinary(url) {
    if (!url) return;
    
    const publicId = getCloudinaryPublicId(url);
    if (!publicId) return;

    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = await generateCloudinarySignature(publicId, timestamp);

    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('api_key', CLOUDINARY_CONFIG.api_key);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloud_name}/image/destroy`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (data.result !== 'ok') {
            console.error('Failed to delete from Cloudinary:', data);
        }
    } catch (error) {
        console.error('Error deleting from Cloudinary:', error);
    }
}

// Generate signature for Cloudinary deletion
async function generateCloudinarySignature(publicId, timestamp) {
    const str = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_CONFIG.api_secret}`;
    // Use SHA-1 for Cloudinary signature
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Progress indicator functions
function showDeletionProgress() {
    const modal = document.querySelector('.deletion-progress-modal');
    if (modal) modal.style.display = 'flex';
}

function hideDeletionProgress() {
    const modal = document.querySelector('.deletion-progress-modal');
    if (modal) modal.style.display = 'none';
}

function updateProgressStep(stepId, status, message = '') {
    const step = document.getElementById(stepId);
    if (!step) return;

    // Remove all status classes
    step.classList.remove('active', 'completed', 'error');
    
    // Update icon
    const icon = step.querySelector('i');
    if (icon) {
        icon.className = 'fas';
        switch (status) {
            case 'active':
                icon.classList.add('fa-circle-notch');
                break;
            case 'completed':
                icon.classList.add('fa-check-circle');
                break;
            case 'error':
                icon.classList.add('fa-exclamation-circle');
                break;
            default:
                icon.classList.add('fa-circle-notch');
        }
    }

    // Add new status class
    step.classList.add(status);

    // Update message if provided
    if (message) {
        const span = step.querySelector('span');
        if (span) span.textContent = message;
    }
}

// Utility function for delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Show final delete confirmation
function showFinalDeleteConfirmation() {
    return new Promise((resolve) => {
        const modal = document.querySelector('.final-delete-modal');
        const confirmBtn = modal.querySelector('.confirm-delete-btn');
        const cancelBtn = modal.querySelector('.cancel-delete-btn');

        modal.style.display = 'flex';

        confirmBtn.addEventListener('click', function handler() {
            modal.style.display = 'none';
            confirmBtn.removeEventListener('click', handler);
            resolve(true);
        });

        cancelBtn.addEventListener('click', function handler() {
            modal.style.display = 'none';
            cancelBtn.removeEventListener('click', handler);
            resolve(false);
        });
    });
}

// Delete user account and all associated media
async function deleteUserAccount() {
    try {
        showDeletionProgress();
        updateProgressStep('fetchStep', 'active', 'Preparing to fetch account data...');
        await delay(3000); // Show initial step for 3 seconds

        const userData = JSON.parse(localStorage.getItem('wovo_user'));
        if (!userData || !userData.username) {
            updateProgressStep('fetchStep', 'error', 'No user data found');
            showNotification('No user data found', 'error');
            await delay(3000);
            hideDeletionProgress();
            return;
        }

        updateProgressStep('fetchStep', 'active', 'Fetching user profile...');
        await delay(2000);

        // Get user's media URLs from Supabase
        const { data: userProfile, error: fetchError } = await supabase
            .from('users')
            .select('avatar_url, banner_url, game_profile_pics')
            .eq('username', userData.username)
            .single();

        if (fetchError) {
            updateProgressStep('fetchStep', 'error', 'Failed to fetch user data');
            showNotification('Failed to fetch user data', 'error');
            await delay(3000);
            hideDeletionProgress();
            return;
        }

        updateProgressStep('fetchStep', 'completed', 'Account data fetched successfully');
        await delay(2000);

        updateProgressStep('mediaStep', 'active', 'Preparing to delete media files...');
        await delay(2000);

        // Delete all media from Cloudinary
        const mediaUrls = [
            userProfile.avatar_url,
            userProfile.banner_url,
            ...(userProfile.game_profile_pics || [])
        ].filter(Boolean);

        const mediaProgress = document.getElementById('mediaProgress');
        let deletedCount = 0;

        for (const url of mediaUrls) {
            try {
                updateProgressStep('mediaStep', 'active', `Deleting media file ${deletedCount + 1} of ${mediaUrls.length}...`);
                await delay(2000);
                await deleteFromCloudinary(url);
                deletedCount++;
                if (mediaProgress) {
                    mediaProgress.textContent = `${deletedCount}/${mediaUrls.length}`;
                }
                await delay(1000);
            } catch (error) {
                console.error('Error deleting media:', error);
                await delay(2000);
            }
        }

        updateProgressStep('mediaStep', 'completed', 'All media files deleted successfully');
        await delay(2000);

        updateProgressStep('accountStep', 'active', 'Preparing to delete account...');
        await delay(3000);

        // Delete user from Supabase
        const { error: deleteError } = await supabase
            .from('users')
            .delete()
            .eq('username', userData.username);

        if (deleteError) {
            updateProgressStep('accountStep', 'error', 'Failed to delete account');
            showNotification('Failed to delete account', 'error');
            await delay(3000);
            hideDeletionProgress();
            return;
        }

        updateProgressStep('accountStep', 'completed', 'Account deleted from database');
        await delay(2000);

        updateProgressStep('finalStep', 'active', 'Finalizing deletion...');
        await delay(3000);

        // Clear local storage and prepare for redirect
        localStorage.removeItem('wovo_user');
        showNotification('Account deleted successfully');

        updateProgressStep('finalStep', 'completed', 'Account deletion complete');
        await delay(2000);
        
        // Final redirect
        setTimeout(() => {
            hideDeletionProgress();
            window.location.href = 'index.html';
        }, 2000);

    } catch (error) {
        showNotification('Failed to delete account', 'error');
        
        // Update all incomplete steps to error
        ['fetchStep', 'mediaStep', 'accountStep', 'finalStep'].forEach(stepId => {
            const step = document.getElementById(stepId);
            if (step && !step.classList.contains('completed')) {
                updateProgressStep(stepId, 'error', 'Process failed');
            }
        });
        
        await delay(4000);
        hideDeletionProgress();
    }
}

// Settings functionality
document.addEventListener('DOMContentLoaded', function() {
    // Font size slider
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    if (fontSizeSlider) {
        fontSizeSlider.addEventListener('input', function(e) {
            document.documentElement.style.setProperty('--chat-font-size', `${e.target.value}px`);
        });
    }

    // Delete account confirmation
    const deleteConfirm = document.getElementById('deleteConfirm');
    const deleteConfirmText = document.getElementById('deleteConfirmText');
    const deleteBtn = document.querySelector('.delete-account-btn');
    
    function checkDeleteConfirmation() {
        if (deleteConfirm && deleteConfirmText && deleteBtn) {
            const isChecked = deleteConfirm.checked;
            const confirmText = deleteConfirmText.value;
            deleteBtn.disabled = !(isChecked && confirmText === 'DELETE MY ACCOUNT');
        }
    }

    if (deleteConfirm && deleteConfirmText && deleteBtn) {
        deleteConfirm.addEventListener('change', checkDeleteConfirmation);
        deleteConfirmText.addEventListener('input', checkDeleteConfirmation);

        // Remove any existing click listeners
        deleteBtn.replaceWith(deleteBtn.cloneNode(true));
        const newDeleteBtn = document.querySelector('.delete-account-btn');

        newDeleteBtn.addEventListener('click', async function(e) {
            e.preventDefault(); // Prevent any default actions
            if (deleteConfirmText.value === 'DELETE MY ACCOUNT' && deleteConfirm.checked) {
                try {
                    // Show final confirmation modal
                    const finalConfirmed = await showFinalDeleteConfirmation();
                    if (finalConfirmed) {
                        // Show progress modal
                        showDeletionProgress();
                        await deleteUserAccount();
                    }
                } catch (error) {
                    showNotification('An error occurred during account deletion', 'error');
                }
            } else {
                showNotification('Please type "DELETE MY ACCOUNT" and check the confirmation box', 'error');
            }
        });
    }

    // Initialize delete confirmation modal close button
    const cancelDeleteBtn = document.querySelector('.cancel-delete-btn');
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', function() {
            const modal = document.querySelector('.final-delete-modal');
            if (modal) modal.style.display = 'none';
        });
    }

    // Save settings changes
    const toggleSwitches = document.querySelectorAll('.toggle-switch input[type="checkbox"]');
    toggleSwitches.forEach(toggle => {
        toggle.addEventListener('change', function() {
            const settingName = this.closest('.option-details')?.querySelector('.option-title')?.textContent || 'Setting';
            showNotification(`${settingName} ${this.checked ? 'enabled' : 'disabled'}`);
        });
    });
}); 

// Gaming Profile Functionality
document.addEventListener('DOMContentLoaded', function() {
    // Game Selection
    const gameCards = document.querySelectorAll('.game-card');
    gameCards.forEach(card => {
        card.addEventListener('click', function() {
            // Remove selection from other cards
            gameCards.forEach(c => c.classList.remove('selected'));
            // Select this card
            this.classList.add('selected');
            // Show fun notification
            showNotification(`${this.querySelector('h5').textContent} selected! Time to dominate! 🎮`);
        });
    });

    // Gaming Style Selection
    const styleCards = document.querySelectorAll('.style-card');
    styleCards.forEach(card => {
        card.addEventListener('click', function() {
            // Remove selection from other cards
            styleCards.forEach(c => c.classList.remove('selected'));
            // Select this card
            this.classList.add('selected');
            // Show fun notification
            showNotification(`${this.querySelector('h5').textContent} style chosen! That's how you roll! 😎`);
        });
    });

    // Game Profile Picture Upload
    const gameProfileUpload = document.getElementById('gameProfileUpload');
    const uploadPlaceholder = document.getElementById('gameProfilePic');

    if (gameProfileUpload && uploadPlaceholder) {
        // Click on placeholder to trigger file input
        uploadPlaceholder.addEventListener('click', () => {
            gameProfileUpload.click();
        });

        gameProfileUpload.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 5 * 1024 * 1024) {
                    showNotification('Whoa there! File too large! Keep it under 5MB! 😅', 'error');
                    return;
                }
                try {
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('upload_preset', CLOUDINARY_CONFIG.upload_preset);
                    formData.append('folder', CLOUDINARY_CONFIG.folder);

                    showNotification('Uploading your epic profile pic... 🚀');

                    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloud_name}/image/upload`, {
                        method: 'POST',
                        body: formData
                    });

                    const data = await response.json();
                    if (!response.ok) throw new Error(data.message || 'Upload failed');

                    // Update profile picture
                    uploadPlaceholder.innerHTML = `<img src="${data.secure_url}" alt="Game Profile">`;
                    uploadPlaceholder.classList.add('has-image');
                    showNotification('Profile pic looking fire! 🔥');
                } catch (error) {
                    showNotification('Oops! Upload failed! Try again! 😬', 'error');
                }
            }
        });
    }

    // Save Profile
    const saveProfileBtn = document.querySelector('.save-profile-btn');
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', async function() {
            const selectedGame = document.querySelector('.game-card.selected');
            const selectedStyle = document.querySelector('.style-card.selected');
            const gameId = document.getElementById('gameId').value;
            const nickname = document.getElementById('gameNickname').value;
            const rank = document.getElementById('gameRank').value;

            if (!selectedGame) {
                showNotification('Hey! Pick your game first! 🎮', 'error');
                return;
            }

            if (!gameId) {
                showNotification('Don\'t forget your Game ID! 🎯', 'error');
                return;
            }

            try {
                const userData = JSON.parse(localStorage.getItem('wovo_user'));
                const gameProfile = {
                    game: selectedGame.dataset.game,
                    game_id: gameId,
                    nickname: nickname,
                    rank: rank,
                    style: selectedStyle ? selectedStyle.dataset.style : null,
                    profile_pic: document.getElementById('gameProfilePic').src
                };

                const { error } = await supabase
                    .from('users')
                    .update({ game_profile: gameProfile })
                    .eq('username', userData.username);

                if (error) throw error;

                showNotification('Profile saved! You\'re ready to rock! 🚀');
            } catch (error) {
                showNotification('Oops! Something went wrong! Try again! 😅', 'error');
            }
        });
    }
}); 

// Modal Management Functions
function showCreateGroupModal() {
    document.querySelector('.create-group-modal').style.display = 'block';
}

function hideCreateGroupModal() {
    document.querySelector('.create-group-modal').style.display = 'none';
    resetCreateGroupForm();
}

function resetCreateGroupForm() {
    document.getElementById('groupName').value = '';
    document.querySelectorAll('.privacy-option, .game-option').forEach(opt => opt.classList.remove('selected'));
    validateForm();
}

// Initialize Modal Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Open modal button
    const addNewBtn = document.querySelector('.add-new-btn');
    if (addNewBtn) {
        addNewBtn.addEventListener('click', showCreateGroupModal);
    }

    // Close modal button
    const closeModalBtn = document.querySelector('.close-modal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', hideCreateGroupModal);
    }

    // Privacy option selection
    document.querySelectorAll('.privacy-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.privacy-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            validateForm();
        });
    });

    // Game option selection
    document.querySelectorAll('.game-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.game-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            validateForm();
        });
    });

    // Group name input
    const groupNameInput = document.getElementById('groupName');
    if (groupNameInput) {
        groupNameInput.addEventListener('input', validateForm);
    }

    // Create button
    const createBtn = document.querySelector('.create-btn');
    if (createBtn) {
        createBtn.addEventListener('click', createGroup);
    }

    // Initialize form validation
    validateForm();
});

// Form validation
function validateForm() {
    const groupName = document.getElementById('groupName')?.value.trim();
    const selectedPrivacy = document.querySelector('.privacy-option.selected');
    const selectedGame = document.querySelector('.game-option.selected');
    const createBtn = document.querySelector('.create-btn');

    if (createBtn) {
        createBtn.disabled = !(groupName && selectedPrivacy && selectedGame);
    }
}

// Create new group
async function createGroup() {
    const groupName = document.getElementById('groupName')?.value.trim();
    const selectedPrivacy = document.querySelector('.privacy-option.selected');
    const selectedGame = document.querySelector('.game-option.selected');
    
    // Get current user from localStorage
    const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
    
    if (!currentUser) {
        showNotification('Please log in to create a group', 'error');
        return;
    }

    if (!groupName || !selectedPrivacy || !selectedGame) {
        showNotification('Please fill all required fields', 'error');
        return;
    }

    try {
        const { data: group, error } = await supabase
            .from('groups')
            .insert([{
                name: groupName,
                privacy: selectedPrivacy.dataset.privacy,
                game: selectedGame.dataset.game,
                owner_id: currentUser.id,
                members: [currentUser.id],
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;

        // Hide modal and reset form
        hideCreateGroupModal();
        
        // Show success notification
        showNotification('Group created successfully!', 'success');

        // Reload public groups if the created group is public
        if (selectedPrivacy.dataset.privacy === 'public') {
            loadPublicGroups();
        }

    } catch (error) {
        showNotification('Failed to create group', 'error');
    }
}

// Initialize section toggles
document.addEventListener('DOMContentLoaded', () => {
    // Initialize all section toggles
    const toggleButtons = document.querySelectorAll('.toggle-section');
    toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const sectionId = button.id.replace('toggle', '');
            const section = document.getElementById(sectionId);
            
            // Toggle the collapsed state
            button.classList.toggle('collapsed');
            if (section) {
                section.classList.toggle('collapsed');
                localStorage.setItem(`${sectionId}Collapsed`, section.classList.contains('collapsed'));
            }
        });
    });

    // Load public groups on startup
    loadPublicGroups();
});

// Function to load public groups
async function loadPublicGroups() {
    try {
        const { data: groups, error } = await supabase
            .from('groups')
            .select('*')
            .eq('privacy', 'public')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const publicGroupsList = document.getElementById('publicGroups');
        publicGroupsList.innerHTML = ''; // Clear existing groups

        if (groups.length === 0) {
            publicGroupsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users-slash"></i>
                    <p>No public groups yet</p>
                </div>
            `;
            return;
        }

        groups.forEach(group => {
            const groupElement = createGroupElement(group);
            publicGroupsList.appendChild(groupElement);
        });
    } catch (error) {
        showNotification('Failed to load public groups', 'error');
    }
}

// Function to create a group element
function createGroupElement(group) {
    const div = document.createElement('div');
    div.className = 'group-item';
    div.setAttribute('data-group-id', group.id);

    // Determine the icon based on the game type
    const gameIcons = {
        'bgmi': 'fas fa-mobile-alt',
        'valorant': 'fas fa-desktop',
        'pubg': 'fas fa-gamepad',
        'cod': 'fas fa-crosshairs',
        'freefire': 'fas fa-fire'
    };

    const icon = gameIcons[group.game] || 'fas fa-users';

    // Create group icon/avatar element
    let avatarHtml = '';
    if (group.avatar_url) {
        avatarHtml = `<img src="${group.avatar_url}" alt="${escapeHtml(group.name)}" class="group-avatar-img">`;
    } else {
        avatarHtml = `<i class="${icon}"></i>`;
    }

    div.innerHTML = `
        <div class="group-icon ${group.avatar_url ? 'has-avatar' : ''}">
            ${avatarHtml}
        </div>
        <div class="group-info">
            <div class="group-name">${escapeHtml(group.name)}</div>
            <div class="group-meta">${group.members?.length || 0} members</div>
        </div>
    `;

    // Store full group data for settings
    div.dataset.groupData = JSON.stringify({
        id: group.id,
        name: group.name,
        game: group.game,
        avatar_url: group.avatar_url,
        banner_url: group.banner_url,
        members: group.members
    });

    // Add click event listener
    div.addEventListener('click', () => handleGroupSelection(div));

    return div;
}

// Helper function to escape HTML and prevent XSS
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
} 

// Handle collapsible sections (no console warnings)
function initializeCollapsibleSections() {
  const collapsibleButtons = document.querySelectorAll('.collapsible-button');
  
  collapsibleButtons.forEach(button => {
    button.addEventListener('click', function() {
      const targetId = this.getAttribute('data-target');
      const section = document.getElementById(targetId);
      
      button.classList.toggle('collapsed');
      if (section) {
        section.classList.toggle('collapsed');
        localStorage.setItem(`${targetId}Collapsed`, section.classList.contains('collapsed'));
      }
    });
    // Restore collapsed state from localStorage if needed
    const targetId = button.getAttribute('data-target');
    if (targetId) {
      const section = document.getElementById(targetId);
      const storageKey = `${targetId}Collapsed`;
      const isCollapsed = localStorage.getItem(storageKey) === 'true';
      if (section && isCollapsed) {
        button.classList.add('collapsed');
        section.classList.add('collapsed');
      }
    }
  });
}

// Initialize collapsible sections when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeCollapsibleSections();
}); 

// User Profile Modal logic for members-sidebar
function showUserProfileModal(userId, event) {
    const modal = document.getElementById('userProfileModal');
    const modalContent = modal.querySelector('.user-profile-modal-content');
    const banner = document.getElementById('userProfileBanner');
    const avatar = document.getElementById('userProfileAvatar');
    const name = document.getElementById('userProfileName');
    const idSpan = document.getElementById('userProfileId');
    const loadingOverlay = document.getElementById('userProfileLoadingOverlay');

    // Show loading overlay
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    // Position modal near the click
    const clickX = event.clientX;
    const clickY = event.clientY;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
    // Position modal content (keep in viewport)
    let left = clickX + 16;
    let top = clickY - 40;
    if (left + 340 > window.innerWidth) left = window.innerWidth - 360;
    if (top + 260 > window.innerHeight) top = window.innerHeight - 280;
    if (top < 20) top = 20;
    modalContent.style.left = left + 'px';
    modalContent.style.top = top + 'px';

    // Show loading state
    banner.style.background = 'var(--bg-tertiary, #36393f)';
    avatar.src = 'assets/default-avatar.png';
    name.textContent = 'Loading...';
    idSpan.textContent = '';

    // Fetch user info from Supabase
    supabase
        .from('users')
        .select('id, username, avatar_url, banner_url')
        .eq('id', userId)
        .single()
        .then(({ data, error }) => {
            if (error || !data) {
                name.textContent = 'User not found';
                idSpan.textContent = '';
                banner.style.background = 'var(--bg-tertiary, #36393f)';
                avatar.src = 'assets/default-avatar.png';
                if (loadingOverlay) loadingOverlay.style.display = 'none';
                return;
            }
            name.textContent = data.username;
            idSpan.textContent = data.id;
            avatar.src = data.avatar_url || 'assets/default-avatar.png';
            if (data.banner_url) {
                banner.style.background = `url('${data.banner_url}') center/cover, var(--bg-tertiary, #36393f)`;
            } else {
                banner.style.background = 'var(--bg-tertiary, #36393f)';
            }
            // Hide loading overlay after data is loaded
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        });

    // Close logic
    function closeModal() {
        modal.classList.remove('active');
        setTimeout(() => { modal.style.display = 'none'; }, 200);
        document.removeEventListener('mousedown', outsideClickListener);
    }
    document.getElementById('closeUserProfileModal').onclick = closeModal;
    // Close on outside click
    function outsideClickListener(e) {
        if (!modalContent.contains(e.target)) closeModal();
    }
    setTimeout(() => {
        document.addEventListener('mousedown', outsideClickListener);
    }, 50);

    const addFriendBtn = document.getElementById('addFriendBtn');
    if (addFriendBtn) {
        updateFriendButtonState(getCurrentUserId(), userId, addFriendBtn);
    }
}

function getCurrentUserId() {
    // Assumes user info is stored in localStorage as 'wovo_user' with an 'id' property
    try {
        const user = JSON.parse(localStorage.getItem('wovo_user'));
        return user && user.id ? user.id : null;
    } catch {
        return null;
    }
}

// Attach click event to member items after rendering
function attachMemberItemClickHandlers() {
    document.querySelectorAll('.members-sidebar .member-item').forEach(item => {
        const id = item.getAttribute('data-user-id');
        if (id) {
            item.onclick = (e) => {
                e.stopPropagation();
                showUserProfileModal(id, e);
            };
        }
    });
} 

// --- FRIENDS SYSTEM CORE LOGIC ---

// Check if two users are friends
async function areFriends(userId1, userId2) {
    const [a, b] = [userId1, userId2].sort();
    const { data } = await supabase
        .from('friends')
        .select('*')
        .eq('user_id_1', a)
        .eq('user_id_2', b)
        .maybeSingle();
    return !!data;
}

// Get friend request status between two users
async function getFriendRequestStatus(currentUserId, otherUserId) {
    // Outgoing
    const { data: outgoing } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('sender_id', currentUserId)
        .eq('receiver_id', otherUserId)
        .order('created_at', { ascending: false })
        .maybeSingle();
    if (outgoing) return { type: 'outgoing', status: outgoing.status, request: outgoing };
    // Incoming
    const { data: incoming } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('sender_id', otherUserId)
        .eq('receiver_id', currentUserId)
        .order('created_at', { ascending: false })
        .maybeSingle();
    if (incoming) return { type: 'incoming', status: incoming.status, request: incoming };
    return null;
}

// Send friend request
async function sendFriendRequest(toUserId) {
  try {
    const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
    if (!currentUser) return;

    // First, send the request to Supabase
    const { error } = await supabase
      .from('friend_requests')
      .insert([{
        sender_id: currentUser.id,
        receiver_id: toUserId,
        status: 'pending'
      }]);

    if (error) throw error;

    // Then, notify the user through Socket.IO
    socket.emit('send_friend_request', {
      toUserId: toUserId,
      fromUser: {
        id: currentUser.id,
        username: currentUser.username
      }
    });

    showNotification({
      type: 'success',
      title: 'Request Sent',
      message: 'Friend request sent successfully!'
    });

  } catch (error) {
    showNotification({
      type: 'error',
      title: 'Error',
      message: 'Failed to send friend request.'
    });
  }
}

// Cancel outgoing friend request
async function cancelFriendRequest(requestId, btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        await supabase.from('friend_requests').delete().eq('id', requestId);
        btn.innerHTML = '<i class="fas fa-user-plus"></i>';
        btn.disabled = false;
        showNotification('Friend request cancelled', 'success');
    } catch {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-check"></i>';
        showNotification('Failed to cancel request', 'error');
    }
}

// Accept incoming friend request
async function acceptFriendRequest(request, btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', request.id);
        const [a, b] = [request.sender_id, request.receiver_id].sort();
        await supabase.from('friends').insert({ user_id_1: a, user_id_2: b });
        btn.innerHTML = '<i class="fas fa-user-friends"></i>';
        showNotification('Friend request accepted!', 'success');
    } catch {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-plus"></i>';
        showNotification('Failed to accept request', 'error');
    }
}

// Reject incoming friend request
async function rejectFriendRequest(request, btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        await supabase.from('friend_requests').update({ status: 'rejected' }).eq('id', request.id);
        btn.innerHTML = '<i class="fas fa-user-plus"></i>';
        btn.disabled = false;
        showNotification('Friend request rejected', 'success');
    } catch {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-plus"></i>';
        showNotification('Failed to reject request', 'error');
    }
}

// Remove friend
async function removeFriend(currentUserId, otherUserId, btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        const [a, b] = [currentUserId, otherUserId].sort();
        await supabase.from('friends').delete().eq('user_id_1', a).eq('user_id_2', b);
        btn.innerHTML = '<i class="fas fa-user-plus"></i>';
        btn.disabled = false;
        showNotification('Friend removed', 'success');
    } catch {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-friends"></i>';
        showNotification('Failed to remove friend', 'error');
    }
}

// --- Update user profile modal button logic ---
async function updateFriendButtonState(currentUserId, viewedUserId, btn) {
    if (!btn) return;
    btn.style.display = (currentUserId === viewedUserId) ? 'none' : 'flex';
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    // Check friendship
    if (await areFriends(currentUserId, viewedUserId)) {
        btn.innerHTML = '<i class="fas fa-user-friends"></i>';
        btn.title = 'Remove Friend';
        btn.onclick = () => removeFriend(currentUserId, viewedUserId, btn);
        return;
    }
    // Check request status
    const req = await getFriendRequestStatus(currentUserId, viewedUserId);
    if (!req) {
        btn.innerHTML = '<i class="fas fa-user-plus"></i>';
        btn.title = 'Add Friend';
        btn.onclick = () => sendFriendRequest(currentUserId, viewedUserId, btn);
        return;
    }
    if (req.type === 'outgoing') {
        if (req.status === 'pending') {
            btn.innerHTML = '<i class="fas fa-user-check"></i>';
            btn.title = 'Cancel Friend Request';
            btn.onclick = () => cancelFriendRequest(req.request.id, btn);
        } else if (req.status === 'rejected') {
            btn.innerHTML = '<i class="fas fa-user-plus"></i>';
            btn.title = 'Add Friend';
            btn.onclick = () => sendFriendRequest(currentUserId, viewedUserId, btn);
        } else if (req.status === 'accepted') {
            btn.innerHTML = '<i class="fas fa-user-friends"></i>';
            btn.title = 'Remove Friend';
            btn.onclick = () => removeFriend(currentUserId, viewedUserId, btn);
        }
    } else if (req.type === 'incoming') {
        if (req.status === 'pending') {
            // Accept/Reject UI: for now, clicking accepts
            btn.innerHTML = '<i class="fas fa-user-plus"></i>';
            btn.title = 'Accept Friend Request';
            btn.onclick = () => acceptFriendRequest(req.request, btn);
        } else if (req.status === 'rejected') {
            btn.innerHTML = '<i class="fas fa-user-plus"></i>';
            btn.title = 'Add Friend';
            btn.onclick = () => sendFriendRequest(currentUserId, viewedUserId, btn);
        } else if (req.status === 'accepted') {
            btn.innerHTML = '<i class="fas fa-user-friends"></i>';
            btn.title = 'Remove Friend';
            btn.onclick = () => removeFriend(currentUserId, viewedUserId, btn);
        }
    }
}

// --- Integrate with user profile modal ---
// Replace addFriendBtn logic in showUserProfileModal:
// ...
    const addFriendBtn = document.getElementById('addFriendBtn');
    if (addFriendBtn) {
    }
// ...
// ... existing code ...

// --- FRIEND REQUESTS LIST IN NOTIFICATIONS ---
async function renderFriendRequestsList() {
    const container = document.getElementById('friendRequestsList');
    if (!container) return;
    container.innerHTML = '<div class="notification-group"><h4>Friend Requests</h4><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div></div>';
    const currentUserId = getCurrentUserId();
    const { data: requests, error } = await supabase
        .from('friend_requests')
        .select('*, sender:sender_id (id, username, avatar_url)')
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending');
    if (error) {
        container.innerHTML = '<div class="notification-group"><h4>Friend Requests</h4><div class="notification-option">Failed to load requests</div></div>';
        return;
    }
    if (!requests || requests.length === 0) {
        container.innerHTML = '<div class="notification-group"><h4>Friend Requests</h4><div class="notification-option">No pending requests</div></div>';
        return;
    }
    container.innerHTML = `<div class="notification-group"><h4>Friend Requests</h4>${requests.map(req => `
        <div class="notification-option" data-request-id="${req.id}">
            <img src="${req.sender?.avatar_url || 'assets/default-avatar.png'}" alt="avatar" style="width:36px;height:36px;border-radius:50%;object-fit:cover;margin-right:12px;">
            <div class="option-details">
                <div class="option-title">${req.sender?.username || 'Unknown User'}</div>
                <div class="option-description">wants to be your friend</div>
            </div>
            <button class="accept-friend-btn" data-request-id="${req.id}" style="margin-right:8px;background:#3ba55d;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;"><i class="fas fa-check"></i></button>
            <button class="reject-friend-btn" data-request-id="${req.id}" style="background:#f23f42;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;"><i class="fas fa-times"></i></button>
        </div>
    `).join('')}</div>`;
    // Attach handlers
    container.querySelectorAll('.accept-friend-btn').forEach(btn => {
        btn.onclick = async function() {
            const requestId = this.getAttribute('data-request-id');
            const req = requests.find(r => r.id == requestId);
            if (!req) return;
            this.disabled = true;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            await acceptFriendRequest(req, this);
            renderFriendRequestsList();
        };
    });
    container.querySelectorAll('.reject-friend-btn').forEach(btn => {
        btn.onclick = async function() {
            const requestId = this.getAttribute('data-request-id');
            const req = requests.find(r => r.id == requestId);
            if (!req) return;
            this.disabled = true;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            await rejectFriendRequest(req, this);
            renderFriendRequestsList();
        };
    });
}

// Call this when opening settings and when switching to notifications section
function setupFriendRequestsListAutoRender() {
    const notificationsCategory = document.querySelector('.settings-category[data-section="notifications"]');
    if (notificationsCategory) {
        notificationsCategory.addEventListener('click', () => {
            setTimeout(renderFriendRequestsList, 100); // slight delay for section switch
        });
    }
    // Also render if notifications section is already active on load
    if (document.getElementById('notifications-section')?.classList.contains('active')) {
        renderFriendRequestsList();
    }
}

document.addEventListener('DOMContentLoaded', setupFriendRequestsListAutoRender);

// --- FRIENDS LIST IN FRIENDS SECTION ---
async function renderFriendsList() {
    const container = document.getElementById('realFriendsList');
    if (!container) return;
    container.innerHTML = '<div class="friend-category"><h4>Loading...</h4></div>';
    const currentUserId = getCurrentUserId();
    // Get all friendships where currentUserId is user_id_1 or user_id_2
    const { data: friendsRows, error } = await supabase
        .from('friends')
        .select('*')
        .or(`user_id_1.eq.${currentUserId},user_id_2.eq.${currentUserId}`);
    if (error) {
        container.innerHTML = '<div class="friend-category"><h4>Failed to load friends</h4></div>';
        return;
    }
    if (!friendsRows || friendsRows.length === 0) {
        container.innerHTML = '<div class="friend-category"><h4>No friends yet</h4></div>';
        return;
    }
    // Get friend user IDs
    let friendIds = friendsRows.map(row => row.user_id_1 === currentUserId ? row.user_id_2 : row.user_id_1).filter(Boolean);
    if (!Array.isArray(friendIds) || friendIds.length === 0) {
        container.innerHTML = '<div class="friend-category"><h4>No friends yet</h4></div>';
        return;
    }
    // Fetch user info for all friends
    const { data: users, error: userError } = await supabase
        .from('users')
        .select('id, username, avatar_url, status')
        .in('id', friendIds);
    if (userError) {
        container.innerHTML = '<div class="friend-category"><h4>Failed to load friends</h4></div>';
        return;
    }
    // For demo, randomly assign online/offline (replace with real status if available)
    const online = users.filter((_, i) => i % 2 === 0);
    const offline = users.filter((_, i) => i % 2 !== 0);
    let html = '';
    if (online.length) {
        html += `<div class="friend-category"><h4>ONLINE — ${online.length}</h4>${online.map(friend => `
            <div class="friend-item" data-user-id="${friend.id}">
                <div class="friend-avatar"><div class="status-indicator online"></div><img src="${friend.avatar_url || 'assets/default-avatar.png'}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;"></div>
                <div class="friend-info">
                    <div class="friend-name">${friend.username}</div>
                    <div class="friend-status">Online</div>
                </div>
            </div>
        `).join('')}</div>`;
    }
    if (offline.length) {
        html += `<div class="friend-category"><h4>OFFLINE — ${offline.length}</h4>${offline.map(friend => `
            <div class="friend-item" data-user-id="${friend.id}">
                <div class="friend-avatar"><div class="status-indicator offline"></div><img src="${friend.avatar_url || 'assets/default-avatar.png'}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;"></div>
                <div class="friend-info">
                    <div class="friend-name">${friend.username}</div>
                    <div class="friend-status">Offline</div>
                </div>
            </div>
        `).join('')}</div>`;
    }
    container.innerHTML = html;
}

// Realtime subscription for friends table
function subscribeToFriendsRealtime() {
    const currentUserId = getCurrentUserId();
    supabase.channel('friends-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friends', filter: `user_id_1=eq.${currentUserId}` }, renderFriendsList)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friends', filter: `user_id_2=eq.${currentUserId}` }, renderFriendsList)
        .subscribe();
}

// Call this when opening friends section and on page load if friends section is active
function setupFriendsListAutoRender() {
    const friendsCategory = document.querySelector('.nav-item .fa-user-friends')?.closest('.nav-item');
    if (friendsCategory) {
        friendsCategory.addEventListener('click', () => {
            // Show friends section
            document.querySelectorAll('.details-section').forEach(sec => sec.classList.remove('active'));
            document.getElementById('friends-section').classList.add('active');
            renderFriendsList();
        });
    }
    // Also render if friends section is already active on load
    if (document.getElementById('friends-section')?.classList.contains('active')) {
        renderFriendsList();
    }
    subscribeToFriendsRealtime();
}

document.addEventListener('DOMContentLoaded', setupFriendsListAutoRender);

// --- SOCKET.IO CLIENT SETUP ---
// Use io() with no URL for Render deployment (auto-detects host)
window.socket = io();
window.socket.on('connect', () => {
  console.log('Socket.IO connected:', window.socket.id);
  // Test event
  window.socket.emit('test', { hello: 'from client' });
});
window.socket.on('test-reply', (data) => {
  console.log('Test reply from server:', data);
});

// Initialize Socket.IO connection
const socket = io(window.location.origin);

// Connect and authenticate with Socket.IO
document.addEventListener('DOMContentLoaded', () => {
  const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
  if (currentUser?.id) {
    socket.emit('authenticate', currentUser.id);
  }
});

// Notification System
function createNotification(options) {
  const container = document.getElementById('notificationContainer');
  if (!container) return;

  const notification = document.createElement('div');
  notification.className = 'notification';
  
  let actionsHtml = '';
  if (options.type === 'friend_request') {
    actionsHtml = `
      <div class="notification-actions">
        <button class="notification-btn accept" onclick="handleFriendRequestResponse('${options.fromUser.id}', true)">Accept</button>
        <button class="notification-btn reject" onclick="handleFriendRequestResponse('${options.fromUser.id}', false)">Reject</button>
      </div>
    `;
  }

  notification.innerHTML = `
    <div class="notification-content">
      <div class="notification-title">
        ${options.type === 'friend_request' ? '<i class="fas fa-user-plus"></i>' : ''}
        ${options.title}
      </div>
      <div class="notification-message">${options.message}</div>
      ${actionsHtml}
    </div>
    <button class="notification-close" onclick="this.closest('.notification').remove()">
      <i class="fas fa-times"></i>
    </button>
  `;

  container.appendChild(notification);
  requestAnimationFrame(() => notification.classList.add('show'));

  // Auto remove after 5 seconds if not a friend request
  if (options.type !== 'friend_request') {
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }
}

// Add notification sound
const notificationSound = new Audio('https://cdn.discordapp.com/sounds/friend_request.mp3');

// Handle incoming friend request
socket.on('friend_request', (data) => {
  // Play notification sound
  notificationSound.play().catch(err => console.log('Could not play notification sound'));

  // Create notification with higher z-index and different position
  const container = document.getElementById('notificationContainer');
  if (!container) return;

  const notification = document.createElement('div');
  notification.className = 'notification friend-request-notification';
  notification.setAttribute('data-from-user', data.fromUser.id);
  
  notification.innerHTML = `
    <div class="notification-content">
      <div class="notification-title">
        <i class="fas fa-user-plus"></i>
        Friend Request
      </div>
      <div class="notification-message">
        <b>${data.fromUser.username}</b> sent you a friend request!
      </div>
      <div class="notification-actions">
        <button class="notification-btn accept" onclick="handleFriendRequestResponse('${data.fromUser.id}', true)">Accept</button>
        <button class="notification-btn reject" onclick="handleFriendRequestResponse('${data.fromUser.id}', false)">Reject</button>
      </div>
    </div>
    <button class="notification-close" onclick="this.closest('.notification').remove()">
      <i class="fas fa-times"></i>
    </button>
  `;

  container.appendChild(notification);
  requestAnimationFrame(() => notification.classList.add('show'));

  // Also show browser notification if permission is granted
  if (Notification.permission === "granted") {
    const browserNotification = new Notification("New Friend Request", {
      body: `${data.fromUser.username} sent you a friend request!`,
      icon: "/assets/default-avatar.png"
    });
    browserNotification.onclick = function() {
      window.focus();
      notification.scrollIntoView({ behavior: 'smooth' });
    };
  }
  // Ask for notification permission if not granted
  else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        const browserNotification = new Notification("New Friend Request", {
          body: `${data.fromUser.username} sent you a friend request!`,
          icon: "/assets/default-avatar.png"
        });
        browserNotification.onclick = function() {
          window.focus();
          notification.scrollIntoView({ behavior: 'smooth' });
        };
      }
    });
  }
});

// Add styles for friend request notification
const style = document.createElement('style');
style.textContent = `
  .friend-request-notification {
    z-index: 10000;
    background: var(--bg-floating, #18191c) !important;
    border: 1px solid var(--accent-color, #5865f2) !important;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4) !important;
    animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
  }

  @keyframes shake {
    10%, 90% { transform: translateX(-1px); }
    20%, 80% { transform: translateX(2px); }
    30%, 50%, 70% { transform: translateX(-4px); }
    40%, 60% { transform: translateX(4px); }
  }

  .friend-request-notification .notification-title {
    color: var(--accent-color, #5865f2);
  }

  .friend-request-notification .notification-message b {
    color: var(--text-primary, #f3f4f5);
  }
`;
document.head.appendChild(style);

// Handle friend request response
socket.on('friend_request_response', (data) => {
  createNotification({
    type: 'response',
    title: 'Friend Request ' + (data.accepted ? 'Accepted' : 'Rejected'),
    message: `${data.fromUser.username} ${data.accepted ? 'accepted' : 'rejected'} your friend request.`
  });
});

// Send friend request
async function sendFriendRequest(toUserId) {
  try {
    const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
    if (!currentUser) return;

    // First, send the request to Supabase
    const { error } = await supabase
      .from('friend_requests')
      .insert([{
        sender_id: currentUser.id,
        receiver_id: toUserId,
        status: 'pending'
      }]);

    if (error) throw error;

    // Then, notify the user through Socket.IO
    socket.emit('send_friend_request', {
      toUserId: toUserId,
      fromUser: {
        id: currentUser.id,
        username: currentUser.username
      }
    });

    createNotification({
      type: 'success',
      title: 'Request Sent',
      message: 'Friend request sent successfully!'
    });

  } catch (error) {
    createNotification({
      type: 'error',
      title: 'Error',
      message: 'Failed to send friend request.'
    });
  }
}

// Handle friend request response
async function handleFriendRequestResponse(fromUserId, accepted) {
  try {
    const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
    if (!currentUser) return;

    // Update request status in Supabase
    const { error: updateError } = await supabase
      .from('friend_requests')
      .update({ status: accepted ? 'accepted' : 'rejected' })
      .eq('sender_id', fromUserId)
      .eq('receiver_id', currentUser.id);

    if (updateError) throw updateError;

    if (accepted) {
      // Add to friends table if accepted
      const { error: friendError } = await supabase
        .from('friends')
        .insert([{
          user_id_1: currentUser.id,
          user_id_2: fromUserId
        }]);

      if (friendError) throw friendError;
    }

    // Notify the sender through Socket.IO
    socket.emit('friend_request_response', {
      toUserId: fromUserId,
      accepted: accepted,
      fromUser: {
        id: currentUser.id,
        username: currentUser.username
      }
    });

    // Remove the notification
    const notification = document.querySelector(`.notification[data-from-user="${fromUserId}"]`);
    if (notification) {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }

    // Show success message
    createNotification({
      type: 'success',
      title: 'Success',
      message: `Friend request ${accepted ? 'accepted' : 'rejected'}.`
    });

    // Refresh friends list if accepted
    if (accepted && typeof loadFriendsList === 'function') {
      loadFriendsList();
    }

    // Update button state
    const addFriendBtn = document.getElementById('addFriendBtn');
    if (addFriendBtn) {
      updateFriendButtonState(currentUser.id, fromUserId, addFriendBtn);
    }

  } catch (error) {
    createNotification({
      type: 'error',
      title: 'Error',
      message: `Failed to ${accepted ? 'accept' : 'reject'} friend request.`
    });
  }
}

// Update the existing showNotification function to use the new system
window.showNotification = function(message, type = 'info') {
  createNotification({
    type: type,
    title: type.charAt(0).toUpperCase() + type.slice(1),
    message: message
  });
};

// Update friend button state
async function updateFriendButtonState(currentUserId, targetUserId, button) {
  if (!button || currentUserId === targetUserId) return;

  try {
    // Check if already friends
    const { data: friendData, error: friendError } = await supabase
      .from('friends')
      .select('*')
      .or(`and(user_id_1.eq.${currentUserId},user_id_2.eq.${targetUserId}),and(user_id_1.eq.${targetUserId},user_id_2.eq.${currentUserId})`)
      .maybeSingle();

    if (friendError) throw friendError;

    if (friendData) {
      button.innerHTML = '<i class="fas fa-user-minus"></i> Remove Friend';
      button.onclick = () => removeFriend(targetUserId);
      return;
    }

    // Check for pending requests
    const { data: requestData, error: requestError } = await supabase
      .from('friend_requests')
      .select('*')
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUserId})`)
      .eq('status', 'pending')
      .maybeSingle();

    if (requestError) throw requestError;

    if (requestData) {
      if (requestData.sender_id === currentUserId) {
        button.innerHTML = '<i class="fas fa-clock"></i> Request Sent';
        button.disabled = true;
      } else {
        button.innerHTML = '<i class="fas fa-user-plus"></i> Accept Request';
        button.onclick = () => handleFriendRequestResponse(targetUserId, true);
      }
      return;
    }

    // No relationship exists
    button.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
    button.onclick = () => sendFriendRequest(targetUserId);

  } catch (error) {
    console.error('Error updating friend button:', error);
    button.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
    button.onclick = () => sendFriendRequest(targetUserId);
  }
}

// Remove friend
async function removeFriend(friendId) {
  try {
    const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
    if (!currentUser) return;

    const { error } = await supabase
      .from('friends')
      .delete()
      .or(`and(user_id_1.eq.${currentUser.id},user_id_2.eq.${friendId}),and(user_id_1.eq.${friendId},user_id_2.eq.${currentUser.id})`);

    if (error) throw error;

    showNotification({
      type: 'success',
      title: 'Friend Removed',
      message: 'Friend has been removed successfully.'
    });

    // Refresh friends list
    if (typeof loadFriendsList === 'function') {
      loadFriendsList();
    }

    // Update button state
    const addFriendBtn = document.getElementById('addFriendBtn');
    if (addFriendBtn) {
      updateFriendButtonState(currentUser.id, friendId, addFriendBtn);
    }

  } catch (error) {
    showNotification({
      type: 'error',
      title: 'Error',
      message: 'Failed to remove friend.'
    });
  }
}

// Load friends list
async function loadFriendsList() {
  const container = document.querySelector('.friends-content');
  if (!container) return;

  try {
    const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
    if (!currentUser) return;

    // Show loading state
    container.innerHTML = `
      <div class="loading-spinner">
        <i class="fas fa-spinner fa-spin"></i>
        Loading friends...
      </div>
    `;

    // Get all friends with user details
    const { data: friends, error } = await supabase
      .from('friends')
      .select(`
        user_id_1,
        user_id_2,
        users1:user_id_1(id, username, avatar_url),
        users2:user_id_2(id, username, avatar_url)
      `)
      .or(`user_id_1.eq.${currentUser.id},user_id_2.eq.${currentUser.id}`);

    if (error) throw error;

    // Process friends data
    const friendsList = friends.map(friend => {
      // Get the other user's data (not current user)
      const otherUser = friend.user_id_1 === currentUser.id ? friend.users2 : friend.users1;
      return {
        id: otherUser.id,
        username: otherUser.username,
        avatar_url: otherUser.avatar_url
      };
    });

    // For demo: randomly assign online/offline status
    const online = friendsList.filter((_, i) => i % 2 === 0);
    const offline = friendsList.filter((_, i) => i % 2 !== 0);

    let html = `<div class="friends-header"><h3>FRIENDS</h3></div>`;

    if (online.length) {
      html += `<div class="friend-category"><h4>ONLINE — ${online.length}</h4>${online.map(friend => `
        <div class="friend-item" data-user-id="${friend.id}">
          <div class="friend-avatar">
            <div class="status-indicator online"></div>
            <img src="${friend.avatar_url || 'assets/default-avatar.png'}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">
          </div>
          <div class="friend-info">
            <div class="friend-name">${friend.username}</div>
            <div class="friend-status">Online</div>
          </div>
        </div>
      `).join('')}</div>`;
    }

    if (offline.length) {
      html += `<div class="friend-category"><h4>OFFLINE — ${offline.length}</h4>${offline.map(friend => `
        <div class="friend-item" data-user-id="${friend.id}">
          <div class="friend-avatar">
            <div class="status-indicator offline"></div>
            <img src="${friend.avatar_url || 'assets/default-avatar.png'}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;"></div>
          <div class="friend-info">
            <div class="friend-name">${friend.username}</div>
            <div class="friend-status">Offline</div>
          </div>
        </div>
      `).join('')}</div>`;
    }

    if (!online.length && !offline.length) {
      html += `
        <div class="empty-state">
          <i class="fas fa-user-friends"></i>
          <p>No friends yet</p>
        </div>
      `;
    }

    container.innerHTML = html;

    // Add click handlers to friend items
    container.querySelectorAll('.friend-item').forEach(item => {
      item.onclick = (e) => {
        const userId = item.dataset.userId;
        if (userId) {
          showUserProfileModal(userId, e);
        }
      };
    });

  } catch (error) {
    console.error('Error loading friends:', error);
    container.innerHTML = `
      <div class="error-state">
        <i class="fas fa-exclamation-circle"></i>
        <p>Failed to load friends</p>
      </div>
    `;
  }
}

// Add leaveGroup function
async function leaveGroup(groupId) {
    const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
    if (!currentUser) {
        showNotification('Please log in to leave groups', 'error');
        return;
    }
    try {
        // Remove from group_members
        const { error: removeError } = await supabase
            .from('group_members')
            .delete()
            .eq('group_id', groupId)
            .eq('user_id', currentUser.id);
        if (removeError) {
            showNotification('Failed to leave group', 'error');
            return;
        }
        // Remove from groups.members array
        const { data: groupData, error: groupError } = await supabase
            .from('groups')
            .select('members')
            .eq('id', groupId)
            .single();
        if (groupError) {
            showNotification('Failed to update group members', 'error');
            return;
        }
        const currentMembers = groupData?.members || [];
        const newMembers = currentMembers.filter(id => id !== currentUser.id);
        const { error: updateError } = await supabase
            .from('groups')
            .update({ members: newMembers })
            .eq('id', groupId);
        if (updateError) {
            showNotification('Failed to update group members', 'error');
            return;
        }
        showNotification('You left the group', 'success');
        // Refresh group list and UI
        loadPublicGroups();
        // Hide leave button
        const leaveBtn = document.getElementById('leaveBtn');
        if (leaveBtn) leaveBtn.style.display = 'none';
        // Smoothly remove member from members-sidebar
        const currentUserId = currentUser.id;
        const memberItem = document.querySelector(`.members-sidebar .member-item[data-user-id='${currentUserId}']`);
        if (memberItem) {
            memberItem.style.transition = 'opacity 0.4s';
            memberItem.style.opacity = '0';
            setTimeout(() => {
                memberItem.remove();
            }, 400);
        }
    } catch (error) {
        showNotification('Failed to leave group', 'error');
    }
}

// Group chat UI elements
const groupChatContainer = document.getElementById('groupChatContainer');
const groupMessages = document.getElementById('groupMessages');
const groupChatStart = document.getElementById('groupChatStart');
const groupMessageForm = document.getElementById('groupMessageForm');
const groupMessageInput = document.getElementById('groupMessageInput');

// --- Group Chat Messaging Logic ---
let currentGroupId = null;
let groupMessagesCache = [];

async function loadGroupMessages(groupId) {
    if (!groupMessages) return;

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
    groupMessages.innerHTML = loaderHTML;
    groupChatStart.style.display = 'none';

    try {
        const { data: messages, error } = await supabase
            .from('group_messages')
            .select('*, users(username, avatar_url), reply_to:reply_to_message_id(*, users(username, avatar_url))')
            .eq('group_id', groupId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        groupMessages.innerHTML = ''; // Clear the loader

        if (messages.length === 0) {
            groupChatStart.style.display = 'block';
        } else {
            messages.forEach(msg => renderGroupMessage(msg));
            // Defer scroll to bottom to allow images to load
            setTimeout(() => {
                groupMessages.scrollTop = groupMessages.scrollHeight;
            }, 100);
        }
    } catch (error) {
        groupMessages.innerHTML = '<div class="error-state">Failed to load messages.</div>';
    }
}

function renderGroupMessage(msg, isNew = false) {
    const groupMessages = document.getElementById('groupMessages');
    if (!groupMessages) return;

    // Check for existing message to prevent duplicates
    if (document.querySelector(`.group-message[data-message-id="${msg.id}"]`)) {
        return;
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = 'group-message';
    msgDiv.dataset.messageId = msg.id;

    // Add animation for new messages
    if (isNew) {
        msgDiv.classList.add('new-message-animation');
    }

    // Handle soft-deleted messages
    if (msg.is_deleted) {
        msgDiv.classList.add('deleted');
        msgDiv.innerHTML = `
            <div class="group-message-avatar"></div>
            <div class="group-message-content">
                <div class="group-message-text">(message deleted)</div>
            </div>
        `;
        groupMessages.appendChild(msgDiv);
        return;
    }
    
    // Get current user to check ownership
    const currentUser = JSON.parse(localStorage.getItem('wovo_user') || '{}');
    const isOwner = msg.user_id === currentUser.id;

    // Add message actions for owner and reply for all
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

    // Handle replied messages
    let replyContextHtml = '';
    if (msg.reply_to_message_id && msg.reply_to) {
        replyContextHtml = `
            <div class="reply-context">
                <img src="${msg.reply_to.users?.avatar_url || DEFAULT_AVATAR}" alt="avatar">
                <span class="reply-username">${escapeHtml(msg.reply_to.users?.username || 'User')}</span>
                <span class="reply-text">${escapeHtml(msg.reply_to.content)}</span>
            </div>
        `;
    }

    // Build the final message HTML
    msgDiv.innerHTML = `
        <div class="group-message-avatar">
            <img src="${msg.users?.avatar_url || DEFAULT_AVATAR}" alt="avatar">
        </div>
        <div class="group-message-content">
            ${replyContextHtml}
            <div class="group-message-header">
                <span class="group-message-username">${escapeHtml(msg.users?.username || 'User')}</span>
                <span class="group-message-timestamp">${formatTimestamp(msg.created_at)}</span>
                ${msg.is_edited ? '<span class="message-edited-tag">(edited)</span>' : ''}
            </div>
            ${
                msg.content
                ? (
                    msg.content.startsWith('# ')
                    ? `<h1 class="message-heading">${formatMessageContent(msg.content.substring(2))}</h1>`
                    : `<div class="group-message-text">${formatMessageContent(msg.content)}</div>`
                )
                : ''
            }
        </div>
        ${messageActions}
    `;

    // Add media if it exists
    if (msg.media_url) {
        const mediaContainer = document.createElement('div');
        mediaContainer.className = 'group-message-media';
        if (msg.media_type === 'image') {
            mediaContainer.innerHTML = `<img src="${msg.media_url}" alt="Shared image" loading="lazy">`;
        } else if (msg.media_type === 'video') {
            mediaContainer.innerHTML = `<video src="${msg.media_url}" controls></video>`;
        }
        
        // Add progress bar for uploads
        if (msg.is_uploading) {
            mediaContainer.style.position = 'relative';
            mediaContainer.innerHTML += `
                <div class="upload-progress-overlay">
                    <div class="progress-bar-container">
                        <div class="progress-bar"></div>
                    </div>
                </div>
            `;
        }

        msgDiv.querySelector('.group-message-content').appendChild(mediaContainer);
    }

    // Add reactions container and append both to the DOM
    const reactionsContainer = document.createElement('div');
    reactionsContainer.className = 'message-reactions-container';
    reactionsContainer.dataset.messageId = msg.id;
    
    groupMessages.appendChild(msgDiv);
    groupMessages.appendChild(reactionsContainer);

    // Render existing reactions, but only if it's not a temporary uploading message
    if (!msg.is_uploading) {
        renderReactions(msg.id, reactionsContainer);
    }
}

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(unsafe) {
  return unsafe?.replace(/[&<"'>]/g, function(m) {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return m;
    }
  });
}

// --- Socket.IO group chat ---
let joinedGroupRoom = null;
let messageSubscription = null;
const userCache = {};

async function enterGroupChat(groupId) {
  // Leave previous room and unsubscribe
  if (messageSubscription) {
    messageSubscription.unsubscribe();
    messageSubscription = null;
  }
  
  joinedGroupRoom = groupId;
  groupChatContainer.style.display = 'flex';
  await loadGroupMessages(groupId);

  // Set up real-time subscription for new messages
  messageSubscription = supabase
    .channel(`group_messages_${groupId}`)
    .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'group_messages', 
        filter: `group_id=eq.${groupId}` 
    }, async (payload) => {
        const messageId = payload.new?.id || payload.old?.id;
        const existingEl = document.querySelector(`.group-message[data-message-id="${messageId}"]`);

        // Handle deleted messages
        if (payload.eventType === 'UPDATE' && payload.new.is_deleted) {
            if (existingEl) {
                existingEl.classList.add('deleted');
                existingEl.innerHTML = `
                    <div class="group-message-avatar"></div>
                    <div class="group-message-content">
                        <div class="group-message-text">(message deleted)</div>
                    </div>
                `;
            }
            return;
        }

        // Handle new or edited messages
        if (payload.new) {
            const message = payload.new;

            // --- THIS IS THE NEW LOGIC TO SWAP THE TEMP MESSAGE ---
            if (message.client_temp_id) {
                const tempEl = document.querySelector(`.group-message[data-message-id="${message.client_temp_id}"]`);
                if (tempEl) {
                    // Replace the temporary message with the final one
                    tempEl.dataset.messageId = message.id; // Update the ID to the real one
                    // Remove the progress bar
                    const progressOverlay = tempEl.querySelector('.upload-progress-overlay');
                    if (progressOverlay) progressOverlay.remove();
                    // Update the image src if it was a local blob
                    const img = tempEl.querySelector('img');
                    if (img && img.src.startsWith('blob:')) {
                        img.src = message.media_url;
                    }
                    return; // Stop further processing for this message
                }
            }
            // --- END OF NEW LOGIC ---

            // Fetch user data if not in cache
            if (!userCache[message.user_id]) {
                const { data: userData } = await supabase.from('users').select('username, avatar_url').eq('id', message.user_id).single();
                userCache[message.user_id] = userData || {};
            }
            message.users = userCache[message.user_id];

            // Fetch replied-to message if it exists
            if (message.reply_to_message_id && !message.reply_to) {
                const { data: repliedMsgData } = await supabase.from('group_messages').select('*, users(username, avatar_url)').eq('id', message.reply_to_message_id).single();
                message.reply_to = repliedMsgData;
            }

            if (existingEl) { // Message is being edited
                existingEl.remove();
                renderGroupMessage(message, false);
            } else { // It's a new message
                renderGroupMessage(message, true);
                groupMessages.scrollTop = groupMessages.scrollHeight;
            }
        }
    })
    .subscribe();

  // Add a separate subscription for reactions
  supabase.channel(`message_reactions_${groupId}`)
    .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'message_reactions',
        filter: `group_id=eq.${groupId}`
    }, (payload) => {
        const messageId = payload.new?.message_id || payload.old?.message_id;
        if (messageId) {
            renderReactions(messageId);
        }
    })
    .subscribe();
}

// Listen for incoming group messages
// ... existing code ...

// Send message
if (groupMessageForm) {
    sendGroupMessageBtn.addEventListener('click', sendMessage);
  }
// Function to send a message
async function sendMessage() {
    const content = groupMessageInput.value.trim();
    if (!content) return;
    const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
    if (!currentUser || !joinedGroupRoom) return;
    
    // Clear the input field immediately
    groupMessageInput.value = '';

    // Send to server via Socket.IO
    socket.emit('group_message_send', { 
        groupId: joinedGroupRoom, 
        user_id: currentUser.id, 
        content,
        reply_to_message_id: currentReplyTo ? currentReplyTo.id : null
    });

    // Clear reply state
    if (currentReplyTo) {
        const replyPreview = document.querySelector('.reply-preview');
        if (replyPreview) {
            replyPreview.remove();
        }
        currentReplyTo = null;
    }
}

// --- Hook into group selection ---
const originalHandleGroupSelection = handleGroupSelection;
handleGroupSelection = async function(groupElement) {
  await originalHandleGroupSelection.apply(this, arguments);
  // Get groupId from element
  let groupData = {};
  try {
    groupData = JSON.parse(groupElement.dataset.groupData || '{}');
  } catch {}
  const groupId = groupData.id || groupElement.getAttribute('data-group-id');
  if (groupId && !groupId.toString().startsWith('default-')) {
    enterGroupChat(groupId);
  } else {
    groupChatContainer.style.display = 'none';
  }
};

// Function to delete a message
async function deleteMessage(messageId) {
    const { error } = await supabase
        .from('group_messages')
        .update({ 
            is_deleted: true, 
            content: '(message deleted)' 
        })
        .eq('id', messageId);

    if (error) {
        showNotification('Failed to delete message', 'error');
    }
}

// Add event listener for message actions
document.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.action-btn-icon.delete');
    const editBtn = e.target.closest('.action-btn-icon.edit');
    const replyBtn = e.target.closest('.action-btn-icon.reply');
    const addReactionBtn = e.target.closest('.action-btn-icon.add-reaction');
    const reactionBtn = e.target.closest('.reaction');

    if (deleteBtn) {
        const messageElement = deleteBtn.closest('.group-message');
        if (messageElement) {
            const messageId = messageElement.dataset.messageId;
            deleteMessage(messageId);
        }
        return;
    }
    
    if (editBtn) {
        const messageElement = editBtn.closest('.group-message');
        if (messageElement) {
            startEditing(messageElement);
        }
        return;
    }
    
    if (replyBtn) {
        const messageElement = replyBtn.closest('.group-message');
        if (messageElement) {
            setupReply(messageElement);
        }
        return;
    }

    if (addReactionBtn) {
        const messageElement = addReactionBtn.closest('.group-message');
        if (!messageElement) return;

        currentMessageForReaction = messageElement.dataset.messageId;
        const rect = addReactionBtn.getBoundingClientRect();
        
        // Approx. picker dimensions
        const pickerHeight = 420; 
        const pickerWidth = 350;

        let top = rect.top + window.scrollY - pickerHeight - 5;
        let left = rect.right + window.scrollX - pickerWidth;

        // Adjust if it would go off-screen
        if (top < window.scrollY) {
            top = rect.bottom + window.scrollY + 5;
        }
        if (left < 0) {
            left = 5;
        }
        if (left + pickerWidth > window.innerWidth) {
            left = window.innerWidth - pickerWidth - 5;
        }

        emojiPickerContainer.style.top = `${top}px`;
        emojiPickerContainer.style.left = `${left}px`;
        emojiPickerContainer.style.display = 'block';
        return;
    }

    if (reactionBtn) {
        const messageId = reactionBtn.closest('.message-reactions-container').dataset.messageId;
        const emoji = reactionBtn.dataset.emoji;
        toggleReaction(messageId, emoji);
        return;
    }

    // Hide picker if clicking outside
    if (emojiPickerContainer && !emojiPickerContainer.contains(e.target)) {
        emojiPickerContainer.style.display = 'none';
    }
});

let currentReplyTo = null;

// Function to set up the reply UI
function setupReply(messageElement) {
    const messageId = messageElement.dataset.messageId;
    const username = messageElement.querySelector('.group-message-username').textContent;
    let messageText = messageElement.querySelector('.group-message-text').textContent;

    // Truncate long messages
    if (messageText.length > 50) {
        messageText = messageText.substring(0, 47) + '...';
    }
    
    currentReplyTo = { id: messageId, username, messageText };

    const replyPreview = document.createElement('div');
    replyPreview.className = 'reply-preview';
    replyPreview.innerHTML = `
        <div class="reply-preview-content">
            Replying to <strong>${escapeHtml(username)}</strong>: <span>${escapeHtml(messageText)}</span>
        </div>
        <button class="cancel-reply-btn">&times;</button>
    `;

    // Remove any existing preview
    const existingPreview = document.querySelector('.reply-preview');
    if (existingPreview) {
        existingPreview.remove();
    }
    
    groupMessageForm.prepend(replyPreview);
    groupMessageInput.focus();

    replyPreview.querySelector('.cancel-reply-btn').onclick = () => {
        replyPreview.remove();
        currentReplyTo = null;
    };
}

// Function to start editing a message
function startEditing(messageElement) {
    const messageTextElement = messageElement.querySelector('.group-message-text');
    const originalText = messageTextElement.textContent;

    messageTextElement.innerHTML = `
        <textarea class="edit-message-input">${originalText}</textarea>
        <div class="edit-message-actions">
            <button class="save-edit">Save</button>
            <button class="cancel-edit">Cancel</button>
        </div>
    `;

    const saveBtn = messageElement.querySelector('.save-edit');
    const cancelBtn = messageElement.querySelector('.cancel-edit');
    const editInput = messageElement.querySelector('.edit-message-input');

    saveBtn.onclick = () => {
        const newContent = editInput.value;
        if (newContent.trim() && newContent !== originalText) {
            editMessage(messageElement.dataset.messageId, newContent);
        }
        messageTextElement.innerHTML = escapeHtml(newContent); // Revert to text
    };

    cancelBtn.onclick = () => {
        messageTextElement.innerHTML = escapeHtml(originalText); // Revert to original text
    };
}

// Function to edit a message
async function editMessage(messageId, newContent) {
    const { error } = await supabase
        .from('group_messages')
        .update({ content: newContent, is_edited: true })
        .eq('id', messageId);

    if (error) {
        showNotification('Failed to edit message', 'error');
    }
}

// Function to render reactions for a message
async function renderReactions(messageId, container) {
    if (!container) {
        container = document.querySelector(`.message-reactions-container[data-message-id="${messageId}"]`);
    }
    if (!container) return;

    const { data: reactions, error } = await supabase
        .from('message_reactions')
        .select('emoji, user_id')
        .eq('message_id', messageId);
    
    if (error) return;

    const currentUser = JSON.parse(localStorage.getItem('wovo_user') || '{}');

    // Group reactions by emoji
    const grouped = reactions.reduce((acc, r) => {
        acc[r.emoji] = acc[r.emoji] || [];
        acc[r.emoji].push(r.user_id);
        return acc;
    }, {});

    container.innerHTML = ''; // Clear existing

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

// --- @MENTIONS LOGIC ---
async function fetchGroupMembers(groupId) {
    try {
        const response = await fetch(`/api/groups/${groupId}/members`);
        if (!response.ok) throw new Error('Failed to fetch group members');
        currentGroupMembers = await response.json();
    } catch (error) {
        console.error(error);
        currentGroupMembers = [];
    }
}

function updateMentionsPopup(query) {
    const userMentionsPopup = document.getElementById('userMentionsPopup');
    if (!userMentionsPopup) return;

    const filteredMembers = currentGroupMembers.filter(member =>
        member && member.username && member.username.toLowerCase().includes(query.toLowerCase())
    );

    if (filteredMembers.length === 0) {
        userMentionsPopup.style.display = 'none';
        return;
    }

    userMentionsPopup.innerHTML = filteredMembers.map(member => `
        <div class="mention-item" data-user-id="${member.id}" data-username="${member.username}">
            <img src="${member.avatar_url || DEFAULT_AVATAR}" alt="avatar">
            <span class="username">${member.username}</span>
        </div>
    `).join('');
    userMentionsPopup.style.display = 'block';
}

function setupMentionsListeners() {
    const groupMessageInput = document.getElementById('groupMessageInput');
    const userMentionsPopup = document.getElementById('userMentionsPopup');

    if (!groupMessageInput || !userMentionsPopup) return;

    groupMessageInput.addEventListener('input', () => {
        const text = groupMessageInput.value;
        const cursorPos = groupMessageInput.selectionStart;
        const textBeforeCursor = text.slice(0, cursorPos);
        const atMatch = textBeforeCursor.match(/@(\w*)$/);

        if (atMatch) {
            isMentionPopupOpen = true;
            mentionQuery = atMatch[1];
            updateMentionsPopup(mentionQuery);
        } else {
            isMentionPopupOpen = false;
            userMentionsPopup.style.display = 'none';
        }
    });

    userMentionsPopup.addEventListener('click', (e) => {
        const item = e.target.closest('.mention-item');
        if (item) {
            const username = item.dataset.username;
            const userId = item.dataset.userId;
            const mentionText = `@[${username}](${userId}) `;

            const text = groupMessageInput.value;
            const cursorPos = groupMessageInput.selectionStart;
            const textBefore = text.slice(0, cursorPos).replace(/@\w*$/, '');
            const textAfter = text.slice(cursorPos);

            groupMessageInput.value = textBefore + mentionText + textAfter;
            userMentionsPopup.style.display = 'none';
            isMentionPopupOpen = false;
            groupMessageInput.focus();

            const newCursorPos = (textBefore + mentionText).length;
            groupMessageInput.setSelectionRange(newCursorPos, newCursorPos);
        }
    });
}

// --- EMOJI REACTIONS LOGIC ---
const emojiPickerContainer = document.querySelector('.emoji-picker-container');
let currentMessageForReaction = null;

// Show emoji picker
document.addEventListener('click', e => {
    const addBtn = e.target.closest('.add-reaction-btn');
    if (addBtn) {
        currentMessageForReaction = addBtn.closest('.message-reactions-container').dataset.messageId;
        const rect = addBtn.getBoundingClientRect();
        emojiPickerContainer.style.top = `${rect.bottom + window.scrollY}px`;
        emojiPickerContainer.style.left = `${rect.left + window.scrollX}px`;
        emojiPickerContainer.style.display = 'block';
        return;
    }
    // Hide picker if clicking outside
    if (!emojiPickerContainer.contains(e.target)) {
        emojiPickerContainer.style.display = 'none';
    }
});

// Handle emoji selection
emojiPicker.addEventListener('emoji-click', async e => {
    if (!currentMessageForReaction) return;
    const emoji = e.detail.unicode;
    await toggleReaction(currentMessageForReaction, emoji);
    emojiPickerContainer.style.display = 'none';
});

// Toggle reaction
async function toggleReaction(messageId, emoji) {
    const currentUser = JSON.parse(localStorage.getItem('wovo_user') || '{}');
    const { data: existing } = await supabase
        .from('message_reactions')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', currentUser.id)
        .eq('emoji', emoji)
        .single();
    
    if (existing) { // Remove reaction
        await supabase.from('message_reactions').delete().eq('id', existing.id);
    } else { // Add reaction
        await supabase.from('message_reactions').insert({
            message_id: messageId,
            user_id: currentUser.id,
            group_id: joinedGroupRoom,
            emoji
        });
    }
}

function formatMessageContent(content) {
    if (!content) return '';
    const mentionRegex = /@\[(.+?)\]\((.+?)\)/g;
    // Escape HTML first, then replace the mention format with a span
    return escapeHtml(content).replace(mentionRegex, (match, username, userId) => {
        return `<span class="mention-highlight" data-user-id="${escapeHtml(userId)}">@${escapeHtml(username)}</span>`;
    });
}