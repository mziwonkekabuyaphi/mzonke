import { supabase } from '../../config/supabase.js';

// Same cleanup pattern as pages/home.js, pages/tickets.js, pages/vvip.js —
// every listener/channel created in init() gets undone in destroy() so
// nothing leaks or double-fires if the user navigates away and back.
let cleanup = [];
const onCleanup = (fn) => cleanup.push(fn);

// Module-scope so a navigate-away-and-back reuses state instead of
// refetching (dynamic import() caches the module — see tickets.js note).
let currentCustomer = null;   // { id, name, phone }
let currentBalance = 0;
let holdings = [];            // all vault_holdings + nested items for this customer
let availableProducts = [];   // from vault_get_available_products
let selection = {};           // order_item_id -> { qty, product }
let walletChannel = null;
let vaultChannel = null;

const ACTIVE_STATUSES = ['PENDING_APPROVAL', 'STORED', 'PENDING_COLLECTION_APPROVAL', 'READY_FOR_COLLECTION'];
const HISTORY_STATUSES = ['COLLECTED', 'REJECTED'];

function showToast(message, isError = false) {
    const toast = document.getElementById('toastMessage');
    toast.innerText = message;
    toast.style.background = isError ? '#b71c1c' : '#1e293b';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3200);
}

function fmtMoney(n) { return `R${(Number(n) || 0).toFixed(2)}`; }
function escapeHtml(str) { if (!str) return ''; return String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]); }

let confirmResolver = null;
function askConfirm(title, message) {
    return new Promise(resolve => {
        document.getElementById('confirmModalTitle').innerText = title;
        document.getElementById('confirmModalMessage').innerText = message;
        document.getElementById('confirmModal').classList.add('show');
        confirmResolver = resolve;
    });
}
function closeConfirmModal(result) {
    document.getElementById('confirmModal').classList.remove('show');
    if (confirmResolver) { confirmResolver(result); confirmResolver = null; }
}

// ========== AUTH / WALLET ==========
async function initAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { showToast('Please log in first', true); setTimeout(() => { window.location.href = '../login.html'; }, 1500); return false; }
    const userId = session.user.id;

    // profiles.id is NOT guaranteed to equal the auth user id — WhatsApp-
    // registered customers get a DB-generated profiles.id, linked to auth
    // only via auth_user_id. Same lookup order as pages/tickets.js.
    let { data: profile } = await supabase.from('profiles').select('id, phone, name').eq('auth_user_id', userId).maybeSingle();
    if (!profile) {
        const fallback = await supabase.from('profiles').select('id, phone, name').eq('id', userId).maybeSingle();
        profile = fallback.data;
    }
    if (!profile) {
        const { data: newProfile, error: insertError } = await supabase.from('profiles').insert({ id: userId, auth_user_id: userId, name: session.user.user_metadata?.full_name || 'Member', email: session.user.email, phone: session.user.user_metadata?.phone || '', role: 'customer' }).select('id, phone, name').single();
        if (insertError) console.error('Profile creation failed:', insertError);
        profile = newProfile;
    }
    if (!profile) {
        showToast('Could not load your account. Please contact support.', true);
        return false;
    }

    const { data: wallet } = await supabase.from('wallets').select('balance').eq('user_id', userId).maybeSingle();
    currentBalance = (wallet && typeof wallet.balance === 'number') ? wallet.balance : 0;
    currentCustomer = { id: profile.id, name: profile.name, phone: profile.phone };
    updateWalletDisplay();
    return true;
}

function updateWalletDisplay() {
    document.getElementById('walletBalance').innerText = fmtMoney(currentBalance);
}

// ========== LOAD VAULT HOLDINGS ==========
async function loadHoldings() {
    if (!currentCustomer?.id) { holdings = []; renderHoldings(); return; }
    const { data, error } = await supabase
        .from('vault_holdings')
        .select(`
            id, status, total_value, requested_at, approved_at, stored_at,
            collection_requested_at, collection_approved_at, collected_at,
            rejection_reason, collection_rejection_reason,
            vault_items ( id, product_name, category, quantity, unit_value, total_value )
        `)
        .eq('customer_profile_id', currentCustomer.id)
        .order('requested_at', { ascending: false });
    if (error) { console.error(error); showToast('Could not load your Vault', true); return; }
    holdings = data || [];
    updateVaultStats();
    renderHoldings();
}

