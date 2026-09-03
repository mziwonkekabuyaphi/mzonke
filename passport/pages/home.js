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

// ===== CARD ARTWORK (decorative pattern regenerated with each color randomize) =====
// Ported from the old app's addLuxuryCardArtwork IIFE. Requires the same
// .card-artwork CSS rule the old home.css already defines (absolute-positioned,
// pointer-events:none overlay inside each card face) — carry that CSS rule
// over if this SPA's stylesheet doesn't already have it.
function generateRandomArtworkSVG() {
    const viewBox = "0 0 100 100";
    const elements = [];
    const count = Math.floor(Math.random() * 8) + 5;
    const palettes = ['rgba(255,255,255,0.2)', 'rgba(255,215,0,0.25)', 'rgba(227,6,19,0.2)', 'rgba(255,255,255,0.35)', 'rgba(255,180,40,0.2)', 'rgba(200,220,255,0.15)'];
    for (let i = 0; i < count; i++) {
        const cx = Math.random() * 100, cy = Math.random() * 100, rx = Math.random() * 18 + 6, ry = Math.random() * 14 + 4;
        const strokeColor = palettes[Math.floor(Math.random() * palettes.length)], strokeWidth = Math.random() * 1.5 + 0.6, rotate = Math.random() * 360;
        const fill = Math.random() > 0.7 ? 'rgba(255,255,255,0.05)' : 'none';
        elements.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rotate} ${cx} ${cy})" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="${fill}" stroke-linecap="round" />`);
    }
    for (let i = 0; i < 4; i++) {
        const cx = Math.random() * 100, cy = Math.random() * 100, r = Math.random() * 20 + 10;
        const start = Math.random() * 360, end = start + 60 + Math.random() * 120;
        elements.push(`<path d="M ${cx + r * Math.cos(start * Math.PI / 180)} ${cy + r * Math.sin(start * Math.PI / 180)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(end * Math.PI / 180)} ${cy + r * Math.sin(end * Math.PI / 180)}" stroke="rgba(255,255,255,0.25)" stroke-width="1.2" fill="none" />`);
    }
    for (let i = 0; i < 12; i++) {
        const cx = Math.random() * 100, cy = Math.random() * 100;
        elements.push(`<circle cx="${cx}" cy="${cy}" r="${Math.random() * 1.5 + 0.5}" fill="rgba(255,215,0,0.4)" />`);
    }
    return `<svg viewBox="${viewBox}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${elements.join('')}</svg>`;
}
function getArtworkContainer(parent) {
    let container = parent.querySelector('.card-artwork');
    if (!container) {
        container = document.createElement('div');
        container.className = 'card-artwork';
        parent.insertBefore(container, parent.firstChild);
    }
    return container;
}
function refreshCardArtwork() {
    const front = $('cardFront'), back = $('cardBack');
    if (front) getArtworkContainer(front).innerHTML = generateRandomArtworkSVG();
    if (back) getArtworkContainer(back).innerHTML = generateRandomArtworkSVG();
}

// ===== CARD COLOR RANDOMIZE (ported from old app's randomizeCardColors) =====
function randomFrontGradient() {
    const hue1 = Math.floor(Math.random() * 360);
    const hue2 = (hue1 + 40 + Math.random() * 100) % 360;
    const hue3 = (hue2 + 30 + Math.random() * 80) % 360;
    const hue4 = (hue1 + 180) % 360;
    const hue5 = (hue2 + 210) % 360;
    const sat1 = 60 + Math.random() * 32;
    const sat2 = 55 + Math.random() * 32;
    const sat3 = 60 + Math.random() * 28;
    const lit1 = 25 + Math.random() * 28;
    const lit2 = 20 + Math.random() * 22;
    const lit3 = 15 + Math.random() * 24;
    return `linear-gradient(135deg, hsl(${hue1}, ${sat1}%, ${lit1}%) 0%, hsl(${hue2}, ${sat2}%, ${lit2}%) 25%, hsl(${hue3}, ${sat3}%, ${lit3}%) 50%, hsl(${hue4}, ${sat1 - 10}%, ${lit1 - 5}%) 75%, hsl(${hue5}, ${sat2 - 5}%, ${lit2 - 4}%) 100%)`;
}
function randomBackGradient() {
    const hueA = Math.floor(Math.random() * 360);
    const hueB = (hueA + 50) % 360;
    const hueC = (hueB + 70) % 360;
    return `linear-gradient(135deg, hsl(${hueA}, 68%, 10%) 0%, hsl(${hueB}, 62%, 16%) 30%, hsl(${hueC}, 72%, 8%) 55%, hsl(${(hueA + 120) % 360}, 68%, 12%) 80%, hsl(${(hueB + 90) % 360}, 65%, 6%) 100%)`;
}
function randomizeCardColors(cardStage, cardFront, cardBack) {
    if (!cardFront || !cardBack) return;
    cardFront.style.background = randomFrontGradient();
    cardBack.style.background = randomBackGradient();
    refreshCardArtwork();
    if (window.navigator?.vibrate) window.navigator.vibrate(30);
    if (cardStage) {
        cardStage.style.filter = 'drop-shadow(0 0 12px rgba(220, 60, 80, 0.8))';
        setTimeout(() => { cardStage.style.filter = ''; }, 200);
    }
    // Requires the same .card-burst CSS (a ring element + .play keyframe
    // animation) the old home.css defines — carry that rule over too.
    const burstElem = $('cardBurst');
    if (burstElem) {
        burstElem.classList.remove('play');
        void burstElem.offsetWidth;
        burstElem.classList.add('play');
    }
}

