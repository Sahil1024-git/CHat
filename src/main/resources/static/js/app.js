// Application State
let currentUser = null;
let activeChat = 'global'; // 'global' or username of direct message partner
let registeredUsers = [];
let onlineUsers = new Set();
let ws = null;
let typingTimeout = null;
let localTyping = false;
let partnerTypingTimer = null;

// DOM Elements
const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const authError = document.getElementById('auth-error');
const btnGoogle = document.getElementById('btn-google');


const userSearch = document.getElementById('user-search');
const usersList = document.getElementById('users-list');
const userCountBadge = document.getElementById('user-count-badge');

const myAvatar = document.getElementById('my-avatar');
const myUsername = document.getElementById('my-username');
const myRole = document.getElementById('my-role');
const logoutBtn = document.getElementById('logout-btn');

const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages-container');

const activeChatName = document.getElementById('active-chat-name');
const activeChatRole = document.getElementById('active-chat-role');
const activeChatAvatar = document.getElementById('active-chat-avatar');
const activeChatStatus = document.getElementById('active-chat-status');

const typingIndicatorBar = document.getElementById('typing-indicator-bar');
const typingUserName = document.getElementById('typing-user-name');

const sidebarLeft = document.querySelector('.sidebar-left');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
const sidebarRight = document.getElementById('sidebar-right');
const toggleRightPanelBtn = document.getElementById('toggle-right-panel');
const closeRightPanelBtn = document.getElementById('close-right-panel');

// Right Sidebar Details
const rightPanelAvatar = document.getElementById('right-panel-avatar');
const rightPanelStatus = document.getElementById('right-panel-status');
const rightPanelName = document.getElementById('right-panel-name');
const rightPanelRole = document.getElementById('right-panel-role');
const rightPanelAvailability = document.getElementById('right-panel-availability');
const rightPanelAddress = document.getElementById('right-panel-address');
const rightPanelEmail = document.getElementById('right-panel-email');

// UI Colors for Avatars
const AVATAR_COLORS = [
    { bg: '#eff6ff', text: '#1e40af' }, // Blue
    { bg: '#f0fdf4', text: '#166534' }, // Green
    { bg: '#fff7ed', text: '#9a3412' }, // Orange
    { bg: '#faf5ff', text: '#6b21a8' }, // Purple
    { bg: '#fdf2f8', text: '#9d174d' }, // Pink
    { bg: '#f0fdfa', text: '#0f766e' }, // Teal
    { bg: '#fef2f2', text: '#991b1b' }  // Red
];

// Helper: Get initials of a name
function getInitials(name) {
    if (!name) return '?';
    return name.slice(0, 2).toUpperCase();
}

// Helper: Hash username to select stable colors and details
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
}

// Helper: Style avatar with custom initials & color palette
function styleAvatar(element, name) {
    if (name === 'global') {
        element.textContent = 'G';
        element.style.background = 'linear-gradient(135deg, #0f62fe 0%, #3f87ff 100%)';
        element.style.color = '#ffffff';
        return;
    }
    const initials = getInitials(name);
    const hash = hashString(name);
    const palette = AVATAR_COLORS[hash % AVATAR_COLORS.length];
    
    element.textContent = initials;
    element.style.background = palette.bg;
    element.style.color = palette.text;
}

// Helper: Generate Mock Profile Details based on Username
function getMockDetails(name) {
    const hash = hashString(name);
    const streets = ['Sips Parkways', 'Broadway Ave', 'Sunset Blvd', 'Lexington St', 'Oakwood Lane', 'Highland Court'];
    const domains = ['codedtheme.com', 'chatapp.com', 'gmail.com', 'outlook.com', 'techcorp.io'];
    
    const street = streets[hash % streets.length];
    const streetNum = (hash % 89999) + 10000;
    const domain = domains[hash % domains.length];
    
    return {
        address: `${streetNum} ${street}, U.S`,
        email: `${name.toLowerCase()}@${domain}`,
        phone: `995-${200 + (hash % 799)}-${1000 + (hash % 8999)}`
    };
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    checkSession();
    
    // Check if there is an error in URL from OAuth redirect
    const urlParams = new URLSearchParams(window.location.search);
    const oauthError = urlParams.get('error');
    if (oauthError) {
        if (oauthError === 'oauth_token_failed') {
            showAuthError('Failed to exchange Google code for token.');
        } else if (oauthError === 'oauth_user_failed') {
            showAuthError('Failed to retrieve user profile from Google.');
        } else {
            const msg = urlParams.get('message');
            showAuthError(`Google login error: ${msg || oauthError}`);
        }
        // Clean the URL query parameters
        window.history.replaceState({}, document.title, "/");
    }
    
    // Auth Tab switching
    tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
        authError.textContent = '';
    });
    
    tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
        authError.textContent = '';
    });

    // Auth Submission
    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
    logoutBtn.addEventListener('click', handleLogout);
    if (btnGoogle) {
        btnGoogle.addEventListener('click', handleGoogleLogin);
    }


    // Messaging UI
    chatInput.addEventListener('keypress', handleTypingInput);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    sendBtn.addEventListener('click', sendMessage);

    // Search Box
    userSearch.addEventListener('input', renderUserList);

    // Mobile & Panel Toggles
    toggleSidebarBtn.addEventListener('click', () => {
        sidebarLeft.classList.toggle('open');
    });

    toggleRightPanelBtn.addEventListener('click', () => {
        sidebarRight.classList.toggle('collapsed');
    });

    closeRightPanelBtn.addEventListener('click', () => {
        sidebarRight.classList.add('collapsed');
    });

    // Setup Accordion (Details Sidebar)
    const accordionHeader = document.querySelector('.accordion-header');
    const accordionContent = document.querySelector('.accordion-content');
    const chevron = accordionHeader.querySelector('.chevron');
    
    accordionHeader.addEventListener('click', () => {
        const isCollapsed = accordionContent.style.display === 'none';
        accordionContent.style.display = isCollapsed ? 'flex' : 'none';
        chevron.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
    });
});

