// script.js
// No scroll logic needed since the page is not scrollable.
// Optionally, add a sparkle or pulse effect to the brand name for extra flair.

// Example: Add a sparkle effect to the brand name every few seconds
const brand = document.querySelector('.special-brand');
if (brand) {
  setInterval(() => {
    brand.classList.add('sparkle');
    setTimeout(() => brand.classList.remove('sparkle'), 700);
  }, 3500);
}

// Feature points carousel
const featurePoints = [
    'Set Custom Matches Instantly',
    'Organize 1v1, 2v2, 4v4 Like a Pro',
    'Create & Manage Tournaments Easily',
    'Track All Your Past Games',
    'Securely Share Room ID & Passwords',
    'Invite Friends or Full Groups',
    'Respond to Match Tickets in One Tap',
    'Chat Within Matches or Teams',
    'Auto-Notify Players When Matches Start',
    'No Spam, Just Organized Gameplay'
];

const featurePointText = document.getElementById('feature-point-text');
let featureIndex = 0;

function decoratePoint(text) {
    return `&gt;&gt; '<span class="terminal-highlight">${text}</span>' ==`;
}

// Supabase config
const SUPABASE_URL = 'https://mygdcrvbrqfxudvxrwpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15Z2RjcnZicnFmeHVkdnhyd3BxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3NjQ1MzIsImV4cCI6MjA2ODM0MDUzMn0.5Wavk9j2oZ2BbBqeULr5TSYcQMWk_PFJAbP9RYxNAiU';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Sign Up function
async function supabaseSignUp(username, password) {
    if (username.includes(' ')) {
        return { error: 'Username cannot contain spaces.' };
    }
    
    // Check if username exists
    const { data: existing, error: findError } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single();
        
    if (existing) {
        return { error: 'Username already exists.' };
    }
    
    const { data, error } = await supabase
        .from('users')
        .insert([{ username, password_hash: password }]);
        
    if (error) return { error: error.message };
    return { data };
}

// Login function
async function supabaseLogin(username, password) {
    if (username.includes(' ')) {
        return { error: 'Username cannot contain spaces.' };
    }
    
    // Fetch user by username and password
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('password_hash', password)
        .single();
        
    if (error || !user) return { error: 'Invalid username or password.' };
    return { data: user };
}

// Check if user is already logged in
function checkLoginStatus() {
    const userData = localStorage.getItem('wovo_user');
    if (userData && window.location.pathname.includes('index.html')) {
        window.location.href = 'dashboard.html';
    } else if (!userData && window.location.pathname.includes('dashboard.html')) {
        window.location.href = 'index.html';
    }
}

// Initialize feature points carousel
if (featurePointText) {
    function updateFeaturePoint() {
        featurePointText.innerHTML = decoratePoint(featurePoints[featureIndex]);
        featureIndex = (featureIndex + 1) % featurePoints.length;
    }
    updateFeaturePoint();
    setInterval(updateFeaturePoint, 3000);
}

// Initialize login/signup form handlers
const signupForm = document.getElementById('signupForm');
const loginForm = document.getElementById('loginForm');
const modalFeedback = document.querySelector('.modal-feedback');

function showModalFeedback(message, color = '#ff4444') {
    if (modalFeedback) {
        modalFeedback.textContent = message;
        modalFeedback.style.color = color;
    }
}

function clearModalFeedback() {
    if (modalFeedback) {
        modalFeedback.textContent = '';
    }
}

if (signupForm) {
    signupForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        clearModalFeedback();
        const username = signupForm.querySelector('#username').value.trim();
        const password = signupForm.querySelector('#password').value;
        const confirm = signupForm.querySelector('#confirm-password').value;
        
        if (!username || !password) {
            showModalFeedback('Username and password required.');
            return;
        }
        if (password !== confirm) {
            showModalFeedback('Passwords do not match.');
            return;
        }
        
        showModalFeedback('Signing up...', '#a259ff');
        const result = await supabaseSignUp(username, password);
        
        if (result.error) {
            showModalFeedback(result.error);
        } else {
            showModalFeedback('Sign up successful! You can now log in.', '#4caf50');
            setTimeout(() => {
                document.querySelector('.modal-tab[data-tab="login"]').click();
                clearModalFeedback();
            }, 1200);
        }
    });
}

if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        clearModalFeedback();
        const username = loginForm.querySelector('#login-username').value.trim();
        const password = loginForm.querySelector('#login-password').value;
        
        if (!username || !password) {
            showModalFeedback('Username and password required.');
            return;
        }
        
        showModalFeedback('Logging in...', '#a259ff');
        const result = await supabaseLogin(username, password);
        
        if (result.error) {
            showModalFeedback(result.error);
        } else {
            localStorage.setItem('wovo_user', JSON.stringify(result.data));
            window.location.href = 'dashboard.html';
        }
    });
}

// Check login status on page load
checkLoginStatus();

// Modal logic
const getStartedBtn = document.querySelector('.get-started');
const modalOverlay = document.getElementById('modalOverlay');
const modalTabs = document.querySelectorAll('.modal-tab');
const modalFormContents = document.querySelectorAll('.modal-form-content');
const signupText = document.querySelector('.signup-text');
const loginText = document.querySelector('.login-text');
const switchToLogin = document.getElementById('switchToLogin');
const switchToSignup = document.getElementById('switchToSignup');

if (getStartedBtn && modalOverlay) {
  getStartedBtn.addEventListener('click', function() {
    modalOverlay.classList.add('active');
  });
  modalOverlay.addEventListener('click', function(e) {
    if (e.target === this) {
      this.classList.remove('active');
    }
  });
}
if (modalTabs.length && modalFormContents.length) {
  modalTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      // Update tabs
      modalTabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      // Update forms
      const target = this.getAttribute('data-tab');
      modalFormContents.forEach(form => {
        form.classList.remove('active');
        if (form.classList.contains(target)) {
          form.classList.add('active');
        }
      });
      // Update link text
      if (target === 'login') {
        signupText.style.display = 'none';
        loginText.style.display = 'inline';
      } else {
        signupText.style.display = 'inline';
        loginText.style.display = 'none';
      }
    });
  });
}
if (switchToLogin) {
  switchToLogin.addEventListener('click', function(e) {
    e.preventDefault();
    document.querySelector('.modal-tab[data-tab="login"]').click();
  });
}
if (switchToSignup) {
  switchToSignup.addEventListener('click', function(e) {
    e.preventDefault();
    document.querySelector('.modal-tab[data-tab="signup"]').click();
  });
}

// Show/hide password logic
const togglePasswordBtns = document.querySelectorAll('.toggle-password');
togglePasswordBtns.forEach(btn => {
  btn.addEventListener('click', function() {
    const targetId = btn.getAttribute('data-target');
    const input = document.getElementById(targetId);
    if (input) {
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
      } else {
        input.type = 'password';
        btn.textContent = '👁️';
      }
    }
  });
}); 