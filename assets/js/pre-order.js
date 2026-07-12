// ===== Constants =====
// Supabase is imported via module import from config

// ===== State =====
let cart = [];
let butcherMenuItems = [];

// ===== DOM Elements =====
// References are accessed directly via document.getElementById()

// ===== Utility Functions =====

// Helper: show popup
function showPopup(options) {
    return new Promise((resolve) => {
        const modal = document.getElementById('popupModal');
        const title = document.getElementById('popupTitle');
        const message = document.getElementById('popupMessage');
        const okBtn = document.getElementById('popupOkBtn');
        title.innerText = options.title || 'Notification';
        message.innerText = options.message || '';
        const newOkBtn = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);
        newOkBtn.onclick = () => {
            modal.classList.remove('active');
            resolve(true);
        };
        modal.classList.add('active');
    });
}

async function showAlert(message, title = 'Notification') {
    await showPopup({ message, title });
}

function validatePhoneNumber(phone) {
    const d = phone.replace(/\D/g, '');
    return d.length === 10 && /^[0-9]{10}$/.test(d);
}

function updateJoinButtonState() {
    const phoneInput = document.getElementById('whatsappNumber');
    const joinBtn = document.getElementById('joinBtn');
    const phoneHint = document.getElementById('phoneHint');
    const v = phoneInput.value.trim();
    if (validatePhoneNumber(v)) {
        joinBtn.disabled = false;
        joinBtn.classList.remove('disabled');
        phoneInput.classList.add('valid');
        phoneInput.classList.remove('invalid');
        phoneHint.innerHTML = '<i class="fas fa-check-circle"></i> Valid phone number';
        phoneHint.className = 'phone-hint valid';
    } else {
        joinBtn.disabled = true;
        joinBtn.classList.add('disabled');
        phoneInput.classList.remove('valid');
        phoneInput.classList.add('invalid');
        if (v.length > 0 && v.replace(/\D/g, '').length < 10) {
            phoneHint.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Need 10 digits';
        } else {
            phoneHint.innerHTML = '<i class="fas fa-info-circle"></i> Enter 10-digit number';
        }
        phoneHint.className = 'phone-hint invalid';
    }
}

function animateCartBounce() {
    const cartSection = document.querySelector('.cart-section');
    if (cartSection) {
        cartSection.classList.add('cart-bounce');
        setTimeout(() => cartSection.classList.remove('cart-bounce'), 350);
    }
}

function highlightCartItem(itemIndex) {
    setTimeout(() => {
        const cartItems = document.querySelectorAll('.cart-item-row');
        if (cartItems[itemIndex]) {
            cartItems[itemIndex].classList.add('new-item-highlight');
            setTimeout(() => cartItems[itemIndex].classList.remove('new-item-highlight'), 500);
        }
    }, 100);
}

function animateThrowToCart(element, callback) {
    if (!element) {
        if (callback) callback();
        return;
    }
    const rect = element.getBoundingClientRect();
    const cartSection = document.querySelector('.cart-section');
    const cartRect = cartSection ? cartSection.getBoundingClientRect() : null;
    const clone = element.cloneNode(true);
    clone.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;z-index:20000;pointer-events:none;transition:all 0.4s cubic-bezier(0.34,1.2,0.64,1);border-radius:18px;box-shadow:0 4px 20px rgba(227,6,19,0.4);`;
    document.body.appendChild(clone);
    if (cartRect) {
        setTimeout(() => {
            clone.style.transform = `translate(${cartRect.left + cartRect.width / 2 - rect.left - rect.width / 2}px, ${cartRect.top + cartRect.height / 2 - rect.top - rect.height / 2}px) scale(0.3) rotate(15deg)`;
            clone.style.opacity = '0.4';
        }, 10);
    } else {
        clone.style.transform = 'scale(0.1) rotate