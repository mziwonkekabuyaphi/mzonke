import { supabase } from '../../config/supabase.js';
import { appState, refreshSession, refreshWallet, onStateChange, setupWalletRealtime } from '../js/state.js';

// Same cleanup pattern as pages/home.js / pages/tickets.js / pages/vvip.js —
// every listener, interval, and subscription created in init() gets undone
// in destroy() so nothing leaks or double-fires on navigate-away-and-back.
let cleanup = [];
const onCleanup = (fn) => cleanup.push(fn);

// FLAG (fixed, not silent): the original page hardcoded a single
// SESSION_PRICE (250) for every flavour and reused it for coal refills too.
// Real pricing lives in shisha_products.price (see loadLocationsAndFlavours),
// which staff can edit — Mzi Mint is currently R265, not R250. This
// fallback is only ever shown for a split second before flavours load,
// never used to actually charge anyone (requestNewOrder refuses to submit
// if a flavour's live price isn't in flavourPrices).
const FALLBACK_PRICE = 250;
const COAL_DURATION = 60;          // minutes
const REFILL_THRESHOLD = 15;       // minutes

// Module-scope so navigate-away-and-back reuses state instead of
// refetching (module is cached by dynamic import — see tickets.js note).
let currentBalance = 0;
let activeSession = null;
let currentCustomer = null;
let flavourPrices = {};     // shisha_products.name -> live price, refreshed in loadLocationsAndFlavours

// ========== REQUEST AWARENESS (mirrors lockers.js's vault_holdings pattern) ==========
// shisha_requests has no "seen" flag, so rejection awareness is session-local:
// dismissedRequestIds just stops us re-showing a rejection banner the
// customer already dismissed in this visit, same lifetime as the rest of
// this module's state.
let pendingRequests = [];          // shisha_requests rows with status 'pending' for this customer
let latestResolvedRequest = null;  // most recent non-pending request, for the rejection/approval banner
let dismissedRequestIds = new Set();
let requestsChannel = null;
let watchedOrderRequestId = null;  // the order_session request the status modal below is currently tracking

// NOT reused across visits on purpose — these are recreated in init() and
// torn down in destroy() every time, same treatment as walletChannel in
// tickets.js / vvipChannel in vvip.js. In the original page these lived as
// long-lived globals (one of them literally on `window`); see the flag
// below for why that had to change for the SPA.
let timerInterval = null;
let sessionPollInterval = null;
let statementPollInterval = null;
let authListenerSub = null;

