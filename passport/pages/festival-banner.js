import { navigate } from '../js/router.js';

// Same cleanup pattern as pages/home.js / pages/tickets.js / pages/vvip.js —
// every listener/timer created in init() gets undone in destroy() so nothing
// leaks or double-fires if the user navigates away and back within the SPA
// session. This page has an extra wrinkle: fullscreen mode appends a node
// directly to document.body (outside #app-content) and toggles a class on
// <body> itself, so destroy() explicitly exits fullscreen too — the router's
// container.innerHTML swap on navigation would never touch either of those.
let cleanup = [];
const onCleanup = (fn) => cleanup.push(fn);

// DOM refs are (re)looked up in init(), not cached at module load — dynamic
// import() caches this module, so top-level `const x = document.getElementById(...)`
// would only ever run once and go stale on a second visit to this route.
let els = {};

// ==================== STATE (persists across navigate-away-and-back,
// same tradeoff as pages/tickets.js — dynamic import only loads this
// module once per app session) ====================
let currentMessage = "#See Your Vibe Mode";
let currentColor = "#FFFFFF";
let currentMode = "static";
let currentSpeed = 8;
let isTyping = false;
let isFullscreen = false;
let fullscreenContainer = null;
let fullscreenExitBtn = null;
let fullscreenAnimationInterval = null;
let typingTimeout = null;
let pressTimer = null;

// ==================== STORAGE KEYS ====================
const STORAGE_MESSAGE = 'festival_last_message';
const STORAGE_COLOR = 'festival_last_color';
const STORAGE_MODE = 'festival_last_mode';
const STORAGE_SPEED = 'festival_last_speed';

// ==================== FULLSCREEN FUNCTIONS ====================
function enterFullscreen() {
    if (isFullscreen) return;

    isFullscreen = true;
    document.body.classList.add('fullscreen-mode');

    fullscreenContainer = document.createElement('div');
    fullscreenContainer.className = 'fullscreen-led-container';

    const fullscreenScreen = document.createElement('div');
    fullscreenScreen.className = 'fullscreen-led-screen';

    const fullscreenMsgContainer = document.createElement('div');
    fullscreenMsgContainer.className = 'fullscreen-message-container';

    const fullscreenMsgText = document.createElement('div');
    fullscreenMsgText.className = 'fullscreen-message-text';
    fullscreenMsgText.id = 'fullscreenMessageText';
    fullscreenMsgText.style.color = currentColor;
    fullscreenMsgText.style.textShadow = `0 0 20px ${currentColor}, 0 0 40px ${currentColor}`;

    updateFullscreenWaveContent(fullscreenMsgText);

    fullscreenMsgContainer.appendChild(fullscreenMsgText);
    fullscreenScreen.appendChild(fullscreenMsgContainer);
    fullscreenContainer.appendChild(fullscreenScreen);

    applyFullscreenAnimationMode(fullscreenScreen, fullscreenMsgContainer, fullscreenMsgText);

    fullscreenExitBtn = document.createElement('div');
    fullscreenExitBtn.className = 'fullscreen-exit-btn';
    fullscreenExitBtn.innerHTML = '<i class="fas fa-times"></i>';
    fullscreenExitBtn.onclick = (e) => {
        e.stopPropagation();
        exitFullscreen();
    };

    fullscreenContainer.appendChild(fullscreenExitBtn);
    document.body.appendChild(fullscreenContainer);

    let fullscreenPressTimer = null;
    function handleFullscreenLongPressStart() {
        fullscreenPressTimer = setTimeout(() => {
            exitFullscreen();
        }, 800);
    }
    function handleFullscreenLongPressEnd() {
        if (fullscreenPressTimer) {
            clearTimeout(fullscreenPressTimer);
            fullscreenPressTimer = null;
        }
    }

    fullscreenScreen.addEventListener('touchstart', handleFullscreenLongPressStart);
    fullscreenScreen.addEventListener('touchend', handleFullscreenLongPressEnd);
    fullscreenScreen.addEventListener('touchcancel', handleFullscreenLongPressEnd);
    fullscreenScreen.addEventListener('mousedown', handleFullscreenLongPressStart);
    fullscreenScreen.addEventListener('mouseup', handleFullscreenLongPressEnd);

    fullscreenScreen.addEventListener('dblclick', () => {
        exitFullscreen();
    });

    if (fullscreenAnimationInterval) clearInterval(fullscreenAnimationInterval);
    fullscreenAnimationInterval = setInterval(() => {
        if (!isFullscreen) {
            if (fullscreenAnimationInterval) clearInterval(fullscreenAnimationInterval);
            return;
        }
        const fsMsgText = document.getElementById('fullscreenMessageText');
        const fsScreen = document.querySelector('.fullscreen-led-screen');
        const fsMsgContainer = document.querySelector('.fullscreen-message-container');
        if (fsMsgText && fsScreen) {
            fsMsgText.style.color = currentColor;
            fsMsgText.style.textShadow = `0 0 20px ${currentColor}, 0 0 40px ${currentColor}`;

            if (currentMode !== 'wave') {
                if (fsMsgText.innerText !== currentMessage) {
                    fsMsgText.innerText = currentMessage;
                    fsMsgText.dataset.renderedMessage = currentMessage;
                }
            } else {
                if (fsMsgText.dataset.renderedMessage !== currentMessage) {
                    updateFullscreenWaveContent(fsMsgText);
                } else {
                    const letters = fsMsgText.querySelectorAll('.fullscreen-wave-letter');
                    letters.forEach(letter => {
                        letter.style.animationDuration = `${0.4 + (12 - currentSpeed) * 0.03}s`;
                    });
                }
            }

            applyFullscreenAnimationMode(fsScreen, fsMsgContainer, fsMsgText);
        }
    }, 100);
}