function updateVaultStats() {
    // Vault Value only counts officially STORED/PENDING_COLLECTION_APPROVAL/READY_FOR_COLLECTION
    // holdings — a PENDING_APPROVAL request isn't yet stored, so it doesn't count.
    const countedStatuses = ['STORED', 'PENDING_COLLECTION_APPROVAL', 'READY_FOR_COLLECTION'];
    const counted = holdings.filter(h => countedStatuses.includes(h.status));
    const totalValue = counted.reduce((sum, h) => sum + Number(h.total_value || 0), 0);
    const totalItems = counted.reduce((sum, h) => sum + (h.vault_items || []).reduce((s, i) => s + i.quantity, 0), 0);
    document.getElementById('vaultValueStat').innerText = fmtMoney(totalValue);
    document.getElementById('vaultItemsStat').innerText = totalItems;
}

function statusLabel(status) {
    return ({
        PENDING_APPROVAL: 'Pending Approval',
        STORED: 'Stored',
        PENDING_COLLECTION_APPROVAL: 'Collection Pending',
        READY_FOR_COLLECTION: 'Ready for Collection',
        COLLECTED: 'Collected',
        REJECTED: 'Rejected'
    })[status] || status;
}

function renderHoldingCard(h) {
    const itemsHtml = (h.vault_items || []).map(i => `
        <div class="holding-item-row">
            <span><span class="holding-item-name">${i.quantity} &times; ${escapeHtml(i.product_name)}</span></span>
            <span>${fmtMoney(i.total_value)}</span>
        </div>
    `).join('');

    let actionHtml = '';
    if (h.status === 'STORED') {
        actionHtml = `<button class="holding-action-btn" data-action="collect" data-id="${h.id}">Request Collection</button>`;
    } else if (h.status === 'PENDING_APPROVAL') {
        actionHtml = `<div class="holding-note">Awaiting staff verification. We'll update this once a staff member confirms your items.</div>`;
    } else if (h.status === 'PENDING_COLLECTION_APPROVAL') {
        actionHtml = `<div class="holding-note">Collection requested — a staff member will retrieve your items shortly.</div>`;
    } else if (h.status === 'READY_FOR_COLLECTION') {
        actionHtml = `<div class="holding-note">Ready! Please see a staff member to collect your products.</div>`;
    } else if (h.status === 'REJECTED') {
        actionHtml = `<div class="holding-note rejected">Not stored${h.rejection_reason ? ': ' + escapeHtml(h.rejection_reason) : '.'}</div>`;
    } else if (h.status === 'COLLECTED') {
        actionHtml = `<div class="holding-note">Collected on ${new Date(h.collected_at).toLocaleString('en-ZA', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}.</div>`;
    }

    return `
        <div class="holding-card">
            <div class="holding-header">
                <span class="holding-id">${(h.vault_items||[]).length} Item${(h.vault_items||[]).length===1?'':'s'}</span>
                <span class="holding-status-badge">${statusLabel(h.status)}</span>
            </div>
            <div class="holding-body">
                ${itemsHtml}
                <div class="holding-value-row">
                    <span class="holding-value-label">Value</span>
                    <span class="holding-value-amount">${fmtMoney(h.total_value)}</span>
                </div>
                <div class="holding-meta">Requested ${new Date(h.requested_at).toLocaleString('en-ZA', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}</div>
                ${actionHtml}
            </div>
        </div>
    `;
}

function renderHoldings() {
    const activeContainer = document.getElementById('activeHoldingsContainer');
    const historyContainer = document.getElementById('historyContainer');
    const historyToggle = document.getElementById('historyToggle');

    const active = holdings.filter(h => ACTIVE_STATUSES.includes(h.status));
    const history = holdings.filter(h => HISTORY_STATUSES.includes(h.status));

    if (!currentCustomer?.id) {
        activeContainer.innerHTML = `<div class="empty-state"><i class="fas fa-lock"></i>Please log in to view your Vault.</div>`;
        historyToggle.style.display = 'none';
        historyContainer.innerHTML = '';
        return;
    }

    if (active.length === 0) {
        activeContainer.innerHTML = `<div class="empty-state"><i class="fas fa-box-archive"></i><p>Your Vault is empty.</p><p>Products you ask us to keep will appear here.</p></div>`;
    } else {
        activeContainer.innerHTML = active.map(renderHoldingCard).join('');
    }

    if (history.length > 0) {
        historyToggle.style.display = 'block';
        historyContainer.innerHTML = history.map(renderHoldingCard).join('');
    } else {
        historyToggle.style.display = 'none';
        historyContainer.innerHTML = '';
    }

    activeContainer.querySelectorAll('[data-action="collect"]').forEach(btn => {
        btn.addEventListener('click', () => requestCollection(btn.dataset.id));
    });
}

