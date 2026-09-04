/**
 * screens/scanner.js
 *
 * Gate Scanner + Passport Purchase screen for the Rands kiosk SPA.
 *
 * This is a direct migration of the former standalone `gate-kiosk.html`
 * page (markup + script) into an SPA screen module, following the same
 * pattern established by `screens/welcome.js`. The HTML markup and
 * JavaScript logic below are preserved verbatim from the original file —
 * this is NOT a rewrite or redesign. All scanner/check-in/wristband/
 * Passport-purchase business logic, Supabase queries, and RPC calls are
 * unchanged.
 *
 * The only behavioural changes from the original gate-kiosk.html:
 *   1. `supabase` is now received via init({ supabase }) instead of being
 *      imported directly, matching welcome.js's convention.
 *   2. The "← Back to Main Kiosk" button now calls
 *      window.kioskNavigate('welcome') instead of doing a full-page
 *      window.location.href redirect.
 *   3. A cleanup() export was added (see bottom of file) so kiosk.js can
 *      tear down this screen's timers/overlays when navigating away,
 *      and re-initialize it cleanly the next time it's opened.
 *
 * The CSS for this screen lives in ./scanner.css and is loaded by
 * kiosk.js when this screen is first navigated to. Every selector in
 * that file is scoped under the top-level `.scanner-screen` wrapper
 * below so it can never bleed into other SPA screens (welcome.css and
 * the original gate-kiosk stylesheet both define generic class names
 * like .btn-primary, .toast and .section-divider — scoping keeps the
 * two stylesheets, which stay loaded in <head> for the lifetime of the
 * app, from fighting over those names).
 */

