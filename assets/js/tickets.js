// ============================================================
// tickets.js – all client-side logic for Ticket Wallet
// ============================================================

import { supabase } from '../../config/supabase.js';

// ----- Constants -----
// (no additional constants needed beyond imported supabase)

// ----- DOM Elements -----
const toastEl = document.getElementById('customToast');
const walletBalanceEl = document.getElementById('walletBalance');
const eventsCountStatEl = document.getElementById('eventsCountStat');
const myTicketsCountStatEl = document.getElementById('myTicketsCountStat');
const eventSelectStore = document.getElementById('eventSelectStore');
const ticketsContainerStore = document.getElementById('ticketsContainerStore');
const myTicketsListFull = document.getElementById('myTicketsListFull');
const eventsPanel = document.getElementById('eventsPanel');
const myTicketsPanel = document.getElementById('myTicketsPanel');
const eventsTabBtn = document.getElementById('eventsTabBtn');
const myTicketsTabBtn = document.getElementById('myTicketsTabBtn');
const homeIconBtn = document.getElementById('homeIconBtn');
const transferModal = document.getElementById('transferModal');
const closeTransferModal = document.getElementById('closeTransferModal');
const cancelTransferBtn = document.getElementById('cancelTransferBtn');
const confirmTransferBtn = document.getElementById('confirmTransferBtn');
const transferPhone = document.getElementById('transferPhone');
const transferStatus = document.getElementById('transferStatus');
const confirmationModal = document.getElementById('confirmationModal');
const closeConfirmModal = document.getElementById('closeConfirmModal');
const confirmModalCancelBtn = document.getElementById('confirmModalCancelBtn');
const confirmModalConfirmBtn = document.getElementById('confirmModalConfirmBtn');
const confirmModalMessage = document.getElementById('confirmModalMessage');
const confirmModalTitle = document.getElementById('confirmModalTitle');

// ----- State -----
let currentUser = null;
let userProfile = null;
let events = [];
let selectedEventId = null;
let currentTicketTypes = [];
let transferTicketId = null;
let isPurchasing = false;
let isWalletBlocked = false;
let walletBlockReason = '';
let confirmResolver = null;

