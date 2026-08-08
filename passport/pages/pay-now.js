import { supabase } from '../../config/supabase.js';
import { loadScriptOnce } from '../js/lazy-load.js';

// Same cleanup pattern as pages/tickets.js / pages/vvip.js / pages/lockers.js.
let cleanup = [];
const onCleanup = (fn) => cleanup.push(fn);

// Module-scope so a navigate-away-and-back reuses state instead of
// refetching (dynamic import() caches the module — see tickets.js note).
let currentUserId = null;
let currentProfileId = null;
let currentUserPhone = null;
let currentBalance = 0;
let boxofficeRequests = [];
let boxofficeCountdowns = new Map();
let boxofficeChannel = null;
let walletChannel = null;

// qrcodejs / JsBarcode are only needed on this page, so load them on
// demand instead of paying for them on every route via index.html <head>.
// Same jsdelivr qrcodejs URL pages/tickets.js already uses.
function loadPayNowLibs() {
    return Promise.all([
        loadScriptOnce('https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js', () => !!window.QRCode),
        loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js', () => !!window.JsBarcode)
    ]);
}

function showToastMsg(message, type = 'info') {
    const toast = document.getElementById('globalToast');
    if (!toast) return;
    toast.innerText = message;
    toast.className = `paynow-toast ${type}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

function generateBarcode(text) {
    const canvas = document.getElementById('barcodeCanvas');
    if (canvas && text && window.JsBarcode) {
        try {
            window.JsBarcode('#barcodeCanvas', text, { format: 'CODE128', width: 2, height: 50, displayValue: false });
        } catch (e) { console.warn(e); }
    }
}

function generateQRCode(text) {
    const qrcodeDiv = document.getElementById('qrcode');
    if (qrcodeDiv && text && window.QRCode) {
        qrcodeDiv.innerHTML = '';
        try {
            new window.QRCode(qrcodeDiv, { text: text, width: 140, height: 140, colorDark: '#E30613' });
        } catch (e) { console.warn(e); }
    }
}

function setWalletBalanceDisplay() {
    const formatted = `R ${currentBalance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    const el1 = document.getElementById('walletBalance');
    const el2 = document.getElementById('walletBalanceStat');
    if (el1) el1.textContent = formatted;
    if (el2) el2.textContent = formatted;
}

async function loadUserData() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
        showToastMsg('Please log in first', 'error');
        setTimeout(() => { window.location.href = '../login.html'; }, 1500);
        return false;
    }
    currentUserId = session.user.id;

    // profiles.id is NOT guaranteed to equal the auth user id — WhatsApp-
    // registered customers get a DB-generated profiles.id, linked to auth
    // only via auth_user_id. Same lookup order as pages/tickets.js. This
    // page tolerates a missing profile (falls back to phone from session
    // metadata/email), so no auto-create step here — that stays specific
    // to pages that write records under a profile id (tickets, vault).
    let { data: profile, error: profileErr } = await supabase.from('profiles').select('id, phone').eq('auth_user_id', currentUserId).maybeSingle();
    if (!profile) {
        const fallback = await supabase.from('profiles').select('id, phone').eq('id', currentUserId).maybeSingle();
        profile = fallback.data;
    }
    if (profileErr) console.warn('Profile fetch error:', profileErr);

    currentUserPhone = profile?.phone || session.user.user_metadata?.phone || session.user.email?.split('@')[0] || 'MEMBER';
    currentProfileId = profile?.id;

    const { data: wallet, error: walletErr } = await supabase.from('wallets').select('balance').eq('user_id', currentUserId).maybeSingle();
    if (walletErr) console.warn('Wallet error:', walletErr);
    currentBalance = wallet?.balance || 0;
    setWalletBalanceDisplay();

    const qrLabel = document.getElementById('qrAccountLabel');
    if (qrLabel) qrLabel.innerText = currentUserPhone;

    await loadPayNowLibs();
    generateBarcode(currentUserPhone);
    generateQRCode(currentUserPhone);

    return true;
}