// ===== FLIP HINT =====
// One-time visual nudge that the card can be tapped. Shown once per device
// (localStorage-gated), auto-dismisses after 5s or on first flip — whichever
// comes first. Deliberately says nothing about the long-press color easter
// egg, so that stays a discovery rather than a hint.
function showFlipHint(cardStage) {
    if (localStorage.getItem('cardFlipHintSeen')) return null;

    const hint = document.createElement('div');
    hint.className = 'card-flip-hint';
    hint.textContent = 'Tap the card to flip ↻';
    hint.style.cssText = 'position:absolute;bottom:-26px;left:50%;transform:translateX(-50%);' +
        'font-size:12px;color:rgba(255,255,255,0.65);white-space:nowrap;pointer-events:none;' +
        'transition:opacity 0.4s ease;z-index:5;opacity:1;';

    if (!cardStage.style.position) cardStage.style.position = 'relative';
    cardStage.appendChild(hint);

    let dismissed = false;
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        hint.style.opacity = '0';
        setTimeout(() => hint.remove(), 400);
        localStorage.setItem('cardFlipHintSeen', 'true');
    };
    const autoHideTimer = setTimeout(dismiss, 5000);

    return () => { clearTimeout(autoHideTimer); dismiss(); };
}

function wireCardFlip() {
    const cardStage = $('cardStage');
    const flipper = $('cardFlipper');
    if (!cardStage || !flipper) return;

    let flipped = false;
    let dismissHint = () => {};

    // --- Tap to flip ---
    const onClick = (e) => {
        e.stopPropagation();
        flipped = !flipped;
        cardStage.classList.toggle('flipped', flipped);
        dismissHint();
    };
    cardStage.addEventListener('click', onClick);
    onCleanup(() => cardStage.removeEventListener('click', onClick));

    dismissHint = showFlipHint(cardStage) || dismissHint;
    onCleanup(() => dismissHint());

    // --- Pointer-tilt / parallax sheen (ported from old app) ---
    const onPointerMove = (e) => {
        const rect = cardStage.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * 100;
        const py = ((e.clientY - rect.top) / rect.height) * 100;
        cardStage.style.setProperty('--mx', px + '%');
        cardStage.style.setProperty('--my', py + '%');
        if (flipped) return;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / (rect.width / 2);
        const dy = (e.clientY - cy) / (rect.height / 2);
        flipper.style.transform = `rotateY(${dx * 8}deg) rotateX(${-dy * 6}deg)`;
    };
    const onPointerLeave = () => {
        cardStage.style.setProperty('--mx', '50%');
        cardStage.style.setProperty('--my', '35%');
        if (flipped) return;
        flipper.style.transform = '';
    };
    cardStage.addEventListener('pointermove', onPointerMove);
    cardStage.addEventListener('pointerleave', onPointerLeave);
    onCleanup(() => {
        cardStage.removeEventListener('pointermove', onPointerMove);
        cardStage.removeEventListener('pointerleave', onPointerLeave);
    });

    // --- Long-press to randomize card colors (ported from old app) ---
    const cardFront = $('cardFront');
    const cardBack = $('cardBack');
    let pressTimer = null;

    const startLongPress = () => {
        if (flipped) return;
        pressTimer = setTimeout(() => {
            randomizeCardColors(cardStage, cardFront, cardBack);
            cardStage.classList.add('long-press-active');
            setTimeout(() => cardStage.classList.remove('long-press-active'), 280);
        }, 380);
    };
    const cancelLongPress = () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        cardStage.classList.remove('long-press-active');
    };

    cardStage.addEventListener('mousedown', startLongPress);
    cardStage.addEventListener('mouseup', cancelLongPress);
    cardStage.addEventListener('mouseleave', cancelLongPress);
    cardStage.addEventListener('touchstart', startLongPress, { passive: false });
    cardStage.addEventListener('touchend', cancelLongPress);
    cardStage.addEventListener('touchcancel', cancelLongPress);
    onCleanup(() => {
        cancelLongPress();
        cardStage.removeEventListener('mousedown', startLongPress);
        cardStage.removeEventListener('mouseup', cancelLongPress);
        cardStage.removeEventListener('mouseleave', cancelLongPress);
        cardStage.removeEventListener('touchstart', startLongPress);
        cardStage.removeEventListener('touchend', cancelLongPress);
        cardStage.removeEventListener('touchcancel', cancelLongPress);
    });

    // --- Initial decorative artwork on both faces ---
    refreshCardArtwork();
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