// ----- Utilities -----
function showToast(message, isError = false) {
    if (toastEl) {
        toastEl.textContent = message;
        toastEl.style.background = isError ? '#E30613' : '#1a1a2e';
        toastEl.classList.add('show');
        setTimeout(() => toastEl.classList.remove('show'), 3000);
    } else {
        alert(message);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return 'TBA';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

function isVipTicket(ticketName) {
    return ticketName && ticketName.toLowerCase().includes('vip');
}

function isEventExpired(eventDateStr) {
    if (!eventDateStr) return true;
    return new Date(eventDateStr) < new Date();
}

function getEventBannerUrl(event) {
    if (!event || !event.image_url) return null;
    if (/^https?:\/\//i.test(event.image_url)) return event.image_url;
    try {
        const { data } = supabase.storage.from('event-banners').getPublicUrl(event.image_url);
        return data?.publicUrl || null;
    } catch (e) {
        return null;
    }
}

function bannerMarkup(event, eventNameForTag) {
    const url = getEventBannerUrl(event);
    return `<div class="ticket-banner">${
        url
            ? `<img src="${url}" alt="${escapeHtml(eventNameForTag || event?.name || 'Event')}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=&quot;ticket-banner-fallback&quot;><i class=&quot;fas fa-image&quot;></i></div>'">`
            : `<div class="ticket-banner-fallback"><i class="fas fa-image"></i></div>`
    }<div class="ticket-banner-event-name"><i class="fas fa-calendar-alt"></i> ${escapeHtml(eventNameForTag || event?.name || 'Event')}</div></div>`;
}

function showConfirmModal(message, title = "Confirm") {
    return new Promise((resolve) => {
        confirmResolver = resolve;
        confirmModalMessage.innerText = message;
        confirmModalTitle.innerHTML = `<i class="fas fa-question-circle"></i> ${title}`;
        confirmationModal.classList.add('show');
    });
}

function closeConfirmModalFn(confirmed) {
    confirmationModal.classList.remove('show');
    if (confirmResolver) {
        confirmResolver(confirmed);
        confirmResolver = null;
    }
}

// ----- API / Supabase Functions -----
async function initAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        showToast('Please log in first', true);
        setTimeout(() => { window.location.href = '../login.html'; }, 1500);
        return false;
    }
    currentUser = session.user;
    let { data: profile } = await supabase.from('profiles').select('phone, name').eq('id', currentUser.id).maybeSingle();
    if (!profile) {
        const { data: newProfile } = await supabase.from('profiles').insert({
            id: currentUser.id,
            name: currentUser.user_metadata?.full_name || 'User',
            email: currentUser.email,
            phone: currentUser.user_metadata?.phone || '',
            role: 'customer'
        }).select('phone, name').single();
        profile = newProfile;
    }
    const { data: wallet } = await supabase.from('wallets').select('balance, status, block_reason').eq('user_id', currentUser.id).maybeSingle();
    userProfile = {
        phone: profile.phone,
        name: profile.name,
        wallet_balance: wallet?.balance ?? 0
    };
    isWalletBlocked = (wallet?.status || '').toLowerCase() === 'blocked';
    walletBlockReason = wallet?.block_reason || 'Your wallet has been blocked. Please contact support for assistance.';
    walletBalanceEl.innerText = `R${userProfile.wallet_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    renderWalletBlockedBanners();
    await updateMyTicketsCount();
    return true;
}

function renderWalletBlockedBanners() {
    const bannerHtml = isWalletBlocked
        ? `<div class="wallet-blocked-banner"><i class="fas fa-ban"></i><span>${escapeHtml(walletBlockReason)}</span></div>`
        : '';
    document.querySelectorAll('.wallet-blocked-banner').forEach(el => el.remove());
    if (!isWalletBlocked) return;
    if (eventsPanel) eventsPanel.insertAdjacentHTML('afterbegin', bannerHtml);
    if (myTicketsPanel) myTicketsPanel.insertAdjacentHTML('afterbegin', bannerHtml);
}

async function updateMyTicketsCount() {
    if (!userProfile?.phone) return;
    const { count } = await supabase.from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('customer_phone', userProfile.phone)
        .eq('status', 'issued');
    if (count !== undefined) myTicketsCountStatEl.textContent = count || 0;
}

async function refreshUserBalance() {
    const { data: wallet } = await supabase.from('wallets').select('balance').eq('user_id', currentUser.id).maybeSingle();
    if (wallet) {
        userProfile.wallet_balance = wallet.balance;
        walletBalanceEl.innerText = `R${wallet.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }
}

async function loadEvents() {
    const { data, error } = await supabase.from('events').select('*').order('start_time', { ascending: true });
    if (!error) events = data || [];
    eventsCountStatEl.textContent = events.length;
    if (!events.length) {
        eventSelectStore.innerHTML = '<option>No events</option>';
        ticketsContainerStore.innerHTML = '<div class="empty-state">No upcoming events</div>';
        return;
    }
    const activeEvents = events.filter(ev => !isEventExpired(ev.start_time));
    if (activeEvents.length === 0) {
        eventSelectStore.innerHTML = '<option>No upcoming events</option>';
        ticketsContainerStore.innerHTML = '<div class="empty-state">All events have ended</div>';
        return;
    }
    eventSelectStore.innerHTML = activeEvents.map(ev =>
        `<option value="${ev.id}">${escapeHtml(ev.name)} — ${formatDate(ev.start_time)}</option>`
    ).join('');
    eventSelectStore.disabled = false;
    selectedEventId = activeEvents[0].id;
    eventSelectStore.value = selectedEventId;
    eventSelectStore.onchange = (e) => {
        selectedEventId = e.target.value;
        renderStoreTickets();
    };
    await renderStoreTickets();
}

async function renderStoreTickets() {
    if (!selectedEventId) return;
    ticketsContainerStore.innerHTML = '<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>';
    const { data, error } = await supabase.from('ticket_types').select('*').eq('event_id', selectedEventId).order('price');
    if (error || !data?.length) {
        ticketsContainerStore.innerHTML = '<div class="empty-state">No ticket types available</div>';
        return;
    }
    currentTicketTypes = data;
    const currentEvent = events.find(ev => ev.id === selectedEventId);
    const banner = bannerMarkup(currentEvent);
    ticketsContainerStore.innerHTML = currentTicketTypes.map(tt => {
        const remaining = Math.max(0, (tt.capacity || 0) - (tt.sold || 0));
        const soldOut = remaining <= 0;
        const isVip = isVipTicket(tt.name);
        const disabled = soldOut || isWalletBlocked;
        const btnLabel = isWalletBlocked
            ? '<i class="fas fa-ban"></i> Wallet Blocked'
            : (soldOut ? 'Sold Out' : '<i class="fas fa-ticket-alt"></i> Get Tickets');
        return `<div class="ticket-card">${
            isVip ? `<div class="vip-ribbon"><i class="fas fa-crown"></i> VIP</div>` : ''
        }${banner}<div class="ticket-header"><div class="ticket-type">${escapeHtml(tt.name)}${
            isVip ? ' <i class="fas fa-gem" style="color:#FFD700;"></i>' : ''
        }</div><div class="ticket-price">R${Number(tt.price).toLocaleString()}</div><div class="ticket-desc">${
            soldOut ? 'SOLD OUT' : `${remaining} left`
        }</div></div><div class="ticket-body"><button class="buy-btn purchase-btn" data-type-id="${tt.id}" data-price="${tt.price}" ${
            disabled ? 'disabled' : ''
        }>${btnLabel}</button></div></div>`;
    }).join('');
    document.querySelectorAll('.purchase-btn:not(:disabled)').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (isPurchasing) return;
            const typeId = btn.dataset.typeId;
            const price = parseFloat(btn.dataset.price);
            await purchaseTicket(typeId, price);
        });
    });
}