// ========== UI HELPERS ==========
function showToast(message, isError = false) {
    const toast = document.getElementById('toastMessage');
    toast.innerText = message;
    toast.style.background = isError ? '#b71c1c' : '#1e293b';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function formatTime(seconds) {
    const mins = Math.floor(Math.abs(seconds) / 60);
    const secs = Math.floor(Math.abs(seconds) % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

function updateWalletDisplay() {
    document.getElementById('walletBalance').innerText = `R${currentBalance.toFixed(2)}`;
    const sessionStat = document.getElementById('sessionStatText');
    if (activeSession && activeSession.status !== 'expired' && activeSession.remainingTime > 0) sessionStat.innerText = 'Active';
    else sessionStat.innerText = 'None';
    updateCoalsUsedStat();
}

function updateCoalsUsedStat() {
    const coalsElem = document.getElementById('coalsUsedStat');
    if (!activeSession || activeSession.status === 'expired' || activeSession.remainingTime <= 0) {
        coalsElem.innerText = '0';
        return;
    }
    const refillCount = activeSession.refillCount || 0;
    const totalCoals = 3 + (refillCount * 3);
    coalsElem.innerText = totalCoals;
}

async function loadCurrentCustomerAndBalance() {
    // Session lookup (with the auth_user_id/id fallback and first-login
    // insert — see state.js's refreshSession) is shared across every tab
    // via appState; only hit the network here if nothing has populated it
    // yet this session.
    if (!appState.session) await refreshSession();
    if (!appState.session) {
        console.warn("No active session");
        currentBalance = 0;
        currentCustomer = null;
        updateWalletDisplay();
        return;
    }

    if (!appState.wallet) await refreshWallet();
    setupWalletRealtime(); // no-op if the shared channel is already subscribed
    syncFromAppState();
}

// Mirrors appState.profile/wallet into this page's local variables and the
// on-screen balance. Called on initial load, on auth state changes, and
// whenever the shared appState wallet changes (realtime update, or a spend
// made from another tab) — this page previously only ever saw a fresh
// balance right after a full reload of this function, since it had no
// realtime subscription of its own.
function syncFromAppState() {
    currentBalance = appState.wallet?.balance ?? 0;

    // shisha_requests.customer_profile_id has a FK to profiles.id, so
    // currentCustomer.id must be the *profile's* id, not the auth id — see
    // the original fallback note this replaced.
    const session = appState.session;
    currentCustomer = {
        id: appState.profile?.id || session?.user?.id,
        walletId: appState.wallet?.id || null,
        phone: appState.profile?.phone || session?.user?.user_metadata?.phone || session?.user?.email || '',
        name: appState.profile?.name || session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'Member'
    };

    updateWalletDisplay();
}

// ========== LOAD LOCATIONS & FLAVOURS FROM DB ==========
async function loadLocationsAndFlavours() {
    try {
        const { data: locations, error: locError } = await supabase
            .from('shisha_locations')
            .select('name')
            .eq('is_active', true)
            .order('name');

        if (locError) throw locError;

        const locationSelect = document.getElementById('orderLocation');
        locationSelect.innerHTML = '';

        if (!locations || locations.length === 0) {
            locationSelect.innerHTML = '<option value="">No active locations</option>';
        } else {
            locations.forEach(loc => {
                const opt = document.createElement('option');
                opt.value = loc.name;
                opt.textContent = loc.name;
                locationSelect.appendChild(opt);
            });
        }

        const { data: flavours, error: flavError } = await supabase
            .from('shisha_products')
            .select('name, price')
            .eq('is_available', true)
            .order('name');

        if (flavError) throw flavError;

        const flavourSelect = document.getElementById('orderFlavour');
        flavourSelect.innerHTML = '';
        flavourPrices = {};

        if (!flavours || flavours.length === 0) {
            flavourSelect.innerHTML = '<option value="">No available flavours</option>';
        } else {
            flavours.forEach(flav => {
                flavourPrices[flav.name] = Number(flav.price) || 0;
                const opt = document.createElement('option');
                opt.value = flav.name;
                opt.textContent = `${flav.name} — R${Number(flav.price).toFixed(0)}`;
                flavourSelect.appendChild(opt);
            });
        }

        updateOrderButtonState();

    } catch (err) {
        console.error('Error loading locations/flavours:', err);
        showToast('Failed to load locations and flavours', true);
    }
}

function updateOrderButtonState() {
    const orderBtn = document.getElementById('orderNowBtn');
    if (pendingRequests.length > 0) {
        orderBtn.disabled = true;
        orderBtn.textContent = 'Request Pending Approval';
        return;
    }

    const locationSelect = document.getElementById('orderLocation');
    const flavourSelect = document.getElementById('orderFlavour');

    const hasLocations = locationSelect && locationSelect.options.length > 0 && locationSelect.options[0].value !== '';
    const hasFlavours = flavourSelect && flavourSelect.options.length > 0 && flavourSelect.options[0].value !== '';

    if (!hasLocations || !hasFlavours) {
        orderBtn.disabled = true;
        orderBtn.textContent = hasLocations ? 'No flavours available' : 'No locations available';
    } else {
        orderBtn.disabled = false;
        const price = flavourPrices[flavourSelect.value] ?? FALLBACK_PRICE;
        orderBtn.textContent = `Smoke Now - R${price}`;
    }
}

// ========== SESSION MANAGEMENT ==========
async function loadSession() {
    if (!currentCustomer?.phone && !currentCustomer?.id) {
        await loadCurrentCustomerAndBalance();
        if (!currentCustomer?.phone) {
            if (activeSession) activeSession = null;
            renderModernSessionCard();
            updateWalletDisplay();
            return;
        }
    }
    const { data, error } = await supabase
        .from('shisha_sessions')
        .select(`
            id, device_id, product_id, location_id,
            start_time, last_refill_time, remaining_time_seconds,
            total_amount, refill_count, status, paused,
            hookah_devices (device_code),
            shisha_products (name),
            shisha_locations (name)
        `)
        .eq('customer_phone', currentCustomer.phone)
        .in('status', ['active', 'refill'])
        .order('created_at', { ascending: false })
        .limit(1);
    if (error) { console.error(error); return; }
    if (data && data.length > 0) {
        const s = data[0];
        activeSession = {
            id: s.id,
            shishaId: s.hookah_devices?.device_code,
            location: s.shisha_locations?.name,
            flavour: s.shisha_products?.name,
            startTime: new Date(s.start_time),
            lastRefillTime: new Date(s.last_refill_time),
            remainingTime: s.remaining_time_seconds,
            amount: s.total_amount,
            refillCount: s.refill_count,
            status: s.status,
            paused: false
        };
        if (activeSession.status !== 'expired') {
            const elapsedSeconds = (new Date() - activeSession.lastRefillTime) / 1000;
            const newRemaining = Math.max(0, COAL_DURATION * 60 - elapsedSeconds);
            activeSession.remainingTime = newRemaining;
            if (newRemaining <= 0) activeSession.status = 'expired';
            else if (newRemaining <= REFILL_THRESHOLD * 60) activeSession.status = 'refill';
            else activeSession.status = 'active';
        }
    } else {
        activeSession = null;
    }
    renderModernSessionCard();
    updateWalletDisplay();
}

function renderModernSessionCard() {
    const container = document.getElementById('activeSessionContainer');
    const noSessionDiv = document.getElementById('noSessionContainer');
    const hasValidSession = activeSession && activeSession.status !== 'expired' && activeSession.remainingTime > 0;

    if (!hasValidSession) {
        if (container) container.innerHTML = '';
        noSessionDiv.style.display = 'block';
        document.getElementById('sessionStatText').innerText = 'None';
        updateCoalsUsedStat();
        return;
    }
    noSessionDiv.style.display = 'none';
    document.getElementById('sessionStatText').innerText = 'Active';

    const statusText = activeSession.status === 'refill' ? 'Refill Soon' : 'Active';
    const statusClass = activeSession.status === 'refill' ? 'refill' : '';
    const timerClass = activeSession.remainingTime <= 300 ? 'critical' : (activeSession.remainingTime <= 900 ? 'warning' : '');
    const coalPercent = Math.max(0, (activeSession.remainingTime / (COAL_DURATION * 60)) * 100);

    const html = `
        <div class="session-card-modern">
            <div class="session-header-modern">
                <div class="title-row">
                    <span class="session-name"><i class="fas fa-smoking"></i> Your Hubbly Session</span>
                    <span class="session-status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="session-details">
                    <span><i class="fas fa-map-marker-alt"></i> ${activeSession.location || 'Shisha Lounge'}</span>
                    <span><i class="fas fa-leaf"></i> ${activeSession.flavour || 'Mint+Grape'}</span>
                </div>
            </div>
            <div class="timer-section">
                <div class="timer-label"><i class="fas fa-hourglass-half"></i> Time Remaining</div>
                <div class="timer-display ${timerClass}" id="dynamicTimerDisplay">${formatTime(activeSession.remainingTime)}</div>
            </div>
            <div class="coal-container">
                <div class="coal-label">
                    <span><i class="fas fa-fire"></i> Coal Health</span>
                    <span id="coalPercentLabel">${Math.floor(coalPercent)}%</span>
                </div>
                <div class="coal-bar-bg">
                    <div class="coal-bar-fill" id="coalFillBar" style="width: ${coalPercent}%;"></div>
                </div>
            </div>
        </div>
    `;
    container.innerHTML = html;
    // FLAG (fixed, not silent): the original page kept this timer on
    // `window._timerInterval` — a real global. In a multi-page app that's
    // harmless since the whole document unloads on navigation, but in the
    // SPA the document never unloads, so a window-level interval would
    // keep ticking (and keep re-querying DOM nodes that may no longer
    // exist) after you'd left the shisha route. Moved to the module-scope
    // `timerInterval` variable below so destroy() can actually stop it.
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!activeSession || activeSession.remainingTime <= 0) return;
        activeSession.remainingTime--;
        if (activeSession.remainingTime <= 0) activeSession.status = 'expired';
        else if (activeSession.remainingTime <= REFILL_THRESHOLD * 60) activeSession.status = 'refill';
        const timerEl = document.getElementById('dynamicTimerDisplay');
        const coalFill = document.getElementById('coalFillBar');
        const coalLabel = document.getElementById('coalPercentLabel');
        if (timerEl) timerEl.innerText = formatTime(activeSession.remainingTime);
        if (coalFill && activeSession) {
            const percent = (activeSession.remainingTime / (COAL_DURATION * 60)) * 100;
            coalFill.style.width = `${percent}%`;
            if (coalLabel) coalLabel.innerText = `${Math.floor(percent)}%`;
        }
        if (activeSession.remainingTime <= 0) {
            clearInterval(timerInterval);
            loadSession();
        }
        updateWalletDisplay();
    }, 1000);
}