function updateFullscreenWaveContent(element) {
    if (!element) return;
    if (currentMode === 'wave') {
        const chars = currentMessage.split('');
        const spannedHtml = chars.map((char, index) => {
            if (char === ' ') return '&nbsp;';
            return `<span class="fullscreen-wave-letter" style="--i: ${index}">${char}</span>`;
        }).join('');
        element.innerHTML = spannedHtml;
        element.dataset.renderedMessage = currentMessage;
        const letters = element.querySelectorAll('.fullscreen-wave-letter');
        letters.forEach((letter, idx) => {
            letter.style.animationDelay = `${idx * 0.04}s`;
            letter.style.animationDuration = `${0.4 + (12 - currentSpeed) * 0.03}s`;
        });
    } else {
        element.innerText = currentMessage;
        element.dataset.renderedMessage = currentMessage;
    }
}

function applyFullscreenAnimationMode(container, msgContainer, textElement) {
    if (!container) return;

    container.classList.remove('scrolling-full', 'bounce-full', 'flash-full', 'wave-full');

    if (msgContainer) {
        msgContainer.style.animation = '';
        msgContainer.style.transform = '';
    }
    if (textElement) {
        textElement.style.animation = '';
        textElement.style.transform = '';
    }

    switch (currentMode) {
        case 'scroll': {
            container.classList.add('scrolling-full');
            const scrollDuration = Math.max(3, Math.min(20, 20 / (currentSpeed / 5)));
            if (msgContainer) msgContainer.style.animationDuration = `${scrollDuration}s`;
            break;
        }
        case 'bounce': {
            container.classList.add('bounce-full');
            const bounceDuration = 0.8 + (10 - currentSpeed) * 0.05;
            if (textElement) textElement.style.animationDuration = `${bounceDuration}s`;
            break;
        }
        case 'flash': {
            container.classList.add('flash-full');
            const flashDuration = 0.3 + (10 - currentSpeed) * 0.02;
            if (textElement) textElement.style.animationDuration = `${flashDuration}s`;
            break;
        }
        case 'wave': {
            container.classList.add('wave-full');
            if (textElement && textElement.id === 'fullscreenMessageText') {
                const letters = textElement.querySelectorAll('.fullscreen-wave-letter');
                letters.forEach((letter) => {
                    letter.style.animationDuration = `${0.4 + (12 - currentSpeed) * 0.03}s`;
                });
            }
            break;
        }
        default:
            break;
    }
}