async function purchaseTicket(ticketTypeId, price) {
    if (isWalletBlocked) {
        showToast(walletBlockReason, true);
        return;
    }
    if (isPurchasing || !userProfile || userProfile.wallet_balance < price) {
        if (userProfile?.wallet_balance < price) showToast(`Insufficient balance. Need R${price.toLocaleString()}`, true);
        return;
    }
    const confirmed = await showConfirmModal(`Buy this ticket for R${price.toLocaleString()}?`, "Confirm Purchase");
    if (!confirmed) return;
    const btn = document.querySelector(`.purchase-btn[data-type-id="${ticketTypeId}"]`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Processing...';
    }
    isPurchasing = true;
    const { error } = await supabase.rpc('purchase_ticket', {
        p_user_id: currentUser.id,
        p_ticket_type_id: ticketTypeId
    });
    if (error) {
        showToast(error.message.includes('Insufficient') ? 'Insufficient wallet balance' :
                  error.message.includes('sold out') ? 'Sold out' : 'Purchase failed', true);
    } else {
        showToast('✅ Ticket purchased!');
        await refreshUserBalance();
        await renderStoreTickets();
        await updateMyTicketsCount();
        if (myTicketsTabBtn.classList.contains('active')) await renderMyTicketsFull();
    }
    isPurchasing = false;
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-ticket-alt"></i> Get Tickets';
    }
}