// --- AUTHENTICATION FLOWS ---
async function checkSession() {
    try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
            const user = await res.json();
            onLoginSuccess(user);
        } else {
            showAuthForm();
        }
    } catch (e) {
        showAuthForm();
    }
}

async function handleGoogleLogin() {
    try {
        const response = await fetch('/api/auth/oauth2/config');
        if (!response.ok) {
            throw new Error('Failed to fetch OAuth2 config');
        }
        const config = await response.json();
        if (!config.clientId || !config.redirectUri) {
            throw new Error('OAuth2 client ID or redirect URI is missing');
        }
        
        // Build the Google OAuth2 Auth URL
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
            `client_id=${encodeURIComponent(config.clientId)}&` + 
            `redirect_uri=${encodeURIComponent(config.redirectUri)}&` + 
            `response_type=code&` + 
            `scope=${encodeURIComponent('openid email profile')}`;
            
        // Redirect browser to Google Sign-In
        window.location.href = authUrl;
    } catch (error) {
        console.error('Google login error:', error);
        authError.textContent = 'Google sign-in is not configured yet or failed to load.';
    }
}

async function handleLogin(e) {

    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    authError.textContent = '';

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        if (res.ok) {
            checkSession();
        } else {
            authError.textContent = data.error || 'Authentication failed';
        }
    } catch (err) {
        authError.textContent = 'Server unreachable. Try again later.';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    authError.textContent = '';

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        if (res.ok) {
            authError.textContent = 'Registration successful! Please Sign In.';
            tabLogin.click();
            document.getElementById('login-username').value = username;
        } else {
            authError.textContent = data.error || 'Registration failed';
        }
    } catch (err) {
        authError.textContent = 'Server unreachable. Try again later.';
    }
}

async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        if (ws) ws.close();
        currentUser = null;
        activeChat = 'global';
        showAuthForm();
    } catch (e) {
        console.error('Logout error: ', e);
    }
}

function showAuthForm() {
    authOverlay.classList.remove('hidden');
    appContainer.classList.add('hidden');
}

function onLoginSuccess(user) {
    currentUser = user;
    authOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');
    
    // Update footer profile info
    myUsername.textContent = user.username;
    myRole.textContent = user.role;
    styleAvatar(myAvatar, user.username);
    
    // Connect WebSockets and Load users
    connectWebSocket();
    loadUsersList();
    selectChat('global');
}

// --- USERS LIST LOADING & RENDERING ---
async function loadUsersList() {
    try {
        const res = await fetch('/api/auth/users');
        if (res.ok) {
            registeredUsers = await res.json();
            renderUserList();
        }
    } catch (e) {
        console.error('Error fetching registered users list: ', e);
    }
}