// ========== REQUEST HANDLING ==========
async function sendRequestToStaff(requestData) {
    if (!currentCustomer?.phone && !currentCustomer?.id) {
        showToast("Please log in first", true);
        return null;
    }

    // Live check against the DB, not the cached pendingRequests array —
    // same reasoning as the console's own isHookahFree() double-check
    // right before it commits a write: the cache could be a poll-interval
    // stale, and this is the one place a duplicate would actually land.
    const { count, error: countError } = await supabase
        .from('shisha_requests')
        .select('id', { count: 'exact', head: true })
        .eq('customer_phone', currentCustomer.phone)
        .eq('status', 'pending');
    if (countError) {
        console.error(countError);
    } else if ((count || 0) > 0) {
        showToast("You already have a request awaiting staff approval", true);
        await loadRequestStatus(); // resync the banner/buttons in case they were stale
        return null;
    }

    const { data: inserted, error } = await supabase.from('shisha_requests').insert({
        request_type: requestData.type,
        session_id: activeSession?.id || null,
        location_name: requestData.location,
        flavour_name: requestData.flavour,
        device_code: requestData.shishaId,
        amount: requestData.amount,
        customer_phone: currentCustomer.phone,
        customer_profile_id: currentCustomer.id,
        request_data: { paymentMethod: requestData.paymentMethod, accountId: requestData.accountId, issueKey: requestData.issueKey, issueLabel: requestData.issueLabel },
        status: 'pending'
    }).select().single();
    if (error) {
        console.error(error);
        showToast("Failed to send request", true);
        return null;
    }
    showToast("Request sent to staff!");
    loadStatement();
    loadRequestStatus();
    return inserted;
}

