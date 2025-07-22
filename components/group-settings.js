// Group Settings Modal Logic
let groupSettingsModal; // Declare modal variable in global scope

(function() {
  // Initialize modal and other elements
  groupSettingsModal = document.getElementById('groupSettingsModal');
  const openBtn = document.getElementById('groupSettingsBtn');
  const closeBtn = groupSettingsModal ? groupSettingsModal.querySelector('.close-group-settings') : null;
  const sidebar = groupSettingsModal ? groupSettingsModal.querySelector('.group-settings-sidebar') : null;
  const categories = sidebar ? sidebar.querySelectorAll('.group-settings-category') : [];
  const sections = groupSettingsModal ? groupSettingsModal.querySelectorAll('.group-settings-section') : [];

  // Group Overview Elements
  const groupNameInput = document.getElementById('groupSettingsName');
  const groupNamePreview = document.getElementById('groupNamePreview');
  const groupIdDisplay = document.getElementById('groupIdDisplay');
  const bannerUpload = document.getElementById('groupBannerUpload');
  const avatarUpload = document.getElementById('groupAvatarUpload');
  const gameCards = document.querySelectorAll('.game-card');

  // Initial state
  let originalState = {
    name: '',
    game: '',
    banner_url: '',
    avatar_url: ''
  };

  // Initialize member search
  const memberSearchInput = document.getElementById('memberSearchInput');
  if (memberSearchInput) {
    memberSearchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase().trim();
      const membersTableBody = document.getElementById('membersTableBody');
      
      if (!membersTableBody) return;

      const rows = membersTableBody.querySelectorAll('tr:not(.member-loading)');
      if (!rows.length) return;

      rows.forEach(row => {
        const username = row.querySelector('.member-name')?.textContent?.toLowerCase() || '';
        const userId = row.querySelector('.member-id')?.textContent?.toLowerCase() || '';
        const role = row.querySelector('.member-role')?.textContent?.toLowerCase() || '';
        
        if (username.includes(searchTerm) || 
            userId.includes(searchTerm) || 
            role.includes(searchTerm)) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    });
  }

  // Open modal
  if (openBtn && groupSettingsModal) {
    openBtn.addEventListener('click', () => {
      groupSettingsModal.style.display = 'flex';
      setTimeout(() => groupSettingsModal.classList.add('active'), 10);
      document.body.style.overflow = 'hidden';
    });
  }

  // Close modal
  if (closeBtn && groupSettingsModal) {
    closeBtn.addEventListener('click', () => {
      groupSettingsModal.classList.remove('active');
      setTimeout(() => {
        groupSettingsModal.style.display = 'none';
        document.body.style.overflow = '';
        // Reset form to original state
        resetToOriginalState();
      }, 350);
    });
  }

  // Sidebar navigation
  if (categories.length && sections.length) {
    categories.forEach(cat => {
      cat.addEventListener('click', () => {
        categories.forEach(c => c.classList.remove('active'));
        cat.classList.add('active');
        const section = cat.getAttribute('data-section');
        sections.forEach(sec => sec.classList.remove('active'));
        const activeSection = groupSettingsModal.querySelector(`#group-${section}-section`);
        if (activeSection) activeSection.classList.add('active');
      });
    });
  }

  // Upload icon click
  const iconPlaceholder = groupSettingsModal ? groupSettingsModal.querySelector('#groupIconPlaceholder') : null;
  const iconInput = groupSettingsModal ? groupSettingsModal.querySelector('#groupIconUpload') : null;
  if (iconPlaceholder && iconInput) {
    iconPlaceholder.addEventListener('click', () => iconInput.click());
    iconInput.addEventListener('change', () => {
      if (iconInput.files && iconInput.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
          iconPlaceholder.innerHTML = `<img src="${e.target.result}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;">`;
        };
        reader.readAsDataURL(iconInput.files[0]);
      }
    });
  }

  // Enable/disable delete button
  const deleteInput = groupSettingsModal ? groupSettingsModal.querySelector('#deleteGroupConfirmText') : null;
  const deleteBtn = groupSettingsModal ? groupSettingsModal.querySelector('.delete-group-btn') : null;
  if (deleteInput && deleteBtn) {
    deleteInput.addEventListener('input', () => {
      deleteBtn.disabled = deleteInput.value !== 'DELETE GROUP';
    });
  }

  // Update name preview as user types
  if (groupNameInput) {
    groupNameInput.addEventListener('input', (e) => {
      const name = e.target.value.trim();
      if (groupNamePreview) {
        groupNamePreview.textContent = name || 'Group Name';
      }
      // Update character counter
      const counter = e.target.parentElement.querySelector('.input-counter');
      if (counter) {
        counter.textContent = `${name.length}/50`;
      }
      // Enable/disable save button based on changes
      updateSaveButton();
    });
  }

  // Cloudinary configuration
  const CLOUDINARY_CONFIG = {
    cloud_name: 'dxsvbes6q',
    upload_preset: 'wovo_user'
  };

  // Handle banner upload
  if (bannerUpload) {
    bannerUpload.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
          showNotification('Banner image must be less than 10MB', 'error');
          return;
        }
        
        try {
          const preview = document.getElementById('groupBannerPreview');
          const placeholder = document.querySelector('.banner-placeholder');
          if (preview && placeholder) {
            // Show loading state
            placeholder.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>UPLOADING...</span>';
            placeholder.style.display = 'flex';
            preview.style.display = 'none';

            // Upload to Cloudinary
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', CLOUDINARY_CONFIG.upload_preset);
            formData.append('folder', 'group_banners');

            const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloud_name}/image/upload`, {
              method: 'POST',
              body: formData
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Upload failed');

            // Update preview
            preview.src = data.secure_url;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
            placeholder.innerHTML = '<i class="fas fa-image"></i><span>UPLOAD BANNER</span>';

            // Store URL for saving
            preview.dataset.newUrl = data.secure_url;
            updateSaveButton();
          }
        } catch (error) {
          showNotification('Failed to upload banner image', 'error');
          const placeholder = document.querySelector('.banner-placeholder');
          if (placeholder) {
            placeholder.innerHTML = '<i class="fas fa-image"></i><span>UPLOAD BANNER</span>';
          }
        }
      }
    });
  }

  // Handle avatar upload
  if (avatarUpload) {
    avatarUpload.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
          showNotification('Avatar image must be less than 5MB', 'error');
          return;
        }
        
        try {
          const preview = document.getElementById('groupAvatarPreview');
          if (preview) {
            // Show loading state
            preview.src = '';
            preview.style.opacity = '0.5';
            const loadingIcon = document.createElement('i');
            loadingIcon.className = 'fas fa-spinner fa-spin avatar-loading';
            preview.parentElement.appendChild(loadingIcon);

            // Upload to Cloudinary
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', CLOUDINARY_CONFIG.upload_preset);
            formData.append('folder', 'group_avatars');

            const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloud_name}/image/upload`, {
              method: 'POST',
              body: formData
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Upload failed');

            // Update preview
            preview.src = data.secure_url;
            preview.style.opacity = '1';
            const loadingIconElem = preview.parentElement.querySelector('.avatar-loading');
            if (loadingIconElem) loadingIconElem.remove();

            // Store URL for saving
            preview.dataset.newUrl = data.secure_url;
            updateSaveButton();
          }
        } catch (error) {
          showNotification('Failed to upload avatar image', 'error');
          const preview = document.getElementById('groupAvatarPreview');
          if (preview) {
            preview.style.opacity = '1';
            const loadingIconElem = preview.parentElement.querySelector('.avatar-loading');
            if (loadingIconElem) loadingIconElem.remove();
          }
        }
      }
    });
  }

  // Game selection
  if (gameCards) {
    gameCards.forEach(card => {
      card.addEventListener('click', () => {
        // Remove selection from other cards
        gameCards.forEach(c => c.classList.remove('selected'));
        // Select this card
        card.classList.add('selected');
        updateSaveButton();
      });
    });
  }

  // Copy group ID
  window.copyGroupId = async () => {
    const id = groupIdDisplay?.textContent;
    if (id) {
      try {
        await navigator.clipboard.writeText(id);
        showNotification('Group ID copied to clipboard!');
      } catch (err) {
        showNotification('Failed to copy Group ID', 'error');
      }
    }
  };

  // Toggle group name edit
  window.toggleGroupNameEdit = () => {
    if (groupNameInput) {
      groupNameInput.focus();
      groupNameInput.select();
    }
  };

  // Enable/disable save button based on changes
  function updateSaveButton() {
    const saveBtn = document.querySelector('.save-group-settings-btn');
    if (saveBtn && groupSettingsModal) {
      const currentName = groupNameInput?.value.trim() || '';
      const currentGame = document.querySelector('.game-card.selected')?.dataset.game || '';
      const newBannerUrl = document.getElementById('groupBannerPreview')?.dataset.newUrl;
      const newAvatarUrl = document.getElementById('groupAvatarPreview')?.dataset.newUrl;

      const hasChanges = 
        currentName !== originalState.name ||
        currentGame !== originalState.game ||
        newBannerUrl ||
        newAvatarUrl;
      
      saveBtn.disabled = !hasChanges;
    }
  }

  // Reset form to original state
  function resetToOriginalState() {
    if (groupNameInput) groupNameInput.value = originalState.name;
    if (groupNamePreview) groupNamePreview.textContent = originalState.name;
    
    const bannerPreview = document.getElementById('groupBannerPreview');
    const bannerPlaceholder = document.querySelector('.banner-placeholder');
    if (bannerPreview && bannerPlaceholder) {
      if (originalState.banner_url) {
        bannerPreview.src = originalState.banner_url;
        bannerPreview.style.display = 'block';
        bannerPlaceholder.style.display = 'none';
      } else {
        bannerPreview.src = '';
        bannerPreview.style.display = 'none';
        bannerPlaceholder.style.display = 'flex';
      }
    }
    
    const avatarPreview = document.getElementById('groupAvatarPreview');
    if (avatarPreview) {
      avatarPreview.src = originalState.avatar_url || 'assets/default-avatar.png';
    }

    if (gameCards) {
      gameCards.forEach(card => {
        if (card.dataset.game === originalState.game) {
          card.classList.add('selected');
        } else {
          card.classList.remove('selected');
        }
      });
    }

    if (bannerUpload) bannerUpload.value = '';
    if (avatarUpload) avatarUpload.value = '';
  }

  // Save changes
  async function saveGroupChanges() {
    const saveBtn = document.querySelector('.save-group-settings-btn');
    if (!saveBtn || saveBtn.disabled || !groupSettingsModal) return;

    const groupId = groupSettingsModal.dataset.groupId;
    if (!groupId) {
      showNotification('Group ID not found', 'error');
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

      const updates = {
        name: groupNameInput?.value.trim(),
        game: document.querySelector('.game-card.selected')?.dataset.game
      };

      // Get new image URLs if uploaded
      const bannerPreview = document.getElementById('groupBannerPreview');
      const avatarPreview = document.getElementById('groupAvatarPreview');
      const newBannerUrl = bannerPreview?.dataset.newUrl;
      const newAvatarUrl = avatarPreview?.dataset.newUrl;

      // Only update if a new image was uploaded
      if (newBannerUrl) {
        updates.banner_url = newBannerUrl;
      }
      if (newAvatarUrl) {
        updates.avatar_url = newAvatarUrl;
      }

      // Don't overwrite existing URLs with undefined/null
      // If no new image, don't include the field in the update

      // Update group in Supabase
      const { error } = await supabase
        .from('groups')
        .update(updates)
        .eq('id', groupId);

      if (error) throw error;

      // Update original state
      originalState = {
        name: updates.name,
        game: updates.game,
        banner_url: updates.banner_url || originalState.banner_url,
        avatar_url: updates.avatar_url || originalState.avatar_url
      };

      // Clear new URL markers
      if (bannerPreview) delete bannerPreview.dataset.newUrl;
      if (avatarPreview) delete avatarPreview.dataset.newUrl;

      showNotification('Changes saved successfully!');
      updateSaveButton();

      // Refresh groups list
      if (typeof loadPublicGroups === 'function') {
        loadPublicGroups();
      }
    } catch (error) {
      showNotification('Failed to save changes', 'error');
      console.error('Save error:', error);
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    }
  }

  // Upload file to Cloudinary
  async function uploadToCloudinary(file, folder) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'wovo_user');
    formData.append('folder', folder);

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/dxsvbes6q/image/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Upload failed');

      return data.secure_url;
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw error;
    }
  }

  // Add save button click handler
  const saveBtn = document.querySelector('.save-group-settings-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveGroupChanges);
  }

  // Store original state when modal opens
  if (groupSettingsModal) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          if (groupSettingsModal.style.display === 'flex') {
            originalState = {
              name: groupNameInput?.value.trim() || '',
              game: document.querySelector('.game-card.selected')?.dataset.game || '',
              banner_url: document.getElementById('groupBannerPreview')?.src,
              avatar_url: document.getElementById('groupAvatarPreview')?.src
            };

            // Show/hide banner preview based on URL
            const bannerPreview = document.getElementById('groupBannerPreview');
            const bannerPlaceholder = document.querySelector('.banner-placeholder');
            if (bannerPreview && bannerPlaceholder) {
              if (originalState.banner_url && originalState.banner_url !== 'assets/default-banner.png') {
                bannerPreview.style.display = 'block';
                bannerPlaceholder.style.display = 'none';
              } else {
                bannerPreview.style.display = 'none';
                bannerPlaceholder.style.display = 'flex';
              }
            }
          }
        }
      });
    });

    observer.observe(groupSettingsModal, { attributes: true });
  }
})(); 