async function requestCollection(holdingId) {
    const confirmed = await askConfirm('Request Collection', "We'll let staff know you'd like to collect these products. Continue?");
    if (!confirmed) return;
    const { error } = await supabase.rpc('vault_create_collect_request', { p_vault_holding_id: holdingId });
    if (error) {
        console.error(error);
        showToast(error.message || 'Could not request collection', true);
        return;
    }
    showToast('Collection requested — staff will be notified.');
    await loadHoldings();
}

// ========== KEEP PRODUCTS ==========
async function loadAvailableProducts() {
    const container = document.getElementById('availableProductsContainer');
    if (!currentCustomer?.id) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-lock"></i>Please log in to store products.</div>`;
        return;
    }
    container.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin"></i>Loading your eligible products...</div>`;
    const { data, error } = await supabase.rpc('vault_get_available_products', { p_customer_profile_id: currentCustomer.id });
    if (error) {
        console.error(error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-triangle-exclamation"></i>Could not load your products.</div>`;
        return;
    }
    availableProducts = data || [];
    selection = {};
    renderAvailableProducts();
    updateSelectionSummary();
}

function renderAvailableProducts() {
    const container = document.getElementById('availableProductsContainer');
    if (availableProducts.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-box-open"></i><p>No eligible products to store.</p><p>Alcohol purchases you haven't already placed in the Vault will show up here.</p></div>`;
        return;
    }
    container.innerHTML = availableProducts.map(p => {
        const sel = selection[p.order_item_id];
        const qty = sel ? sel.qty : 0;
        const checked = qty > 0;
        return `
            <div class="product-select-card">
                <div class="product-check ${checked ? 'checked' : ''}" data-toggle="${p.order_item_id}">${checked ? '<i class="fas fa-check"></i>' : ''}</div>
                <div class="product-info">
                    <div class="product-name">${escapeHtml(p.product_name)}</div>
                    <div class="product-sub">${fmtMoney(p.unit_price)} each &middot; ${p.available_quantity} available</div>
                </div>
                <div class="qty-stepper">
                    <button class="qty-btn" data-dec="${p.order_item_id}" ${qty <= 0 ? 'disabled' : ''}>&minus;</button>
                    <span class="qty-value">${qty}</span>
                    <button class="qty-btn" data-inc="${p.order_item_id}" ${qty >= p.available_quantity ? 'disabled' : ''}>+</button>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('[data-toggle]').forEach(el => {
        el.addEventListener('click', () => toggleProduct(el.dataset.toggle));
    });
    container.querySelectorAll('[data-inc]').forEach(el => {
        el.addEventListener('click', () => changeQty(el.dataset.inc, 1));
    });
    container.querySelectorAll('[data-dec]').forEach(el => {
        el.addEventListener('click', () => changeQty(el.dataset.dec, -1));
    });
}

function toggleProduct(orderItemId) {
    const product = availableProducts.find(p => p.order_item_id === orderItemId);
    if (!product) return;
    if (selection[orderItemId]) {
        delete selection[orderItemId];
    } else {
        selection[orderItemId] = { qty: 1, product };
    }
    renderAvailableProducts();
    updateSelectionSummary();
}

function changeQty(orderItemId, delta) {
    const product = availableProducts.find(p => p.order_item_id === orderItemId);
    if (!product) return;
    const current = selection[orderItemId]?.qty || 0;
    const next = Math.max(0, Math.min(product.available_quantity, current + delta));
    if (next === 0) {
        delete selection[orderItemId];
    } else {
        selection[orderItemId] = { qty: next, product };
    }
    renderAvailableProducts();
    updateSelectionSummary();
}

function updateSelectionSummary() {
    const entries = Object.entries(selection);
    const summary = document.getElementById('selectionSummary');
    if (entries.length === 0) {
        summary.style.display = 'none';
        return;
    }
    summary.style.display = 'block';
    const totalItems = entries.reduce((sum, [, v]) => sum + v.qty, 0);
    const totalValue = entries.reduce((sum, [, v]) => sum + v.qty * Number(v.product.unit_price), 0);
    document.getElementById('selectedCount').innerText = `${totalItems} Item${totalItems === 1 ? '' : 's'}`;
    document.getElementById('selectedTotal').innerText = fmtMoney(totalValue);
}

async function submitStoreRequest() {
    const entries = Object.entries(selection);
    if (entries.length === 0) return;
    const totalItems = entries.reduce((sum, [, v]) => sum + v.qty, 0);
    const totalValue = entries.reduce((sum, [, v]) => sum + v.qty * Number(v.product.unit_price), 0);
    const confirmed = await askConfirm(
        'Request to Keep',
        `Ask us to keep ${totalItems} item${totalItems === 1 ? '' : 's'} (${fmtMoney(totalValue)}) for you? A staff member will verify before this is stored.`
    );
    if (!confirmed) return;

    const btn = document.getElementById('requestToKeepBtn');
    btn.disabled = true;
    btn.innerText = 'Sending request...';

    const items = entries.map(([orderItemId, v]) => ({ order_item_id: orderItemId, quantity: v.qty }));
    const { error } = await supabase.rpc('vault_create_store_request', {
        p_customer_profile_id: currentCustomer.id,
        p_items: items
    });

    btn.disabled = false;
    btn.innerText = 'Request to Keep';

    if (error) {
        console.error(error);
        showToast(error.message || 'Could not submit your request', true);
        return;
    }

    showToast('Request sent! Staff will verify and confirm shortly.');
    selection = {};
    document.getElementById('selectionSummary').style.display = 'none';
    await loadAvailableProducts();
    await loadHoldings();
    switchToMyVault();
}

// ========== TAB SWITCHING ==========
function switchToMyVault() {
    document.getElementById('myVaultPanel').style.display = 'block';
    document.getElementById('keepProductsPanel').style.display = 'none';
    document.getElementById('selectionSummary').style.display = 'none';
    document.getElementById('myVaultTabBtn').classList.add('active');
    document.getElementById('keepProductsTabBtn').classList.remove('active');
    loadHoldings();
}
function switchToKeepProducts() {
    document.getElementById('myVaultPanel').style.display = 'none';
    document.getElementById('keepProductsPanel').style.display = 'block';
    document.getElementById('myVaultTabBtn').classList.remove('active');
    document.getElementById('keepProductsTabBtn').classList.add('active');
    loadAvailableProducts();
}

function wireStaticListeners() {
    const bind = (id, evt, fn) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener(evt, fn);
        onCleanup(() => el.removeEventListener(evt, fn));
    };
    bind('myVaultTabBtn', 'click', switchToMyVault);
    bind('keepProductsTabBtn', 'click', switchToKeepProducts);
    bind('requestToKeepBtn', 'click', submitStoreRequest);
    bind('historyToggle', 'click', () => {
        const section = document.getElementById('historyContainer');
        const toggle = document.getElementById('historyToggle');
        const showing = section.classList.toggle('show');
        toggle.innerHTML = showing
            ? 'Hide Past Holdings <i class="fas fa-chevron-up"></i>'
            : 'Show Past Holdings <i class="fas fa-chevron-down"></i>';
    });
    bind('confirmModalCancelBtn', 'click', () => closeConfirmModal(false));
    bind('confirmModalConfirmBtn', 'click', () => closeConfirmModal(true));
    // homeIconBtn / .brand navigate via data-link in the fragment — the
    // router's global click delegation handles those, no JS needed here.
}

export default {
    async init() {
        if (!(await initAuth())) return;
        await loadHoldings();
        wireStaticListeners();

        walletChannel = supabase
            .channel('vault-wallet-balance')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wallets', filter: `user_id=eq.${currentCustomer.id}` }, (payload) => {
                if (payload.new.balance !== undefined) {
                    currentBalance = payload.new.balance;
                    updateWalletDisplay();
                }
            })
            .subscribe();
        onCleanup(() => { if (walletChannel) { supabase.removeChannel(walletChannel); walletChannel = null; } });

        // Auto-refresh when staff approve/reject/stage a holding, so the
        // status badge updates live instead of needing a manual refresh.
        vaultChannel = supabase
            .channel('vault-holdings-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vault_holdings', filter: `customer_profile_id=eq.${currentCustomer.id}` }, () => loadHoldings())
            .subscribe();
        onCleanup(() => { if (vaultChannel) { supabase.removeChannel(vaultChannel); vaultChannel = null; } });
    },

    destroy() {
        cleanup.forEach(fn => fn());
        cleanup = [];
    }
};