function exitFullscreen() {
    if (!isFullscreen) return;

    isFullscreen = false;
    document.body.classList.remove('fullscreen-mode');

    if (fullscreenContainer) {
        fullscreenContainer.remove();
        fullscreenContainer = null;
    }
    fullscreenExitBtn = null;

    if (fullscreenAnimationInterval) {
        clearInterval(fullscreenAnimationInterval);
        fullscreenAnimationInterval = null;
    }
}

function toggleFullscreen() {
    if (isFullscreen) exitFullscreen();
    else enterFullscreen();
}

// ==================== HELPER FUNCTIONS ====================
function saveToLocalStorage() {
    localStorage.setItem(STORAGE_MESSAGE, currentMessage);
    localStorage.setItem(STORAGE_COLOR, currentColor);
    localStorage.setItem(STORAGE_MODE, currentMode);
    localStorage.setItem(STORAGE_SPEED, currentSpeed);
}

function loadFromLocalStorage() {
    const savedMessage = localStorage.getItem(STORAGE_MESSAGE);
    const savedColor = localStorage.getItem(STORAGE_COLOR);
    const savedMode = localStorage.getItem(STORAGE_MODE);
    const savedSpeed = localStorage.getItem(STORAGE_SPEED);

    if (savedMessage) currentMessage = savedMessage;
    if (savedColor) currentColor = savedColor;
    if (savedMode) currentMode = savedMode;
    if (savedSpeed) currentSpeed = parseInt(savedSpeed);

    els.messageInput.value = currentMessage;
    els.colorPicker.value = currentColor;
    els.speedSlider.value = currentSpeed;
    updateSpeedLabel();
}

function updateSpeedLabel() {
    const speedVal = currentSpeed;
    let label = 'NORMAL';
    if (speedVal <= 3) label = 'VERY FAST';
    else if (speedVal <= 5) label = 'FAST';
    else if (speedVal <= 8) label = 'NORMAL';
    else if (speedVal <= 12) label = 'SLOW';
    else label = 'VERY SLOW';
    els.speedValue.innerText = label;
}

function showTypingIndicator() {
    els.messageTextEl.innerHTML = 'TYPING';
    const cursor = document.createElement('span');
    cursor.className = 'typing-cursor';
    els.messageTextEl.appendChild(cursor);
    updateTextColor();
}

function applyAnimationMode() {
    els.ledScreen.classList.remove('scrolling', 'bounce', 'flash', 'wave');
    els.messageContainer.style.animation = '';
    els.messageContainer.style.transform = '';

    if (currentMode === 'wave') {
        applyWaveEffect();
    } else {
        if (els.messageTextEl.innerText !== currentMessage && els.messageTextEl.innerText !== 'TYPING') {
            els.messageTextEl.innerText = currentMessage;
        }
    }

    switch (currentMode) {
        case 'scroll': {
            els.ledScreen.classList.add('scrolling');
            const scrollDuration = Math.max(3, Math.min(20, 20 / (currentSpeed / 5)));
            els.messageContainer.style.animationDuration = `${scrollDuration}s`;
            break;
        }
        case 'bounce': {
            els.ledScreen.classList.add('bounce');
            const bounceDuration = 0.8 + (10 - currentSpeed) * 0.05;
            els.messageTextEl.style.animationDuration = `${bounceDuration}s`;
            break;
        }
        case 'flash': {
            els.ledScreen.classList.add('flash');
            const flashDuration = 0.3 + (10 - currentSpeed) * 0.02;
            els.messageTextEl.style.animationDuration = `${flashDuration}s`;
            break;
        }
        case 'wave':
            els.ledScreen.classList.add('wave');
            break;
        default:
            break;
    }
}