// Shared label/icon for a shisha_requests row — used both by the always-on
// status banner below and by the Puffing Statement list.
function requestTypeMeta(req) {
    switch (req.request_type) {
        case 'order_session': return { icon: 'fa-ticket-alt', label: 'New Session' };
        case 'maintenance': return { icon: 'fa-fire', label: 'Coal Refill' };
        case 'end_session': return { icon: 'fa-stop', label: 'End Session' };
        case 'issue_report': {
            const label = req.request_data?.issueLabel;
            return { icon: 'fa-triangle-exclamation', label: label ? `Issue: ${label}` : 'Issue Report' };
        }
        default: return { icon: 'fa-bell', label: req.request_type };
    }
}

// ========== ORDER STATUS MODAL ==========
// "Send an order and hear nothing back" was the actual complaint — the
// request-status banner (below) covers every request type persistently,
// but a brand-new session order gets its own modal too: it opens the
// instant the order is sent showing "pending", and updates itself in
// place to "session started" or "declined" the moment staff act on it,
// via the same realtime channel as the banner, with the 3s poll in
// loadRequestStatus() as a fallback if a realtime event is missed.
function openSessionStatusModal() { document.getElementById('sessionStatusOverlay').classList.add('show'); }
function closeSessionStatusModal() {
    document.getElementById('sessionStatusOverlay').classList.remove('show');
    watchedOrderRequestId = null;
}
function renderSessionStatusModal(state, extra = {}) {
    const icon = document.getElementById('sessionStatusIcon');
    const title = document.getElementById('sessionStatusTitle');
    const message = document.getElementById('sessionStatusMessage');
    const closeBtn = document.getElementById('sessionStatusCloseBtn');
    icon.className = 'session-status-icon ' + state;
    if (state === 'pending') {
        icon.innerHTML = '<i class="fas fa-hourglass-half"></i>';
        title.textContent = 'Request sent';
        message.textContent = "We've sent your order to staff — this'll only take a moment.";
        closeBtn.style.display = 'none';
    } else if (state === 'approved') {
        icon.innerHTML = '<i class="fas fa-check"></i>';
        title.textContent = 'Session started!';
        message.textContent = `Enjoy your ${escapeHtml(extra.flavour || 'shisha')}${extra.device ? ` on ${escapeHtml(extra.device)}` : ''} 🔥`;
        closeBtn.style.display = 'block';
    } else if (state === 'rejected') {
        icon.innerHTML = '<i class="fas fa-xmark"></i>';
        title.textContent = 'Request declined';
        message.textContent = extra.reason ? escapeHtml(extra.reason) : "Staff weren't able to start your session. Please try again or ask a staff member.";
        closeBtn.style.display = 'block';
    }
}
async function resolveSessionStatusModal(req) {
    if (req.status === 'rejected') {
        const reason = req.request_data?.rejection_reason || req.request_data?.reason || req.request_data?.staff_note;
        renderSessionStatusModal('rejected', { reason });
    } else if (req.status === 'approved' || req.status === 'completed') {
        await loadSession(); // pick up the device/flavour of the session staff just created
        renderSessionStatusModal('approved', { flavour: activeSession?.flavour || req.flavour_name, device: activeSession?.shishaId });
    }
    watchedOrderRequestId = null; // stop watching — realtime and the next poll both no-op on it now
}