function renderUserList() {
    const query = userSearch.value.toLowerCase().trim();
    usersList.innerHTML = '';
    
    // Filter users
    const filtered = registeredUsers.filter(u => u.username.toLowerCase().includes(query));
    userCountBadge.textContent = filtered.length;

    filtered.forEach(user => {
        const isOnline = onlineUsers.has(user.username);
        const isActive = activeChat === user.username;
        
        const item = document.createElement('div');
        item.className = `conversation-item ${isActive ? 'active' : ''}`;
        item.id = `chat-user-${user.username}`;
        item.onclick = () => selectChat(user.username);
        
        item.innerHTML = `
            <div class="avatar-container">
                <div class="avatar" id="avatar-${user.username}"></div>
                <span class="status-indicator ${isOnline ? 'online' : ''}" id="status-ind-${user.username}"></span>
            </div>
            <div class="item-details">
                <div class="item-top-row">
                    <span class="user-name">${user.username}</span>
                    <span class="item-time" id="time-${user.username}"></span>
                </div>
                <div class="item-bottom-row">
                    <span class="user-role">${user.role}</span>
                    <span class="unread-dot"></span>
                </div>
            </div>
        `;
        
        usersList.appendChild(item);
        styleAvatar(item.querySelector('.avatar'), user.username);
    });
}

