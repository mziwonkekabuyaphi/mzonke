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

function showToast(message, isError = false) {
    const toast = $('customToast');
    if (toast) {
        toast.textContent = message;
        toast.style.background = isError ? '#E30613' : '#1a1a2e';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    } else {
        alert(message);
    }
}

// Shrinks an element's font-size step by step until its text fits its own
// box width. Keeps the header-balance-card visually identical (same
// padding/height) no matter how long the balance string gets.
function fitTextToWidth(el, maxFontPx, minFontPx = 15) {
    if (!el) return;
    el.style.fontSize = maxFontPx + 'px';
    requestAnimationFrame(() => {
        let size = maxFontPx;
        while (el.scrollWidth > el.clientWidth && size > minFontPx) {
            size -= 1;
            el.style.fontSize = size + 'px';
        }
    });
}

let lastKnownWalletStatus = null;

function renderBalance(balance) {
    const full = `R ${(balance || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    const compact = formatBalanceCompact(balance || 0);
    const el = $('realWalletBalance');
    if (el) {
        el.textContent = compact;
        el.title = full;
        const baseFontPx = window.innerWidth <= 480 ? 29 : 38; // matches CSS 1.8rem / 2.4rem
        fitTextToWidth(el, baseFontPx);
    }
    const shishaEl = $('shishaWalletBalance');
    if (shishaEl) { shishaEl.textContent = compact; shishaEl.title = full; }
}

function renderWalletStatus(status) {
    const cardElem = $('headerBalanceCard');
    const subElem = $('balanceSubText');
    const wasBlocked = lastKnownWalletStatus === 'blocked';
    const isBlocked = status === 'blocked';
    if (isBlocked) {
        cardElem?.classList.add('is-blocked');
        if (subElem) subElem.textContent = '🔒 Passport blocked — contact support to unlock';
    } else {
        cardElem?.classList.remove('is-blocked');
        if (subElem) subElem.textContent = 'Available for cashless spending and Tickets';
    }
    if (lastKnownWalletStatus !== null && status !== lastKnownWalletStatus) {
        if (!wasBlocked && isBlocked) showToast('Your Passport has just been blocked. Contact support for assistance.', true);
        else if (wasBlocked && !isBlocked) showToast('Your Passport has been unblocked!', false);
    }
    lastKnownWalletStatus = status || null;
}

function generateBarcodeFromId(idString) {
    const barcodeInner = $('barcodeInner');
    if (!barcodeInner || !idString) return;
    barcodeInner.innerHTML = '';
    const cleaned = String(idString).replace(/-/g, '');

    let binaryPattern = [];
    for (let i = 0; i < cleaned.length; i++) {
        const charCode = cleaned.charCodeAt(i);
        for (let bit = 0; bit < 8; bit++) binaryPattern.push((charCode >> bit) & 1);
    }

    const startPattern = [1,0,1,1,0,0,1,0];
    const stopPattern = [1,1,0,0,1,0,1,1];
    const fullPattern = [...startPattern, ...binaryPattern, ...stopPattern];

    let totalWidth = 0;
    const barData = [];

    for (let i = 0; i < fullPattern.length; i++) {
        const isBar = i % 2 === 0;
        if (isBar && fullPattern[i] === 1) {
            const w = (fullPattern[i + 1] === 1) ? 3 : ((fullPattern[i - 1] === 1) ? 2 : 1);
            totalWidth += w;
            barData.push({ type: 'bar', w, tall: true });
        } else if (isBar && fullPattern[i] === 0) {
            totalWidth += 1;
            barData.push({ type: 'space', w: 1 });
        } else if (!isBar && fullPattern[i] === 1) {
            totalWidth += 1;
            barData.push({ type: 'bar', w: 1, tall: true });
        } else {
            totalWidth += 1;
            barData.push({ type: 'space', w: 1 });
        }
    }

    const scaleFactor = 100 / Math.max(totalWidth, 1);
    barData.forEach(bar => {
        const el = document.createElement('div');
        if (bar.type === 'bar') {
            el.className = 'bar tall';
            el.style.width = (bar.w * scaleFactor) + '%';
            el.style.background = '#1a1a1a';
            el.style.height = '100%';
        } else {
            el.style.width = (bar.w * scaleFactor) + '%';
            el.style.flexShrink = '0';
            el.style.background = 'transparent';
        }
        barcodeInner.appendChild(el);
    });
}

const GREETINGS = [
    // Local
    { text: "Wamkelekile,", time: "any" },
    { text: "Molo,", time: "any" },
    { text: "Sawubona,", time: "any" },
    { text: "Molweni,", time: "any" },
    { text: "Sanibonani,", time: "any" },

    // Friendly
    { text: "Hello,", time: "any" },
    { text: "Hi there,", time: "any" },
    { text: "Hey,", time: "any" },
    { text: "Welcome,", time: "any" },
    { text: "Welcome back,", time: "any" },

    // Time-based
    { text: "Good morning,", time: "morning" },
    { text: "Good afternoon,", time: "afternoon" },
    { text: "Good evening,", time: "evening" },

    // Concierge style
    { text: "It's great to see you,", time: "any" },
    { text: "Happy to have you back,", time: "any" },
    { text: "Welcome to Rands,", time: "any" },
    { text: "Thanks for reaching out,", time: "any" },
];
function updateGreeting() {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'any';
    const pool = GREETINGS.filter(g => g.time === timeOfDay || g.time === 'any');
    const available = pool.length > 0 ? pool : GREETINGS.filter(g => g.time === 'any');
    const el = document.querySelector('.greeting');
    if (el) el.textContent = available[Math.floor(Math.random() * available.length)].text;
}

async function loadRecentTransactions(walletId) {
    const list = $('txList');
    if (!list) return;
    if (!walletId) { list.innerHTML = '<div class="tx-empty">No wallet found.</div>'; return; }
    try {
        // Transaction history lives in `wallet_transactions`, not `transactions`.
        // Columns are amount/type/direction/description/created_at.
        const { data, error } = await supabase
            .from('wallet_transactions')
            .select('amount, type, direction, description, created_at')
            .eq('wallet_id', walletId)
            .order('created_at', { ascending: false })
            .limit(10);
        if (error) throw error;
        if (!data?.length) { list.innerHTML = '<div class="tx-empty">No transactions yet.</div>'; return; }
        list.innerHTML = data.map(tx => {
            const isCredit = (tx.direction || tx.type || '').toLowerCase() === 'credit';
            const cls = isCredit ? 'credit' : 'debit';
            const icon = isCredit ? 'fa-arrow-down' : 'fa-arrow-up';
            const sign = isCredit ? '+' : '-';
            const amt = Math.abs(parseFloat(tx.amount || 0)).toFixed(2);
            const desc = (tx.description || (isCredit ? 'Top-up' : 'Payment')).replace(/</g, '&lt;');
            const date = new Date(tx.created_at).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            return `<div class="tx-item">
                <div class="tx-icon-wrap ${cls}"><i class="fas ${icon}"></i></div>
                <div class="tx-info">
                    <div class="tx-desc">${desc}</div>
                    <div class="tx-date">${date}</div>
                </div>
                <div class="tx-amount ${cls}">${sign}R${amt}</div>
            </div>`;
        }).join('');
    } catch (err) {
        console.error('Transaction load error:', err);
        list.innerHTML = '<div class="tx-empty">Could not load transactions.</div>';
    }
}

// ===== VIBE METER =====
let currentEventId = null;
let vibeUpdateInterval = null;
let vibeEventChannel = null;

async function loadCurrentEvent() {
    try {
        const { data: event, error } = await supabase
            .from('events')
            .select('id, name, start_time, end_time, status, is_active')
            .eq('is_active', true)
            .order('start_time', { ascending: true })
            .limit(1)
            .maybeSingle();
        if (error) throw error;

        const statusEl = $('vibeEventStatus');
        if (!event) {
            if ($('vibeEventName')) $('vibeEventName').textContent = 'No active events';
            if (statusEl) { statusEl.innerHTML = '<i class="fas fa-calendar-alt"></i> No Event'; statusEl.style.background = '#e5e7eb'; statusEl.style.color = '#6b7280'; }
            return null;
        }

        currentEventId = event.id;
        if ($('vibeEventName')) $('vibeEventName').textContent = event.name;
        const eventDate = new Date(event.start_time);
        if ($('vibeEventDate')) $('vibeEventDate').textContent = eventDate.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        const now = new Date();
        const startTime = new Date(event.start_time);
        const endTime = event.end_time ? new Date(event.end_time) : null;
        const isLive = now >= startTime && (!endTime || now <= endTime);
        const isPast = endTime ? now > endTime : now > startTime;
        if (statusEl) {
            if (isLive) { statusEl.innerHTML = '<i class="fas fa-calendar-day"></i> LIVE NOW'; statusEl.style.background = '#10b981'; statusEl.style.color = 'white'; }
            else if (isPast) { statusEl.innerHTML = '<i class="fas fa-calendar-check"></i> Past Event'; statusEl.style.background = '#9ca3af'; statusEl.style.color = 'white'; }
            else { statusEl.innerHTML = '<i class="fas fa-calendar-alt"></i> Upcoming'; statusEl.style.background = '#f3f4f6'; statusEl.style.color = '#E30613'; }
        }
        return event;
    } catch (err) {
        console.error('[VibeMeter] Error loading event:', err);
        if ($('vibeEventName')) $('vibeEventName').textContent = 'Error loading event';
        return null;
    }
}

async function getTotalTicketsSold(eventId) {
    const { data, error } = await supabase
        .from('ticket_types')
        .select('sold')
        .eq('event_id', eventId);
    if (error) { console.error('[VibeMeter] Error getting ticket sales:', error); return 0; }
    return data.reduce((total, tt) => total + (tt.sold || 0), 0);
}

function updateVibeDisplay(totalSold, checkedIn) {
    let vibePercent = 0;
    if (totalSold > 0) vibePercent = Math.min(100, Math.round((checkedIn / totalSold) * 100));

    const percentSpan = $('vibePercentage');
    const vibeBarFill = $('vibeBarFill');
    const statsSpan = $('vibeStatsText');

    if (percentSpan) percentSpan.textContent = `${vibePercent}%`;
    if (vibeBarFill) {
        vibeBarFill.style.width = `${vibePercent}%`;
        if (vibePercent < 30) vibeBarFill.style.background = 'linear-gradient(90deg, #E30613, #ff6b6b)';
        else if (vibePercent < 70) vibeBarFill.style.background = 'linear-gradient(90deg, #ff8c00, #ffd700)';
        else vibeBarFill.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
    }
    if (statsSpan) {
        if (vibePercent < 30) statsSpan.innerHTML = '😴 Low Energy • Need more people inside!';
        else if (vibePercent < 70) statsSpan.innerHTML = '🎵 Building Up • Getting lively!';
        else if (vibePercent < 90) statsSpan.innerHTML = '🔥 High Energy • The party is on!';
        else statsSpan.innerHTML = '⚡ MAXIMUM VIBE • ABSOLUTE MADNESS!';
    }
}

async function updateVibeMeter() {
    if (!currentEventId) return;
    try {
        const totalSold = await getTotalTicketsSold(currentEventId);
        const { count: checkedIn, error: checkError } = await supabase
            .from('checkins')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', currentEventId)
            .eq('status', 'valid');

        let checkedInCount = 0;
        if (checkError) {
            console.warn('[VibeMeter] checkins query failed, falling back to tickets.checked_in:', checkError);
            const { count: ticketCheckins, error: ticketError } = await supabase
                .from('tickets')
                .select('*', { count: 'exact', head: true })
                .eq('event_id', currentEventId)
                .eq('checked_in', true);
            if (!ticketError) checkedInCount = ticketCheckins || 0;
        } else {
            checkedInCount = checkedIn || 0;
        }
        updateVibeDisplay(totalSold, checkedInCount);
    } catch (err) {
        console.error('[VibeMeter] Error updating vibe meter:', err);
    }
}

function setupVibeRealtime() {
    if (!currentEventId) return;
    vibeEventChannel = supabase.channel(`vibe-${currentEventId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins', filter: `event_id=eq.${currentEventId}` }, () => updateVibeMeter())
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ticket_types', filter: `event_id=eq.${currentEventId}` }, () => updateVibeMeter())
        .subscribe();
    onCleanup(() => { if (vibeEventChannel) { supabase.removeChannel(vibeEventChannel); vibeEventChannel = null; } });
}

async function initVibeMeter() {
    const event = await loadCurrentEvent();
    if (!event) return;
    await updateVibeMeter();
    setupVibeRealtime();
    vibeUpdateInterval = setInterval(updateVibeMeter, 30000);
    onCleanup(() => { if (vibeUpdateInterval) { clearInterval(vibeUpdateInterval); vibeUpdateInterval = null; } });
}

function wireBalanceResize() {
    let resizeFitTimeout;
    const onResize = () => {
        clearTimeout(resizeFitTimeout);
        resizeFitTimeout = setTimeout(() => {
            const balanceEl = $('realWalletBalance');
            if (!balanceEl || !balanceEl.textContent) return;
            const baseFontPx = window.innerWidth <= 480 ? 29 : 38;
            fitTextToWidth(balanceEl, baseFontPx);
        }, 150);
    };
    window.addEventListener('resize', onResize);
    onCleanup(() => { clearTimeout(resizeFitTimeout); window.removeEventListener('resize', onResize); });
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
        wireBalanceResize();

        // Subscribe to shared state instead of fetching fresh every mount —
        // refreshSession/refreshWallet only re-hit Supabase if not already loaded.
        const renderFromState = (state) => {
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
        };
        const unsub = onStateChange(renderFromState);
        onCleanup(unsub);

        // onStateChange only fires on FUTURE changes — it doesn't replay the
        // current value to a new subscriber. On the very first visit that's
        // fine because refreshSession/refreshWallet below haven't run yet,
        // so they fetch, state changes, and the callback fires. But on every
        // later visit to Home (e.g. tickets -> home), appState.session and
        // appState.wallet are already cached, so those refresh calls are
        // skipped, no state change ever fires, and the callback above never
        // runs — leaving name/card number/cvv/passport ID/barcode/balance
        // blank until a full page reload. Paint immediately from whatever's
        // already cached so this mount doesn't depend on a change event.
        renderFromState(appState);

        if (!appState.session) await refreshSession();
        if (!appState.wallet) await refreshWallet();
        setupWalletRealtime(); // no-op if already subscribed

        if (appState.wallet?.id) loadRecentTransactions(appState.wallet.id);

        initVibeMeter();
    },

    destroy() {
        cleanup.forEach(fn => fn());
        cleanup = [];
        currentEventId = null;
        lastKnownWalletStatus = null;
        // Note: we deliberately do NOT tear down appState.channels.wallet here —
        // that's app-lifetime, not page-lifetime. See state.js.
    }
};
