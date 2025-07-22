// Default avatar path
const DEFAULT_AVATAR = './assets/default-avatar.png';

// Initialize Supabase client
const SUPABASE_URL = 'https://mygdcrvbrqfxudvxrwpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15Z2RjcnZicnFmeHVkdnhyd3BxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3NjQ1MzIsImV4cCI6MjA2ODM0MDUzMn0.5Wavk9j2oZ2BbBqeULr5TSYcQMWk_PFJAbP9RYxNAiU';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM Elements - Global
const sidebar = document.getElementById('sidebar');
const hamburgerBtn = document.getElementById('hamburger-btn');
const themeToggle = document.getElementById('theme-toggle');
const html = document.documentElement;

// Initialize theme from localStorage
const savedTheme = localStorage.getItem('theme') || 'dark';
html.setAttribute('data-theme', savedTheme);
updateThemeIcon(savedTheme);

// Initialize all DOM elements and event listeners when document is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM elements
    const logoutBtn = document.getElementById('logout-btn');
    const settingsBtn = document.querySelector('.user-settings-btn');
    const sidebarSettingsBtn = document.querySelector('.nav-item[data-section="settings"]');
    const settingsPage = document.getElementById('settings-page');
    const closeSettingsBtn = document.querySelector('.close-settings');
    const defaultContent = document.getElementById('default-content');
    const settingsCategories = document.querySelectorAll('.settings-category');
    const settingsSections = document.querySelectorAll('.settings-section');

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

    } catch (error) {
        showNotification('Failed to join group', 'error');
    }
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
        // Fetch group data
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
document.querySelector('.groups-content').style.display = 'flex';

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
async function sendFriendRequest(senderId, receiverId, btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        const { error } = await supabase.from('friend_requests').insert({ sender_id: senderId, receiver_id: receiverId, status: 'pending' });
        if (error) throw error;
        btn.innerHTML = '<i class="fas fa-user-check"></i>';
        showNotification('Friend request sent!', 'success');
    } catch {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-plus"></i>';
        showNotification('Failed to send friend request', 'error');
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
            <div class="friend-item">
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
            <div class="friend-item">
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
function showNotification(options) {
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

// Handle incoming friend request
socket.on('friend_request', (data) => {
  showNotification({
    type: 'friend_request',
    title: 'Friend Request',
    message: `${data.fromUser.username} sent you a friend request!`,
    fromUser: data.fromUser
  });
});

// Handle friend request response
socket.on('friend_request_response', (data) => {
  showNotification({
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
        from_user_id: currentUser.id,
        to_user_id: toUserId,
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

// Handle friend request response
async function handleFriendRequestResponse(fromUserId, accepted) {
  try {
    const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
    if (!currentUser) return;

    // Update request status in Supabase
    const { error: updateError } = await supabase
      .from('friend_requests')
      .update({ status: accepted ? 'accepted' : 'rejected' })
      .eq('from_user_id', fromUserId)
      .eq('to_user_id', currentUser.id);

    if (updateError) throw updateError;

    if (accepted) {
      // Add to friends table if accepted
      const { error: friendError } = await supabase
        .from('friends')
        .insert([
          {
            user_id: currentUser.id,
            friend_id: fromUserId
          },
          {
            user_id: fromUserId,
            friend_id: currentUser.id
          }
        ]);

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
    showNotification({
      type: 'success',
      title: 'Success',
      message: `Friend request ${accepted ? 'accepted' : 'rejected'}.`
    });

    // Refresh friends list if accepted
    if (accepted && typeof loadFriendsList === 'function') {
      loadFriendsList();
    }

  } catch (error) {
    showNotification({
      type: 'error',
      title: 'Error',
      message: `Failed to ${accepted ? 'accept' : 'reject'} friend request.`
    });
  }
}

// Update the existing showNotification function to use the new system
window.showNotification = function(message, type = 'info') {
  showNotification({
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
      .eq('user_id', currentUserId)
      .eq('friend_id', targetUserId)
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
      .or(`and(from_user_id.eq.${currentUserId},to_user_id.eq.${targetUserId}),and(from_user_id.eq.${targetUserId},to_user_id.eq.${currentUserId})`)
      .eq('status', 'pending')
      .maybeSingle();

    if (requestError) throw requestError;

    if (requestData) {
      if (requestData.from_user_id === currentUserId) {
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
      .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${currentUser.id})`);

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