function applyWaveEffect() {
    const originalText = currentMessage;
    if (!originalText) return;

    const chars = originalText.split('');
    const spannedHtml = chars.map((char, index) => {
        if (char === ' ') return '&nbsp;';
        return `<span class="wave-letter" style="--i: ${index}">${char}</span>`;
    }).join('');

    els.messageTextEl.innerHTML = spannedHtml;

    const letters = els.messageTextEl.querySelectorAll('.wave-letter');
    letters.forEach((letter, idx) => {
        letter.style.animationDelay = `${idx * 0.04}s`;
        letter.style.animationDuration = `${0.4 + (12 - currentSpeed) * 0.03}s`;
    });
}

function updateTextColor() {
    els.messageTextEl.style.color = currentColor;
    els.messageTextEl.style.textShadow = `0 0 20px ${currentColor}, 0 0 40px ${currentColor}`;
}

function renderMessage() {
    if (currentMode !== 'wave') {
        els.messageTextEl.innerText = currentMessage;
    } else {
        applyWaveEffect();
    }
    updateTextColor();
    applyAnimationMode();
    saveToLocalStorage();
}

function setMessage(message) {
    if (!message || message.trim() === '') {
        message = "#See Your Vibe Mode";
    }
    currentMessage = message;
    els.messageInput.value = message;
    renderMessage();
}

function clearMessage() {
    setMessage("#See Your Vibe Mode");
}

function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
    renderMessage();
}

function setColor(color) {
    currentColor = color;
    els.colorPicker.value = color;
    updateTextColor();
    saveToLocalStorage();
}

function setSpeed(speed) {
    currentSpeed = parseInt(speed);
    els.speedSlider.value = currentSpeed;
    updateSpeedLabel();
    if (currentMode === 'scroll' || currentMode === 'bounce' || currentMode === 'flash') {
        applyAnimationMode();
    } else if (currentMode === 'wave') {
        applyWaveEffect();
    }
    saveToLocalStorage();
}

function brightnessBoost() {
    els.brightnessFlash.classList.add('active');
    setTimeout(() => {
        els.brightnessFlash.classList.remove('active');
    }, 150);
    els.messageTextEl.style.textShadow = `0 0 60px ${currentColor}, 0 0 100px ${currentColor}`;
    setTimeout(() => {
        els.messageTextEl.style.textShadow = `0 0 20px ${currentColor}, 0 0 40px ${currentColor}`;
    }, 200);
}

// ==================== TYPING HANDLERS ====================
function handleTypingStart() {
    if (typingTimeout) clearTimeout(typingTimeout);
    if (!isTyping) {
        isTyping = true;
        showTypingIndicator();
    }
}

function handleTypingEnd() {
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        if (currentMode !== 'wave') {
            els.messageTextEl.innerText = currentMessage;
        } else {
            applyWaveEffect();
        }
        updateTextColor();
        applyAnimationMode();
    }, 300);
}

// ==================== LONG PRESS TO CLEAR ====================
function handleLongPressStart() {
    pressTimer = setTimeout(() => {
        clearMessage();
        const flashDiv = document.createElement('div');
        flashDiv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.1);pointer-events:none;z-index:999;';
        document.body.appendChild(flashDiv);
        setTimeout(() => flashDiv.remove(), 100);
    }, 500);
}

function handleLongPressEnd() {
    if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
    }
}

// ==================== DOUBLE TAP CYCLE MODE ====================
const modes = ['static', 'scroll', 'bounce', 'flash', 'wave'];
function handleDblClick(e) {
    e.stopPropagation();
    const index = modes.indexOf(currentMode);
    const nextIndex = (index + 1) % modes.length;
    setMode(modes[nextIndex]);
}