// Same job as lockers.js's holding-note ("Awaiting staff verification...")
// — the customer previously had zero visibility into a pending request
// unless they manually opened the Puffing Statement tab, and no visibility
// at all into a rejection beyond the one-off toast (missed if they'd
// already navigated away). This keeps that state pinned to the top of the
// Shisha tab until staff act on it, and shows the outcome once they do.
async function loadRequestStatus() {
    if (!currentCustomer?.phone) {
        pendingRequests = [];
        latestResolvedRequest = null;
        renderRequestStatus();
        return;
    }
    const { data, error } = await supabase
        .from('shisha_requests')
        .select('*')
        .eq('customer_phone', currentCustomer.phone)
        .order('created_at', { ascending: false })
        .limit(10);
    if (error) { console.error(error); return; }
    const all = data || [];
    pendingRequests = all.filter(r => r.status === 'pending');
    latestResolvedRequest = all.find(r => r.status !== 'pending') || null;
    renderRequestStatus();

    if (watchedOrderRequestId) {
        const watched = all.find(r => r.id === watchedOrderRequestId);
        if (watched && watched.status !== 'pending') await resolveSessionStatusModal(watched);
    }
}

function renderRequestStatus() {
    const container = document.getElementById('requestStatusContainer');
    if (!container) return;
    let html = '';

    pendingRequests.forEach(req => {
        const meta = requestTypeMeta(req);
        html += `
            <div class="request-status-card pending">
                <div class="request-status-icon"><i class="fas ${meta.icon}"></i></div>
                <div class="request-status-body">
                    <div class="request-status-title">${escapeHtml(meta.label)}</div>
                    <div class="request-status-note"><i class="fas fa-clock"></i> Awaiting staff approval — we'll let you know once it's actioned.</div>
                </div>
            </div>
        `;
    });

    if (latestResolvedRequest && latestResolvedRequest.status === 'rejected' && !dismissedRequestIds.has(latestResolvedRequest.id)) {
        const meta = requestTypeMeta(latestResolvedRequest);
        const reason = latestResolvedRequest.request_data?.rejection_reason
            || latestResolvedRequest.request_data?.reason
            || latestResolvedRequest.request_data?.staff_note;
        html += `
            <div class="request-status-card rejected">
                <div class="request-status-icon"><i class="fas fa-xmark"></i></div>
                <div class="request-status-body">
                    <div class="request-status-title">${escapeHtml(meta.label)} — Declined</div>
                    <div class="request-status-note">${reason ? escapeHtml(reason) : 'Staff were unable to action this request. Please try again or ask a staff member.'}</div>
                </div>
                <button class="request-status-dismiss" data-dismiss="${latestResolvedRequest.id}" aria-label="Dismiss"><i class="fas fa-xmark"></i></button>
            </div>
        `;
    }

    container.innerHTML = html;
    container.querySelectorAll('[data-dismiss]').forEach(btn => {
        btn.addEventListener('click', () => {
            dismissedRequestIds.add(btn.dataset.dismiss);
            renderRequestStatus();
        });
    });

    updateActionAvailability();
}

