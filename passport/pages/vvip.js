import { supabase } from '../../config/supabase.js';
import { loadScriptOnce } from '../js/lazy-load.js';

// Same cleanup pattern as pages/home.js and pages/tickets.js.
let cleanup = [];
const onCleanup = (fn) => cleanup.push(fn);

// Module-scope so a navigate-away-and-back reuses state instead of
// refetching (module is cached by dynamic import — see tickets.js note).
let currentUser = null;
let currentProfile = null;
let currentTabCredit = 0;
let activePackage = null;
let selectedPackage = null;
let selectedTableId = null;
let selectedTableLabel = null;
let availableTablesForSelection = [];
let eventsById = {};
let isWalletBlocked = false;
let walletBlockReason = '';
let vvipChannel = null;
let vvipWalletChannel = null;

function loadQrLib() {
    return loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', () => !!window.QRCode);
}

function showToastMsg(msg, isError = false) {
    const t = document.getElementById('globalToast');
    t.innerText = msg;
    t.style.background = isError ? '#dc2626' : '#1e293b';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
}
function escapeHtml(str) { if (!str) return ''; return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }
async function showVVIPInfo(title, message) {
    const overlay = document.getElementById('vvipModalOverlay');
    document.getElementById('vvipModalTitle').innerText = title;
    document.getElementById('vvipModalMessage').innerHTML = message;
    document.getElementById('vvipModalConfirmBtn').innerText = 'OK';
    document.getElementById('vvipModalCancelBtn').style.display = 'none';
    overlay.classList.add('active');
    const onConfirm = () => { overlay.classList.remove('active'); document.getElementById('vvipModalConfirmBtn').removeEventListener('click', onConfirm); };
    document.getElementById('vvipModalConfirmBtn').addEventListener('click', onConfirm);
}

async function loadUserAndPackageCredit() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = '../login.html'; return false; }
    currentUser = session.user;
    // NOTE: unlike home.js/tickets.js, this only looks profiles up by
    // `id = currentUser.id` — it doesn't fall back to `auth_user_id` for
    // WhatsApp-registered customers whose profiles.id was DB-generated
    // (see tickets.js's initAuth comment for the same bug, already fixed
    // there). Carried over unchanged from the original vvip.js; flagging
    // it rather than silently changing auth-lookup behavior in this pass.
    const { data: profile } = await supabase.from('profiles').select('id, name, phone, role').eq('id', currentUser.id).maybeSingle();
    if (!profile) {
        await supabase.from('profiles').insert([{ id: currentUser.id, name: currentUser.user_metadata?.full_name || 'Member', phone: '', role: 'user' }]);
        currentProfile = { id: currentUser.id, name: currentUser.user_metadata?.full_name || 'Member', phone: '', role: 'user' };
    } else { currentProfile = profile; }

    const { data: wallet } = await supabase.from('wallets').select('balance, status, block_reason').eq('user_id', currentUser.id).maybeSingle();
    isWalletBlocked = (wallet?.status || '').toLowerCase() === 'blocked';
    walletBlockReason = wallet?.block_reason || 'Your wallet has been blocked. Please contact support for assistance.';
    renderWalletBlockedBanners();

    await loadActivePackageAndCredit();
    return true;
}
function renderWalletBlockedBanners() {
    const bannerHtml = isWalletBlocked ? `<div class="wallet-blocked-banner"><i class="fas fa-ban"></i><span>${escapeHtml(walletBlockReason)}</span></div>` : '';
    document.querySelectorAll('.wallet-blocked-banner').forEach(el => el.remove());
    if (!isWalletBlocked) return;
    const storePanel = document.getElementById('storePanel');
    const wristbandPanel = document.getElementById('wristbandPanel');
    if (storePanel) storePanel.insertAdjacentHTML('afterbegin', bannerHtml);
    if (wristbandPanel) wristbandPanel.insertAdjacentHTML('afterbegin', bannerHtml);
}