function wireListeners() {
    const bind = (el, evt, fn) => {
        if (!el) return;
        el.addEventListener(evt, fn);
        onCleanup(() => el.removeEventListener(evt, fn));
    };

    bind(els.messageInput, 'input', () => { handleTypingStart(); handleTypingEnd(); });
    bind(els.messageInput, 'focus', handleTypingStart);
    bind(els.messageInput, 'blur', () => {
        if (typingTimeout) clearTimeout(typingTimeout);
        isTyping = false;
        if (currentMode !== 'wave') {
            els.messageTextEl.innerText = currentMessage;
        } else {
            applyWaveEffect();
        }
        updateTextColor();
        applyAnimationMode();
    });

    bind(els.showBtn, 'click', () => {
        const newMsg = els.messageInput.value.trim();
        if (newMsg) setMessage(newMsg);
        else setMessage("#See Your Vibe Mode");
        isTyping = false;
        if (typingTimeout) clearTimeout(typingTimeout);
    });

    bind(els.clearBtn, 'click', () => {
        clearMessage();
        els.messageInput.value = "";
        isTyping = false;
        if (typingTimeout) clearTimeout(typingTimeout);
    });

    document.querySelectorAll('.color-preset').forEach(preset => {
        bind(preset, 'click', () => setColor(preset.getAttribute('data-color')));
    });

    bind(els.colorPicker, 'input', (e) => setColor(e.target.value));
    bind(els.speedSlider, 'input', (e) => setSpeed(e.target.value));

    document.querySelectorAll('.mode-btn').forEach(btn => {
        bind(btn, 'click', () => setMode(btn.getAttribute('data-mode')));
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        bind(btn, 'click', () => setMessage(btn.getAttribute('data-preset')));
    });

    bind(els.brightnessBoostBtn, 'click', brightnessBoost);

    // X icon: exit fullscreen first (if active), then hand off to the
    // router instead of a hard location.href — this is the one custom
    // case that can't just be a data-link, since it needs that extra step.
    bind(els.closeHomeBtn, 'click', () => {
        if (isFullscreen) exitFullscreen();
        navigate('home');
    });

    bind(els.fullscreenToggleBtn, 'click', toggleFullscreen);

    bind(els.ledScreen, 'touchstart', handleLongPressStart);
    bind(els.ledScreen, 'touchend', handleLongPressEnd);
    bind(els.ledScreen, 'touchcancel', handleLongPressEnd);
    bind(els.ledScreen, 'mousedown', handleLongPressStart);
    bind(els.ledScreen, 'mouseup', handleLongPressEnd);
    bind(els.ledScreen, 'dblclick', handleDblClick);
}

export default {
    init() {
        els = {
            ledScreen: document.getElementById('ledScreen'),
            messageTextEl: document.getElementById('messageText'),
            messageContainer: document.getElementById('messageContainer'),
            messageInput: document.getElementById('messageInput'),
            showBtn: document.getElementById('showBtn'),
            clearBtn: document.getElementById('clearBtn'),
            colorPicker: document.getElementById('colorPicker'),
            speedSlider: document.getElementById('speedSlider'),
            speedValue: document.getElementById('speedValue'),
            brightnessBoostBtn: document.getElementById('brightnessBoostBtn'),
            brightnessFlash: document.getElementById('brightnessFlash'),
            closeHomeBtn: document.getElementById('closeHomeBtn'),
            fullscreenToggleBtn: document.getElementById('fullscreenToggleBtn'),
        };

        wireListeners();

        loadFromLocalStorage();

        if (currentMessage === "🔥 FESTIVAL MODE 🔥" || currentMessage === "FESTIVAL MODE" || currentMessage === "FESTIVAL MODE 🔥") {
            currentMessage = "#See Your Vibe Mode";
            els.messageInput.value = currentMessage;
            saveToLocalStorage();
        }

        setColor(currentColor);
        setMode(currentMode);
        setSpeed(currentSpeed);
        setMessage(currentMessage);
        updateTextColor();

        setTimeout(() => {
            if (currentMode === 'wave') applyWaveEffect();
        }, 50);
    },

    destroy() {
        // Fullscreen escapes #app-content (appended to document.body) and
        // toggles a class on <body> itself, so it has to be torn down
        // explicitly — the router only replaces #app-content's innerHTML.
        if (isFullscreen) exitFullscreen();
        if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }

        cleanup.forEach(fn => fn());
        cleanup = [];
    }
};