// Mirrors the console's own "don't let two things happen to the same
// session at once" caution — with one pending request already in flight,
// every action button is disabled until staff resolve it, rather than
// letting the customer submit and only finding out it was refused after.
function updateActionAvailability() {
    const hasPending = pendingRequests.length > 0;
    const coalBtn = document.getElementById('coalRefillBtn');
    const endBtn = document.getElementById('endSessionBtn');
    const issueBtn = document.getElementById('reportIssueBtn');
    [coalBtn, endBtn, issueBtn].forEach(btn => { if (btn) btn.disabled = hasPending; });

    const orderBtn = document.getElementById('orderNowBtn');
    if (!orderBtn) return;
    if (hasPending) {
        orderBtn.disabled = true;
        orderBtn.textContent = 'Request Pending Approval';
    } else {
        updateOrderButtonState(); // restores the normal "Smoke Now - R..." label
    }
}

async function requestCoalRefill() {
    if (!activeSession) { showToast("No active session", true); return; }
    // Was hardcoded to 250 regardless of flavour. Charge what this session
    // actually costs (its stored total_amount), falling back to the
    // flavour's current live price if that's ever missing.
    const refillAmount = Number(activeSession.amount) || flavourPrices[activeSession.flavour] || FALLBACK_PRICE;
    await sendRequestToStaff({ type: 'maintenance', shishaId: activeSession.shishaId, location: activeSession.location, flavour: activeSession.flavour, amount: refillAmount });
}
async function requestEndSession() {
    if (!activeSession) { showToast("No active session", true); return; }
    await sendRequestToStaff({ type: 'end_session', shishaId: activeSession.shishaId, location: activeSession.location, flavour: activeSession.flavour, amount: activeSession.amount });
}

// ========== REPORT ISSUE (picker modal) ==========
const ISSUE_TYPES = [
    { key: 'iyatsarha',   label: 'Iyatsarha',              icon: 'fa-frown' },
    { key: 'weak_smoke',  label: 'Weak / No Smoke',        icon: 'fa-wind' },
    { key: 'hose',        label: 'Hose Problem',           icon: 'fa-link-slash' },
    { key: 'water',       label: 'Water Needs Changing',   icon: 'fa-tint' },
    { key: 'coal_cold',   label: 'Coal Not Hot Enough',    icon: 'fa-temperature-low' },
    { key: 'other',       label: 'Other',                  icon: 'fa-comment-dots' }
];

function openIssueModal() {
    if (!activeSession) { showToast("No active session", true); return; }
    renderIssueOptions();
    document.getElementById('issueOtherInput').style.display = 'none';
    document.getElementById('issueOtherText').value = '';
    document.getElementById('issueModalOverlay').classList.add('show');
}
function closeIssueModal() {
    document.getElementById('issueModalOverlay').classList.remove('show');
}
function renderIssueOptions() {
    // Rebuilt via innerHTML each open, so old buttons (and their listeners)
    // are discarded with the nodes — no separate cleanup needed here,
    // same as the original page.
    const list = document.getElementById('issueOptionsList');
    list.innerHTML = ISSUE_TYPES.map(t => `
        <button type="button" class="issue-option" data-key="${t.key}">
            <span class="issue-option-icon"><i class="fas ${t.icon}"></i></span>
            <span class="issue-option-label">${t.label}</span>
            <i class="fas fa-chevron-right issue-option-chevron"></i>
        </button>
    `).join('');
    list.querySelectorAll('.issue-option').forEach(btn => {
        btn.addEventListener('click', () => handleIssueSelect(btn.dataset.key));
    });
}
async function handleIssueSelect(key) {
    if (key === 'other') {
        document.getElementById('issueOtherInput').style.display = 'block';
        document.getElementById('issueOtherText').focus();
        return;
    }
    const type = ISSUE_TYPES.find(t => t.key === key);
    await submitIssueReport(type.key, type.label);
}
async function submitOtherIssue() {
    const text = document.getElementById('issueOtherText').value.trim();
    if (!text) { showToast("Please describe the issue", true); return; }
    await submitIssueReport('other', text);
}
async function submitIssueReport(issueKey, issueLabel) {
    if (!activeSession) { showToast("No active session", true); return; }
    const ok = await sendRequestToStaff({
        type: 'issue_report',
        shishaId: activeSession.shishaId,
        location: activeSession.location,
        flavour: activeSession.flavour,
        issueKey, issueLabel
    });
    if (ok) closeIssueModal();
}
async function requestNewOrder() {
    const location = document.getElementById('orderLocation').value;
    const flavour = document.getElementById('orderFlavour').value;

    if (!location || !flavour) {
        showToast("Please select a location and flavour", true);
        return;
    }

    const price = flavourPrices[flavour];
    if (price === undefined) {
        showToast("Could not confirm pricing for that flavour — please try again", true);
        return;
    }

    const inserted = await sendRequestToStaff({ type: 'order_session', location, flavour, amount: price, paymentMethod: 'wallet', accountId: currentCustomer?.phone });
    if (inserted) {
        watchedOrderRequestId = inserted.id;
        renderSessionStatusModal('pending');
        openSessionStatusModal();
    }
}

