import { supabase } from '../../config/supabase.js';
import { appState, refreshSession, refreshWallet, setupWalletRealtime, onStateChange, logout } from '../js/state.js';
import { navigate } from '../js/router.js';

// Everything in here is scoped to THIS page instance. cleanup[] collects
// every listener/interval/subscription we create so destroy() can undo
// all of it — this is the piece that was missing before and caused pages
// to leak state into each other under an SPA.
let cleanup = [];
const onCleanup = (fn) => cleanup.push(fn);

const $ = (id) => document.getElementById(id);

function formatPhoneNumber(phone) {
    if (!phone) return '—';
    return phone.toString().replace(/\D/g, '').replace(/(\d{3})(?=\d)/g, '$1 ');
}
function formatCardNumber(n) {
    if (!n) return '•••• •••• •••• ••••';
    return String(n).match(/.{1,4}/g)?.join(' ') || String(n);
}
function formatBalanceCompact(amount) {
    const abs = Math.abs(amount);
    if (abs >= 1_000_000) return `R ${(amount / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
    if (abs >= 100_000) return `R ${(amount / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

function renderBalance(balance) {
    const el = $('realWalletBalance');
    if (el) { el.textContent = formatBalanceCompact(balance || 0); el.title = `R ${(balance || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`; }
}

function renderWalletStatus(status) {
    const cardElem = $('headerBalanceCard');
    const subElem = $('balanceSubText');
    if (status === 'blocked') {
        cardElem?.classList.add('is-blocked');
        if (subElem) subElem.textContent = '🔒 Passport blocked — contact support to unlock';
    } else {
        cardElem?.classList.remove('is-blocked');
        if (subElem) subElem.textContent = 'Available for cashless spending and Tickets';
    }
}

function generateBarcodeFromId(idString) {
    const barcodeInner = $('barcodeInner');
    if (!barcodeInner || !idString) return;
    barcodeInner.innerHTML = '';
    const cleaned = String(idString).replace(/-/g, '');
    let bits = [];
    for (let i = 0; i < cleaned.length; i++) {
        const code = cleaned.charCodeAt(i);
        for (let b = 0; b < 8; b++) bits.push((code >> b) & 1);
    }
    const full = [1,0,1,1,0,0,1,0, ...bits, 1,1,0,0,1,0,1,1];
    full.forEach((bit) => {
        const el = document.createElement('div');
        el.style.width = '2px';
        el.style.flexShrink = '0';
        el.style.height = '100%';
        el.style.background = bit ? '#1a1a1a' : 'transparent';
        barcodeInner.appendChild(el);
    });
}

const GREETINGS = [
    { text: "Wamkelekile,", time: "any" }, { text: "Molo,", time: "any" },
    { text: "Hello,", time: "any" }, { text: "Welcome back,", time: "any" },
    { text: "Good morning,", time: "morning" }, { text: "Good afternoon,", time: "afternoon" },
    { text: "Good evening,", time: "evening" },
];
function updateGreeting() {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'any';
    const pool = GREETINGS.filter(g => g.time === timeOfDay || g.time === 'any');
    const el = document.querySelector('.greeting');
    if (el) el.textContent = pool[Math.floor(Math.random() * pool.length)].text;
}

async function loadRecentTransactions(walletId) {
    const list = $('txList');
    if (!list) return;
    try {
        const { data, error } = await supabase
            .from('transactions')
            .select('id, type, amount, created_at')
            .eq('wallet_id', walletId)
            .order('created_at', { ascending: false })
            .limit(10);
        if (error) throw error;
        if (!data?.length) { list.innerHTML = '<div class="tx-empty">No transactions yet.</div>'; return; }
        list.innerHTML = data.map(tx => {
            const isCredit = tx.type === 'credit' || tx.type === 'topup';
            return `<div class="tx-row">
                <div class="tx-desc">${tx.type}</div>
                <div class="tx-amount ${isCredit ? 'credit' : 'debit'}">${isCredit ? '+' : '-'}R${Number(tx.amount).toFixed(2)}</div>
            </div>`;
        }).join('');
    } catch (err) {
        console.error('Transaction load error:', err);
        list.innerHTML = '<div class="tx-empty">Could not load transactions.</div>';
    }
}

function wireCardFlip() {
    const cardStage = $('cardStage');
    const flipper = $('cardFlipper');
    if (!cardStage || !flipper) return;
    let flipped = false;
    const onClick = (e) => { e.stopPropagation(); flipped = !flipped; cardStage.classList.toggle('flipped', flipped); };
    cardStage.addEventListener('click', onClick);
    onCleanup(() => cardStage.removeEventListener('click', onClick));
}

function wireModals() {
    const buyHereBtn = $('buyHereBtn');
    const buyHereModal = $('buyHereModalOverlay');
    const closeBuyHere = $('closeBuyHereModal');
    const openBuyHere = () => buyHereModal?.classList.add('active');
    const closeBuyHereFn = () => buyHereModal?.classList.remove('active');
    buyHereBtn?.addEventListener('click', openBuyHere);
    closeBuyHere?.addEventListener('click', closeBuyHereFn);
    onCleanup(() => { buyHereBtn?.removeEventListener('click', openBuyHere); closeBuyHere?.removeEventListener('click', closeBuyHereFn); });

    const refundModal = $('refundModalOverlay');
    const openRefundBtn = $('openRefundModalBtn');
    const closeRefundBtn = $('closeRefundModal');
    const openRefund = () => refundModal?.classList.add('active');
    const closeRefund = () => refundModal?.classList.remove('active');
    openRefundBtn?.addEventListener('click', openRefund);
    closeRefundBtn?.addEventListener('click', closeRefund);
    onCleanup(() => { openRefundBtn?.removeEventListener('click', openRefund); closeRefundBtn?.removeEventListener('click', closeRefund); });

    const logoutBtn = $('logoutBtn');
    const onLogout = () => logout();
    logoutBtn?.addEventListener('click', onLogout);
    onCleanup(() => logoutBtn?.removeEventListener('click', onLogout));
}

export default {
    async init() {
        updateGreeting();
        const greetingInterval = setInterval(updateGreeting, 3600000);
        onCleanup(() => clearInterval(greetingInterval));

        wireCardFlip();
        wireModals();

        // Subscribe to shared state instead of fetching fresh every mount —
        // refreshSession/refreshWallet only re-hit Supabase if not already loaded.
        const unsub = onStateChange((state) => {
            if (state.profile) {
                const fullName = [state.profile.name, state.profile.surname].filter(Boolean).join(' ') || 'Member';
                if ($('userNameDisplay')) $('userNameDisplay').textContent = fullName.split(' ')[0];
                if ($('cardHolderName')) $('cardHolderName').textContent = fullName.toUpperCase();
                if ($('dynamicCardNumber')) $('dynamicCardNumber').textContent = formatCardNumber(state.profile.card_number);
                if ($('dynamicCvv')) $('dynamicCvv').textContent = state.profile.card_cvv || '•••';
                if ($('accountPhoneNumber')) $('accountPhoneNumber').textContent = `Passport ID: ${formatPhoneNumber(state.profile.phone)}`;
            }
            if (state.wallet) {
                renderBalance(state.wallet.balance);
                renderWalletStatus(state.wallet.status);
                generateBarcodeFromId(state.wallet.id);
            }
        });
        onCleanup(unsub);

        if (!appState.session) await refreshSession();
        if (!appState.wallet) await refreshWallet();
        setupWalletRealtime(); // no-op if already subscribed

        if (appState.wallet?.id) loadRecentTransactions(appState.wallet.id);
    },

    destroy() {
        cleanup.forEach(fn => fn());
        cleanup = [];
        // Note: we deliberately do NOT tear down appState.channels.wallet here —
        // that's app-lifetime, not page-lifetime. See state.js.
    }
};