async function renderMyTicketsFull() {
    myTicketsListFull.innerHTML = '<div class="skeleton skeleton-card"></div>';
    const { data, error } = await supabase.from('tickets')
        .select(`id, qr_token, issued_at, status, event_id, ticket_type_id, customer_phone, ticket_types(name, price), events(name, start_time, location, image_url)`)
        .eq('customer_phone', userProfile.phone)
        .order('issued_at', { ascending: false });
    if (error || !data?.length) {
        myTicketsListFull.innerHTML = '<div class="empty-state"><i class="fas fa-ticket-alt"></i><p>You have no tickets yet.<br>Buy one from the store!</p></div>';
        return;
    }
    myTicketsListFull.innerHTML = '';
    for (const ticket of data) {
        const event = ticket.events || {};
        const ticketType = ticket.ticket_types || {};
        const eventDate = event.start_time ? formatDate(event.start_time) + ' · ' + formatTime(event.start_time) : 'Date TBA';
        const statusClass = ticket.status === 'used' ? 'used' : (ticket.status === 'cancelled' ? 'cancelled' : '');
        const statusLabel = ticket.status === 'used' ? 'Used' : (ticket.status === 'cancelled' ? 'Cancelled' : 'Valid');
        const isVip = isVipTicket(ticketType.name);
        const banner = bannerMarkup(event, event.name);
        const canTransfer = ticket.status !== 'cancelled' && !isWalletBlocked;
        const card = document.createElement('div');
        card.className = 'ticket-card-wallet';
        card.setAttribute('data-ticket-id', ticket.id);
        card.innerHTML = `${isVip ? `<div class="vip-ribbon"><i class="fas fa-crown"></i> VIP</div>` : ''}${
            banner
        }<div class="ticket-header-wallet"><div class="event-name-tag">${escapeHtml(event.name || 'Event')}</div><div class="ticket-title">${escapeHtml(ticketType.name || 'Ticket')}</div><div style="font-size:0.7rem; color:rgba(255,255,255,0.9);">R${Number(ticketType.price || 0).toLocaleString()}</div></div><div class="wallet-body"><div class="wallet-detail-row"><i class="fas fa-calendar-alt"></i> ${escapeHtml(eventDate)}</div><div class="wallet-detail-row"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(event.location || 'Venue TBA')}</div><div class="wallet-detail-row"><i class="fas fa-phone"></i> ${escapeHtml(ticket.customer_phone)}</div><div class="wallet-detail-row"><i class="fas fa-clock"></i> Issued ${formatDate(ticket.issued_at)}</div><div class="wallet-detail-row"><span><i class="fas fa-info-circle"></i> Status</span><span class="status-pill ${statusClass}">${statusLabel}</span></div><div class="ticket-actions">${
            canTransfer ? `<button class="ticket-action-btn transfer-ticket" data-id="${ticket.id}"><i class="fas fa-paper-plane"></i> Send</button>` : ''
        }<button class="ticket-action-btn download-ticket-full" data-id="${ticket.id}"><i class="fas fa-download"></i> Download Ticket</button></div></div><div class="qr-section"><div id="qr-${ticket.id}" class="qr-container"></div><div style="font-size:0.7rem; margin-top:8px;">Ticket ID: ${ticket.id.slice(0,8)}...</div></div><div class="ticket-footer-wallet"><span><i class="fas fa-qrcode"></i> Scan for entry</span><span>${statusLabel}</span></div>`;
        myTicketsListFull.appendChild(card);
        const qrDiv = document.getElementById(`qr-${ticket.id}`);
        if (qrDiv && window.QRCode) {
            new QRCode(qrDiv, {
                text: JSON.stringify({ ticket_id: ticket.id, qr_token: ticket.qr_token, event_id: ticket.event_id }),
                width: 260,
                height: 260,
                correctLevel: QRCode.CorrectLevel.M
            });
        }
    }
    attachTicketActions();
}

function attachTicketActions() {
    document.querySelectorAll('.transfer-ticket').forEach(btn => {
        btn.removeEventListener('click', handleTransfer);
        btn.addEventListener('click', handleTransfer);
    });
    document.querySelectorAll('.download-ticket-full').forEach(btn => {
        btn.removeEventListener('click', handleFullDownload);
        btn.addEventListener('click', handleFullDownload);
    });
}

function handleTransfer(e) {
    if (isWalletBlocked) {
        showToast(walletBlockReason, true);
        return;
    }
    transferTicketId = e.currentTarget.dataset.id;
    transferModal.classList.add('show');
}