async function loadActivePackageAndCredit() {
    if (!currentProfile?.id) return;
    const { data: booking } = await supabase
        .from('vvip_bookings')
        .select(`id, booking_reference, total_amount, remaining_balance, used_amount, status, table_id, packages:vvip_packages(name, price, description, capacity, benefits), table:vvip_tables(table_number)`)
        .eq('customer_id', currentProfile.id)
        .in('status', ['confirmed', 'checked_in', 'seated'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (booking) {
        const remaining = booking.remaining_balance ?? 0;
        const used = booking.used_amount ?? 0;
        activePackage = {
            id: booking.id,
            reference: booking.booking_reference,
            pricePaid: booking.total_amount,
            creditIssued: remaining + used,
            remainingAmount: remaining,
            usedAmount: used,
            status: booking.status,
            package: booking.packages,
            tableLabel: booking.table?.table_number || null
        };
        currentTabCredit = remaining;
    } else {
        activePackage = null;
        currentTabCredit = 0;
    }
    updateDisplay();
    renderIntegratedPackage();
    await renderVVIPBand();
}

function renderIntegratedPackage() {
    const container = document.getElementById('integratedPackageBody');
    if (!activePackage || !activePackage.package) {
        container.innerHTML = `<div class="no-package-message"><i class="fas fa-crown"></i><p>No active VVIP package</p><p style="font-size:0.7rem;">Visit VVIP Tables to purchase a package</p></div>`;
        document.getElementById('integratedPackageBadge').innerText = 'No Package';
        return;
    }
    const pkg = activePackage.package;
    const remaining = activePackage.remainingAmount;
    const total = activePackage.creditIssued;
    const used = activePackage.usedAmount;
    const percent = total > 0 ? Math.min(100, (remaining / total) * 100) : 0;

    container.innerHTML = `
        <div class="credit-ring-wrapper">
            <div class="credit-ring">
                <svg viewBox="0 0 120 120">
                    <defs>
                        <linearGradient id="creditGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stop-color="#E30613" />
                            <stop offset="100%" stop-color="#FF6B6B" />
                        </linearGradient>
                    </defs>
                    <circle class="bg" cx="60" cy="60" r="48" />
                    <circle class="progress" cx="60" cy="60" r="48"
                        stroke-dasharray="${2 * Math.PI * 48 * (percent/100)} ${2 * Math.PI * 48}"
                    />
                </svg>
                <div class="center-text">
                    R${remaining.toFixed(0)}
                    <small>Remaining</small>
                </div>
            </div>
        </div>
        <div class="package-info-grid">
            <div class="package-info-item">
                <div class="label">Package</div>
                <div class="value">${escapeHtml(pkg.name)}</div>
            </div>
            <div class="package-info-item">
                <div class="label">Your Table</div>
                <div class="value highlight">${escapeHtml(activePackage.tableLabel || 'Not yet assigned')}</div>
            </div>
            <div class="package-info-item">
                <div class="label">Tab Credit</div>
                <div class="value">R${total.toFixed(2)}</div>
            </div>
            <div class="package-info-item">
                <div class="label">Used</div>
                <div class="value highlight">R${used.toFixed(2)}</div>
            </div>
        </div>
    `;
    document.getElementById('integratedPackageBadge').innerText = 'Active';
}

function updateDisplay() {
    document.getElementById('tabCreditStat').innerHTML = `R${currentTabCredit.toFixed(2)}`;
    document.getElementById('statusStat').innerText = (currentProfile?.role === 'admin') ? 'Sovereign' : 'Noble';
    document.getElementById('bandTabCredit').innerHTML = `R${currentTabCredit.toFixed(2)}`;

    const tableStatEl = document.getElementById('vvipTableStat');
    const tableSubEl = document.getElementById('vvipTableSubStat');
    if (activePackage && activePackage.package) {
        tableStatEl.innerText = activePackage.tableLabel || 'Not yet assigned';
        tableSubEl.innerText = `${activePackage.package.name} · R${activePackage.remainingAmount.toFixed(2)} left on tab`;
    } else {
        tableStatEl.innerText = 'Not Assigned';
        tableSubEl.innerText = 'No active package';
    }
}

function getVVIPBand() {
    if (!currentProfile) return null;
    const bandId = currentProfile.phone || currentProfile.id;
    return { bandId, accountId: currentProfile.id, accountName: currentProfile.name, tabCredit: currentTabCredit };
}

async function renderVVIPBand() {
    if (!currentProfile) return;
    const band = getVVIPBand();
    document.getElementById('vvipBandNumber').textContent = band.bandId;
    document.getElementById('bandIdDisplay').textContent = band.bandId;
    document.getElementById('bandWalletName').textContent = currentProfile.name.toUpperCase();
    const qrContainer = document.getElementById('vvipBandQR');
    if (qrContainer) {
        await loadQrLib();
        qrContainer.innerHTML = "";
        const qrPayload = `VVIP_TAB:${band.bandId}|${currentProfile.id}|${currentProfile.name}|CREDIT:${currentTabCredit}`;
        new QRCode(qrContainer, { text: qrPayload, width: 130, height: 130, colorDark: "#E30613", correctLevel: QRCode.CorrectLevel.H });
    }
    updateDisplay();
}

async function printVVIPBand() {
    const band = getVVIPBand();
    const win = window.open('', '_blank');
    win.document.write(`
        <html><head><title>SOVEREIGN BAND</title><style>
            body{font-family:'Inter';background:#000;display:flex;justify-content:center;padding:20px;}
            .card{background:#111;border:3px solid #E30613;border-radius:48px;padding:32px;text-align:center;max-width:400px;}
            .crown{font-size:48px;color:#FFD700;}.qr{background:white;padding:15px;border-radius:24px;display:inline-block;margin:15px 0;}
            .credit{font-size:24px;color:#ffd700;margin:10px 0;}
        </style></head>
        <body><div class='card'><div class='crown'>👑</div>
        <h1 style='color:#FFD700'>SOVEREIGN BAND</h1>
        <div style='background:#1f1f1f;padding:8px;border-radius:40px;margin:15px 0;color:#E30613;font-weight:bold'>${band.bandId}</div>
        <div class='qr' id='printQR'></div>
        <div><strong>${currentProfile.name}</strong></div>
        <div class='credit'>Tab Credit: R${currentTabCredit.toFixed(2)}</div>
        <button onclick='window.print()'>Print Band</button>
        </div>
        <script src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'><\/script>
        <script>new QRCode(document.getElementById('printQR'),{text:"VVIP_TAB:${band.bandId}|${currentProfile.id}",width:130,height:130,colorDark:"#E30613"});<\/script>
        </body></html>
    `);
    win.document.close();
    await showVVIPInfo("Band Forged", `Your Sovereign band "${band.bandId}" with R${currentTabCredit.toFixed(2)} credit is ready.`);
}

async function loadPackages() {
    const { data } = await supabase.from('vvip_packages').select('*').eq('status', 'active').order('price');
    const container = document.getElementById('packagesGrid');
    if (!data?.length) { container.innerHTML = '<div class="loading-state"><i class="fas fa-crown"></i><p>No VVIP Tables available</p></div>'; return; }

    const packageIds = data.map(p => p.id);
    const { data: allTables } = await supabase.from('vvip_tables').select('id, package_id, table_number').in('package_id', packageIds);
    const { data: activeBookings } = await supabase.from('vvip_bookings').select('table_id').not('status', 'in', '(cancelled,no_show)').not('table_id', 'is', null);
    const bookedTableIds = new Set((activeBookings || []).map(b => b.table_id));
    const tablesByPackage = {};
    (allTables || []).forEach(t => { (tablesByPackage[t.package_id] = tablesByPackage[t.package_id] || []).push(t); });

    const eventIds = [...new Set(data.map(p => p.event_id).filter(Boolean))];
    if (eventIds.length) {
        const { data: eventsData } = await supabase.from('events').select('id, name, start_time').in('id', eventIds);
        eventsById = {};
        (eventsData || []).forEach(ev => { eventsById[ev.id] = ev; });
    }

    container.innerHTML = data.map(pkg => {
        const pkgTables = tablesByPackage[pkg.id] || [];
        const usesRealTables = pkgTables.length > 0;
        const tablesTotal = usesRealTables ? pkgTables.length : (pkg.capacity || 0);
        const tablesAvailable = usesRealTables
            ? pkgTables.filter(t => !bookedTableIds.has(t.id)).length
            : Math.max(0, (pkg.capacity || 0) - (pkg.sold_count || 0));
        const ev = pkg.event_id ? eventsById[pkg.event_id] : null;
        const eventLine = ev
            ? `<div style="font-size:0.7rem;color:var(--mist);margin-bottom:8px;"><i class="fas fa-calendar"></i> ${escapeHtml(ev.name)} · ${ev.start_time ? new Date(ev.start_time).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}) : 'Date TBC'}</div>`
            : '';
        return `<div class="package-card" onclick="window.selectPackage(${JSON.stringify(pkg).replace(/"/g, '&quot;')})">
            <div class="package-image">${pkg.image ? `<img src="${pkg.image}" style="width:100%;height:100%;object-fit:cover;">` : '<i class="fas fa-crown"></i>'}</div>
            <div class="package-content">
                <div class="package-header"><span class="package-name">${escapeHtml(pkg.name)}</span><span class="package-price">R${pkg.price}</span></div>
                ${eventLine}
                <div class="package-description">${escapeHtml(pkg.description || 'Premium VVIP experience')}</div>
                <div class="benefits-list">${(pkg.benefits || []).slice(0,2).map(b => `<span class="benefit-tag">${escapeHtml(b)}</span>`).join('')}</div>
                <div class="availability"><i class="fas fa-table"></i> ${tablesAvailable} of ${tablesTotal} tables available</div>
                <button class="purchase-btn" ${(tablesAvailable <= 0 || isWalletBlocked) ? 'disabled' : ''}>${isWalletBlocked ? '<i class="fas fa-ban"></i> Wallet Blocked' : (tablesAvailable <= 0 ? 'Sold Out' : 'Purchase Package')}</button>
            </div>
        </div>`;
    }).join('');
}

// Attached to window because the package cards' onclick attribute (built
// into an innerHTML template string above) needs to reach it. Assigning it
// at module scope — rather than inside init() — matches the original file;
// harmless here since dynamic import() only evaluates this module once per
// app session anyway.
window.selectPackage = async function(pkg) {
    if (isWalletBlocked) { showToastMsg(walletBlockReason, true); return; }
    if (currentTabCredit > 0) {
        showToastMsg(`Cannot purchase - you already have an active package with R${currentTabCredit} remaining. Use that first.`, true);
        return;
    }
    selectedPackage = pkg;
    selectedTableId = null;
    selectedTableLabel = null;

    const { data: tables } = await supabase.from('vvip_tables').select('id, table_number').eq('package_id', pkg.id).order('table_number');
    const { data: activeBookings } = await supabase.from('vvip_bookings').select('table_id').not('status', 'in', '(cancelled,no_show)').not('table_id', 'is', null);
    const bookedTableIds = new Set((activeBookings || []).map(b => b.table_id));
    availableTablesForSelection = (tables || []).map(t => ({ ...t, taken: bookedTableIds.has(t.id) }));

    document.getElementById('purchaseModalTitle').innerText = pkg.name;

    const label = document.getElementById('tableSelectionLabel');
    const grid = document.getElementById('tableSelectionGrid');
    if (availableTablesForSelection.length > 0) {
        const anyAvailable = availableTablesForSelection.some(t => !t.taken);
        label.style.display = 'block';
        grid.style.display = 'flex';
        if (!anyAvailable) {
            grid.innerHTML = '<div style="color:var(--mist);font-size:0.75rem;">No tables available right now</div>';
        } else {
            grid.innerHTML = availableTablesForSelection.map(t => `
                <button type="button" class="table-select-chip ${t.taken ? 'taken' : ''}" data-id="${t.id}" data-label="${escapeHtml(t.table_number)}" ${t.taken ? 'disabled' : ''}>${escapeHtml(t.table_number)}</button>
            `).join('');
            grid.querySelectorAll('.table-select-chip:not(.taken)').forEach(chip => {
                chip.addEventListener('click', () => {
                    grid.querySelectorAll('.table-select-chip').forEach(c => c.classList.remove('selected'));
                    chip.classList.add('selected');
                    selectedTableId = chip.dataset.id;
                    selectedTableLabel = chip.dataset.label;
                    updatePurchaseSummary();
                });
            });
        }
    } else {
        label.style.display = 'none';
        grid.style.display = 'none';
        grid.innerHTML = '';
    }

    updatePurchaseSummary();
    document.getElementById('purchaseModal').classList.add('active');
};

function updatePurchaseSummary() {
    const pkg = selectedPackage;
    if (!pkg) return;
    const tabCredit = pkg.tab_credit || 0;
    const tableLine = availableTablesForSelection.length
        ? (selectedTableLabel
            ? `<div style="margin-top:8px;">Your table: <strong>${escapeHtml(selectedTableLabel)}</strong></div>`
            : `<div style="margin-top:8px;color:var(--red);font-weight:600;">Please select a table above</div>`)
        : '';
    document.getElementById('purchaseModalMessage').innerHTML = `
        <div style="background:var(--bone);padding:16px;border-radius:16px;">
            <div>Table Price: <strong>R${pkg.price}</strong></div>
            ${tableLine}
            <div style="margin-top:8px;">After purchase you will have <strong>R${tabCredit.toFixed(2)}</strong> tab credit.</div>
        </div>
    `;
}

async function confirmPurchase() {
    if (!selectedPackage) return;
    if (isWalletBlocked) { showToastMsg(walletBlockReason, true); document.getElementById('purchaseModal').classList.remove('active'); return; }
    if (availableTablesForSelection.length > 0 && !selectedTableId) {
        showToastMsg('Please select a table first', true);
        return;
    }
    if (selectedTableId) {
        const { data: clash } = await supabase
            .from('vvip_bookings')
            .select('id')
            .eq('table_id', selectedTableId)
            .not('status', 'in', '(cancelled,no_show)')
            .limit(1);
        if (clash && clash.length) {
            showToastMsg('That table was just booked by someone else — pick another', true);
            await window.selectPackage(selectedPackage);
            return;
        }
    }
    const bookingRef = `VVIP-${Date.now()}`;
    const tabCredit = selectedPackage.tab_credit || 0;
    const { error: bookingErr } = await supabase.from('vvip_bookings').insert([{
        package_id: selectedPackage.id,
        customer_id: currentProfile.id,
        customer_phone: currentProfile.phone,
        customer_name: currentProfile.name,
        booking_reference: bookingRef,
        quantity: 1,
        total_amount: selectedPackage.price,
        remaining_balance: tabCredit,
        used_amount: 0,
        status: 'confirmed',
        table_id: selectedTableId || null
    }]);
    if (bookingErr) { showToastMsg('Booking failed: ' + bookingErr.message, true); return; }
    await supabase.from('vvip_packages').update({ sold_count: (selectedPackage.sold_count || 0) + 1 }).eq('id', selectedPackage.id);
    showToastMsg(`Package purchased! Ref: ${bookingRef}${selectedTableLabel ? ' | Table: ' + selectedTableLabel : ''} | Credit: R${tabCredit.toFixed(2)}`);
    document.getElementById('purchaseModal').classList.remove('active');
    await loadActivePackageAndCredit();
    await loadPackages();
    selectedPackage = null;
    selectedTableId = null;
    selectedTableLabel = null;
    availableTablesForSelection = [];
}

async function sendServiceRequest() {
    if (!currentProfile) return;
    if (isWalletBlocked) { showToastMsg(walletBlockReason, true); return; }
    if (currentTabCredit <= 0) {
        await showVVIPInfo("No Credit Available", "You don't have any active VVIP package credit. Please purchase a package first.");
        return;
    }
    const { error } = await supabase.from('service_requests').insert([{
        customer_id: currentProfile.id,
        customer_name: currentProfile.name,
        remaining_balance: currentTabCredit,
        table_location: 'POS will assign',
        status: 'pending'
    }]);
    if (error) { showToastMsg('Request failed: ' + error.message, true); return; }
    document.getElementById('serviceRequestModal').classList.remove('active');
    await showVVIPInfo("✨ Request Sent ✨", "Staff has been notified. They will load your tab at the POS.");
}

async function openServiceRequestModal() {
    if (isWalletBlocked) { showToastMsg(walletBlockReason, true); return; }
    if (currentTabCredit <= 0) {
        await showVVIPInfo("No Active Package", "You need an active VVIP package with credit to request service. Visit VVIP Tables to purchase.");
        return;
    }
    document.getElementById('serviceRequestBalance').innerHTML = `R${currentTabCredit.toFixed(2)}`;
    document.getElementById('serviceRequestModal').classList.add('active');
}

function switchToStore() {
    document.getElementById('storePanel').style.display = 'block';
    document.getElementById('wristbandPanel').style.display = 'none';
    document.getElementById('storeTabBtn').classList.add('active');
    document.getElementById('wristbandTabBtn').classList.remove('active');
    loadPackages();
}
function switchToWristband() {
    document.getElementById('storePanel').style.display = 'none';
    document.getElementById('wristbandPanel').style.display = 'block';
    document.getElementById('storeTabBtn').classList.remove('active');
    document.getElementById('wristbandTabBtn').classList.add('active');
    renderVVIPBand();
    loadActivePackageAndCredit();
}

function wireStaticListeners() {
    const bind = (id, evt, fn) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener(evt, fn);
        onCleanup(() => el.removeEventListener(evt, fn));
    };
    bind('printVVIPBandBtn', 'click', printVVIPBand);
    bind('requestServiceBtn', 'click', openServiceRequestModal);
    bind('submitServiceRequest', 'click', sendServiceRequest);
    bind('cancelServiceRequest', 'click', () => document.getElementById('serviceRequestModal').classList.remove('active'));
    bind('purchaseModalCancelBtn', 'click', () => document.getElementById('purchaseModal').classList.remove('active'));
    bind('purchaseModalConfirmBtn', 'click', confirmPurchase);
    bind('storeTabBtn', 'click', switchToStore);
    bind('wristbandTabBtn', 'click', switchToWristband);
    bind('howToPayBtn', 'click', async () => {
        await showVVIPInfo("Cashless Decree", "Present your QR wristband at any VVIP POS. Staff will scan and deduct from your Tab Credit automatically.");
    });
    // homeIconBtn / .brand navigate via data-link in the fragment — the
    // router's global click delegation handles those, no JS needed here.
}

export default {
    async init() {
        if (!(await loadUserAndPackageCredit())) return;
        await renderVVIPBand();
        loadPackages();
        wireStaticListeners();

        vvipChannel = supabase
            .channel('vvip-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vvip_bookings', filter: `customer_id=eq.${currentProfile.id}` }, () => loadActivePackageAndCredit())
            .subscribe();
        onCleanup(() => { if (vvipChannel) { supabase.removeChannel(vvipChannel); vvipChannel = null; } });

        vvipWalletChannel = supabase
            .channel('vvip-wallet-status')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wallets', filter: `user_id=eq.${currentUser.id}` }, (payload) => {
                isWalletBlocked = (payload.new.status || '').toLowerCase() === 'blocked';
                walletBlockReason = payload.new.block_reason || 'Your wallet has been blocked. Please contact support for assistance.';
                renderWalletBlockedBanners();
                loadPackages();
            })
            .subscribe();
        onCleanup(() => { if (vvipWalletChannel) { supabase.removeChannel(vvipWalletChannel); vvipWalletChannel = null; } });
    },

    destroy() {
        cleanup.forEach(fn => fn());
        cleanup = [];
    }
};