function setupWalletListener() {
    walletChannel = supabase
        .channel(`paynow-wallet-${currentUserId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wallets', filter: `user_id=eq.${currentUserId}` }, (payload) => {
            if (payload.new?.balance !== undefined) {
                currentBalance = payload.new.balance;
                setWalletBalanceDisplay();
            }
        })
        .subscribe();
    onCleanup(() => { if (walletChannel) { supabase.removeChannel(walletChannel); walletChannel = null; } });
}

function startBoxofficeCountdown(requestId, expiresAt) {
    if (boxofficeCountdowns.has(requestId)) clearInterval(boxofficeCountdowns.get(requestId));

    const updateTimer = () => {
        const timerEl = document.getElementById(`boxoffice-timer-${requestId}`);
        if (!timerEl) return;
        const now = new Date();
        const expiry = new Date(expiresAt);
        const diff = Math.max(0, Math.floor((expiry - now) / 1000));
        if (diff <= 0) {
            timerEl.textContent = 'EXPIRED';
            timerEl.classList.add('expired');
            clearInterval(boxofficeCountdowns.get(requestId));
            boxofficeCountdowns.delete(requestId);
            markBoxofficeRequestExpired(requestId);
        } else {
            timerEl.textContent = formatTime(diff);
        }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    boxofficeCountdowns.set(requestId, interval);
}

async function markBoxofficeRequestExpired(requestId) {
    await supabase.from('payment_requests').update({ status: 'expired' }).eq('id', requestId);
    boxofficeRequests = boxofficeRequests.filter(r => r.id !== requestId);
    renderBoxofficeRequests();
}

async function processBoxofficePayment(request) {
    const amount = request.total_amount;

    if (currentBalance < amount) {
        showToastMsg(`Insufficient balance. Need R${amount.toFixed(2)}`, 'error');
        return;
    }

    const payBtn = document.getElementById(`boxoffice-pay-${request.id}`);
    if (payBtn) {
        payBtn.disabled = true;
        payBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Processing...';
    }

    try {
        const newBalance = currentBalance - amount;

        await supabase.from('wallets').update({ balance: newBalance }).eq('user_id', currentUserId);

        await supabase.from('wallet_transactions').insert({
            user_id: currentUserId,
            amount: -amount,
            type: 'payment',
            direction: 'debit',
            description: `Box Office: ${request.events?.name || 'Event'} - ${request.ticket_types?.name || 'Ticket'} x${request.quantity}`,
            status: 'completed',
            metadata: { payment_request_id: request.id }
        });

        await supabase
            .from('payment_requests')
            .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: currentUserId })
            .eq('id', request.id);

        currentBalance = newBalance;
        setWalletBalanceDisplay();

        boxofficeRequests = boxofficeRequests.filter(r => r.id !== request.id);
        renderBoxofficeRequests();

        if (boxofficeCountdowns.has(request.id)) {
            clearInterval(boxofficeCountdowns.get(request.id));
            boxofficeCountdowns.delete(request.id);
        }

        showToastMsg(`✅ Payment of R${amount.toFixed(2)} successful!`, 'success');

    } catch (err) {
        console.error('Payment error:', err);
        showToastMsg(err.message || 'Payment failed', 'error');
        if (payBtn) {
            payBtn.disabled = false;
            payBtn.innerHTML = '<i class="fas fa-credit-card"></i> Pay Now';
        }
    }
}

function renderBoxofficeRequests() {
    const container = document.getElementById('boxofficeRequestsList');
    if (!container) return;

    const activeRequests = boxofficeRequests.filter(r => r.status === 'pending' && new Date(r.expires_at) > new Date());

    const countBadge = document.getElementById('boxofficeCount');
    const pendingStat = document.getElementById('pendingCountStat');
    if (countBadge) countBadge.textContent = activeRequests.length;
    if (pendingStat) pendingStat.textContent = activeRequests.length;

    if (activeRequests.length === 0) {
        container.innerHTML = `
            <div class="boxoffice-empty">
                <i class="fas fa-clock"></i>
                <p>No pending payment requests</p>
                <p style="font-size: 0.65rem; margin-top: 6px; color: var(--mist);">When you buy tickets at Box Office, requests appear here</p>
            </div>
        `;
        return;
    }

    container.innerHTML = activeRequests.map(request => {
        const eventName = request.events?.name || 'Event';
        const ticketType = request.ticket_types?.name || 'Ticket';
        const expiry = new Date(request.expires_at);
        const isExpired = expiry <= new Date();
        const orderNumber = request.id.slice(0, 8).toUpperCase();

        return `
            <div class="boxoffice-request-card ${isExpired ? 'expired' : ''}">
                <div class="boxoffice-request-header">
                    <div class="boxoffice-event-name">🎟️ ${escapeHtml(eventName)}</div>
                    <div class="boxoffice-timer ${isExpired ? 'expired' : ''}" id="boxoffice-timer-${request.id}">
                        ${isExpired ? 'EXPIRED' : formatTime(Math.max(0, Math.floor((expiry - new Date()) / 1000)))}
                    </div>
                </div>
                <div class="boxoffice-request-details">
                    <div class="boxoffice-detail">
                        <div class="boxoffice-detail-label">Ticket Type</div>
                        <div class="boxoffice-detail-value">${escapeHtml(ticketType)}</div>
                    </div>
                    <div class="boxoffice-detail">
                        <div class="boxoffice-detail-label">Quantity</div>
                        <div class="boxoffice-detail-value">x${request.quantity || 1}</div>
                    </div>
                    <div class="boxoffice-detail">
                        <div class="boxoffice-detail-label">Order #</div>
                        <div class="boxoffice-detail-value">${orderNumber}</div>
                    </div>
                    <div class="boxoffice-detail">
                        <div class="boxoffice-detail-label">Amount</div>
                        <div class="boxoffice-detail-value boxoffice-amount">R ${(request.total_amount || 0).toFixed(2)}</div>
                    </div>
                </div>
                ${!isExpired ? `
                    <button class="boxoffice-pay-btn" id="boxoffice-pay-${request.id}">
                        <i class="fas fa-credit-card"></i> Pay Now
                    </button>
                ` : `
                    <button class="boxoffice-pay-btn" disabled style="background:var(--mist);">
                        <i class="fas fa-clock"></i> Expired
                    </button>
                `}
            </div>
        `;
    }).join('');

    activeRequests.forEach(request => {
        if (new Date(request.expires_at) > new Date()) {
            const payBtn = document.getElementById(`boxoffice-pay-${request.id}`);
            if (payBtn) payBtn.addEventListener('click', () => processBoxofficePayment(request));
            startBoxofficeCountdown(request.id, request.expires_at);
        }
    });
}

async function loadBoxofficeRequests() {
    if (!currentProfileId && !currentUserPhone) return;

    let query = supabase
        .from('payment_requests')
        .select('*, events(name), ticket_types(name, price)')
        .in('status', ['pending']);

    if (currentProfileId) {
        query = query.eq('customer_profile_id', currentProfileId);
    } else if (currentUserPhone) {
        query = query.eq('customer_phone', currentUserPhone);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading boxoffice requests:', error);
        return;
    }

    boxofficeRequests = data || [];
    renderBoxofficeRequests();
}

function subscribeBoxofficeRequests() {
    boxofficeChannel = supabase
        .channel('boxoffice-requests-all')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'payment_requests'
        }, async (payload) => {
            const newRequest = payload.new;
            const belongsToUser = (newRequest.customer_profile_id === currentProfileId) ||
                                 (newRequest.customer_phone === currentUserPhone);

            if (belongsToUser && newRequest.status === 'pending') {
                const { data: fullRequest } = await supabase
                    .from('payment_requests')
                    .select('*, events(name), ticket_types(name, price)')
                    .eq('id', newRequest.id)
                    .single();

                if (fullRequest) {
                    boxofficeRequests.unshift(fullRequest);
                    renderBoxofficeRequests();
                    showToastMsg(`📱 New Box Office request: R${fullRequest.total_amount?.toFixed(2)}`, 'info');
                    try {
                        const audio = new Audio('https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3');
                        audio.volume = 0.3;
                        audio.play().catch(e => console.log('Audio play failed:', e));
                    } catch (e) {}
                }
            }
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'payment_requests'
        }, (payload) => {
            const updated = payload.new;
            const belongsToUser = (updated.customer_profile_id === currentProfileId) ||
                                 (updated.customer_phone === currentUserPhone);

            if (belongsToUser && (updated.status === 'approved' || updated.status === 'rejected' || updated.status === 'expired')) {
                boxofficeRequests = boxofficeRequests.filter(r => r.id !== updated.id);
                renderBoxofficeRequests();
                if (boxofficeCountdowns.has(updated.id)) {
                    clearInterval(boxofficeCountdowns.get(updated.id));
                    boxofficeCountdowns.delete(updated.id);
                }
                if (updated.status === 'approved') {
                    showToastMsg('✅ Payment completed!', 'success');
                } else if (updated.status === 'rejected') {
                    showToastMsg('❌ Payment rejected', 'error');
                } else if (updated.status === 'expired') {
                    showToastMsg('⏰ Payment request expired', 'error');
                }
            }
        })
        .subscribe();
    onCleanup(() => { if (boxofficeChannel) { supabase.removeChannel(boxofficeChannel); boxofficeChannel = null; } });
}

// homeIconBtn / .brand / the "Open Passport" and "Top Up" buttons all
// navigate via data-link in the fragment — the router's global click
// delegation handles those, no JS needed here.

export default {
    async init() {
        const userLoaded = await loadUserData();
        if (!userLoaded) return;

        setupWalletListener();
        await loadBoxofficeRequests();
        subscribeBoxofficeRequests();
    },

    destroy() {
        // Countdown intervals aren't tracked via onCleanup since they're
        // keyed by request id in boxofficeCountdowns — clear all of them
        // explicitly so none keep firing against a torn-down fragment.
        boxofficeCountdowns.forEach(interval => clearInterval(interval));
        boxofficeCountdowns.clear();
        cleanup.forEach(fn => fn());
        cleanup = [];
    }
};