// ========== LOAD PUFFING STATEMENT ==========
async function loadStatement() {
    const container = document.getElementById('statementListContainer');
    if (!container) return;
    if (!currentCustomer?.phone) {
        container.innerHTML = '<div class="statement-empty">Please log in to view your statement</div>';
        return;
    }
    container.innerHTML = '<div class="statement-empty">Loading your requests...</div>';
    try {
        const { data, error } = await supabase
            .from('shisha_requests')
            .select('*')
            .eq('customer_phone', currentCustomer.phone)
            .order('created_at', { ascending: false });
        if (error) throw error;
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="statement-empty"><i class="fas fa-smoking"></i><p>No requests yet</p></div>';
            return;
        }
        let html = '';
        for (const req of data) {
            const date = new Date(req.created_at).toLocaleString('en-ZA', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
            const meta = requestTypeMeta(req);
            const typeLabel = `<i class="fas ${meta.icon}"></i> ${escapeHtml(meta.label)}`;
            let statusClass = '';
            let statusLabel = req.status?.toUpperCase() || 'PENDING';
            if (req.status === 'pending') statusClass = 'pending';
            else if (req.status === 'completed') statusClass = 'completed';
            else if (req.status === 'rejected') statusClass = 'rejected';
            else if (req.status === 'accepted') statusClass = 'accepted';
            else statusClass = 'pending';

            const amountHtml = req.amount ? `<span><i class="fas fa-coins"></i> R${req.amount}</span>` : '';
            html += `
                <div class="statement-item">
                    <div class="statement-item-header">
                        <span class="statement-type">${typeLabel}</span>
                        <span class="statement-status ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="statement-details">
                        <span><i class="fas fa-calendar-alt"></i> ${date}</span>
                        ${req.location_name ? `<span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(req.location_name)}</span>` : ''}
                        ${req.flavour_name ? `<span><i class="fas fa-leaf"></i> ${escapeHtml(req.flavour_name)}</span>` : ''}
                        ${amountHtml}
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="statement-empty">Error loading statement</div>';
    }
}

// ========== TAB SWITCHING ==========
function switchToShisha() {
    document.getElementById('shishaPanel').style.display = 'block';
    document.getElementById('statementPanel').style.display = 'none';
    document.getElementById('shishaTabBtn').classList.add('active');
    document.getElementById('statementTabBtn').classList.remove('active');
    loadSession();
    loadLocationsAndFlavours();
    loadRequestStatus();
}

function switchToStatement() {
    document.getElementById('shishaPanel').style.display = 'none';
    document.getElementById('statementPanel').style.display = 'block';
    document.getElementById('shishaTabBtn').classList.remove('active');
    document.getElementById('statementTabBtn').classList.add('active');
    loadStatement();
}

function startPolling() {
    if (sessionPollInterval) clearInterval(sessionPollInterval);
    sessionPollInterval = setInterval(async () => {
        await loadSession();
        await loadRequestStatus();
    }, 3000);
    onCleanup(() => { if (sessionPollInterval) { clearInterval(sessionPollInterval); sessionPollInterval = null; } });

    if (statementPollInterval) clearInterval(statementPollInterval);
    statementPollInterval = setInterval(() => {
        const statementPanel = document.getElementById('statementPanel');
        if (statementPanel && statementPanel.style.display === 'block') {
            loadStatement();
        }
    }, 60000);
    onCleanup(() => { if (statementPollInterval) { clearInterval(statementPollInterval); statementPollInterval = null; } });
}

function wireStaticListeners() {
    const bind = (id, evt, fn) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener(evt, fn);
        onCleanup(() => el.removeEventListener(evt, fn));
    };
    bind('coalRefillBtn', 'click', requestCoalRefill);
    bind('endSessionBtn', 'click', requestEndSession);
    bind('reportIssueBtn', 'click', openIssueModal);
    bind('orderNowBtn', 'click', requestNewOrder);
    bind('sessionStatusCloseBtn', 'click', closeSessionStatusModal);
    bind('issueModalClose', 'click', closeIssueModal);
    bind('issueModalOverlay', 'click', (e) => { if (e.target.id === 'issueModalOverlay') closeIssueModal(); });
    bind('issueOtherSubmit', 'click', submitOtherIssue);
    bind('shishaTabBtn', 'click', switchToShisha);
    bind('statementTabBtn', 'click', switchToStatement);
    bind('orderLocation', 'change', updateOrderButtonState);
    bind('orderFlavour', 'change', updateOrderButtonState);
    // homeHeaderBtn / .brand navigate via data-link in the fragment — the
    // router's global click delegation handles those, no JS needed here.
    // (Original page had a manual `homeHeaderBtn.onclick = () =>
    // location.href = 'home.html'` — removed, router replaces it.)
}

export default {
    async init() {
        await loadCurrentCustomerAndBalance();
        await loadSession();
        await loadLocationsAndFlavours();
        await loadRequestStatus();
        wireStaticListeners();
        startPolling();
        switchToShisha();

        // Auto-refresh the status banner the moment staff approve/reject/complete
        // a request, so the customer sees it without waiting for the next poll —
        // same pattern as lockers.js's vault-holdings-updates channel.
        if (currentCustomer?.phone) {
            requestsChannel = supabase
                .channel('shisha-requests-updates')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'shisha_requests', filter: `customer_phone=eq.${currentCustomer.phone}` }, (payload) => {
                    loadRequestStatus();
                    if (payload.eventType === 'UPDATE' && payload.old?.status === 'pending' && payload.new?.status && payload.new.status !== 'pending') {
                        const meta = requestTypeMeta(payload.new);
                        if (payload.new.status === 'rejected') showToast(`${meta.label} was declined by staff`, true);
                        else if (payload.new.status === 'approved' || payload.new.status === 'completed') showToast(`${meta.label} was approved!`);

                        if (watchedOrderRequestId && payload.new.id === watchedOrderRequestId) {
                            resolveSessionStatusModal(payload.new);
                        }
                    }
                })
                .subscribe();
            onCleanup(() => { if (requestsChannel) { supabase.removeChannel(requestsChannel); requestsChannel = null; } });
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
            if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                await refreshSession();
                await refreshWallet();
                setupWalletRealtime();
                syncFromAppState();
                await loadSession();
                await loadLocationsAndFlavours();
                await loadRequestStatus();
                if (document.getElementById('statementPanel').style.display === 'block') loadStatement();
            } else if (event === 'SIGNED_OUT') {
                currentBalance = 0;
                currentCustomer = null;
                activeSession = null;
                pendingRequests = [];
                latestResolvedRequest = null;
                watchedOrderRequestId = null;
                closeSessionStatusModal();
                updateWalletDisplay();
                renderModernSessionCard();
                renderRequestStatus();
                document.getElementById('statementListContainer').innerHTML = '<div class="statement-empty">Please log in to view your statement</div>';
            }
        });
        authListenerSub = subscription;
        // FLAG (fixed, not silent): the original page never unsubscribed
        // this listener because the whole document unloaded on navigation
        // anyway. In the SPA it must be torn down explicitly or every
        // navigate-away-and-back stacks another SIGNED_IN/SIGNED_OUT
        // handler, each one re-querying DOM nodes that may be gone.
        onCleanup(() => { if (authListenerSub) { authListenerSub.unsubscribe(); authListenerSub = null; } });

        // state.js's setupWalletRealtime() (called in loadCurrentCustomerAndBalance
        // above) keeps appState.wallet current; mirror it into this page
        // whenever it changes instead of only refreshing on init/sign-in.
        onCleanup(onStateChange(() => syncFromAppState()));

        // Stops whatever timerInterval renderModernSessionCard() last
        // started — read at destroy-time via closure, so this only needs
        // registering once here rather than on every render.
        onCleanup(() => { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } });
    },

    destroy() {
        cleanup.forEach(fn => fn());
        cleanup = [];
    }
};
