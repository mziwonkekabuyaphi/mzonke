import { supabase } from '../../config/supabase.js';
import { loadScriptOnce } from '../js/lazy-load.js';
import { appState, refreshSession, refreshWallet, onStateChange, setupWalletRealtime } from '../js/state.js';

// Same cleanup pattern as pages/home.js / pages/vvip.js / pages/lockers.js /
// pages/shisha.js — every listener, interval, and realtime subscription
// created in init() gets undone in destroy() so nothing leaks or
// double-fires if the user navigates away and back.
let cleanup = [];
const onCleanup = (fn) => cleanup.push(fn);

// Module-scope state below persists across navigate-away-and-back: the
// router's dynamic import() caches the module after its first load, so
// this top-level state survives while the SPA session lives — only
// destroy() runs on unmount, not a full module reload. Other pages'
// comments refer back to this note. That said, ticket/wallet data changes
// often, so init() still refetches fresh rather than trusting stale state.
let currentUser = null, userProfile = null, events = [], selectedEventId = null, currentTicketTypes = [], transferTicketId = null, isPurchasing = false, isWalletBlocked = false, walletBlockReason = '';

// The two libraries the old <head> pulled in via <script src> tags can't
// be loaded that way from a fragment (innerHTML'd <script> tags never
// execute), so they're lazy-loaded on first use instead — same treatment
// as the QR lib in pages/vvip.js.
function loadQrLib() {
    return loadScriptOnce('https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js', () => !!window.QRCode);
}
function loadHtml2Canvas() {
    return loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', () => !!window.html2canvas);
}

