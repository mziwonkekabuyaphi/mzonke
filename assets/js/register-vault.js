// ===== Constants =====
// Supabase is imported via module import from config

// ===== State =====
let productsWithValues = {};   // { name: price }
let productsWithIds = {};      // { name: id }
let selectedItems = [];        // { name, quantity, product_id }

// ===== DOM Elements =====
// References are accessed directly via document.getElementById()

// ===== Utility Functions =====

// SA Phone Formatting
function formatSouthAfricanPhone(input) {
    let digits = input.replace(/\D/g, '');
    if (digits.length > 10) digits = digits.slice(0, 10);
    let formatted = '';
    if (digits.length > 0) {
        formatted = digits.slice(0, 3);
        if (digits.length >= 4) formatted += ' ' + digits.slice(3, 6);
        if (digits.length >= 7) formatted += ' ' + digits.slice(6, 10);
    }
    return formatted.trim();
}

function getRawPhoneNumber(formattedValue) {
    return formattedValue.replace(/\s/g, '');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ===== Toast =====
function showToast(message) {
    const toast = document.getElementById('toastMessage');
    if (!toast) return;
    toast.innerText = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(100px)';
    }, 1800);
}

// ===== Floating Plus Animation =====
function showFloatingPlus(x, y) {
    const plus = document.createElement('div');
    plus.className = 'floating-plus';
    plus.innerHTML = '+1';
    plus.style.left = x + 'px';
    plus.style.top = y + 'px';
    document.body.appendChild(plus);
    setTimeout(() => plus.remove(), 600);
}

// ===== Modal Functions =====
function showModal(title, message, onOk = null) {
    document.getElementById('modalTitle').innerHTML = title;
    document.getElementById('modalMessage').innerHTML = message;
    const modal = document.getElementById('customModal');
    const okBtn = document.getElementById('modalOkBtn');
    okBtn.onclick = () => {
        modal.classList.remove('active');
        if (onOk) onOk();
    };
    modal.onclick = (e) => {
        if (e.target === modal) modal.classList.remove('active');
    };
    modal.classList.add('active');
}

function showModalWithRedirect(title, message, redirectUrl = 'index.html') {
    document.getElementById('modalTitle').innerHTML = title;
    document.getElementById('modalMessage').innerHTML = message;
    const modal = document.getElementById('customModal');
    const okBtn = document.getElementById('modalOkBtn');
    okBtn.onclick = () => {
        modal.classList.remove('active');
        window.location.href = redirectUrl;
    };
    modal.onclick = (e) => {
        if (e.target === modal) window.location.href = redirectUrl;
    };
    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('customModal').classList.remove('active');
}

function goToLockerDashboard() {
    window.location.href = 'lockers.html';
}

// ===== Product Functions =====
async function loadProductsFromSupabase() {
    const grid = document.getElementById('productModalGrid');
    if (grid && grid.innerHTML.includes('Loading')) {
        grid.innerHTML = '<div style="text-align:center; padding:40px; color:var(--mist);"><i class="fas fa-spinner fa-pulse"></i> Loading alcohol products...</div>';
    }
    try {
        const { data, error } = await supabase
            .from('products')
            .select('id, name, price')
            .eq('alcohol', true)
            .eq('is_available', true)
            .order('name');
        if (error) throw error;
        if (data && data.length > 0) {
            productsWithValues = {};
            productsWithIds = {};
            data.forEach(item => {
                productsWithValues[item.name] = item.price;
                productsWithIds[item.name] = item.id;
            });
            console.log(`✅ Loaded ${data.length} alcohol products from 'products' table.`);
            return true;
        } else {
            throw new Error('No alcohol products found.');
        }
    } catch (err) {
        console.error(err);
        showModal('Products Load Error', `Unable to load alcohol products.<br><br>${err.message}`);
        return false;
    }
}

function renderProductGrid(grid) {
    grid.innerHTML = '';
    const productNames = Object.keys(productsWithValues);
    productNames.forEach(product => {
        const price = productsWithValues[product];
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.innerHTML = `<div class="product-name">${escapeHtml(product)}</div><div class="product-price">R${price.toFixed(2)}</div>`;
        productCard.onclick = (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            showFloatingPlus(rect.left + rect.width / 2, rect.top + rect.height / 2);
            addProduct(product);
        };
        grid.appendChild(productCard);
    });
}

async function openProductModal() {
    const grid = document.getElementById('productModalGrid');
    if (Object.keys(productsWithValues).length > 0) {
        renderProductGrid(grid);
    } else {
        grid.innerHTML = '<div style="text-align:center; padding:40px; color:var(--mist);"><i class="fas fa-spinner fa-pulse"></i> Loading alcohol products...</div>';
        const loaded = await loadProductsFromSupabase();
        if (loaded && Object.keys(productsWithValues).length > 0) {
            renderProductGrid(grid);
        } else {
            grid.innerHTML = '<div style="text-align:center; padding:40px; color:var(--red);"><i class="fas fa-exclamation-triangle"></i> No alcohol products available. Please check your database.</div>';
        }
    }
    document.getElementById('productPickerModal').classList.add('active');
}

