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
        sendMediaBtn.addEventListener('click', async () => {
            if (!selectedFile) return;

            const caption = mediaCaptionInput.value.trim();
            const tempId = `temp_${Date.now()}`;
            const objectURL = URL.createObjectURL(selectedFile);

            // 1. Optimistically render the message
            renderOptimisticMediaMessage(tempId, objectURL, selectedFile.type, caption);
            closeModal();

            // 2. Start the upload process
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

            const xhr = new XMLHttpRequest();
            xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, true);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    const progressBar = document.querySelector(`.media-upload-progress[data-temp-id="${tempId}"] .progress-bar`);
                    if (progressBar) {
                        progressBar.style.width = `${percentComplete}%`;
                    }
                }
            };

            xhr.onload = () => {
                const tempElement = document.querySelector(`.group-message[data-message-id="${tempId}"]`);

                if (xhr.status >= 200 && xhr.status < 300) {
                    const data = JSON.parse(xhr.responseText);
                    
                    // 3. Send final message to server
                    const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
                    const messagePayload = {
                        groupId: joinedGroupRoom,
                        user_id: currentUser.id,
                        content: caption,
                        media_url: data.secure_url,
                        media_type: data.resource_type
                    };

                    socket.emit('group_message_send', messagePayload, (response) => {
                        if (response.status === 'error') {
                            showNotification(`Server Error: ${response.message}`, 'error');
                            if(tempElement) tempElement.remove(); // Clean up on error
                        }
                        // On success, real-time will handle adding the final message,
                        // so we just need to remove the temp one.
                        if(tempElement) tempElement.remove();
                    });
                } else {
                    showNotification('Upload failed. Please try again.', 'error');
                    if(tempElement) tempElement.remove(); // Clean up on error
                }
            };

            xhr.onerror = () => {
                const tempElement = document.querySelector(`.group-message[data-message-id="${tempId}"]`);
                showNotification('An unexpected error occurred during upload.', 'error');
                if(tempElement) tempElement.remove();
            };

            xhr.send(formData);
        });
    }
});

// --- New function to render optimistic message ---
function renderOptimisticMediaMessage(tempId, objectURL, fileType, caption) {
    const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
    
    // Create a fake message object
    const msg = {
        id: tempId,
        user_id: currentUser.id,
        users: { // Use current user's info
            username: currentUser.username,
            avatar_url: currentUser.avatar_url
        },
        created_at: new Date().toISOString(),
        content: caption,
        media_url: objectURL,
        media_type: fileType.split('/')[0] // 'image' or 'video'
    };
    
    renderGroupMessage(msg, true); // Render it like a new message

    // Add the progress overlay to the newly rendered message
    const msgElement = document.querySelector(`.group-message[data-message-id="${tempId}"] .group-message-media`);
    if (msgElement) {
        const progressOverlay = document.createElement('div');
        progressOverlay.className = 'media-upload-progress';
        progressOverlay.dataset.tempId = tempId;
        progressOverlay.innerHTML = `
            <div class="upload-status-text">Uploading...</div>
            <div class="progress-bar-container">
                <div class="progress-bar"></div>
            </div>
        `;
        msgElement.style.position = 'relative';
        msgElement.appendChild(progressOverlay);
    }
} 