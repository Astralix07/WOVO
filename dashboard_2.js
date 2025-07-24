// dashboard_2.js - New features, including media sharing.

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

            sendMediaBtn.disabled = true;
            sendMediaBtn.textContent = 'Sending...';

            try {
                // --- Upload to Cloudinary ---
                const formData = new FormData();
                formData.append('file', selectedFile);
                formData.append('upload_preset', 'wovo_user'); // Replace with your preset
                
                const response = await fetch('https://api.cloudinary.com/v1_1/dxsvbes6q/auto/upload', { // Replace with your cloud name
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) throw new Error('Upload failed');
                
                const data = await response.json();
                
                // --- Send message to group ---
                const currentUser = JSON.parse(localStorage.getItem('wovo_user'));
                const caption = mediaCaptionInput.value.trim();

                const messagePayload = {
                    groupId: joinedGroupRoom,
                    user_id: currentUser.id,
                    content: caption,
                    media_url: data.secure_url,
                    media_type: data.resource_type
                };

                socket.emit('group_message_send', messagePayload);

                closeModal();

            } catch (error) {
                showNotification('Failed to send media', 'error');
            } finally {
                sendMediaBtn.disabled = false;
                sendMediaBtn.textContent = 'Send';
            }
        });
    }
}); 