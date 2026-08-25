    import { supabase } from '../../config/supabase.js';

    // ─── CONSTANTS ───
    const COAL_DURATION = 60; // minutes
    const REFILL_THRESHOLD = 15;
    const DURATION_SECONDS = COAL_DURATION * 60;
    let realtimeSubscription = null;
    let activeSessions = [];
    let charts = {};

    // ─── MODAL ───
    let modalResolver = null;
    const modalOverlay = document.getElementById('confirmationModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');

    function showConfirm(message, title = "Confirm Action") {
        return new Promise((resolve) => {
            modalTitle.innerText = title;
            modalMessage.innerText = message;
            modalOverlay.classList.add('active');
            modalResolver = resolve;
        });
    }
    function closeModal(confirmed) {
        modalOverlay.classList.remove('active');
        if (modalResolver) { modalResolver(confirmed); modalResolver = null; }
    }
    confirmBtn.onclick = () => closeModal(true);
    cancelBtn.onclick = () => closeModal(false);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(false); });

    // ─── TOAST ───
    function showToast(msg, isError = false) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.className = `toast ${isError ? 'error' : 'success'} show`;
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // ─── HELPERS ───
    function escapeHtml(str) { if (!str) return ''; return String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]); }
    function fmtR(val) { return `R${(val||0).toFixed(2)}`; }
    function calculateRemainingSeconds(session) {
        if (!session) return 0;
        if (session.paused || session.status === 'expired') return session.remaining_time_seconds || 0;
        const refTime = session.last_refill_time ? new Date(session.last_refill_time) : new Date(session.start_time);
        const elapsed = Math.floor((Date.now() - refTime.getTime()) / 1000);
        let remaining = DURATION_SECONDS - elapsed;
        return remaining > 0 ? remaining : 0;
    }
    function formatTime(seconds) {
        if (seconds <= 0) return "EXPIRED";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    }
    function determineSessionStatus(session) {
        if (session.paused) return 'paused';
        if (session.status === 'expired') return 'expired';
        const rem = calculateRemainingSeconds(session);
        if (rem <= 0) return 'expired';
        if (rem <= REFILL_THRESHOLD * 60) return 'refill';
        return 'active';
    }

    // ─── LOAD DATA ───
    async function loadFlavours() {
        try {
            const { data, error } = await supabase.from('shisha_products').select('*').order('name');
            if (error) throw error;
            const container = document.getElementById('flavoursList');
            if (!data.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-leaf"></i><p>No flavours. Add one above.</p></div>'; return; }
            container.innerHTML = data.map(p => `
                <div class="item-card" data-id="${p.id}">
                    <div class="item-info">
                        <div class="name">${escapeHtml(p.name)}</div>
                        <div class="meta">${fmtR(p.price)} • ${p.is_available ? 'In Stock' : 'Out of Stock'}</div>
                    </div>
                    <div class="item-actions">
                        <button class="edit-price" data-id="${p.id}" data-price="${p.price}" title="Edit price">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="toggle-availability" data-id="${p.id}" data-avail="${p.is_available}" title="${p.is_available ? 'Mark out of stock' : 'Mark in stock'}">
                            <i class="fas ${p.is_available ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                        </button>
                        <button class="delete-flavour danger" data-id="${p.id}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `).join('');
            document.querySelectorAll('.edit-price').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    const currentPrice = parseFloat(btn.dataset.price);
                    const input = window.prompt('New price (R):', currentPrice);
                    if (input === null) return; // cancelled
                    const newPrice = parseFloat(input);
                    if (isNaN(newPrice) || newPrice < 0) { showToast('Enter a valid price', true); return; }
                    const { error } = await supabase.from('shisha_products').update({ price: newPrice }).eq('id', id);
                    if (error) showToast(error.message, true);
                    else { await loadFlavours(); showToast('Price updated'); }
                });
            });
            document.querySelectorAll('.toggle-availability').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    const current = btn.dataset.avail === 'true';
                    const { error } = await supabase.from('shisha_products').update({ is_available: !current }).eq('id', id);
                    if (error) showToast(error.message, true);
                    else { await loadFlavours(); showToast(current ? 'Marked out of stock' : 'Marked in stock'); }
                });
            });
            document.querySelectorAll('.delete-flavour').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!await showConfirm('Delete this flavour?')) return;
                    const id = btn.dataset.id;
                    const { error } = await supabase.from('shisha_products').delete().eq('id', id);
                    if (error) showToast(error.message, true);
                    else { await loadFlavours(); showToast('Deleted'); }
                });
            });
        } catch (error) { showToast('Failed to load flavours', true); }
    }

    async function loadDevices() {
        try {
            const { data, error } = await supabase.from('hookah_devices').select('*').order('device_code');
            if (error) throw error;
            const container = document.getElementById('devicesList');
            if (!data.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-fire"></i><p>No devices.</p></div>'; return; }
            container.innerHTML = data.map(d => `
                <div class="item-card" data-id="${d.id}">
                    <div class="item-info">
                        <div class="name">${escapeHtml(d.device_code)} ${d.device_name ? `(${escapeHtml(d.device_name)})` : ''}</div>
                        <div class="meta">
                            <span class="device-status status-${d.status}">${d.status}</span>
                        </div>
                    </div>
                    <div class="item-actions">
                        <select class="status-select" data-id="${d.id}" style="padding:4px 8px; border-radius:30px; background:var(--s1); color:var(--text); border:1px solid var(--border);">
                            <option value="available" ${d.status === 'available' ? 'selected' : ''}>Available</option>
                            <option value="maintenance" ${d.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
                            <option value="deleted" ${d.status === 'deleted' ? 'selected' : ''}>Deleted</option>
                        </select>
                        <button class="delete-device danger" data-id="${d.id}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `).join('');
            document.querySelectorAll('.status-select').forEach(select => {
                select.addEventListener('change', async () => {
                    const id = select.dataset.id;
                    const newStatus = select.value;
                    const { error } = await supabase.from('hookah_devices').update({ status: newStatus }).eq('id', id);
                    if (error) showToast(error.message, true);
                    else { await loadDevices(); showToast('Device updated'); }
                });
            });
            document.querySelectorAll('.delete-device').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!await showConfirm('Mark device as deleted?')) return;
                    const id = btn.dataset.id;
                    const { error } = await supabase.from('hookah_devices').update({ status: 'deleted' }).eq('id', id);
                    if (error) showToast(error.message, true);
                    else { await loadDevices(); showToast('Marked deleted'); }
                });
            });
        } catch (error) { showToast('Failed to load devices', true); }
    }

    async function loadLocations() {
        try {
            const { data, error } = await supabase.from('shisha_locations').select('*').order('name');
            if (error) throw error;
            const container = document.getElementById('locationsList');
            if (!data.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-map-marker-alt"></i><p>No shisha stations.</p></div>'; return; }
            container.innerHTML = data.map(l => `
                <div class="item-card" data-id="${l.id}">
                    <div class="item-info">
                        <div class="name">${escapeHtml(l.name)}</div>
                        <div class="meta">${l.is_active ? 'Active' : 'Inactive'}</div>
                    </div>
                    <div class="item-actions">
                        <button class="toggle-location" data-id="${l.id}" data-active="${l.is_active}">
                            <i class="fas ${l.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
                        </button>
                        <button class="delete-location danger" data-id="${l.id}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `).join('');
            document.querySelectorAll('.toggle-location').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    const current = btn.dataset.active === 'true';
                    const { error } = await supabase.from('shisha_locations').update({ is_active: !current }).eq('id', id);
                    if (error) showToast(error.message, true);
                    else { await loadLocations(); showToast('Updated'); }
                });
            });
            document.querySelectorAll('.delete-location').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!await showConfirm('Delete this shisha station?')) return;
                    const id = btn.dataset.id;
                    const { error } = await supabase.from('shisha_locations').delete().eq('id', id);
                    if (error) showToast(error.message, true);
                    else { await loadLocations(); showToast('Deleted'); }
                });
            });
        } catch (error) { showToast('Failed to load shisha stations', true); }
    }

    async function loadActiveSessions() {
        const container = document.getElementById('sessionsList');
        container.innerHTML = '<div class="loading-state">Loading active sessions...</div>';
        try {
            const { data, error } = await supabase
                .from('shisha_sessions')
                .select(`
                    id, device_id, product_id, location_id, start_time, last_refill_time,
                    remaining_time_seconds, total_amount, refill_count, status, paused,
                    payment_method, customer_phone,
                    hookah_devices!inner (device_code),
                    shisha_products!inner (name, price),
                    shisha_locations!inner (name)
                `)
                .in('status', ['active', 'refill', 'paused'])
                .order('start_time', { ascending: false });
            if (error) throw error;
            if (!data || data.length === 0) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-hourglass-half"></i><p>No active sessions.</p></div>';
                activeSessions = [];
                return;
            }
            activeSessions = data.map(s => ({
                id: s.id,
                deviceId: s.device_id,
                deviceCode: s.hookah_devices?.device_code || 'Unknown',
                flavour: s.shisha_products?.name || 'Unknown',
                flavourPrice: s.shisha_products?.price || 250,
                location: s.shisha_locations?.name || 'Unknown',
                startTime: new Date(s.start_time),
                lastRefillTime: s.last_refill_time ? new Date(s.last_refill_time) : null,
                remaining_time_seconds: s.remaining_time_seconds,
                total_amount: s.total_amount,
                refillCount: s.refill_count || 0,
                status: s.status,
                paused: s.paused,
                paymentMethod: s.payment_method,
                customer_phone: s.customer_phone || 'Walk-in'
            }));
            const html = `
                <table class="sessions-table">
                    <thead><tr>
                        <th>Device</th><th>Flavour</th><th>Shisha Station</th><th>Time Left</th>
                        <th>Status</th><th>Customer</th><th>Total</th><th>Refills</th>
                    </tr></thead>
                    <tbody>
                        ${activeSessions.map(s => {
                            const rem = calculateRemainingSeconds(s);
                            const timeLeft = rem <= 0 ? 'EXPIRED' : formatTime(rem);
                            const statusClass = s.paused ? 'paused' : (s.status === 'refill' ? 'refill' : (s.status === 'expired' ? 'expired' : 'active'));
                            const statusText = s.paused ? 'Paused' : (s.status === 'refill' ? 'Refill Soon' : (s.status === 'expired' ? 'Expired' : 'Active'));
                            return `<tr>
                                <td><strong>${escapeHtml(s.deviceCode)}</strong></td>
                                <td>${escapeHtml(s.flavour)}</td>
                                <td>${escapeHtml(s.location)}</td>
                                <td><span style="font-family:monospace;font-weight:600;">${timeLeft}</span></td>
                                <td><span class="session-status-badge session-status-${statusClass}">${statusText}</span></td>
                                <td>${escapeHtml(s.customer_phone)}</td>
                                <td>${fmtR(s.total_amount)}</td>
                                <td>${s.refillCount}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            `;
            container.innerHTML = html;
        } catch (error) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error: ${error.message}</p></div>`;
            showToast('Failed to load sessions', true);
        }
    }

    // ─── REFRESH ───
    async function refreshAllData() {
        showToast('Refreshing...');
        await Promise.all([loadFlavours(), loadDevices(), loadLocations(), loadActiveSessions()]);
        if (document.getElementById('dashboardOverlay').classList.contains('open')) renderCharts();
        showToast('Data refreshed');
    }
    window.refreshAllData = refreshAllData;

    // ─── TAB SWITCHING ───
    async function switchTab(tabId) {
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`${tabId}Panel`).classList.add('active');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
        if (tabId === 'sessions') await loadActiveSessions();
        else if (tabId === 'flavours') await loadFlavours();
        else if (tabId === 'devices') await loadDevices();
        else if (tabId === 'locations') await loadLocations();
    }
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // ─── ADD BUTTONS ───
    document.getElementById('addFlavourBtn').onclick = async () => {
        const name = document.getElementById('newFlavourName').value.trim();
        const price = parseFloat(document.getElementById('newFlavourPrice').value);
        if (!name || isNaN(price)) { showToast('Enter name and price', true); return; }
        const { error } = await supabase.from('shisha_products').insert({ name, price, is_available: true });
        if (error) showToast(error.message, true);
        else { document.getElementById('newFlavourName').value = ''; await loadFlavours(); showToast('Flavour added'); }
    };
    document.getElementById('addDeviceBtn').onclick = async () => {
        const code = document.getElementById('newDeviceCode').value.trim().toUpperCase();
        if (!code) { showToast('Enter device code', true); return; }
        const status = document.getElementById('newDeviceStatus').value;
        const { error } = await supabase.from('hookah_devices').insert({ device_code: code, status });
        if (error) showToast(error.message, true);
        else { document.getElementById('newDeviceCode').value = ''; await loadDevices(); showToast('Device added'); }
    };
    document.getElementById('addLocationBtn').onclick = async () => {
        const name = document.getElementById('newLocationName').value.trim();
        if (!name) { showToast('Enter shisha station name', true); return; }
        const { error } = await supabase.from('shisha_locations').insert({ name });
        if (error) showToast(error.message, true);
        else { document.getElementById('newLocationName').value = ''; await loadLocations(); showToast('Shisha Station added'); }
    };

    // ─── TIMER UPDATER ───
    function startTimerUpdater() {
        setInterval(() => {
            const panel = document.getElementById('sessionsPanel');
            if (panel.classList.contains('active') && activeSessions.length > 0) {
                const rows = document.querySelectorAll('#sessionsList tbody tr');
                rows.forEach((row, idx) => {
                    if (idx < activeSessions.length) {
                        const s = activeSessions[idx];
                        const rem = calculateRemainingSeconds(s);
                        const timeLeft = rem <= 0 ? 'EXPIRED' : formatTime(rem);
                        const cell = row.cells[3];
                        if (cell) cell.innerHTML = `<span style="font-family:monospace;font-weight:600;">${timeLeft}</span>`;
                    }
                });
            }
        }, 1000);
    }

    // ─── REALTIME ───
    function setupRealtime() {
        if (realtimeSubscription) realtimeSubscription.unsubscribe();
        realtimeSubscription = supabase
            .channel('shisha-admin')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shisha_sessions' }, () => {
                if (document.getElementById('sessionsPanel').classList.contains('active')) loadActiveSessions();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shisha_products' }, () => {
                if (document.getElementById('flavoursPanel').classList.contains('active')) loadFlavours();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'hookah_devices' }, () => {
                if (document.getElementById('devicesPanel').classList.contains('active')) loadDevices();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shisha_locations' }, () => {
                if (document.getElementById('locationsPanel').classList.contains('active')) loadLocations();
            })
            .subscribe();
    }

    // ─── DASHBOARD TOGGLE ───
    function toggleDashboard() {
        const overlay = document.getElementById('dashboardOverlay');
        overlay.classList.toggle('open');
        document.getElementById('toggleDashBtn').classList.toggle('active-toggle', overlay.classList.contains('open'));
        if (overlay.classList.contains('open')) renderCharts();
    }
    window.toggleDashboard = toggleDashboard;

    // ─── CHARTS ───
    async function renderCharts() {
        // Fetch data for charts
        const { data: allSessions, error: sErr } = await supabase
            .from('shisha_sessions')
            .select('total_amount, status, created_at, refill_count')
            .order('created_at', { ascending: false })
            .limit(200);
        const { data: allDevices } = await supabase.from('hookah_devices').select('status');
        const { data: allFlavours } = await supabase.from('shisha_products').select('name, is_available');

        const sessions = allSessions || [];
        const devices = allDevices || [];
        const flavours = allFlavours || [];

        // KPIs
        const totalRevenue = sessions.reduce((s, row) => s + (row.total_amount || 0), 0);
        const activeSessions = sessions.filter(r => r.status === 'active').length;
        const totalSessions = sessions.length;
        const refillCount = sessions.reduce((s, r) => s + (r.refill_count || 0), 0);
        const availableDevices = devices.filter(d => d.status === 'available').length;
        const inUseDevices = devices.filter(d => d.status === 'active').length;
        const utilization = devices.length ? Math.round((inUseDevices / devices.length) * 100) : 0;

        document.getElementById('dashKpiGrid').innerHTML = `
            <div class="dash-kpi"><div class="val">${fmtR(totalRevenue)}</div><div class="label">Total Revenue</div></div>
            <div class="dash-kpi"><div class="val">${activeSessions}</div><div class="label">Active Sessions</div></div>
            <div class="dash-kpi"><div class="val">${totalSessions}</div><div class="label">Total Sessions</div></div>
            <div class="dash-kpi"><div class="val">${utilization}%</div><div class="label">Hookah Utilization</div><div class="sub">${inUseDevices} in use / ${devices.length} total</div></div>
        `;

        // Revenue Trend (last 7 days)
        const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        const revData = days.map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            const dayStr = d.toISOString().split('T')[0];
            return sessions.filter(r => r.created_at?.startsWith(dayStr)).reduce((s, r) => s + (r.total_amount || 0), 0);
        });
        const ctx1 = document.getElementById('dashRevenueChart').getContext('2d');
        if (charts.revenue) charts.revenue.destroy();
        charts.revenue = new Chart(ctx1, {
            type: 'line',
            data: { labels: days, datasets: [{ label: 'Revenue (R)', data: revData, borderColor: '#E30613', backgroundColor: 'rgba(227,6,19,0.1)', fill: true, tension: 0.3 }] },
            options: { responsive: true, plugins: { tooltip: { callbacks: { label: (ctx) => fmtR(ctx.raw) } } } }
        });

        // Session Status
        const statusCounts = { active:0, refill:0, paused:0, expired:0, completed:0 };
        sessions.forEach(r => { if (statusCounts[r.status] !== undefined) statusCounts[r.status]++; });
        const ctx2 = document.getElementById('dashSessionChart').getContext('2d');
        if (charts.session) charts.session.destroy();
        charts.session = new Chart(ctx2, {
            type: 'doughnut',
            data: { labels: ['Active','Refill Soon','Paused','Expired','Completed'], datasets: [{ data: [statusCounts.active, statusCounts.refill, statusCounts.paused, statusCounts.expired, statusCounts.completed], backgroundColor: ['#E30613','#f59e0b','#ff8f00','#6b7280','#10b981'] }] },
            options: { responsive: true, plugins: { legend: { labels: { color: '#71717a', boxWidth: 8 } } } }
        });

        // Hookah Utilization
        const inUse = devices.filter(d => d.status === 'active').length;
        const avail = devices.filter(d => d.status === 'available').length;
        const maint = devices.filter(d => d.status === 'maintenance').length;
        const ctx3 = document.getElementById('dashUtilChart').getContext('2d');
        if (charts.util) charts.util.destroy();
        charts.util = new Chart(ctx3, {
            type: 'bar',
            data: { labels: ['In Use', 'Available', 'Maintenance'], datasets: [{ label: 'Hookahs', data: [inUse, avail, maint], backgroundColor: ['#E30613', '#22c55e', '#f59e0b'], borderRadius: 4 }] },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#71717a', stepSize: 1 } } } }
        });

        // Top Flavours
        const flavourCount = {};
        const flavourRevenue = {};
        sessions.forEach(r => {
            const name = r.shisha_products?.name || 'Unknown';
            flavourCount[name] = (flavourCount[name] || 0) + 1;
            flavourRevenue[name] = (flavourRevenue[name] || 0) + (r.total_amount || 0);
        });
        const sorted = Object.entries(flavourCount).sort((a,b) => b[1] - a[1]).slice(0,5);
        const topContainer = document.getElementById('dashTopFlavours');
        if (sorted.length) {
            topContainer.innerHTML = sorted.map(([name, count], idx) => `
                <div class="dash-activity-item" style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:0.7rem;">
                    <span>${idx+1}. ${name}</span>
                    <span style="color:var(--red);font-weight:700;">${count} sessions</span>
                </div>
            `).join('');
        } else {
            topContainer.innerHTML = '<div style="color:var(--muted);font-size:0.7rem;">No data</div>';
        }

        // Alerts
        const alerts = [];
        if (statusCounts.refill > 3) alerts.push({ level:'warning', title:'Multiple Refills Needed', desc:`${statusCounts.refill} sessions require coal refill` });
        if (avail === 0 && inUse > 0) alerts.push({ level:'info', title:'All Hookahs Occupied', desc:'Consider adding more stations' });
        if (devices.length === 0) alerts.push({ level:'info', title:'No Hookah Devices', desc:'Add devices to track sessions' });
        const alertContainer = document.getElementById('dashAlerts');
        if (alerts.length) {
            alertContainer.innerHTML = alerts.map(a => `
                <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.7rem;">
                    <i class="fas fa-exclamation-circle" style="color:${a.level==='warning'?'var(--gold)':'#3b82f6'}"></i>
                    <div><strong>${a.title}</strong> · ${a.desc}</div>
                </div>
            `).join('');
        } else {
            alertContainer.innerHTML = '<div style="color:var(--muted);font-size:0.7rem;">No alerts</div>';
        }
    }

    // ─── INIT ───
    async function init() {
        await Promise.all([loadFlavours(), loadDevices(), loadLocations(), loadActiveSessions()]);
        setupRealtime();
        startTimerUpdater();
        // Close overlay on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const overlay = document.getElementById('dashboardOverlay');
                if (overlay.classList.contains('open')) toggleDashboard();
            }
        });
        console.log('Shisha Admin initialized');
    }

    init();
    window.addEventListener('beforeunload', () => { if (realtimeSubscription) realtimeSubscription.unsubscribe(); });