export const html = `<div class="scanner-screen">
<div id="bg-layer"></div>

<header class="page-header no-print">
  <div class="brand-pill" id="logoAdminTrigger">
    <!-- BIG TRANSPARENT LOGO -->
    <img src="../../../assets/images/rands-logo2.png" alt="Rands" class="brand-logo" onerror="this.style.display='none'">
    <span class="logotype">Rands<span>.</span></span>
    <span class="hdivider"></span>
    <span class="tagline">Gate Kiosk v2</span>
  </div>
  <button class="back-nav-btn" id="backToStartBtn">← Back to Main Kiosk</button>
</header>

<div class="kiosk-layout no-print">

  <!-- LEFT: Gate Scanner -->
  <div class="glass-card">
    <div class="card-header">
      <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 9 3 5 7 5"/><polyline points="21 9 21 5 17 5"/>
        <polyline points="3 15 3 19 7 19"/><polyline points="21 15 21 19 17 19"/>
        <rect x="9" y="9" width="6" height="6" rx="1"/>
      </svg>
      <div class="card-title">Gate Scanner</div>
      <div class="card-meta">Scan → Check-in → Print</div>
    </div>

    <div class="scanner-stage">
      <div class="scan-visual">
        <div class="scan-line"></div>
        <div class="scan-corners"></div>
        <div class="scan-corners-b"></div>
        <span class="scan-icon">📷</span>
        <div class="scan-label">Scan wristband QR</div>
        <div class="scan-hint">Or enter ticket ID below — auto-prints on entry</div>
      </div>
    </div>

    <div class="scan-format-hints">
      <span>🎟️ Ticket Number</span>
      <span>🆔 Rands Passport ID</span>
      <span>✉️ Email</span>
      <span>💳 Rands Account #</span>
    </div>

    <div class="form-row">
      <label>Ticket Number / Rands Passport ID / Email / Rands Account #</label>
      <div class="scan-input-wrap">
        <input type="text" id="scanInput" class="kiosk-input" placeholder="Paste ticket number, phone, email or account number…" autocomplete="off" spellcheck="false">
        <span class="input-type-badge" id="scanInputBadge">SEARCH</span>
      </div>
    </div>

    <div id="scanResults" class="scan-results"></div>

    <button id="checkinBtn" class="btn-primary">
      <span id="checkinBtnLabel">✓ Check in &amp; Print Wristband</span>
      <div class="spinner" id="checkinSpinner"></div>
    </button>

    <div id="checkinResult" class="checkin-result"></div>

    <hr class="section-divider">
    <div class="status-bar">
      <span>🖨️ Wristband printer <span class="status-ok">ready</span></span>
      <span>Gate <span class="status-active">KIOSK</span></span>
    </div>
  </div>

  <!-- RIGHT: Passport Purchase -->
  <div class="glass-card">
    <div class="card-header">
      <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="1" y="6" width="22" height="14" rx="2"/>
        <path d="M1 10h22"/>
        <circle cx="17.5" cy="15" r="1.5" fill="currentColor"/>
      </svg>
      <div class="card-title">Passport Purchase</div>
      <div class="card-meta">Pay → Auto check-in → Print</div>
    </div>

    <div class="form-row">
      <label>📱 Mobile number</label>
      <input type="tel" id="buyPhone" class="kiosk-input" placeholder="+27 00 000 0000" autocomplete="off">
    </div>
    <div class="form-row">
      <label>🔐 Passport Key</label>
      <input type="password" id="buyCvv" class="kiosk-input" placeholder="Passport Key" autocomplete="off">
    </div>

    <div id="balancePreview" class="balance-preview">
      <span>Passport balance</span>
      <span class="bal-amount" id="balanceAmount">—</span>
    </div>

    <div class="form-row">
      <label>🎟️ Ticket type</label>
      <div class="type-toggle">
        <div class="type-btn active" id="typeGeneral" onclick="selectType('general')">🎟 General</div>
        <div class="type-btn" id="typeVip" onclick="selectType('vip')">⭐ VIP</div>
      </div>
    </div>
    <div class="form-row">
      <label>📅 Event</label>
      <select id="eventSelect" class="kiosk-input"><option value="">Loading events…</option></select>
    </div>
    <div id="priceLine" style="text-align:right; font-size:0.7rem; color:var(--muted); margin:-0.4rem 0 0.8rem;"></div>

    <button id="purchaseBtn" class="btn-primary">
      <span id="purchaseBtnLabel">💳 Pay, Check-in &amp; Print Wristband</span>
      <div class="spinner" id="purchaseSpinner"></div>
    </button>

    <div class="auto-print-row">
      <input type="checkbox" id="autoPrint" checked>
      <label for="autoPrint">Auto-print wristband after purchase</label>
    </div>

    <hr class="section-divider">
    <div class="status-bar">
      <span>Passport system <span class="status-ok">active</span></span>
      <span id="lastUpdated">—</span>
    </div>
  </div>
</div>

<footer class="kiosk-footer-status no-print">
  <div class="dot-badge"><span class="dot green"></span> Printer ready</div>
  <div class="dot-badge"><span class="dot red"></span> Scanner live</div>
</footer>

<!-- Wristband Modal -->
<div id="wbModal" class="wb-modal">
  <div class="wb-modal-card no-print">
    <div class="wb-modal-header">
      <h3>🎟️ Wristband ready</h3>
      <button class="btn-secondary" id="closeWbModal">✕ Close</button>
    </div>
    <div class="wristband-wrap">
      <div id="wbContainer"></div>
    </div>
    <div class="wb-modal-actions no-print">
      <button class="btn-secondary" id="closeWbModal2">Close</button>
      <button class="btn-primary" id="printBtn" style="width:auto; padding:0.9rem 2rem;">🖨️ Print wristband</button>
    </div>
  </div>
</div>

<!-- Hidden print target -->
<div id="printTarget" style="display:none;"></div>

<!-- Admin Modal (Security) -->
<div id="adminModal" class="admin-modal">
  <div class="admin-modal-card">
    <h3>🔐 Administrator Access</h3>
    <div id="adminContent">
      <div class="admin-row"><span>Supabase</span><span class="status-ok" id="adminSupabaseStatus">Connected</span></div>
      <div class="admin-row"><span>Printer (Epson)</span><span class="status-ok">Online · Paper OK</span></div>
      <div class="admin-row"><span>Kiosk Version</span><span>v2.1 (Gate + Passport)</span></div>
      <div class="admin-row"><span>Last Sync</span><span id="adminLastSync">Just now</span></div>
    </div>
    <div class="admin-actions">
      <button class="btn-secondary" id="adminTestPrint">Printer Test</button>
      <button class="btn-secondary" id="adminSyncData">Sync Data</button>
      <button class="close-admin" id="closeAdminBtn">Close</button>
    </div>
  </div>
</div>

<div id="toast" class="toast"></div>
</div>`;