// --- WEBSOCKET real-time COMMUNICATION ---
function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/chat`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket Connection established.');
    };
    
    ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        handleIncomingWSMessage(payload);
    };
    
    ws.onclose = () => {
        console.log('WebSocket Connection closed. Retrying in 5 seconds...');
        setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = (err) => {
        console.error('WebSocket Error: ', err);
    };
}

function handleIncomingWSMessage(msg) {
    if (msg.type === 'ONLINE_USERS') {
        onlineUsers = new Set(msg.users);
        // Refresh statuses in Left Sidebar
        renderUserList();
        updateActiveChatStatus();
    } else if (msg.type === 'STATUS') {
        if (msg.online) {
            onlineUsers.add(msg.username);
        } else {
            onlineUsers.delete(msg.username);
        }
        
        // Update online status in left user list dynamically
        const ind = document.getElementById(`status-ind-${msg.username}`);
        if (ind) {
            if (msg.online) ind.classList.add('online');
            else ind.classList.remove('online');
        }
        
        updateActiveChatStatus();
    } else if (msg.type === 'CHAT') {
        const isFromMe = msg.sender.toLowerCase() === currentUser.username.toLowerCase();
        const isForActiveChat = (activeChat === 'global' && msg.recipient === 'global') || 
                                (activeChat !== 'global' && !isFromMe && msg.sender.toLowerCase() === activeChat.toLowerCase()) ||
                                (activeChat !== 'global' && isFromMe && msg.recipient.toLowerCase() === activeChat.toLowerCase());
        
        if (isForActiveChat) {
            appendMessageBubble(msg);
            scrollMessagesToBottom();
        } else {
            // Put unread dot on sidebar user list item
            const item = document.getElementById(`chat-user-${msg.sender}`);
            if (item) {
                item.classList.add('unread');
            }
        }
    } else if (msg.type === 'TYPING') {
        // Render typing indicator if message sender is the active chat partner
        if (activeChat !== 'global' && msg.sender.toLowerCase() === activeChat.toLowerCase()) {
            showPartnerTyping(msg.sender, msg.status);
        }
    }
}

// --- SENDING MESSAGES & TYPING NOTIFICATIONS ---
function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
    
    const payload = {
        type: 'CHAT',
        recipient: activeChat,
        content: text
    };
    
    ws.send(JSON.stringify(payload));
    chatInput.value = '';
    
    // Cancel local typing notifications
    clearTimeout(typingTimeout);
    sendLocalTypingStatus(false);
}

function handleTypingInput() {
    if (activeChat === 'global') return;
    if (!localTyping) {
        sendLocalTypingStatus(true);
    }
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        sendLocalTypingStatus(false);
    }, 2000);
}

function sendLocalTypingStatus(isTyping) {
    if (activeChat === 'global' || !ws || ws.readyState !== WebSocket.OPEN) return;
    localTyping = isTyping;
    
    const payload = {
        type: 'TYPING',
        recipient: activeChat,
        status: isTyping
    };
    
    ws.send(JSON.stringify(payload));
}

function showPartnerTyping(username, isTyping) {
    clearTimeout(partnerTypingTimer);
    
    if (isTyping) {
        typingUserName.textContent = username;
        typingIndicatorBar.classList.remove('hidden');
        
        // Safety timeout to clear indicator in case user closes client
        partnerTypingTimer = setTimeout(() => {
            typingIndicatorBar.classList.add('hidden');
        }, 5000);
    } else {
        typingIndicatorBar.classList.add('hidden');
    }
}

// --- SELECTION OF ACTIVE CHAT ---
async function selectChat(partner) {
    activeChat = partner;
    sidebarLeft.classList.remove('open'); // Close on mobile
    
    // Clear unread flag
    const item = document.getElementById(`chat-user-${partner}`);
    if (item) {
        item.classList.remove('unread');
    }
    
    // Highlight sidebar active item
    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
    if (item) {
        item.classList.add('active');
    } else if (partner === 'global') {
        document.getElementById('chat-user-global').classList.add('active');
    }

    // Toggle active chat info header
    chatInput.disabled = false;
    sendBtn.disabled = false;
    
    // Refresh User Info details on Header and Right Sidebar
    updateActiveChatDetails(partner);
    
    // Load history
    await loadChatHistory(partner);
    
    // Hide typing indicator
    typingIndicatorBar.classList.add('hidden');
    
    // Focus input
    chatInput.focus();
}

function updateActiveChatDetails(partner) {
    if (partner === 'global') {
        activeChatName.textContent = 'Global Chatroom';
        activeChatRole.textContent = 'Public Lounge Room';
        styleAvatar(activeChatAvatar, 'global');
        activeChatStatus.classList.add('online');
        
        // Right Sidebar elements
        rightPanelName.textContent = 'Global Chatroom';
        rightPanelRole.textContent = 'All Connected Members';
        styleAvatar(rightPanelAvatar, 'global');
        rightPanelStatus.classList.add('online');
        rightPanelAvailability.innerHTML = `<span class="dot" style="background-color: #22c55e"></span> Public Channel`;
        rightPanelAvailability.className = 'availability-badge';
        rightPanelAddress.textContent = 'e:\\CHat Workspace';
        rightPanelEmail.textContent = 'lobby@chatapp.com';
    } else {
        const user = registeredUsers.find(u => u.username === partner) || { username: partner, role: 'Team Member', department: 'Staff' };
        activeChatName.textContent = user.username;
        activeChatRole.textContent = user.role;
        styleAvatar(activeChatAvatar, user.username);
        
        // Right Sidebar elements
        rightPanelName.textContent = user.username;
        rightPanelRole.textContent = `${user.role} (${user.department})`;
        styleAvatar(rightPanelAvatar, user.username);
        
        // Dynamic Address/Email based on Username hash
        const mock = getMockDetails(user.username);
        rightPanelAddress.textContent = mock.address;
        rightPanelEmail.textContent = mock.email;
        
        updateActiveChatStatus();
    }
}

function updateActiveChatStatus() {
    if (activeChat === 'global') {
        activeChatStatus.classList.add('online');
        rightPanelStatus.classList.add('online');
        return;
    }
    
    const isOnline = onlineUsers.has(activeChat);
    
    if (isOnline) {
        activeChatStatus.classList.add('online');
        rightPanelStatus.classList.add('online');
        rightPanelAvailability.innerHTML = `<span class="dot" style="background-color: #22c55e"></span> Available`;
        rightPanelAvailability.className = 'availability-badge';
    } else {
        activeChatStatus.classList.remove('online');
        rightPanelStatus.classList.remove('online');
        rightPanelAvailability.innerHTML = `<span class="dot" style="background-color: #94a3b8"></span> Offline`;
        rightPanelAvailability.className = 'availability-badge offline';
    }
}

async function loadChatHistory(partner) {
    messagesContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); margin-top: 20px;">Loading chat history...</div>';
    
    try {
        const res = await fetch(`/api/chat/history?with=${partner}`);
        if (res.ok) {
            const history = await res.json();
            messagesContainer.innerHTML = '';
            
            if (history.length === 0) {
                messagesContainer.innerHTML = `
                    <div class="no-chat-selected">
                        <i data-lucide="message-square" class="no-chat-icon"></i>
                        <h3>Beginning of Chat History</h3>
                        <p>Say hello to ${partner === 'global' ? 'the Global Lounge' : partner}!</p>
                    </div>
                `;
                lucide.createIcons();
            } else {
                history.forEach(msg => appendMessageBubble(msg));
                scrollMessagesToBottom();
            }
        }
    } catch (e) {
        console.error('Error fetching chat history: ', e);
        messagesContainer.innerHTML = '<div style="text-align: center; color: var(--danger); margin-top: 20px;">Could not load history.</div>';
    }
}

function appendMessageBubble(msg) {
    const isFromMe = msg.sender.toLowerCase() === currentUser.username.toLowerCase();
    
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isFromMe ? 'outgoing' : 'incoming'}`;
    
    // Format timestamp nicely
    let timeStr = '';
    try {
        const date = new Date(msg.timestamp);
        timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        timeStr = msg.timestamp;
    }

    bubble.innerHTML = `
        <div class="message-avatar" id="msg-avatar-${msg.id}"></div>
        <div class="message-content-wrapper">
            <div class="message-text">${escapeHtml(msg.content)}</div>
            <span class="message-time">${timeStr}</span>
        </div>
    `;
    
    messagesContainer.appendChild(bubble);
    styleAvatar(bubble.querySelector('.message-avatar'), msg.sender);
}

function scrollMessagesToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}