// Load members for the group
async function loadGroupMembers(groupId) {
  const tableBody = document.getElementById('membersTableBody');
  const memberCount = document.getElementById('memberCount');
  
  if (!tableBody || !groupId) return;

  try {
    tableBody.innerHTML = `
      <tr class="member-loading">
        <td colspan="5">
          <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i>
            Loading members...
          </div>
        </td>
      </tr>
    `;

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
        id: null, // No group_members entry for owner
        user_id: ownerData.id,
        role: 'owner',
        joined_at: group.created_at, // Use group creation date
        users: {
          username: ownerData.username,
          avatar_url: ownerData.avatar_url
        }
      },
      ...(members || [])
    ];

    // Update member count
    if (memberCount) {
      memberCount.textContent = allMembers.length;
    }

    // Clear loading state
    tableBody.innerHTML = '';

    // Add each member to the table
    allMembers.forEach(member => {
      const row = document.createElement('tr');
      const joinedDate = member.joined_at 
        ? new Date(member.joined_at).toLocaleDateString()
        : 'Group Created';
      
      row.innerHTML = `
        <td>
          <div class="member-user">
            <div class="member-avatar">
              <img src="${member.users?.avatar_url || 'assets/default-avatar.png'}" alt="${member.users?.username}">
            </div>
            <span class="member-name">${member.users?.username || 'Unknown User'}</span>
          </div>
        </td>
        <td>
          <span class="member-id">${member.user_id}</span>
        </td>
        <td>
          <span class="member-role ${member.role}">${member.role.charAt(0).toUpperCase() + member.role.slice(1)}</span>
        </td>
        <td>
          <span class="member-joined">${joinedDate}</span>
        </td>
        <td class="member-actions">
          ${member.role !== 'owner' ? `
            <button class="member-action-btn" onclick="showMemberActions(event, '${member.user_id}', '${member.role}')">
              <i class="fas fa-ellipsis-v"></i>
            </button>
          ` : ''}
        </td>
      `;

      tableBody.appendChild(row);
    });

  } catch (error) {
    console.error('Error loading members:', error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-danger);">
          Failed to load members. Please try again.
        </td>
      </tr>
    `;
  }
}

// Show member actions menu
window.showMemberActions = (event, userId, currentRole) => {
  event.preventDefault();
  event.stopPropagation();

  const menu = document.getElementById('memberActionsMenu');
  if (!menu) return;

  // Position menu at click
  const rect = event.target.closest('.member-action-btn').getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left - 160}px`; // Menu width is 180px
  menu.style.display = 'block';

  // Update menu items based on current role
  const promoteItem = menu.querySelector('[data-action="promote"]');
  const demoteItem = menu.querySelector('[data-action="demote"]');
  
  if (currentRole === 'admin') {
    promoteItem.style.display = 'none';
    demoteItem.style.display = 'flex';
  } else {
    promoteItem.style.display = 'flex';
    demoteItem.style.display = 'none';
  }

  // Store user ID for actions
  menu.dataset.userId = userId;

  // Close menu when clicking outside
  const closeMenu = (e) => {
    if (!menu.contains(e.target) && !e.target.closest('.member-action-btn')) {
      menu.style.display = 'none';
      document.removeEventListener('click', closeMenu);
    }
  };
  
  document.addEventListener('click', closeMenu);
};