function closeProductModal() {
    document.getElementById('productPickerModal').classList.remove('active');
}

// ===== Cart Functions =====
function addProduct(productName, productId = null) {
    const existingIndex = selectedItems.findIndex(i => i.name === productName);
    if (existingIndex !== -1) {
        selectedItems[existingIndex].quantity += 1;
    } else {
        selectedItems.push({
            name: productName,
            quantity: 1,
            product_id: productId || productsWithIds[productName] || null
        });
    }
    updateSelectedItemsDisplay();
    showToast(`✓ Added ${productName}`);
    const basket = document.getElementById('selectedItemsContainer');
    basket.classList.add('basket-highlight');
    setTimeout(() => basket.classList.remove('basket-highlight'), 400);
    setTimeout(() => {
        const rows = document.querySelectorAll('.selected-item-row');
        if (existingIndex !== -1 && rows[existingIndex]) {
            rows[existingIndex].classList.add('item-flash');
            setTimeout(() => rows[existingIndex].classList.remove('item-flash'), 500);
        } else if (rows[rows.length - 1]) {
            rows[rows.length - 1].classList.add('item-flash');
            setTimeout(() => rows[rows.length - 1].classList.remove('item-flash'), 500);
        }
    }, 50);
    if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(50);
}

function increaseQuantity(idx) {
    if (selectedItems[idx]) {
        selectedItems[idx].quantity += 1;
        updateSelectedItemsDisplay();
        showToast(`✓ ${selectedItems[idx].name} quantity: ${selectedItems[idx].quantity}`);
    }
}

function decreaseQuantity(idx) {
    if (selectedItems[idx]) {
        if (selectedItems[idx].quantity > 1) {
            selectedItems[idx].quantity -= 1;
            showToast(`↘️ ${selectedItems[idx].name} quantity: ${selectedItems[idx].quantity}`);
        } else {
            selectedItems.splice(idx, 1);
            showToast(`🗑️ Removed item`);
        }
        updateSelectedItemsDisplay();
    }
}

function removeSelectedItem(idx) {
    const itemName = selectedItems[idx]?.name;
    selectedItems.splice(idx, 1);
    updateSelectedItemsDisplay();
    showToast(`🗑️ Removed ${itemName || 'item'}`);
}

function updateSelectedItemsDisplay() {
    const container = document.getElementById('selectedItemsList');
    if (!container) return;
    if (selectedItems.length === 0) {
        container.innerHTML = '<p style="color: var(--mist); text-align: center; padding: 20px;"><i class="fas fa-inbox"></i> No items selected yet</p>';
        return;
    }
    let html = '';
    selectedItems.forEach((item, idx) => {
        const price = productsWithValues[item.name] || 0;
        const subtotal = price * item.quantity;
        html += `<div class="selected-item-row">
                <span class="item-name">${escapeHtml(item.name)}<br><small style="color:var(--mist);">R${price.toFixed(2)} each</small></span>
                <div class="item-qty-controls">
                    <button class="qty-btn" onclick="window.decreaseQuantity(${idx})">−</button>
                    <span style="min-width: 36px; text-align:center; font-weight:700;">${item.quantity}</span>
                    <button class="qty-btn" onclick="window.increaseQuantity(${idx})">+</button>
                </div>
                <div style="min-width:70px;text-align:right;font-weight:700;color:#16a34a;">R${subtotal.toFixed(2)}</div>
                <div class="remove-item" onclick="window.removeSelectedItem(${idx})"><i class="fas fa-trash-alt"></i></div>
            </div>`;
    });
    const totalValue = selectedItems.reduce((sum, item) => sum + ((productsWithValues[item.name] || 0) * item.quantity), 0);
    html += `<div class="total-row">Total: R${totalValue.toFixed(2)}</div>`;
    container.innerHTML = html;
}

function calculateRegistrationValue() {
    return selectedItems.reduce((sum, item) => sum + ((productsWithValues[item.name] || 0) * item.quantity), 0);
}

// ===== Auto-fill Functions =====
function autoFillWalletUser() {
    const saved = localStorage.getItem('rands_accounts_v2');
    if (!saved) return;
    try {
        const accounts = JSON.parse(saved);
        if (accounts.length) {
            const acc = accounts[0];
            if (acc.name) document.getElementById('preName').value = acc.name;
            if (acc.id) {
                let phone = acc.id.replace(/\D/g, '');
                if (phone.length >= 10) {
                    phone = phone.slice(-10);
                    const formattedPhone = formatSouthAfricanPhone(phone);
                    document.getElementById('prePhone').value = formattedPhone;
                }
            }
        }
    } catch (e) { console.warn(e); }
}