async function handleFullDownload(e) {
    const ticketId = e.currentTarget.dataset.id;
    const ticketEl = document.querySelector(`.ticket-card-wallet[data-ticket-id="${ticketId}"]`);
    if (!ticketEl) return;
    const clone = ticketEl.cloneNode(true);
    clone.classList.add('export-ticket-template');
    clone.style.position = 'absolute';
    clone.style.top = '-9999px';
    clone.style.left = '-9999px';
    clone.style.width = '400px';
    clone.style.background = 'white';
    clone.style.borderRadius = '24px';
    clone.style.boxShadow = 'none';
    const actionButtons = clone.querySelectorAll('.ticket-actions, .ticket-action-btn, .transfer-ticket, .download-ticket-full');
    actionButtons.forEach(btn => btn.remove());
    document.body.appendChild(clone);
    try {
        const canvas = await html2canvas(clone, { scale: 2, backgroundColor: '#ffffff' });
        const link = document.createElement('a');
        link.download = `ticket_${ticketId}.png`;
        link.href = canvas.toDataURL();
        link.click();
        showToast('Ticket downloaded as PNG');
    } catch (err) {
        showToast('Download failed', true);
    } finally {
        document.body.removeChild(clone);
    }
}

async function transferTicketToPhone(ticketId, targetPhone) {
    if (isWalletBlocked) {
        showToast(walletBlockReason, true);
        return false;
    }
    let finalPhone = targetPhone.replace(/\D/g, '');
    if (finalPhone.startsWith('27')) finalPhone = '+' + finalPhone;
    else if (finalPhone.startsWith('0')) finalPhone = '+27' + finalPhone.slice(1);
    else finalPhone = '+' + finalPhone;
    if (finalPhone === userProfile.phone) {
        showToast('Cannot transfer to yourself', true);
        return false;
    }
    const { error } = await supabase.rpc('transfer_ticket', {
        p_ticket_id: ticketId,
        p_from_user_id: currentUser.id,
        p_to_phone: finalPhone
    });
    if (error) {
        showToast(error.message, true);
        return false;
    }
    showToast('Ticket transferred');
    await renderMyTicketsFull();
    await updateMyTicketsCount();
    return true;
}

function switchTab(tab) {
    if (tab === 'events') {
        eventsPanel.style.display = 'block';
        myTicketsPanel.style.display = 'none';
        eventsTabBtn.classList.add('active');
        myTicketsTabBtn.classList.remove('active');
        if (events.length) renderStoreTickets();
        else loadEvents();
    } else {
        eventsPanel.style.display = 'none';
        myTicketsPanel.style.display = 'block';
        eventsTabBtn.classList.remove('active');
        myTicketsTabBtn.classList.add('active');
        renderMyTicketsFull();
    }
}

// ----- Initialization -----
async function init() {
    if (!(await initAuth())) return;
    await loadEvents();
    homeIconBtn.addEventListener('click', () => window.location.href = 'home.html');
    eventsTabBtn.addEventListener('click', () => switchTab('events'));
    myTicketsTabBtn.addEventListener('click', () => switchTab('myTickets'));
    closeTransferModal.addEventListener('click', () => transferModal.classList.remove('show'));
    cancelTransferBtn.addEventListener('click', () => transferModal.classList.remove('show'));
    confirmTransferBtn.addEventListener('click', async () => {
        const phone = transferPhone.value.trim();
        if (phone && transferTicketId) {
            await transferTicketToPhone(transferTicketId, phone);
            transferModal.classList.remove('show');
        } else {
            showToast('Enter phone number', true);
        }
    });
    closeConfirmModal.addEventListener('click', () => closeConfirmModalFn(false));
    confirmModalCancelBtn.addEventListener('click', () => closeConfirmModalFn(false));
    confirmModalConfirmBtn.addEventListener('click', () => closeConfirmModalFn(true));
    supabase.channel('wallet-balance')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'wallets',
            filter: `user_id=eq.${currentUser.id}`
        }, async (payload) => {
            if (payload.new.balance !== undefined) {
                userProfile.wallet_balance = payload.new.balance;
                walletBalanceEl.innerText = `R${payload.new.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            }
        })
        .subscribe();
}

// Kick off
init();