// Guards against re-running this screen's initialization logic (DOM
// lookups, event listeners, the initial loadEvents() fetch) more than
// once while it's mounted. Reset by cleanup() below so the screen can
// be cleanly re-initialized the next time it's navigated to.
let initialized = false;

// Hoisted to module scope (rather than declared inside init()) so
// cleanup() can clear them when this screen is navigated away from.
let toastTimer = null;
let lookupDebounceTimer = null;
let adminTapCount = 0;
let adminTimer = null;

/**
 * Mounts the Scanner screen's behaviour. Must be called AFTER `html`
 * has been inserted into the DOM (e.g. via kiosk.js's navigate()),
 * since the code below looks up elements by id exactly as the original
 * inline <script type="module"> did when it ran at the bottom of
 * gate-kiosk.html's <body>.
 *
 * @param {{ supabase: import('@supabase/supabase-js').SupabaseClient }} deps
 */
export function init({ supabase }) {
  if (initialized) return;
  initialized = true;

  /* ── State ── */
  let currentEvent  = null;
  let selectedType  = 'general';
  let eventTypes    = { generalId: null, vipId: null };
  let cachedProfile = null;
  let cachedWallet  = null;

  /* ── DOM ── */
  const scanInput       = document.getElementById('scanInput');
  const checkinBtn      = document.getElementById('checkinBtn');
  const checkinLabel    = document.getElementById('checkinBtnLabel');
  const checkinSpinner  = document.getElementById('checkinSpinner');
  const checkinResult   = document.getElementById('checkinResult');

  const buyPhone        = document.getElementById('buyPhone');
  const buyCvv          = document.getElementById('buyCvv');
  const eventSelect     = document.getElementById('eventSelect');
  const priceLine       = document.getElementById('priceLine');
  const purchaseBtn     = document.getElementById('purchaseBtn');
  const purchaseLabel   = document.getElementById('purchaseBtnLabel');
  const purchaseSpinner = document.getElementById('purchaseSpinner');
  const balPreview      = document.getElementById('balancePreview');
  const balAmount       = document.getElementById('balanceAmount');
  const autoPrint       = document.getElementById('autoPrint');
  const lastUpdated     = document.getElementById('lastUpdated');

  const wbModal         = document.getElementById('wbModal');
  const wbContainer     = document.getElementById('wbContainer');
  const printTarget     = document.getElementById('printTarget');
  const printBtn        = document.getElementById('printBtn');

  const adminModal      = document.getElementById('adminModal');
  const closeAdminBtn   = document.getElementById('closeAdminBtn');
  const adminTestPrint  = document.getElementById('adminTestPrint');
  const adminSyncData   = document.getElementById('adminSyncData');

  /* ── Helpers ── */
  function toast(msg, type = 'info') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
  }

  function setCheckinLoading(on) {
    checkinBtn.disabled = on;
    checkinLabel.style.display = on ? 'none' : '';
    checkinSpinner.className   = on ? 'spinner show' : 'spinner';
  }
  function setPurchaseLoading(on) {
    purchaseBtn.disabled = on;
    purchaseLabel.style.display = on ? 'none' : '';
    purchaseSpinner.className   = on ? 'spinner show' : 'spinner';
  }

  function showResult(msg, ok, sub = '') {
    checkinResult.className = `checkin-result show ${ok ? 'success' : 'error'}`;
    checkinResult.innerHTML = `${ok ? '✅' : '❌'} <strong>${msg}</strong>${sub ? `<div style="margin-top:4px;font-size:0.75rem;opacity:0.8;">${sub}</div>` : ''}`;
    setTimeout(() => { checkinResult.className = 'checkin-result'; }, 7000);
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function fmtR(n) { return `R${Number(n).toLocaleString('en-ZA',{minimumFractionDigits:2})}`; }

  /* ── Multi-format lookup: Ticket ID / Rands Passport ID (phone) / Email / Rands Account # (wallet_id) ── */
  function normalizePhoneDigits(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/\D/g, '');
    if (digits.length > 9) digits = digits.slice(-9);
    return digits;
  }
  function toE164ZA(phone) {
    // Normalizes to +27XXXXXXXXX so 073.../2773.../+2773... all resolve to the same account
    const last9 = normalizePhoneDigits(phone);
    return last9 ? '+27' + last9 : '';
  }
  function phoneToAuthEmail(phone) {
    // Matches kiosk-start.html: Supabase phone-auth needs a paid SMS provider, so we
    // authenticate with a synthetic email derived from the phone number instead.
    const last9 = normalizePhoneDigits(phone);
    return last9 ? `${last9}@passport.rands.local` : '';
  }
  function detectInputType(raw) {
    const v = (raw || '').trim();
    if (!v) return 'empty';
    if (v.includes('@')) return 'email';
    const compact = v.replace(/\s/g, '');
    if (/^\d{16}$/.test(compact)) return 'wallet';
    return 'query';
  }
  function updateInputTypeBadge(raw) {
    const badge = document.getElementById('scanInputBadge');
    if (!badge) return;
    const type = detectInputType(raw);
    if (type === 'empty') { badge.textContent = 'SEARCH'; badge.className = 'input-type-badge'; return; }
    if (type === 'email')  { badge.textContent = 'EMAIL'; badge.className = 'input-type-badge email'; return; }
    if (type === 'wallet') { badge.textContent = 'ACCOUNT #'; badge.className = 'input-type-badge wallet'; return; }
    badge.textContent = 'SEARCH'; badge.className = 'input-type-badge';
  }

  // Ticket ID (full or partial, as printed on the wristband) / Rands Passport ID (phone) search
  async function searchTicketsByQuery(raw, eventId) {
    const v = raw.trim();
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRe.test(v)) {
      const { data } = await supabase.from('tickets').select('id, checked_in, customer_phone, ticket_type, event_id, status').eq('id', v).maybeSingle();
      return data ? [data] : [];
    }
    const isHexish = /^[0-9a-f]+$/i.test(v);
    if (isHexish && v.length >= 6 && v.length < 36) {
      const { data } = await supabase.from('tickets').select('id, checked_in, customer_phone, ticket_type, event_id, status').eq('event_id', eventId);
      return (data || []).filter(t => t.id.toLowerCase().endsWith(v.toLowerCase()));
    }
    const digitsNorm = normalizePhoneDigits(v);
    if (!digitsNorm) return [];
    const { data } = await supabase.from('tickets').select('id, checked_in, customer_phone, ticket_type, event_id, status').eq('event_id', eventId).ilike('customer_phone', `%${digitsNorm}%`);
    return (data || []).filter(t => normalizePhoneDigits(t.customer_phone) === digitsNorm);
  }

  // Email / Rands Account Number (wallet_id) → resolve profile → match that phone against this event's tickets
  async function resolveContactToTickets(raw, type, eventId) {
    const column = type === 'email' ? 'email' : 'wallet_id';
    try {
      const { data: profile, error } = await supabase.from('profiles').select('id, name, phone, email, wallet_id').eq(column, raw.trim()).maybeSingle();
      if (error || !profile) return { profile: null, tickets: [], noPhone: false };
      const digitsNorm = normalizePhoneDigits(profile.phone);
      if (!digitsNorm) return { profile, tickets: [], noPhone: true };
      const { data } = await supabase.from('tickets').select('id, checked_in, customer_phone, ticket_type, event_id, status').eq('event_id', eventId).ilike('customer_phone', `%${digitsNorm}%`);
      const tickets = (data || []).filter(t => normalizePhoneDigits(t.customer_phone) === digitsNorm);
      return { profile, tickets, noPhone: false };
    } catch (err) {
      console.error(err);
      return { profile: null, tickets: [], noPhone: false };
    }
  }

  function renderLookupResults(list) {
    const container = document.getElementById('scanResults');
    if (!container) return;
    if (!list || !list.length) { container.innerHTML = ''; return; }
    container.innerHTML = list.map(t => {
      const statusClass = t.checked_in ? 'used' : (t.status && t.status !== 'issued' ? 'cancelled' : 'issued');
      const statusLabel = t.checked_in ? 'CHECKED IN' : (t.status && t.status !== 'issued' ? t.status.toUpperCase() : 'READY');
      return `<div class="scan-result-item" data-id="${t.id}">
        <div>
          <div class="scan-result-phone">${esc(t.customer_phone || 'Guest')}</div>
          <div class="scan-result-meta">${esc(t.ticket_type || 'general')} · ${t.id.slice(-8)}</div>
        </div>
        <div class="scan-result-status ${statusClass}">${statusLabel}</div>
      </div>`;
    }).join('');
    container.querySelectorAll('.scan-result-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.dataset.id;
        renderLookupResults([]);
        scanInput.value = '';
        updateInputTypeBadge('');
        await processCheckin(id);
      });
    });
  }

  async function handleManualLookup() {
    const raw = scanInput.value.trim();
    if (!raw) { toast('Enter a ticket ID, Rands Passport ID, email or account number', 'error'); return; }
    if (!currentEvent) { toast('Select an event first', 'error'); return; }
    const type = detectInputType(raw);
    setCheckinLoading(true);
    let candidates = [];
    let notFoundMsg = 'No matching ticket found for this event';
    try {
      if (type === 'email' || type === 'wallet') {
        const resolved = await resolveContactToTickets(raw, type, currentEvent.id);
        if (!resolved.profile) notFoundMsg = `No account found for that ${type === 'email' ? 'email address' : 'Rands Account Number'}`;
        else if (resolved.noPhone) notFoundMsg = 'Account found, but it has no phone number on file to match against tickets';
        candidates = resolved.tickets;
      } else {
        candidates = await searchTicketsByQuery(raw, currentEvent.id);
      }
    } catch (err) {
      console.error(err);
      setCheckinLoading(false);
      toast('Lookup failed — try again', 'error');
      return;
    }
    setCheckinLoading(false);
    if (candidates.length === 0) { toast(notFoundMsg, 'error'); renderLookupResults([]); return; }
    if (candidates.length === 1) {
      renderLookupResults([]);
      scanInput.value = '';
      updateInputTypeBadge('');
      await processCheckin(candidates[0].id);
      return;
    }
    renderLookupResults(candidates);
  }

  /* ── Load events ── */
  async function loadEvents() {
    const { data, error } = await supabase.from('events').select('*').eq('is_active', true).order('name');
    if (error || !data?.length) {
      eventSelect.innerHTML = '<option value="">No active events</option>';
      toast('No active events found', 'error'); return;
    }
    eventSelect.innerHTML = data.map(ev => `<option value="${ev.id}">${esc(ev.name)}</option>`).join('');
    currentEvent = data[0];
    await loadTypesForEvent(currentEvent.id);
    updatePriceLine();
  }

  async function loadTypesForEvent(eventId) {
    const { data } = await supabase.from('ticket_types').select('id, name').eq('event_id', eventId);
    eventTypes = { generalId: null, vipId: null };
    if (data) {
      const gen = data.find(t => t.name.toLowerCase().includes('general'));
      const vip = data.find(t => t.name.toLowerCase().includes('vip'));
      if (gen) eventTypes.generalId = gen.id;
      if (vip) eventTypes.vipId     = vip.id;
    }
  }

  function ticketPrice() {
    if (!currentEvent) return 0;
    return selectedType === 'vip'
      ? (Number(currentEvent.vip_price)  || Number(currentEvent.base_price) * 2 || 100)
      : (Number(currentEvent.base_price) || 50);
  }

  function updatePriceLine() {
    priceLine.textContent = currentEvent ? `Price: ${fmtR(ticketPrice())}` : '';
  }

  window.selectType = function(type) {
    selectedType = type;
    document.getElementById('typeGeneral').className = `type-btn${type === 'general' ? ' active' : ''}`;
    document.getElementById('typeVip').className     = `type-btn${type === 'vip'     ? ' active' : ''}`;
    updatePriceLine();
  };

  eventSelect.addEventListener('change', async () => {
    const { data } = await supabase.from('events').select('*').eq('id', eventSelect.value).single();
    if (data) { currentEvent = data; await loadTypesForEvent(data.id); updatePriceLine(); }
  });

  /* Phone blur → prefetch balance */
  buyPhone.addEventListener('blur', async () => {
    const phone = buyPhone.value.trim();
    cachedProfile = null; cachedWallet = null;
    balPreview.className = 'balance-preview';
    if (!phone) return;
    const digits = normalizePhoneDigits(phone);
    const { data: candidates } = await supabase.from('profiles').select('id, name, phone').ilike('phone', `%${digits}%`);
    const p = (candidates || []).find(c => normalizePhoneDigits(c.phone) === digits);
    if (!p) return;
    cachedProfile = p;
    const { data: w } = await supabase.from('wallets').select('id, balance').eq('user_id', p.id).maybeSingle();
    if (!w) return;
    cachedWallet = w;
    balAmount.textContent = fmtR(w.balance);
    balPreview.className = 'balance-preview visible';
    lastUpdated.textContent = `Checked ${new Date().toLocaleTimeString()}`;
  });

  /* QR generation */
  function generateQR(text, sizePx) {
    const qr = qrcodeGenerator(0, 'H');
    qr.addData(text);
    qr.make();
    const modules = qr.getModuleCount();
    const cell    = sizePx / modules;
    const canvas  = document.createElement('canvas');
    canvas.width  = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, sizePx, sizePx);
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        ctx.fillStyle = qr.isDark(r, c) ? '#000' : '#fff';
        ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
    return canvas.toDataURL();
  }

  function buildWristband(d, qrUrl) {
    const serial  = d.id.slice(-8).toUpperCase();
    const vipPill = d.type === 'vip' ? `<span class="wb-vip-pill">⭐ VIP</span>` : '';
    const typeLabel = d.type === 'vip' ? 'VIP Experience' : 'General Admission';
    return `
    <div class="wristband-strip">
      <div class="wb-accent"><span class="wb-accent-logo">R</span><span>ANDS</span></div>
      <div class="wb-body">
        <div class="wb-info-block">
          <div class="wb-event-row">
            <div class="wb-event-name">${esc(d.eventName)}</div>
            ${vipPill}
          </div>
          <div class="wb-person-name">${esc(d.name)}</div>
          <div class="wb-meta-row">
            <span class="wb-meta-chip type">${typeLabel}</span>
            <span class="wb-meta-chip">${esc(d.phone)}</span>
            <span class="wb-meta-chip">ID: ${serial}</span>
            <span class="wb-meta-chip">${esc(d.date)}</span>
            <span class="wb-meta-chip">Rands Cape Town</span>
          </div>
        </div>
        <div class="wb-qr-block">
          <img src="${qrUrl}" width="72" height="72" alt="QR">
          <span class="wb-qr-label">Scan at gate</span>
        </div>
      </div>
      <div class="wb-fasten">✂ Fasten here</div>
    </div>`;
  }

  function showWristband(html, autoPrintNow) {
    wbContainer.innerHTML  = html;
    printTarget.innerHTML  = html;
    printTarget.style.display = 'block';
    wbModal.classList.add('active');
    if (autoPrintNow) setTimeout(() => window.print(), 600);
  }

  function closeModal() {
    wbModal.classList.remove('active');
    printTarget.style.display = 'none';
  }
  document.getElementById('closeWbModal').addEventListener('click', closeModal);
  document.getElementById('closeWbModal2').addEventListener('click', closeModal);
  printBtn.addEventListener('click', () => window.print());
  wbModal.addEventListener('click', e => { if (e.target === wbModal) closeModal(); });

  /* Gate scanner */
  async function processCheckin(rawId) {
    const ticketId = rawId.trim();
    if (!ticketId) { toast('Enter a ticket ID', 'error'); return; }
    setCheckinLoading(true);
    try {
      const { data: ticket, error } = await supabase
        .from('tickets')
        .select('id, checked_in, customer_phone, ticket_type, event_id')
        .eq('id', ticketId)
        .maybeSingle();
      if (error || !ticket) {
        toast('Invalid ticket — not found', 'error');
        showResult('Ticket not found', false, ticketId.slice(0,8)+'…');
        return;
      }
      if (ticket.checked_in === true) {
        toast('⚠️ Ticket already used — duplicate rejected', 'error');
        showResult('Already checked in', false, ticket.customer_phone || '');
        return;
      }
      let guestName = 'Guest';
      let eventName = currentEvent?.name || 'Rands Event';
      if (ticket.customer_phone) {
        const { data: prof } = await supabase.from('profiles').select('name').eq('phone', ticket.customer_phone).maybeSingle();
        if (prof?.name) guestName = prof.name;
      }
      if (ticket.event_id && ticket.event_id !== currentEvent?.id) {
        const { data: ev } = await supabase.from('events').select('name').eq('id', ticket.event_id).maybeSingle();
        if (ev?.name) eventName = ev.name;
      }
      const now = new Date().toISOString();
      const { error: upErr } = await supabase.from('tickets').update({ checked_in: true }).eq('id', ticketId);
      if (upErr) { toast('Check-in update failed', 'error'); return; }
      await supabase.from('checkins').insert({ ticket_id: ticketId, event_id: ticket.event_id || currentEvent?.id || null, scanned_at: now, gate: 'KIOSK' });
      toast('✅ Entry granted — welcome!', 'success');
      showResult('Checked in', true, `${guestName} · ${ticket.customer_phone || ''}`);
      scanInput.value = '';
      const qrUrl = generateQR(ticketId, 96);
      const wb = buildWristband({
        id: ticketId, name: guestName, phone: ticket.customer_phone || '',
        type: ticket.ticket_type || 'general', eventName: eventName,
        date: new Date().toLocaleDateString('en-ZA')
      }, qrUrl);
      showWristband(wb, true);
    } finally { setCheckinLoading(false); }
  }

  checkinBtn.addEventListener('click', () => handleManualLookup());
  scanInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleManualLookup(); });

  scanInput.addEventListener('input', () => {
    const raw = scanInput.value;
    updateInputTypeBadge(raw);
    clearTimeout(lookupDebounceTimer);
    const v = raw.trim();
    if (!v) { renderLookupResults([]); return; }
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const digits = v.replace(/\D/g, '');
    const looksComplete = uuidRe.test(v) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /^\d{16}$/.test(v.replace(/\s/g, '')) || digits.length >= 9;
    if (looksComplete) {
      lookupDebounceTimer = setTimeout(() => handleManualLookup(), 400);
    } else {
      renderLookupResults([]);
    }
  });

  /* Wallet purchase */
  async function purchaseWithWallet() {
    const rawPhone    = buyPhone.value.trim();
    const passportKey = buyCvv.value.trim();
    if (!rawPhone || !passportKey) { toast('Enter phone and Passport Key', 'error'); return; }
    if (!currentEvent)  { toast('Select an event', 'error'); return; }
    const phone = toE164ZA(rawPhone);
    const authEmail = phoneToAuthEmail(rawPhone);
    if (!phone || !authEmail) { toast('Enter a valid phone number', 'error'); return; }
    setPurchaseLoading(true);
    try {
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email: authEmail, password: passportKey });
      if (authErr || !authData?.user) { console.error('Purchase auth error:', authErr); toast('Incorrect phone or Passport Key', 'error'); return; }
      let profile = cachedProfile;
      if (!profile) {
        const { data, error } = await supabase.from('profiles').select('id, name').eq('id', authData.user.id).maybeSingle();
        if (error || !data) { toast('No profile found for this account', 'error'); return; }
        profile = data; cachedProfile = data;
      }
      let wallet = cachedWallet;
      if (!wallet) {
        const { data, error } = await supabase.from('wallets').select('id, balance').eq('user_id', profile.id).maybeSingle();
        if (error || !data) { toast('No wallet found for this account', 'error'); return; }
        wallet = data; cachedWallet = data;
      }
      const currentBal = Number(wallet.balance) || 0;
      const price      = ticketPrice();
      if (currentBal < price) {
        toast(`Insufficient balance — ${fmtR(currentBal)} available, need ${fmtR(price)}`, 'error');
        return;
      }
      const newBal = currentBal - price;
      const now    = new Date().toISOString();
      const { error: deductErr } = await supabase.from('wallets').update({ balance: newBal }).eq('id', wallet.id);
      if (deductErr) { toast('Payment failed — wallet update error', 'error'); return; }
      const ticketId = crypto.randomUUID();
      const { error: ticketErr } = await supabase.from('tickets').insert({
        id: ticketId, event_id: currentEvent.id,
        ticket_type_id: selectedType === 'vip' ? eventTypes.vipId : eventTypes.generalId,
        customer_phone: phone, issued_by: profile.id, status: 'issued', issued_at: now,
        checked_in: true, ticket_type: selectedType, qr_token: ticketId
      });
      if (ticketErr) {
        await supabase.from('wallets').update({ balance: currentBal }).eq('id', wallet.id);
        toast('Ticket creation failed — balance restored', 'error');
        return;
      }
      await supabase.from('checkins').insert({ ticket_id: ticketId, event_id: currentEvent.id, scanned_at: now, gate: 'KIOSK' });
      await supabase.from('wallet_transactions').insert({
        user_id: profile.id, amount: price, type: 'ticket_purchase', direction: 'debit',
        status: 'completed', description: `${selectedType.toUpperCase()} ticket — ${currentEvent.name}`, created_at: now
      });
      cachedWallet = { ...wallet, balance: newBal };
      balAmount.textContent = fmtR(newBal);
      lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
      toast(`✅ Paid ${fmtR(price)} · Checked in · Printing wristband`, 'success');
      const qrUrl = generateQR(ticketId, 96);
      const wb = buildWristband({
        id: ticketId, name: profile.name || 'Guest', phone, type: selectedType,
        eventName: currentEvent.name, date: new Date().toLocaleDateString('en-ZA')
      }, qrUrl);
      showWristband(wb, autoPrint.checked);
      buyCvv.value = '';
      cachedWallet = null; cachedProfile = null;
      balPreview.className = 'balance-preview';
      await supabase.auth.signOut();
    } finally { setPurchaseLoading(false); }
  }

  purchaseBtn.addEventListener('click', purchaseWithWallet);

  /* ── BACK BUTTON (go to start page) ── */
  document.getElementById('backToStartBtn').addEventListener('click', () => {
    window.kioskNavigate('welcome');
  });

  /* ── Security: 5 taps on logo (including the new big image) opens admin modal ── */
  adminTapCount = 0; adminTimer = null; // reset in case of re-init after cleanup
  const logoTrigger = document.getElementById('logoAdminTrigger');
  logoTrigger.addEventListener('click', () => {
    adminTapCount++;
    clearTimeout(adminTimer);
    adminTimer = setTimeout(() => { adminTapCount = 0; }, 3000);
    if (adminTapCount >= 5) {
      adminTapCount = 0;
      adminModal.classList.add('active');
    }
  });
  function closeAdmin() { adminModal.classList.remove('active'); }
  closeAdminBtn.addEventListener('click', closeAdmin);
  adminModal.addEventListener('click', e => { if (e.target === adminModal) closeAdmin(); });
  adminTestPrint.addEventListener('click', () => toast('Test page sent to printer', 'success'));
  adminSyncData.addEventListener('click', async () => {
    toast('Syncing data...', 'info');
    await loadEvents();
    const syncTime = new Date().toLocaleTimeString();
    document.getElementById('adminLastSync').textContent = syncTime;
    toast('Data synced', 'success');
  });

  /* ── Init ── */
  loadEvents().then(() => toast('Rands Kiosk ready', 'success'));
}

/**
 * Tears down everything this screen started, so navigating away and
 * back doesn't leak timers, duplicate listeners, or leave a stale
 * modal open. Called by kiosk.js immediately before it replaces
 * #kiosk-screen's content with the next screen.
 */
export function cleanup() {
  // Stop the manual-lookup debounce and the toast auto-hide timer.
  clearTimeout(lookupDebounceTimer);
  lookupDebounceTimer = null;
  clearTimeout(toastTimer);
  toastTimer = null;

  // Stop the 5-tap admin-trigger debounce.
  clearTimeout(adminTimer);
  adminTimer = null;
  adminTapCount = 0;

  // Close any overlays that belong to this screen so they don't appear
  // pre-opened the next time the Scanner is mounted.
  document.getElementById('wbModal')?.classList.remove('active');
  document.getElementById('adminModal')?.classList.remove('active');
  const printTarget = document.getElementById('printTarget');
  if (printTarget) printTarget.style.display = 'none';

  // Allow a clean re-init next time this screen is navigated to.
  initialized = false;
}