async function loadLoggedInUserAndPrefill() {
    try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
            console.log('No active session, falling back to localStorage');
            autoFillWalletUser();
            return;
        }
        const userId = session.user.id;
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('name, phone')
            .eq('id', userId)
            .maybeSingle();
        if (profileError) throw profileError;
        if (profile) {
            if (profile.name) document.getElementById('preName').value = profile.name;
            if (profile.phone) {
                const rawPhone = profile.phone.replace(/\D/g, '');
                if (rawPhone.length === 10 && rawPhone.startsWith('0')) {
                    const formatted = formatSouthAfricanPhone(rawPhone);
                    document.getElementById('prePhone').value = formatted;
                } else {
                    console.warn('Phone number not in expected SA 10-digit format:', rawPhone);
                }
            }
        } else {
            console.log('No profile found for logged-in user, falling back to localStorage');
            autoFillWalletUser();
        }
    } catch (err) {
        console.error('Error loading user profile:', err);
        autoFillWalletUser();
    }
}

// ===== Create Vault =====
async function createNewVault() {
    const name = document.getElementById('preName').value.trim();
    const phoneFormatted = document.getElementById('prePhone').value.trim();
    const customPin = document.getElementById('prePin').value.trim();
    const phone = getRawPhoneNumber(phoneFormatted);

    if (!name) { showModal('Missing name', 'Please enter your name.'); return; }
    if (!phone) { showModal('Missing phone', 'Please enter your WhatsApp number.'); return; }
    if (phone.length !== 10 || !/^0[6-8][0-9]{8}$/.test(phone)) {
        showModal('Invalid phone number', 'Please enter a valid South African cellphone number starting with 073, 063, 078, etc. (10 digits).');
        return;
    }
    if (!customPin || customPin.length < 4 || customPin.length > 6 || !/^\d+$/.test(customPin)) {
        showModal('Invalid PIN', 'PIN must be 4-6 digits and contain only numbers.');
        return;
    }
    if (selectedItems.length === 0) {
        showModal('No items', 'Please select at least one item to store.');
        return;
    }

    const { data: existing, error: checkErr } = await supabase
        .from('pre_registrations')
        .select('id')
        .eq('customer_phone', phone)
        .eq('status', 'pending')
        .maybeSingle();
    if (existing) {
        showModal('Vault Exists', 'This phone number already has a pending pre-registration. Please wait for staff assignment or contact support.');
        return;
    }

    const itemsForDb = selectedItems.map(item => ({
        product_id: item.product_id || productsWithIds[item.name] || null,
        name: item.name,
        price: productsWithValues[item.name] || 0,
        quantity: item.quantity
    }));
    const totalValue = calculateRegistrationValue();

    const { error: insertErr } = await supabase
        .from('pre_registrations')
        .insert({
            customer_name: name,
            customer_phone: phone,
            pin_hash: customPin,
            items: itemsForDb,
            total_value: totalValue,
            status: 'pending'
        });

    if (insertErr) {
        console.error(insertErr);
        showModal('Error', 'Failed to create vault. Please try again later.');
        return;
    }

    let itemsListHtml = '';
    selectedItems.forEach(item => {
        const price = productsWithValues[item.name] || 0;
        itemsListHtml += `<li>${item.name} x${item.quantity} = R${(price * item.quantity).toFixed(2)}</li>`;
    });

    const displayPhone = formatSouthAfricanPhone(phone);
    showModalWithRedirect('Vault Created!',
        `✅ New vault created successfully!<br><br>
            <strong>Your PIN:</strong> ${customPin}<br>
            <strong>WhatsApp:</strong> ${displayPhone}<br><br>
            <strong>📦 Items:</strong><br><ul style="text-align:left;">${itemsListHtml}</ul>
            <strong>💰 Total Value:</strong> R${totalValue.toFixed(2)}<br><br>
            ⚠️ Keep your PIN safe! You will need to show it together with your WhatsApp number at the counter.<br><br>
            Redirecting to homepage...`,
        'index.html');

    selectedItems = [];
    updateSelectedItemsDisplay();
    document.getElementById('preName').value = '';
    document.getElementById('prePhone').value = '';
    document.getElementById('prePin').value = '';
}

// ===== Make Global Functions =====
window.addProduct = addProduct;
window.increaseQuantity = increaseQuantity;
window.decreaseQuantity = decreaseQuantity;
window.removeSelectedItem = removeSelectedItem;
window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.showModal = showModal;
window.closeModal = closeModal;
window.goToLockerDashboard = goToLockerDashboard;
window.createNewVault = createNewVault;

// ===== Initialization =====
const productsLoaded = await loadProductsFromSupabase();
if (!productsLoaded) console.warn('Alcohol products could not be loaded');

await loadLoggedInUserAndPrefill();

updateSelectedItemsDisplay();

// Phone formatting listener
const phoneInput = document.getElementById('prePhone');
if (phoneInput) {
    phoneInput.addEventListener('input', function(e) {
        const raw = getRawPhoneNumber(this.value);
        const formatted = formatSouthAfricanPhone(raw);
        this.value = formatted;
    });
}

document.getElementById('createVaultBtn').onclick = () => createNewVault();
document.getElementById('openProductModalBtn').onclick = () => openProductModal();

window.addEventListener('storage', (e) => {
    if (e.key === 'rands_accounts_v2') autoFillWalletUser();
});