const showToast = (message, isError = false) => {
    const toast = document.getElementById('customToast');
    if (toast) {
        toast.textContent = message;
        // Red background for errors, dark for success/info
        toast.style.background = isError ? '#E30613' : '#1a1a2e';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    } else {
        alert(message);
    }
};
function escapeHtml(text) { if (!text) return ''; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function formatDate(dateStr) { if (!dateStr) return 'TBA'; const d = new Date(dateStr); return d.toLocaleDateString('en-ZA', { weekday:'short', day:'numeric', month:'short', year:'numeric' }); }
function formatTime(dateStr) { if (!dateStr) return ''; const d = new Date(dateStr); return d.toLocaleTimeString('en-ZA', { hour:'2-digit', minute:'2-digit' }); }
function isVipTicket(ticketName) { return ticketName && ticketName.toLowerCase().includes('vip'); }
// Matches the "is this event over" logic already used in scanner.html /
// home.html: an event with an end_time is only expired once end_time
// has passed (so it stays visible while live). Only events with no
// end_time at all fall back to expiring at start_time.
// Previously this only checked start_time, so any event that had
// already started — even one still in progress — was hidden here.
function isEventExpired(event) {
    if (!event || !event.start_time) return true;
    const start = new Date(event.start_time);
    if (isNaN(start.getTime())) return true;
    const now = new Date();
    if (event.end_time) {
        const end = new Date(event.end_time);
        if (!isNaN(end.getTime())) return now > end;
    }
    return now > start;
}
function getEventBannerUrl(event) {
    if (!event || !event.image_url) return null;
    if (/^https?:\/\//i.test(event.image_url)) return event.image_url;
    try { const { data } = supabase.storage.from('event-banners').getPublicUrl(event.image_url); return data?.publicUrl || null; }
    catch(e) { return null; }
}
function bannerMarkup(event, eventNameForTag) {
    const url = getEventBannerUrl(event);
    return `<div class="ticket-banner">${url ? `<img src="${url}" alt="${escapeHtml(eventNameForTag || event?.name || 'Event')}" loading="lazy" crossorigin="anonymous" onerror="this.parentElement.innerHTML='<div class=&quot;ticket-banner-fallback&quot;><i class=&quot;fas fa-image&quot;></i></div>'">` : `<div class="ticket-banner-fallback"><i class="fas fa-image"></i></div>`}<div class="ticket-banner-event-name"><i class="fas fa-calendar-alt"></i> ${escapeHtml(eventNameForTag || event?.name || 'Event')}</div></div>`;
}

let confirmResolver = null;
function showConfirmModal(message, title = "Confirm") { return new Promise((resolve) => { confirmResolver = resolve; document.getElementById('confirmModalMessage').innerText = message; document.getElementById('confirmModalTitle').innerHTML = `<i class="fas fa-question-circle"></i> ${title}`; document.getElementById('confirmationModal').classList.add('show'); }); }
function closeConfirmModal(confirmed) { document.getElementById('confirmationModal').classList.remove('show'); if(confirmResolver) { confirmResolver(confirmed); confirmResolver = null; } }

async function initAuth() {
    // home.js (or whichever tab loaded first this session) has usually
    // already populated appState.session/profile via refreshSession() —
    // reuse that instead of re-running the session+profile lookup (which
    // includes the auth_user_id/id fallback and first-login insert; see
    // state.js's refreshSession for that logic) on every visit to Tickets.
    if (!appState.session) await refreshSession();
    if (!appState.session) { showToast('Please log in first', true); setTimeout(() => { window.location.href = '../login.html'; }, 1500); return false; }
    currentUser = appState.session.user;

    if (!appState.profile) {
        showToast('Could not load your account. Please contact support.', true);
        return false;
    }

    // Wallet balance changes often (purchases, top-ups), so still refresh
    // it if nothing has populated it yet this session — but if home.js (or
    // another tab) already has a fresh wallet row cached, reuse it rather
    // than firing a redundant query every time this page mounts.
    if (!appState.wallet) await refreshWallet();
    setupWalletRealtime(); // no-op if the shared channel is already subscribed

    syncFromAppState();
    renderWalletBlockedBanners();
    await updateMyTicketsCount();
    return true;
}

// Mirrors appState.profile/wallet into this page's local variables and
// updates the on-screen balance. Called on initial load and whenever the
// shared appState wallet changes (realtime update, or a purchase made from
// this page), so this page never has to run its own wallet query to stay
// current.
function syncFromAppState() {
    userProfile = { id: appState.profile.id, phone: appState.profile.phone, name: appState.profile.name, wallet_balance: appState.wallet?.balance ?? 0 };
    isWalletBlocked = (appState.wallet?.status || '').toLowerCase() === 'blocked';
    walletBlockReason = appState.wallet?.block_reason || 'Your wallet has been blocked. Please contact support for assistance.';
    document.getElementById('walletBalance').innerText = `R${userProfile.wallet_balance.toLocaleString(undefined, {minimumFractionDigits:2})}`;
}
function renderWalletBlockedBanners() {
    const bannerHtml = isWalletBlocked ? `<div class="wallet-blocked-banner"><i class="fas fa-ban"></i><span>${escapeHtml(walletBlockReason)}</span></div>` : '';
    document.querySelectorAll('.wallet-blocked-banner').forEach(el => el.remove());
    if (!isWalletBlocked) return;
    const eventsPanel = document.getElementById('eventsPanel');
    const myPanel = document.getElementById('myTicketsPanel');
    if (eventsPanel) eventsPanel.insertAdjacentHTML('afterbegin', bannerHtml);
    if (myPanel) myPanel.insertAdjacentHTML('afterbegin', bannerHtml);
}
async function updateMyTicketsCount() { if (!userProfile?.phone) return; const { count } = await supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('customer_phone', userProfile.phone).eq('status', 'issued'); if(count !== undefined) document.getElementById('myTicketsCountStat').textContent = count || 0; }
async function refreshUserBalance() { await refreshWallet(); syncFromAppState(); }

async function loadEvents() {
    const { data, error } = await supabase.from('events').select('*').order('start_time', { ascending: true });
    if (!error) events = data || [];
    document.getElementById('eventsCountStat').textContent = events.length;
    const eventSelect = document.getElementById('eventSelectStore');
    if (!events.length) { eventSelect.innerHTML = '<option>No events</option>'; document.getElementById('ticketsContainerStore').innerHTML = '<div class="empty-state">No upcoming events</div>'; return; }
    const activeEvents = events.filter(ev => !isEventExpired(ev));
    if(activeEvents.length === 0) { eventSelect.innerHTML = '<option>No upcoming events</option>'; document.getElementById('ticketsContainerStore').innerHTML = '<div class="empty-state">All events have ended</div>'; return; }
    eventSelect.innerHTML = activeEvents.map(ev => `<option value="${ev.id}">${escapeHtml(ev.name)} — ${formatDate(ev.start_time)}</option>`).join('');
    eventSelect.disabled = false;
    selectedEventId = activeEvents[0].id;
    eventSelect.value = selectedEventId;
    eventSelect.onchange = (e) => { selectedEventId = e.target.value; renderStoreTickets(); };
    await renderStoreTickets();
}

async function renderStoreTickets() {
    const container = document.getElementById('ticketsContainerStore');
    if (!selectedEventId) return;
    container.innerHTML = '<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>';
    const { data, error } = await supabase.from('ticket_types').select('*').eq('event_id', selectedEventId).order('price');
    if (error || !data?.length) { container.innerHTML = '<div class="empty-state">No ticket types available</div>'; return; }
    currentTicketTypes = data;
    const currentEvent = events.find(ev => ev.id === selectedEventId);
    const banner = bannerMarkup(currentEvent);
    container.innerHTML = currentTicketTypes.map(tt => { const remaining = Math.max(0, (tt.capacity || 0) - (tt.sold || 0)); const soldOut = remaining <= 0; const isVip = isVipTicket(tt.name); const disabled = soldOut || isWalletBlocked; const btnLabel = isWalletBlocked ? '<i class="fas fa-ban"></i> Wallet Blocked' : (soldOut ? 'Sold Out' : '<i class="fas fa-ticket-alt"></i> Get Tickets'); return `<div class="ticket-card">${isVip ? `<div class="vip-ribbon"><i class="fas fa-crown"></i> VIP</div>` : ''}${banner}<div class="ticket-header"><div class="ticket-type">${escapeHtml(tt.name)}${isVip ? ' <i class="fas fa-gem" style="color:#FFD700;"></i>' : ''}</div><div class="ticket-price">R${Number(tt.price).toLocaleString()}</div><div class="ticket-desc">${soldOut ? 'SOLD OUT' : `${remaining} left`}</div></div><div class="ticket-body"><button class="buy-btn purchase-btn" data-type-id="${tt.id}" data-price="${tt.price}" ${disabled ? 'disabled' : ''}>${btnLabel}</button></div></div>`; }).join('');
    document.querySelectorAll('.purchase-btn:not(:disabled)').forEach(btn => btn.addEventListener('click', async (e) => { if(isPurchasing) return; const typeId = btn.dataset.typeId; const price = parseFloat(btn.dataset.price); await purchaseTicket(typeId, price); }));
}

async function purchaseTicket(ticketTypeId, price) {
    if(isWalletBlocked) { showToast(walletBlockReason, true); return; }
    if(isPurchasing || !userProfile || userProfile.wallet_balance < price) { if(userProfile?.wallet_balance < price) showToast(`Insufficient balance. Need R${price.toLocaleString()}`, true); return; }
    const confirmed = await showConfirmModal(`Buy this ticket for R${price.toLocaleString()}?`, "Confirm Purchase");
    if(!confirmed) return;
    const btn = document.querySelector(`.purchase-btn[data-type-id="${ticketTypeId}"]`);
    if(btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Processing...'; }
    isPurchasing = true;
    const { error } = await supabase.rpc('purchase_ticket', { p_user_id: userProfile.id, p_ticket_type_id: ticketTypeId });
    if(error) showToast(error.message.includes('Insufficient') ? 'Insufficient wallet balance' : error.message.includes('sold out') ? 'Sold out' : 'Purchase failed', true);
    else { showToast('✅ Ticket purchased!'); await refreshUserBalance(); await renderStoreTickets(); await updateMyTicketsCount(); if(document.getElementById('myTicketsTabBtn').classList.contains('active')) await renderMyTicketsFull(); }
    isPurchasing = false;
    if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-ticket-alt"></i> Get Tickets'; }
}

async function renderMyTicketsFull() {
    const container = document.getElementById('myTicketsListFull');
    container.innerHTML = '<div class="skeleton skeleton-card"></div>';
    const { data, error } = await supabase.from('tickets').select(`id, qr_token, ticket_number, issued_at, status, event_id, ticket_type_id, customer_phone, ticket_types(name, price), events(name, start_time, location, image_url)`).eq('customer_phone', userProfile.phone).order('issued_at', { ascending: false });
    if(error || !data?.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-ticket-alt"></i><p>You have no tickets yet.<br>Buy one from the store!</p></div>'; return; }
    container.innerHTML = '';
    await loadQrLib();
    for(const ticket of data) {
        const event = ticket.events || {}, ticketType = ticket.ticket_types || {};
        const eventDate = event.start_time ? formatDate(event.start_time) + ' · ' + formatTime(event.start_time) : 'Date TBA';
        const statusClass = ticket.status === 'used' ? 'used' : (ticket.status === 'cancelled' ? 'cancelled' : '');
        const statusLabel = ticket.status === 'used' ? 'Used' : (ticket.status === 'cancelled' ? 'Cancelled' : 'Valid');
        const isVip = isVipTicket(ticketType.name);
        const banner = bannerMarkup(event, event.name);
        const canTransfer = ticket.status !== 'cancelled' && !isWalletBlocked;
        const card = document.createElement('div'); card.className = 'ticket-card-wallet'; card.setAttribute('data-ticket-id', ticket.id);
        card.innerHTML = `${isVip ? `<div class="vip-ribbon"><i class="fas fa-crown"></i> VIP</div>` : ''}${banner}<div class="ticket-header-wallet"><div class="event-name-tag">${escapeHtml(event.name || 'Event')}</div><div class="ticket-title">${escapeHtml(ticketType.name || 'Ticket')}</div><div style="font-size:0.7rem; color:rgba(255,255,255,0.9);">R${Number(ticketType.price || 0).toLocaleString()}</div></div><div class="wallet-body"><div class="wallet-detail-row"><i class="fas fa-calendar-alt"></i> ${escapeHtml(eventDate)}</div><div class="wallet-detail-row"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(event.location || 'Venue TBA')}</div><div class="wallet-detail-row"><i class="fas fa-phone"></i> ${escapeHtml(ticket.customer_phone)}</div><div class="wallet-detail-row"><i class="fas fa-clock"></i> Issued ${formatDate(ticket.issued_at)}</div><div class="wallet-detail-row"><span><i class="fas fa-info-circle"></i> Status</span><span class="status-pill ${statusClass}">${statusLabel}</span></div><div class="ticket-actions">${canTransfer ? `<button class="ticket-action-btn transfer-ticket" data-id="${ticket.id}"><i class="fas fa-paper-plane"></i> Send</button>` : ''}<button class="ticket-action-btn download-ticket-full" data-id="${ticket.id}"><i class="fas fa-download"></i> Download Ticket</button></div></div><div class="qr-section"><div id="qr-${ticket.id}" class="qr-container"></div><div style="font-size:0.7rem; margin-top:8px;">Ticket Number: ${escapeHtml(ticket.ticket_number || ticket.id.slice(0,8).toUpperCase())}</div></div><div class="ticket-footer-wallet"><span><i class="fas fa-qrcode"></i> Scan for entry</span><span>${statusLabel}</span></div>`;
        container.appendChild(card);
        const qrDiv = document.getElementById(`qr-${ticket.id}`);
        if(qrDiv && window.QRCode) new QRCode(qrDiv, { text: JSON.stringify({ ticket_id: ticket.id, qr_token: ticket.qr_token, event_id: ticket.event_id }), width: 220, height: 220 });
    }
    attachTicketActions();
}

function attachTicketActions() {
    document.querySelectorAll('.transfer-ticket').forEach(btn => { btn.removeEventListener('click', handleTransfer); btn.addEventListener('click', handleTransfer); });
    document.querySelectorAll('.download-ticket-full').forEach(btn => { btn.removeEventListener('click', handleFullDownload); btn.addEventListener('click', handleFullDownload); });
}
function handleTransfer(e) { if(isWalletBlocked) { showToast(walletBlockReason, true); return; } transferTicketId = e.currentTarget.dataset.id; document.getElementById('transferModal').classList.add('show'); }
async function handleFullDownload(e) {
    const ticketId = e.currentTarget.dataset.id;
    const ticketEl = document.querySelector(`.ticket-card-wallet[data-ticket-id="${ticketId}"]`);
    if(!ticketEl) return;

    await loadHtml2Canvas();

    // Clone the ticket element for export
    const clone = ticketEl.cloneNode(true);
    clone.classList.add('export-ticket-template');
    clone.style.position = 'absolute';
    clone.style.top = '-9999px';
    clone.style.left = '-9999px';
    clone.style.width = '400px';
    clone.style.background = 'white';
    clone.style.borderRadius = '24px';
    clone.style.boxShadow = 'none';

    // Remove any action buttons from clone
    const actionButtons = clone.querySelectorAll('.ticket-actions, .ticket-action-btn, .transfer-ticket, .download-ticket-full');
    actionButtons.forEach(btn => btn.remove());

    // Force every image in the clone (banner, logo, etc.) to load eagerly
    // and re-fetch with CORS enabled — a cloned <img loading="lazy">
    // sitting off-screen may never actually load in time for html2canvas
    // to capture it, and without crossorigin the banner image (served
    // from Supabase Storage) taints the canvas and makes toDataURL()
    // throw, silently killing the whole download.
    const images = Array.from(clone.querySelectorAll('img'));
    const imageLoadPromises = images.map(img => new Promise(resolve => {
        img.loading = 'eager';
        if(!img.crossOrigin) img.crossOrigin = 'anonymous';
        if(img.complete && img.naturalWidth > 0) { resolve(); return; }
        const src = img.src;
        img.onload = () => resolve();
        img.onerror = () => resolve(); // don't let a broken image block the download
        img.src = src; // re-trigger load with crossOrigin now set
    }));

    document.body.appendChild(clone);
    try {
        await Promise.all(imageLoadPromises);
        const canvas = await html2canvas(clone, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
        const link = document.createElement('a');
        link.download = `ticket_${ticketId}.png`;
        link.href = canvas.toDataURL();
        link.click();
        showToast('Ticket downloaded as PNG');
    } catch(err) {
        console.error('[download] Ticket PNG export failed', err);
        showToast('Download failed', true);
    } finally {
        document.body.removeChild(clone);
    }
}

async function transferTicketToPhone(ticketId, targetPhone) {
    if(isWalletBlocked) { showToast(walletBlockReason, true); return false; }
    let digits = targetPhone.replace(/\D/g, '');
    if(digits.startsWith('0')) digits = '27' + digits.slice(1);
    // Canonical form matches what profiles.phone / tickets.customer_phone
    // store in the DB (no leading '+') and what transfer_ticket's own
    // normalisation produces — see that function's comment for why the
    // '+' prefix was removed here too.
    const finalPhone = digits;
    if(finalPhone === userProfile.phone) { showToast('Cannot transfer to yourself', true); return false; }
    const { error } = await supabase.rpc('transfer_ticket', { p_ticket_id: ticketId, p_from_user_id: userProfile.id, p_to_phone: finalPhone });
    if(error) { showToast(error.message, true); return false; }
    showToast('Ticket transferred'); await renderMyTicketsFull(); await updateMyTicketsCount(); return true;
}

function switchTab(tab) {
    const eventsPanel = document.getElementById('eventsPanel'), myPanel = document.getElementById('myTicketsPanel');
    const eventsBtn = document.getElementById('eventsTabBtn'), myBtn = document.getElementById('myTicketsTabBtn');
    if(tab === 'events') { eventsPanel.style.display = 'block'; myPanel.style.display = 'none'; eventsBtn.classList.add('active'); myBtn.classList.remove('active'); if(events.length) renderStoreTickets(); else loadEvents(); }
    else { eventsPanel.style.display = 'none'; myPanel.style.display = 'block'; eventsBtn.classList.remove('active'); myBtn.classList.add('active'); renderMyTicketsFull(); }
}

function wireStaticListeners() {
    const bind = (id, evt, fn) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener(evt, fn);
        onCleanup(() => el.removeEventListener(evt, fn));
    };
    bind('eventsTabBtn', 'click', () => switchTab('events'));
    bind('myTicketsTabBtn', 'click', () => switchTab('myTickets'));
    bind('closeTransferModal', 'click', () => document.getElementById('transferModal').classList.remove('show'));
    bind('cancelTransferBtn', 'click', () => document.getElementById('transferModal').classList.remove('show'));
    bind('confirmTransferBtn', 'click', async () => { const phone = document.getElementById('transferPhone').value.trim(); if(phone && transferTicketId) { await transferTicketToPhone(transferTicketId, phone); document.getElementById('transferModal').classList.remove('show'); } else showToast('Enter phone number', true); });
    bind('closeConfirmModal', 'click', () => closeConfirmModal(false));
    bind('confirmModalCancelBtn', 'click', () => closeConfirmModal(false));
    bind('confirmModalConfirmBtn', 'click', () => closeConfirmModal(true));
    // homeIconBtn / .brand navigate via data-link in the fragment — the
    // router's global click delegation handles those, no JS needed here.
    // (Original page had a manual `homeIconBtn.addEventListener('click', () =>
    // window.location.href = 'home.html')` — removed, router replaces it.)
}

export default {
    async init() {
        if (!(await initAuth())) return;
        await loadEvents();
        wireStaticListeners();

        // state.js's setupWalletRealtime() (called in initAuth above) keeps
        // appState.wallet current; just mirror it into this page whenever it
        // changes, instead of opening a second Supabase realtime channel for
        // the same wallet row.
        onCleanup(onStateChange(() => {
            syncFromAppState();
            renderWalletBlockedBanners();
        }));
    },

    destroy() {
        cleanup.forEach(fn => fn());
        cleanup = [];
    }
};
