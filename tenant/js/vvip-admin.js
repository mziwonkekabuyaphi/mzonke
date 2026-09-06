    import { supabase } from '../../config/supabase.js';

    // ─── STATE ───
    let currentEditingId = null;
    let benefitsArray = [];
    let currentImageBase64 = null;
    let packages = [];
    let pendingDeletePackage = null;
    let charts = {};
    let tableLabels = []; // per-table names for the package currently open in the modal
    let existingTableRows = []; // vvip_tables rows already saved for the package being edited
    let events = []; // cached events list, used to populate the Event dropdown and show dates on cards
    let currentView = 'buyers';
    let bookings = []; // vvip_bookings joined with lookup data, used by the Buyers & Tabs view
    let buyerTablesMap = {}; // vvip_tables id -> table_number
    let buyerProfilesMap = {}; // customer_id -> { name, email, phone }
    let currentBuyerBooking = null;
    let currentBuyerTx = [];
    let currentTxFilter = 'all';

    // ─── HELPERS ───
    function showToast(message, isError = false) {
        const toast = document.getElementById('toastMessage');
        toast.innerText = message;
        toast.style.background = isError ? '#dc2626' : 'var(--s2)';
        toast.style.color = isError ? 'white' : 'var(--text)';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]);
    }

    function fmtR(val) { return `R${(val||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
    function fmtDate(val) {
        if (!val) return 'No date set';
        return new Date(val).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    }

    // ─── EVENTS (packages are tied to an event, which carries the date) ───
    async function loadEvents() {
        try {
            const { data, error } = await supabase
                .from('events')
                .select('id, name, start_time')
                .order('start_time', { ascending: true });
            if (error) throw error;
            events = data || [];
            populateEventSelect();
        } catch (err) {
            console.warn('Could not load events:', err);
        }
    }
    function populateEventSelect() {
        const select = document.getElementById('packageEvent');
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">Select an event…</option>' + events.map(ev =>
            `<option value="${ev.id}">${escapeHtml(ev.name)} — ${fmtDate(ev.start_time)}</option>`
        ).join('');
        if (current) select.value = current;
    }

    // ─── BENEFITS ───
    function updateBenefitsDisplay() {
        const container = document.getElementById('benefitsList');
        if (!container) return;
        if (benefitsArray.length === 0) {
            container.innerHTML = '<span style="color:var(--muted);font-size:0.7rem;">No benefits added yet</span>';
            return;
        }
        container.innerHTML = benefitsArray.map((b, idx) => `
            <div class="benefit-item">
                <i class="fas fa-check-circle"></i> ${escapeHtml(b)}
                <button type="button" onclick="window.removeBenefit(${idx})">&times;</button>
            </div>
        `).join('');
    }
    window.removeBenefit = function(idx) {
        benefitsArray.splice(idx, 1);
        updateBenefitsDisplay();
    };
    document.getElementById('addBenefitBtn')?.addEventListener('click', () => {
        const input = document.getElementById('benefitInput');
        const benefit = input.value.trim();
        if (benefit && !benefitsArray.includes(benefit)) {
            benefitsArray.push(benefit);
            updateBenefitsDisplay();
            input.value = '';
            input.focus();
        }
    });

    // ─── TABLE NAMES (one input per table, defaults to "Table N") ───
    function renderTableLabelInputs() {
        const capacity = parseInt(document.getElementById('packageCapacity').value) || 0;
        const group = document.getElementById('tableLabelsGroup');
        const container = document.getElementById('tableLabelsContainer');
        if (!capacity || capacity < 1) {
            group.style.display = 'none';
            container.innerHTML = '';
            return;
        }
        group.style.display = 'block';
        // Grow/shrink the labels array to match capacity, keeping anything already typed/loaded
        const newLabels = [];
        for (let i = 0; i < capacity; i++) {
            newLabels.push(tableLabels[i] || `Table ${i + 1}`);
        }
        tableLabels = newLabels;
        container.innerHTML = tableLabels.map((label, idx) => `
            <input type="text" class="table-label-input" data-idx="${idx}" value="${escapeHtml(label)}" placeholder="Table ${idx + 1}">
        `).join('');
        container.querySelectorAll('.table-label-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                tableLabels[idx] = e.target.value.trim() || `Table ${idx + 1}`;
            });
        });
    }
    document.getElementById('packageCapacity').addEventListener('input', renderTableLabelInputs);

    // ─── IMAGE UPLOAD ───
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    function setupImageUpload() {
        const uploadArea = document.getElementById('imageUploadArea');
        const imageInput = document.getElementById('imageInput');
        const previewContainer = document.getElementById('imagePreviewContainer');
        const preview = document.getElementById('imagePreview');
        const removeBtn = document.getElementById('removeImageBtn');
        uploadArea.addEventListener('click', () => imageInput.click());
        imageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                if (file.size > 2*1024*1024) { showToast('Image too large. Max 2MB.', true); return; }
                try {
                    const base64 = await fileToBase64(file);
                    currentImageBase64 = base64;
                    preview.src = base64;
                    previewContainer.style.display = 'block';
                    uploadArea.style.display = 'none';
                } catch (err) { showToast('Failed to upload image', true); }
            } else { showToast('Please select a valid image file', true); }
        });
        removeBtn.addEventListener('click', () => {
            currentImageBase64 = null;
            preview.src = '';
            previewContainer.style.display = 'none';
            uploadArea.style.display = 'block';
            imageInput.value = '';
        });
    }
    function resetImageUpload() {
        currentImageBase64 = null;
        document.getElementById('imageUploadArea').style.display = 'block';
        document.getElementById('imagePreviewContainer').style.display = 'none';
        document.getElementById('imageInput').value = '';
    }

    // ─── MODAL CONTROLS ───
    function openCreateModal() {
        currentEditingId = null;
        benefitsArray = [];
        currentImageBase64 = null;
        tableLabels = [];
        existingTableRows = [];
        document.getElementById('modalTitle').innerText = 'Create VVIP Package';
        document.getElementById('packageForm').reset();
        document.getElementById('packageStatus').value = 'active';
        document.getElementById('packageTabCredit').value = '0';
        populateEventSelect();
        document.getElementById('packageEvent').value = '';
        updateBenefitsDisplay();
        renderTableLabelInputs();
        resetImageUpload();
        document.getElementById('packageModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    window.editPackage = async function(id) {
        const pkg = packages.find(p => p.id === id);
        if (!pkg) return;
        currentEditingId = id;
        benefitsArray = pkg.benefits || [];
        currentImageBase64 = pkg.image || null;
        document.getElementById('modalTitle').innerText = 'Edit VVIP Package';
        document.getElementById('packageName').value = pkg.name;
        populateEventSelect();
        document.getElementById('packageEvent').value = pkg.event_id || '';
        document.getElementById('packageDescription').value = pkg.description || '';
        document.getElementById('packagePrice').value = pkg.price;
        document.getElementById('packageCapacity').value = pkg.capacity;
        document.getElementById('packageTabCredit').value = pkg.tab_credit || 0;
        document.getElementById('packageStatus').value = pkg.status || 'active';
        updateBenefitsDisplay();
        if (pkg.image) {
            document.getElementById('imagePreview').src = pkg.image;
            document.getElementById('imagePreviewContainer').style.display = 'block';
            document.getElementById('imageUploadArea').style.display = 'none';
        } else resetImageUpload();

        // Load this package's existing tables so their names prefill instead of resetting to "Table N"
        tableLabels = [];
        existingTableRows = [];
        try {
            const { data: tables, error } = await supabase
                .from('vvip_tables')
                .select('id, table_number')
                .eq('package_id', id)
                .order('created_at', { ascending: true });
            if (!error && tables) {
                existingTableRows = tables;
                tableLabels = tables.map(t => t.table_number);
            }
        } catch (err) { console.warn('Could not load existing tables:', err); }
        renderTableLabelInputs();

        document.getElementById('packageModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    window.deletePackagePrompt = function(id) {
        const pkg = packages.find(p => p.id === id);
        if (!pkg) return;
        pendingDeletePackage = pkg;
        document.getElementById('deletePackageName').innerText = pkg.name;
        document.getElementById('deleteModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    function closeModal() {
        document.getElementById('packageModal').classList.remove('active');
        document.body.style.overflow = 'auto';
        currentEditingId = null;
        benefitsArray = [];
        currentImageBase64 = null;
        tableLabels = [];
        existingTableRows = [];
        document.getElementById('tableLabelsGroup').style.display = 'none';
        document.getElementById('tableLabelsContainer').innerHTML = '';
        resetImageUpload();
    }

    function closeDeleteModal() {
        document.getElementById('deleteModal').classList.remove('active');
        document.body.style.overflow = 'auto';
        pendingDeletePackage = null;
    }

    // ─── SAVE PACKAGE ───
    document.getElementById('packageForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('packageName').value.trim();
        const event_id = document.getElementById('packageEvent').value || null;
        const description = document.getElementById('packageDescription').value.trim();
        const price = parseFloat(document.getElementById('packagePrice').value);
        const capacity = parseInt(document.getElementById('packageCapacity').value);
        const tab_credit = parseFloat(document.getElementById('packageTabCredit').value) || 0;
        const status = document.getElementById('packageStatus').value;
        const benefits = benefitsArray;
        const image = currentImageBase64 || null;

        if (!name || isNaN(price) || !capacity || isNaN(tab_credit)) {
            showToast('Please fill in all required fields', true);
            return;
        }
        if (!event_id) { showToast('Please select which event this package is for', true); return; }
        if (price <= 0) { showToast('Price must be greater than 0', true); return; }
        if (capacity <= 0) { showToast('Tables must be at least 1', true); return; }
        if (tab_credit < 0) { showToast('Tab credit cannot be negative', true); return; }

        const packageData = { name, description, price, capacity, tab_credit, status, benefits, image, event_id };
        try {
            let result;
            let packageId = currentEditingId;
            if (currentEditingId) {
                result = await supabase.from('vvip_packages').update(packageData).eq('id', currentEditingId);
            } else {
                result = await supabase.from('vvip_packages').insert([packageData]).select().single();
            }
            if (result.error) throw result.error;
            if (!currentEditingId) packageId = result.data.id;

            await syncPackageTables(packageId, price, capacity);

            showToast(currentEditingId ? 'Package updated!' : 'Package created!');
            closeModal();
            await loadPackages();
        } catch (error) {
            showToast('Error: ' + error.message, true);
        }
    });

    // ─── SYNC vvip_tables TO MATCH THE NAMED TABLES ENTERED IN THE MODAL ───
    async function syncPackageTables(packageId, price, capacity) {
        try {
            const { data: currentTables, error: fetchErr } = await supabase
                .from('vvip_tables')
                .select('id, table_number')
                .eq('package_id', packageId)
                .order('created_at', { ascending: true });
            if (fetchErr) throw fetchErr;

            const existing = currentTables || [];
            const desiredLabels = (tableLabels.length === capacity)
                ? tableLabels
                : Array.from({ length: capacity }, (_, i) => existing[i]?.table_number || tableLabels[i] || `Table ${i + 1}`);

            // Rename/update tables that already exist, keeping their id (and any bookings tied to them)
            const keepCount = Math.min(existing.length, capacity);
            for (let i = 0; i < keepCount; i++) {
                const row = existing[i];
                const label = desiredLabels[i];
                await supabase.from('vvip_tables').update({ table_number: label, price }).eq('id', row.id);
            }

            // Capacity increased: create the new tables
            if (capacity > existing.length) {
                const newRows = [];
                for (let i = existing.length; i < capacity; i++) {
                    newRows.push({ package_id: packageId, table_number: desiredLabels[i] || `Table ${i + 1}`, capacity: 4, price });
                }
                const { error: insertErr } = await supabase.from('vvip_tables').insert(newRows);
                if (insertErr) throw insertErr;
            }

            // Capacity decreased: only remove tables that have no active booking, keep the rest
            if (capacity < existing.length) {
                const toRemove = existing.slice(capacity);
                const removableIds = [];
                const blockedLabels = [];
                for (const row of toRemove) {
                    const { data: bookings } = await supabase
                        .from('vvip_bookings')
                        .select('id')
                        .eq('table_id', row.id)
                        .not('status', 'in', '(cancelled,no_show)')
                        .limit(1);
                    if (bookings && bookings.length) {
                        blockedLabels.push(row.table_number);
                    } else {
                        removableIds.push(row.id);
                    }
                }
                if (removableIds.length) {
                    await supabase.from('vvip_tables').delete().in('id', removableIds);
                }
                if (blockedLabels.length) {
                    showToast(`Kept "${blockedLabels.join('", "')}" — has an active booking, can't remove it`, true);
                }
            }
        } catch (err) {
            console.error('Table sync error:', err);
            showToast('Package saved, but syncing table names had an issue: ' + err.message, true);
        }
    }

    // ─── DELETE ACTIONS ───
    async function archivePackage() {
        if (!pendingDeletePackage) return;
        const pkg = pendingDeletePackage;
        closeDeleteModal();
        try {
            const { error } = await supabase
                .from('vvip_packages')
                .update({ status: 'inactive' })
                .eq('id', pkg.id);
            if (error) throw error;
            showToast(`Package "${pkg.name}" archived`);
            await loadPackages();
        } catch (error) { showToast('Error: ' + error.message, true); }
    }
    async function permanentDeletePackage() {
        if (!pendingDeletePackage) return;
        const pkg = pendingDeletePackage;
        closeDeleteModal();
        try {
            const { error } = await supabase
                .from('vvip_packages')
                .delete()
                .eq('id', pkg.id);
            if (error) throw error;
            showToast(`Package "${pkg.name}" permanently deleted`);
            await loadPackages();
        } catch (error) { showToast('Error: ' + error.message, true); }
    }

    // ─── LOAD PACKAGES ───
    async function loadPackages() {
        try {
            await loadEvents();
            const { data, error } = await supabase
                .from('vvip_packages')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            packages = data || [];

            // Pull real table rows + active bookings so the card shows named tables, not just a count
            const { data: allTables } = await supabase
                .from('vvip_tables')
                .select('id, package_id, table_number');
            const { data: activeBookings } = await supabase
                .from('vvip_bookings')
                .select('table_id')
                .not('status', 'in', '(cancelled,no_show)')
                .not('table_id', 'is', null);
            const bookedTableIds = new Set((activeBookings || []).map(b => b.table_id));
            const tablesByPackage = {};
            (allTables || []).forEach(t => {
                if (!tablesByPackage[t.package_id]) tablesByPackage[t.package_id] = [];
                tablesByPackage[t.package_id].push(t);
            });

            const container = document.getElementById('packagesGrid');
            if (packages.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-crown"></i>
                        <p>No VVIP packages created yet</p>
                        <button class="btn-primary" id="emptyStateCreateBtn" style="margin-top:12px;">Create Your First Package</button>
                    </div>
                `;
                document.getElementById('emptyStateCreateBtn')?.addEventListener('click', openCreateModal);
                return;
            }
            container.innerHTML = packages.map(pkg => {
                const totalPrice = pkg.price;
                const tables = pkg.capacity;
                const tabCredit = pkg.tab_credit || 0;
                const pkgTables = tablesByPackage[pkg.id] || [];
                const bookedCount = pkgTables.filter(t => bookedTableIds.has(t.id)).length;
                const tablesLabel = pkgTables.length
                    ? `${bookedCount}/${pkgTables.length} booked`
                    : `${tables}`;
                const visibleChips = pkgTables.slice(0, 6);
                const pkgEvent = events.find(e => e.id === pkg.event_id);
                return `
                <div class="package-card">
                    <div class="package-image">
                        ${pkg.image ? `<img src="${pkg.image}" alt="${escapeHtml(pkg.name)}">` : '<i class="fas fa-crown"></i>'}
                    </div>
                    <div class="package-content">
                        <div class="package-header">
                            <span class="package-name">${escapeHtml(pkg.name)}</span>
                            <span class="package-price">${fmtR(totalPrice)}</span>
                        </div>
                        <div class="package-meta">
                            <span><i class="fas fa-calendar"></i> ${pkgEvent ? `${escapeHtml(pkgEvent.name)} · ${fmtDate(pkgEvent.start_time)}` : 'No event set'}</span>
                            <span><i class="fas fa-table"></i> Tables: ${tablesLabel}</span>
                            <span><i class="fas fa-coins"></i> Tab Credit: ${fmtR(tabCredit)}</span>
                            <span><i class="fas fa-sack-dollar"></i> Revenue: ${fmtR(bookedCount * totalPrice)}</span>
                            <span class="status-badge ${pkg.status === 'active' ? 'status-active' : 'status-inactive'}">${pkg.status}</span>
                        </div>
                        <div class="package-description">${escapeHtml(pkg.description || 'No description')}</div>
                        <div class="table-chips">
                            ${visibleChips.map(t => `<span class="table-chip ${bookedTableIds.has(t.id) ? 'booked' : 'available'}">${escapeHtml(t.table_number)}</span>`).join('')}
                            ${pkgTables.length > 6 ? `<span class="table-chip more">+${pkgTables.length - 6} more</span>` : ''}
                            ${pkgTables.length === 0 ? `<span class="table-chip pending">Save this package to generate its tables</span>` : ''}
                        </div>
                        <div class="benefits-list">
                            ${(pkg.benefits || []).slice(0,3).map(b => `<span class="benefit-tag"><i class="fas fa-check"></i> ${escapeHtml(b)}</span>`).join('')}
                            ${(pkg.benefits || []).length > 3 ? `<span class="benefit-tag">+${pkg.benefits.length - 3} more</span>` : ''}
                        </div>
                        <div class="package-actions">
                            <button class="btn-edit" onclick="window.editPackage('${pkg.id}')"><i class="fas fa-edit"></i> Edit</button>
                            <button class="btn-delete" onclick="window.deletePackagePrompt('${pkg.id}')"><i class="fas fa-trash"></i> Delete</button>
                        </div>
                    </div>
                </div>
            `}).join('');
            // Update overlay if open
            if (document.getElementById('dashboardOverlay').classList.contains('open')) renderCharts();
        } catch (error) {
            console.error(error);
            document.getElementById('packagesGrid').innerHTML = `
                <div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error loading packages: ${error.message}</p></div>
            `;
        }
    }

    // ─── DASHBOARD TOGGLE ───
    function toggleDashboard() {
        const overlay = document.getElementById('dashboardOverlay');
        overlay.classList.toggle('open');
        document.getElementById('toggleDashBtn').classList.toggle('active', overlay.classList.contains('open'));
        if (overlay.classList.contains('open')) renderCharts();
    }
    window.toggleDashboard = toggleDashboard;

    // ─── CHARTS ───
    async function renderCharts() {
        // Fetch bookings and customers for stats (real data)
        const { data: bookings, error: bookErr } = await supabase
            .from('vvip_bookings')
            .select('total_amount, status, created_at, customer_id')
            .order('created_at', { ascending: false })
            .limit(100);
        if (bookErr) console.warn('Bookings fetch error:', bookErr);

        // KPIs
        const totalPackages = packages.length;
        const activePackages = packages.filter(p => p.status === 'active').length;
        const totalSold = packages.reduce((s,p) => s + (p.sold_count||0), 0);
        const totalRevenue = (bookings || []).filter(b => b.status === 'completed')
            .reduce((s,b) => s + (b.total_amount||0), 0);
        const avgPrice = totalPackages ? packages.reduce((s,p) => s + p.price, 0) / totalPackages : 0;

        document.getElementById('dashKpiGrid').innerHTML = `
            <div class="dash-kpi"><div class="val">${totalPackages}</div><div class="label">Total Packages</div><div class="sub">${activePackages} active</div></div>
            <div class="dash-kpi"><div class="val">${totalSold}</div><div class="label">Tickets Sold</div></div>
            <div class="dash-kpi"><div class="val">${fmtR(totalRevenue)}</div><div class="label">Revenue</div></div>
            <div class="dash-kpi"><div class="val">${fmtR(avgPrice)}</div><div class="label">Avg Price</div></div>
        `;

        // Table Availability — named tables per package, booked vs available
        const { data: allTablesForDash } = await supabase
            .from('vvip_tables')
            .select('id, package_id, table_number');
        const { data: activeBookingsForDash } = await supabase
            .from('vvip_bookings')
            .select('table_id')
            .not('status', 'in', '(cancelled,no_show)')
            .not('table_id', 'is', null);
        const bookedSet = new Set((activeBookingsForDash || []).map(b => b.table_id));
        const tablesByPkgForDash = {};
        (allTablesForDash || []).forEach(t => {
            (tablesByPkgForDash[t.package_id] = tablesByPkgForDash[t.package_id] || []).push(t);
        });
        const dashTableContainer = document.getElementById('dashTableAvailability');
        if (dashTableContainer) {
            if (!allTablesForDash || allTablesForDash.length === 0) {
                dashTableContainer.innerHTML = '<div style="color:var(--muted);font-size:0.7rem;">No tables yet — save a package to generate its tables</div>';
            } else {
                dashTableContainer.innerHTML = packages.map(pkg => {
                    const tbls = tablesByPkgForDash[pkg.id] || [];
                    if (!tbls.length) return '';
                    return `
                        <div style="margin-bottom:10px;">
                            <div style="font-size:0.65rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">${escapeHtml(pkg.name)}</div>
                            <div class="table-chips">
                                ${tbls.map(t => `<span class="table-chip ${bookedSet.has(t.id) ? 'booked' : 'available'}">${escapeHtml(t.table_number)}</span>`).join('')}
                            </div>
                        </div>
                    `;
                }).join('') || '<div style="color:var(--muted);font-size:0.7rem;">No tables yet</div>';
            }
        }

        // Package Sales chart
        const ctx1 = document.getElementById('dashPackageChart').getContext('2d');
        if (charts.package) charts.package.destroy();
        charts.package = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: packages.map(p => p.name?.slice(0,12) || 'Package'),
                datasets: [
                    { label: 'Sold', data: packages.map(p => p.sold_count||0), backgroundColor: '#E30613', borderRadius: 4 },
                    { label: 'Capacity', data: packages.map(p => p.capacity||0), backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4 }
                ]
            },
            options: { responsive: true, plugins: { legend: { labels: { color: '#71717a', boxWidth: 8 } } }, scales: { y: { ticks: { color: '#71717a', stepSize: 1 } } } }
        });

        // Booking Status (from bookings if available)
        const statusCounts = { confirmed:0, checked_in:0, seated:0, completed:0 };
        (bookings || []).forEach(b => { if (statusCounts[b.status] !== undefined) statusCounts[b.status]++; });
        const ctx2 = document.getElementById('dashBookingChart').getContext('2d');
        if (charts.booking) charts.booking.destroy();
        charts.booking = new Chart(ctx2, {
            type: 'doughnut',
            data: { labels: Object.keys(statusCounts), datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#f59e0b','#3b82f6','#8b5cf6','#10b981'] }] },
            options: { responsive: true, plugins: { legend: { labels: { color: '#71717a', boxWidth: 8 } } } }
        });

        // Revenue Trend (last 7 days)
        const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        const revData = days.map(() => {
            const dayBookings = (bookings || []).filter(b => {
                const d = new Date(b.created_at);
                return d.getDay() === days.indexOf(day) && b.status === 'completed';
            });
            return dayBookings.reduce((s,b) => s + (b.total_amount||0), 0);
        });
        const ctx3 = document.getElementById('dashRevenueChart').getContext('2d');
        if (charts.revenue) charts.revenue.destroy();
        charts.revenue = new Chart(ctx3, {
            type: 'line',
            data: { labels: days, datasets: [{ label: 'Revenue (R)', data: revData, borderColor: '#E30613', backgroundColor: 'rgba(227,6,19,0.1)', fill: true, tension: 0.3 }] },
            options: { responsive: true, plugins: { tooltip: { callbacks: { label: (ctx) => fmtR(ctx.raw) } } } }
        });

        // Credit Utilization (from bookings: total_amount vs remaining_balance)
        const totalCreditIssued = (bookings || []).reduce((s,b) => s + (b.total_amount||0), 0);
        const totalCreditRemaining = (bookings || []).reduce((s,b) => s + (b.remaining_balance||0), 0);
        const utilized = totalCreditIssued - totalCreditRemaining;
        const ctx4 = document.getElementById('dashCreditChart').getContext('2d');
        if (charts.credit) charts.credit.destroy();
        charts.credit = new Chart(ctx4, {
            type: 'doughnut',
            data: { labels: ['Utilized', 'Remaining'], datasets: [{ data: [Math.max(0, utilized), Math.max(0, totalCreditRemaining)], backgroundColor: ['#E30613', '#e2e8f0'] }] },
            options: { responsive: true, plugins: { legend: { labels: { color: '#71717a', boxWidth: 8 } } } }
        });
        const utilRate = totalCreditIssued ? (utilized / totalCreditIssued * 100) : 0;
        document.getElementById('dashUtilRate').innerText = `Utilization Rate: ${utilRate.toFixed(1)}% of credit spent`;

        // Top Customers (mock from bookings)
        const customerSpend = {};
        (bookings || []).forEach(b => {
            if (b.customer_id) {
                customerSpend[b.customer_id] = (customerSpend[b.customer_id]||0) + (b.total_amount||0);
            }
        });
        const sorted = Object.entries(customerSpend).sort((a,b) => b[1] - a[1]).slice(0,5);
        const topContainer = document.getElementById('dashTopCustomers');
        if (sorted.length) {
            topContainer.innerHTML = sorted.map(([id, amt], idx) => `
                <div class="dash-activity-item" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.7rem;">
                    <span>${idx+1}. Customer ${id.slice(0,6)}</span>
                    <span style="color:var(--red);font-weight:700;">${fmtR(amt)}</span>
                </div>
            `).join('');
        } else {
            topContainer.innerHTML = '<div style="color:var(--muted);font-size:0.7rem;">No customer data</div>';
        }
    }

    // ─── VIEW SWITCHING ───
    function switchView(view) {
        currentView = view;
        document.getElementById('packagesView').style.display = view === 'packages' ? 'block' : 'none';
        document.getElementById('buyersView').style.display = view === 'buyers' ? 'block' : 'none';
        document.querySelectorAll('#viewToggle button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
        if (view === 'buyers') loadBuyers();
    }
    window.switchView = switchView;

    // ─── BUYERS & TABS ───
    function initials(name) {
        if (!name) return '?';
        return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    }

    async function loadBuyers() {
        const tbody = document.getElementById('buyersTableBody');
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted);"><i class="fas fa-spinner fa-spin"></i> Loading buyers…</td></tr>`;
        try {
            const { data: bookingRows, error } = await supabase
                .from('vvip_bookings')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            bookings = bookingRows || [];

            // Tables lookup (id -> table_number), reuse if already fetched for packages
            const { data: tableRows } = await supabase.from('vvip_tables').select('id, table_number');
            buyerTablesMap = {};
            (tableRows || []).forEach(t => { buyerTablesMap[t.id] = t.table_number; });

            // Profiles lookup for the customers who appear in bookings
            const customerIds = [...new Set(bookings.map(b => b.customer_id).filter(Boolean))];
            buyerProfilesMap = {};
            if (customerIds.length) {
                try {
                    const { data: profileRows, error: profErr } = await supabase
                        .from('profiles')
                        .select('id, name, email, phone')
                        .in('id', customerIds);
                    if (profErr) throw profErr;
                    (profileRows || []).forEach(p => { buyerProfilesMap[p.id] = p; });
                } catch (profErr) {
                    console.warn('Could not load buyer profiles:', profErr);
                }
            }

            renderBuyersStats();
            renderBuyersTable();
        } catch (error) {
            console.error(error);
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted);"><i class="fas fa-exclamation-triangle"></i> Error loading buyers: ${escapeHtml(error.message)}</td></tr>`;
        }
    }

    function renderBuyersStats() {
        const activeBookings = bookings.filter(b => !['cancelled', 'no_show'].includes(b.status));
        const totalBuyers = new Set(bookings.map(b => b.customer_id).filter(Boolean)).size;
        const tablesSold = activeBookings.filter(b => b.table_id).length;
        const tabOutstanding = activeBookings.reduce((s, b) => s + (b.remaining_balance || 0), 0);
        const revenueCollected = bookings.filter(b => b.status === 'completed').reduce((s, b) => s + (b.total_amount || 0), 0);
        document.getElementById('statTotalBuyers').innerText = totalBuyers;
        document.getElementById('statTablesSold').innerText = tablesSold;
        document.getElementById('statTabOutstanding').innerText = fmtR(tabOutstanding);
        document.getElementById('statRevenueCollected').innerText = fmtR(revenueCollected);
    }

    function renderBuyersTable() {
        const tbody = document.getElementById('buyersTableBody');
        const q = (document.getElementById('buyersSearch').value || '').toLowerCase().trim();
        const rows = bookings.filter(b => {
            if (!q) return true;
            const profile = buyerProfilesMap[b.customer_id] || {};
            const pkg = packages.find(p => p.id === b.package_id);
            const haystack = [profile.name, profile.email, pkg?.name, buyerTablesMap[b.table_id]].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(q);
        });
        document.getElementById('buyersCountBadge').innerText = rows.length;
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:40px 20px;"><i class="fas fa-receipt"></i><p>No table buyers ${q ? 'match your search' : 'yet'}</p></div></td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(b => {
            const profile = buyerProfilesMap[b.customer_id] || {};
            const pkg = packages.find(p => p.id === b.package_id);
            const tabCredit = pkg?.tab_credit || 0;
            const balance = b.remaining_balance != null ? b.remaining_balance : tabCredit;
            const utilPct = tabCredit > 0 ? Math.min(100, Math.max(0, ((tabCredit - balance) / tabCredit) * 100)) : 0;
            const name = profile.name || 'Unknown Buyer';
            return `
                <tr onclick="window.openBuyerDetail('${b.id}')">
                    <td>
                        <div class="buyer-cell">
                            <div class="buyer-avatar">${escapeHtml(initials(name))}</div>
                            <div>
                                <div class="buyer-name">${escapeHtml(name)}</div>
                                <div class="buyer-email">${escapeHtml(profile.email || 'No email on file')}</div>
                            </div>
                        </div>
                    </td>
                    <td>${escapeHtml(pkg?.name || '—')}</td>
                    <td>${escapeHtml(buyerTablesMap[b.table_id] || '—')}</td>
                    <td>${fmtR(b.total_amount || 0)}</td>
                    <td>
                        <div class="tab-balance-wrap">
                            <div class="tab-balance-amt">${fmtR(balance)}</div>
                            <div class="tab-balance-bar"><div class="tab-balance-bar-fill" style="width:${utilPct}%;"></div></div>
                        </div>
                    </td>
                    <td><span class="status-chip ${escapeHtml(b.status || '')}">${escapeHtml((b.status || 'unknown').replace('_',' '))}</span></td>
                    <td><button class="btn-secondary" onclick="event.stopPropagation();window.openBuyerDetail('${b.id}')">View</button></td>
                </tr>
            `;
        }).join('');
    }
    document.getElementById('buyersSearch').addEventListener('input', renderBuyersTable);

    // ─── BUYER DETAIL PANEL ───
    window.openBuyerDetail = async function(bookingId) {
        const booking = bookings.find(b => b.id === bookingId);
        if (!booking) return;
        currentBuyerBooking = booking;
        const profile = buyerProfilesMap[booking.customer_id] || {};
        const pkg = packages.find(p => p.id === booking.package_id);
        const tabCredit = pkg?.tab_credit || 0;
        const balance = booking.remaining_balance != null ? booking.remaining_balance : tabCredit;
        const utilPct = tabCredit > 0 ? Math.min(100, Math.max(0, ((tabCredit - balance) / tabCredit) * 100)) : 0;
        const name = profile.name || 'Unknown Buyer';

        document.getElementById('bdName').innerText = name;
        document.getElementById('bdSub').innerText = [profile.email, profile.phone, buyerTablesMap[booking.table_id] ? `Table ${buyerTablesMap[booking.table_id]}` : null, pkg?.name].filter(Boolean).join(' · ') || 'No contact details on file';
        document.getElementById('bdPaid').innerText = fmtR(booking.total_amount || 0);
        document.getElementById('bdCredit').innerText = fmtR(tabCredit);
        document.getElementById('bdBalance').innerText = fmtR(balance);
        document.getElementById('bdBalance').className = 'val ' + (balance <= 0 ? 'red' : 'green');
        document.getElementById('bdStatus').innerText = (booking.status || 'unknown').replace('_', ' ');
        document.getElementById('bdUtilBar').style.width = utilPct + '%';
        document.getElementById('bdUtilLabel').innerText = `${utilPct.toFixed(0)}% used`;

        // Reset to Overview tab
        document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.profile-tab[data-ptab="overview"]').classList.add('active');
        document.getElementById('bdOverview').classList.add('active');
        document.getElementById('bdTransactions').classList.remove('active');

        document.getElementById('buyerDetailPanel').classList.add('open');
        await loadBuyerTransactions(booking.id);
    };

    function closeBuyerDetail() {
        document.getElementById('buyerDetailPanel').classList.remove('open');
        currentBuyerBooking = null;
    }
    window.closeBuyerDetail = closeBuyerDetail;

    async function loadBuyerTransactions(bookingId) {
        const list = document.getElementById('bdTxList');
        list.innerHTML = `<div style="color:var(--muted);font-size:0.7rem;text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading transactions…</div>`;
        try {
            const { data, error } = await supabase
                .from('vvip_tab_transactions')
                .select('*')
                .eq('booking_id', bookingId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            currentBuyerTx = data || [];
        } catch (err) {
            // Table may not exist yet in this project — fail gracefully rather than break the panel.
            console.warn('vvip_tab_transactions not available:', err.message);
            currentBuyerTx = [];
        }
        renderBuyerTransactions();
    }

    function renderBuyerTransactions() {
        const list = document.getElementById('bdTxList');
        const filtered = currentTxFilter === 'all' ? currentBuyerTx : currentBuyerTx.filter(t => t.type === currentTxFilter);
        if (!filtered.length) {
            list.innerHTML = `<div style="color:var(--muted);font-size:0.7rem;text-align:center;padding:20px;"><i class="fas fa-inbox"></i><br>No transactions ${currentTxFilter === 'all' ? 'logged yet' : 'of this type'}. Log one below.</div>`;
            return;
        }
        list.innerHTML = filtered.map(tx => {
            const isTopup = tx.type === 'topup';
            const sign = isTopup ? '+' : '−';
            const dt = tx.created_at ? new Date(tx.created_at) : null;
            return `
                <div class="transaction-item">
                    <div class="transaction-left">
                        <div class="transaction-icon ${isTopup ? 'topup' : ''}"><i class="fas ${isTopup ? 'fa-arrow-up' : tx.type === 'adjustment' ? 'fa-sliders-h' : 'fa-glass-cheers'}"></i></div>
                        <div>
                            <div class="transaction-type">${escapeHtml(tx.description || (tx.type === 'topup' ? 'Top Up' : tx.type === 'adjustment' ? 'Adjustment' : 'Bar Tab Spend'))}</div>
                            <div class="transaction-time">${dt ? dt.toLocaleDateString() + ' · ' + dt.toLocaleTimeString() : ''}</div>
                        </div>
                    </div>
                    <div class="transaction-amount ${isTopup ? 'amount-positive' : 'amount-negative'}">${sign}${fmtR(Math.abs(tx.amount || 0))}</div>
                </div>
            `;
        }).join('');
    }

    document.querySelectorAll('.profile-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.profile-content').forEach(c => c.classList.remove('active'));
            document.getElementById(tab.dataset.ptab === 'overview' ? 'bdOverview' : 'bdTransactions').classList.add('active');
        });
    });
    document.querySelectorAll('#bdTxFilters .tx-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#bdTxFilters .tx-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTxFilter = btn.dataset.txfilter;
            renderBuyerTransactions();
        });
    });

    document.getElementById('bdTxAddBtn').addEventListener('click', async () => {
        if (!currentBuyerBooking) return;
        const type = document.getElementById('bdTxType').value;
        const amount = parseFloat(document.getElementById('bdTxAmount').value);
        const note = document.getElementById('bdTxNote').value.trim();
        if (isNaN(amount) || amount <= 0) { showToast('Enter a valid amount', true); return; }

        const booking = currentBuyerBooking;
        const pkg = packages.find(p => p.id === booking.package_id);
        const tabCredit = pkg?.tab_credit || 0;
        const currentBalance = booking.remaining_balance != null ? booking.remaining_balance : tabCredit;
        const newBalance = type === 'spend' ? currentBalance - amount : currentBalance + amount;

        try {
            const { error: txError } = await supabase.from('vvip_tab_transactions').insert({
                booking_id: booking.id,
                type,
                amount,
                description: note || null,
                created_at: new Date().toISOString()
            });
            if (txError) throw txError;

            const { error: balError } = await supabase.from('vvip_bookings').update({ remaining_balance: newBalance }).eq('id', booking.id);
            if (balError) throw balError;

            booking.remaining_balance = newBalance;
            document.getElementById('bdTxAmount').value = '';
            document.getElementById('bdTxNote').value = '';
            showToast('Transaction logged');
            await loadBuyerTransactions(booking.id);
            window.openBuyerDetail(booking.id);
            renderBuyersTable();
            renderBuyersStats();
        } catch (err) {
            console.error(err);
            showToast('Could not log transaction — make sure the "vvip_tab_transactions" table exists in Supabase: ' + err.message, true);
        }
    });

    document.getElementById('buyerDetailPanel').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeBuyerDetail(); });
    document.querySelectorAll('#viewToggle button').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
    document.getElementById('refreshBtn').addEventListener('click', () => currentView === 'buyers' ? loadBuyers() : loadPackages());

    // ─── EVENT BINDINGS ───
    document.getElementById('createPackageBtn').addEventListener('click', openCreateModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
    document.getElementById('closeDeleteModalBtn').addEventListener('click', closeDeleteModal);
    document.getElementById('cancelDeleteOptionBtn').addEventListener('click', closeDeleteModal);
    document.getElementById('archivePackageBtn').addEventListener('click', archivePackage);
    document.getElementById('permanentDeleteBtn').addEventListener('click', permanentDeletePackage);
    // Clicking the backdrop no longer closes these modals — only the Cancel/X buttons do.

    // ─── INIT ───
    setupImageUpload();
    loadEvents();
    loadPackages();
    loadBuyers();

    // Real-time subscription
    supabase.channel('vvip_packages_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vvip_packages' }, () => loadPackages())
        .subscribe();
    supabase.channel('vvip_bookings_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vvip_bookings' }, () => { if (currentView === 'buyers') loadBuyers(); })
        .subscribe();

    // Close overlay on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('dashboardOverlay');
            if (overlay.classList.contains('open')) toggleDashboard();
            const buyerPanel = document.getElementById('buyerDetailPanel');
            if (buyerPanel.classList.contains('open')) closeBuyerDetail();
        }
    });