// Handle member actions
document.querySelectorAll('.member-actions-menu .menu-item').forEach(item => {
  item.addEventListener('click', async () => {
    const menu = document.getElementById('memberActionsMenu');
    const action = item.dataset.action;
    const userId = menu.dataset.userId;
    const groupId = groupSettingsModal?.dataset.groupId;

    if (!userId || !groupId) return;

    try {
      switch (action) {
        case 'promote':
          await supabase
            .from('group_members')
            .update({ role: 'admin' })
            .eq('group_id', groupId)
            .eq('user_id', userId);
          break;
        case 'demote':
          await supabase
            .from('group_members')
            .update({ role: 'member' })
            .eq('group_id', groupId)
            .eq('user_id', userId);
          break;
        case 'kick':
          await supabase
            .from('group_members')
            .delete()
            .eq('group_id', groupId)
            .eq('user_id', userId);
          break;
      }

      // Reload members list
      await loadGroupMembers(groupId);
      showNotification('Member updated successfully');
    } catch (error) {
      console.error('Error updating member:', error);
      showNotification('Failed to update member', 'error');
    }

    // Hide menu
    menu.style.display = 'none';
  });
});

// Load members when opening the members section
document.querySelector('.group-settings-category[data-section="members"]')?.addEventListener('click', () => {
  const groupId = groupSettingsModal?.dataset.groupId;
  if (groupId) {
    loadGroupMembers(groupId);
  }
}); 