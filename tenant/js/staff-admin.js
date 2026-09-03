    import { supabase } from '../../config/supabase.js';

    // ─── GLOBALS ───
    let staffList = [];
    let shifts = [];
    let activityLogs = [];
    let payrollRecords = [];
    let currentPayrollBatch = [];      // records currently shown in the Payroll tab
    const payrollById = new Map();     // every payroll record we've seen, keyed by id (used by payslip view/download)
    let venueInfo = { name: 'Rands', address: '', phone: '' };
    let currentPage = 1;
    const pageSize = 10;

    // ─── SARS PAYE / UIF (2026/27 tax year, 1 Mar 2026 – 28 Feb 2027) ───
    // NOTE: this is an estimate for payslip purposes using the standard annualisation
    // method for irregular/period-based pay. It assumes a single, under-65 taxpayer with
    // no medical aid or retirement deductions. Confirm final liabilities with SARS / an
    // accountant — this is not a certified payroll/tax filing calculation.
    const SARS_BRACKETS_2026_27 = [
        { upto: 245100,       rate: 0.18 },
        { upto: 383100,       rate: 0.26 },
        { upto: 530200,       rate: 0.31 },
        { upto: 695800,       rate: 0.36 },
        { upto: 887000,       rate: 0.39 },
        { upto: 1878600,      rate: 0.41 },
        { upto: Infinity,     rate: 0.45 },
    ];
    const SARS_PRIMARY_REBATE_2026_27 = 17820;
    const UIF_RATE = 0.01;
    const UIF_MONTHLY_CAP = 177.12; // per employee, based on the R17,712/month remuneration ceiling

    function calcAnnualPAYE(annualTaxable) {
        let tax = 0, floor = 0;
        for (const b of SARS_BRACKETS_2026_27) {
            if (annualTaxable <= floor) break;
            const inBracket = Math.min(annualTaxable, b.upto) - floor;
            tax += inBracket * b.rate;
            floor = b.upto;
        }
        return Math.max(tax - SARS_PRIMARY_REBATE_2026_27, 0);
    }

    // Estimates PAYE + UIF for a single pay period by annualising the period's gross pay,
    // taxing the annual equivalent, then bringing the tax back down to the period.
    function calculatePeriodDeductions(grossForPeriod, periodDays) {
        const days = Math.max(periodDays, 1);
        const annualEquivalent = (grossForPeriod / days) * 365;
        const annualPAYE = calcAnnualPAYE(annualEquivalent);
        const periodPAYE = annualPAYE * (days / 365);
        const uifCapForPeriod = UIF_MONTHLY_CAP * (days / 30);
        const periodUIF = Math.min(grossForPeriod * UIF_RATE, uifCapForPeriod);
        return { paye: periodPAYE, uif: periodUIF, total: periodPAYE + periodUIF };
    }

    function registerPayrollRecords(records) {
        (records || []).forEach(r => payrollById.set(r.id, r));
    }
    let totalStaff = 0;
    let currentFilters = { search: '', role: '', status: '' };
    let customModalResolve = null;
    let charts = {};

    // ─── MODULE DEFINITIONS ───
    const MODULE_NAMES = {
        'dashboard':'Dashboard','box_office':'Box Office','gate_scanner':'Gate Scanner','shisha_pos':'Shisha POS',
        'shisha_console':'Shisha Console','booze_vault':'Booze Vault','register_locker':'Register Locker',
        'unlock_vault':'Vault Access','booze_collection':'Booze Collection','booze_counter':'Smart Counter',
        'pre_order_pos':'Order POS','butcher_orders':'Kitchen Display','butcher_collection':'Order Collection',
        'vvip_tab':'VVIP Tab','vvip_staff':'VVIP Check-in'
    };
    const MODULE_ICONS = {
        'dashboard':'fa-th-large','box_office':'fa-ticket-alt','gate_scanner':'fa-qrcode','shisha_pos':'fa-cash-register',
        'shisha_console':'fa-gamepad','booze_vault':'fa-box-open','register_locker':'fa-clipboard-list',
        'unlock_vault':'fa-key','booze_collection':'fa-wine-bottle','booze_counter':'fa-calculator',
        'pre_order_pos':'fa-shopping-cart','butcher_orders':'fa-utensils','butcher_collection':'fa-hand-holding-heart',
        'vvip_tab':'fa-star','vvip_staff':'fa-id-card'
    };
    const ALL_MODULES = Object.keys(MODULE_NAMES);
    const JOB_TITLES = {
        'Event Manager':{name:'Event Manager'},'Event Host':{name:'Event Host'},'Shisha Attendant':{name:'Shisha Attendant'},
        'Butcher Crew':{name:'Butcher Crew'},'Smart Host':{name:'Smart Host'},'VVIP Concierge':{name:'VVIP Concierge'}
    };
    // Mobile Scanner is a standalone ROLE (profiles.role), not a job title.
    // It has no module permissions and is routed straight to /staff/scanner.html
    // instead of the staff console — see config/auth.js ROLE_ROUTES.
    const MOBILE_SCANNER_ROLE = 'mobile_scanner';
    const roleDisplay = {
        'staff':'General Staff','security':'Security','cleaner':'Cleaner','scanner':'Scanner',
        'shisha':'Shisha Master','cashier':'Cashier','vvip':'VVIP Concierge','mobile_scanner':'Mobile Scanner'
    };
    function roleLabel(s) {
        if (s.role === MOBILE_SCANNER_ROLE) return 'Mobile Scanner';
        return s.staff_role || s.role || 'N/A';
    }

    // ─── HELPERS ───
    function escapeHtml(str) { if (!str) return ''; return String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]); }
    function fmtR(val) { return `R${(val||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
    function getInitials(name, surname) { return `${(name?.charAt(0)||'U')}${(surname?.charAt(0)||'')}`.toUpperCase(); }
    function formatDate(d) { return d ? new Date(d).toLocaleDateString('en-ZA') : 'Never'; }
    function formatDateTime(d) { return d ? new Date(d).toLocaleString('en-ZA') : 'Never'; }

    // Supabase/PostgREST returns timestamptz values with their offset already
    // baked in (e.g. "2026-08-04T00:05:08.593+00:00"). Blindly appending "Z"
    // to a string that already has an offset produces an unparseable date,
    // which silently corrupts hours_worked. Only add "Z" if the string
    // genuinely has no timezone info. (Mirrors staff-clockin.js.)
    function parseServerTimestamp(ts) {
        if (!ts) return null;
        const hasOffset = /Z$|[+-]\d{2}:?\d{2}$/.test(ts);
        return new Date(hasOffset ? ts : ts + 'Z');
    }

    function formatDuration(ms) {
        const minutes = Math.floor(ms / (1000 * 60));
        if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        const hours = (minutes / 60).toFixed(1);
        return `${hours} hours`;
    }

    function showToast(msg, isError = false) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.className = 'toast show' + (isError ? ' error' : '');
        setTimeout(() => t.classList.remove('show'), 3000);
    }

    // ─── CUSTOM MODAL ───
    window.showCustomModal = function(title, body, confirmText = 'Confirm', confirmType = 'primary') {
        return new Promise((resolve) => {
            document.getElementById('custom-modal-title').textContent = title;
            document.getElementById('custom-modal-body').textContent = body;
            const btn = document.getElementById('custom-modal-confirm-btn');
            btn.textContent = confirmText;
            btn.className = 'btn-primary';
            customModalResolve = resolve;
            document.getElementById('custom-modal').classList.add('active');
        });
    };
    window.closeCustomModal = function() {
        document.getElementById('custom-modal').classList.remove('active');
        if (customModalResolve) { customModalResolve(false); customModalResolve = null; }
    };
    window.confirmCustomModal = function() {
        document.getElementById('custom-modal').classList.remove('active');
        if (customModalResolve) { customModalResolve(true); customModalResolve = null; }
    };

    // ─── DATA LOADING ───
    async function loadWorkforceData() {
        try {
            // Staff
            const { data: staffData, error: staffErr } = await supabase
                .from('profiles')
                .select('*')
                .in('role', ['staff','security','cleaner','scanner','shisha','cashier','vvip','mobile_scanner'])
                .order('created_at', { ascending: false });
            if (staffErr) throw staffErr;
            staffList = staffData || [];

            // Shifts
            const { data: shiftData, error: shiftErr } = await supabase
                .from('staff_shifts')
                .select('*')
                .order('login_time', { ascending: false });
            shifts = shiftData || [];

            // Activity logs
            const { data: activityData, error: activityErr } = await supabase
                .from('staff_activity_logs')
                .select('*, profiles!staff_activity_logs_staff_id_fkey(name, surname)')
                .order('created_at', { ascending: false })
                .limit(20);
            activityLogs = activityData || [];

            // Payroll
            const { data: payrollData, error: payrollErr } = await supabase
                .from('staff_payroll')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);
            payrollRecords = payrollData || [];
            registerPayrollRecords(payrollRecords);
            currentPayrollBatch = payrollRecords;

            updateStats();
            renderStaffTable();
            renderActivityFeed();
            renderActiveShifts();
            renderPayrollTable(payrollRecords);
            await loadModulePermissions();

        } catch (err) {
            console.error('Load error:', err);
            showToast('Failed to load data', true);
        }
    }

    // ─── STATS ───
    function updateStats() {
        const total = staffList.length;
        const active = staffList.filter(s => s.status === 'Active').length;
        const clockedIn = shifts.filter(s => s.status === 'active').length;
        const roles = new Set(staffList.map(s => s.staff_role || s.role).filter(Boolean)).size;
        document.getElementById('statTotal').textContent = total;
        document.getElementById('statActive').textContent = active;
        document.getElementById('statClocked').textContent = clockedIn;
        document.getElementById('statRoles').textContent = roles;
    }

    // ─── STAFF TABLE ───
    async function renderStaffTable() {
        const tbody = document.getElementById('staff-table-body');
        try {
            let query = supabase.from('profiles').select('*', { count: 'exact' }).in('role', ['staff','security','cleaner','scanner','shisha','cashier','vvip','mobile_scanner']);
            if (currentFilters.search) query = query.or(`name.ilike.%${currentFilters.search}%,surname.ilike.%${currentFilters.search}%,email.ilike.%${currentFilters.search}%,phone.ilike.%${currentFilters.search}%`);
            if (currentFilters.role === 'Mobile Scanner') query = query.eq('role', MOBILE_SCANNER_ROLE);
            else if (currentFilters.role) query = query.eq('staff_role', currentFilters.role);
            if (currentFilters.status) query = query.eq('status', currentFilters.status);
            const from = (currentPage - 1) * pageSize;
            const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);
            if (error) throw error;
            totalStaff = count || 0;
            const staff = data || [];

            if (!staff.length) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted);">No staff found</td></tr>`;
                return;
            }

            // Count modules per role
            const moduleCounts = {};
            for (const s of staff) {
                if (s.role === MOBILE_SCANNER_ROLE) continue; // no job-title modules for this role
                const role = s.staff_role || s.role;
                if (role && !moduleCounts[role]) {
                    const { data: mods } = await supabase.from('job_title_modules').select('module_id').eq('job_title', role);
                    moduleCounts[role] = (mods||[]).length;
                }
            }

            tbody.innerHTML = staff.map(s => {
                const role = roleLabel(s);
                const modCount = s.role === MOBILE_SCANNER_ROLE ? '—' : (moduleCounts[role] || 0);
                const statusClass = s.status === 'Active' ? 'status-active' : 'status-inactive';
                const hourly = s.hourly_rate ? `R${parseFloat(s.hourly_rate).toFixed(2)}` : '—';
                return `
                    <tr>
                        <td><div style="display:flex;align-items:center;gap:8px;"><div style="width:32px;height:32px;border-radius:50%;background:var(--red-dim);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.7rem;color:var(--red);">${getInitials(s.name, s.surname)}</div><div><div style="font-weight:600;">${escapeHtml(s.name||'')} ${escapeHtml(s.surname||'')}</div><div style="font-size:0.6rem;color:var(--muted);">${escapeHtml(s.email||'')}</div></div></div></td>
                        <td><span class="role-badge">${role}</span></td>
                        <td>${hourly}</td>
                        <td>${modCount}</td>
                        <td><span class="status-badge ${statusClass}">${s.status || 'Active'}</span></td>
                        <td>${s.last_seen ? formatDate(s.last_seen) : 'Never'}</td>
                        <td>
                            <button class="btn-sm" onclick="viewStaffProfile('${s.id}')"><i class="fas fa-eye"></i></button>
                            <button class="btn-sm" onclick="editStaff('${s.id}')"><i class="fas fa-edit"></i></button>
                            <button class="btn-sm" onclick="toggleStaffStatus('${s.id}','${s.status}')"><i class="fas ${s.status === 'Active' ? 'fa-ban' : 'fa-check-circle'}"></i></button>
                            <button class="btn-sm danger" onclick="deleteStaff('${s.id}')"><i class="fas fa-trash-alt"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');
            renderPagination();
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--red);">Error loading staff</td></tr>`;
        }
    }

    function renderPagination() {
        const container = document.getElementById('pagination-container');
        const totalPages = Math.ceil(totalStaff / pageSize);
        if (totalPages <= 1) { container.innerHTML = ''; return; }
        let html = `<span>${((currentPage-1)*pageSize)+1} - ${Math.min(currentPage*pageSize, totalStaff)} of ${totalStaff}</span><div>`;
        if (currentPage > 1) html += `<button onclick="changePage(${currentPage-1})">Prev</button>`;
        for (let i = 1; i <= Math.min(totalPages, 5); i++) {
            html += `<button class="${i===currentPage?'active-page':''}" onclick="changePage(${i})">${i}</button>`;
        }
        if (currentPage < totalPages) html += `<button onclick="changePage(${currentPage+1})">Next</button>`;
        html += `</div>`;
        container.innerHTML = html;
    }

    window.changePage = (p) => { currentPage = p; renderStaffTable(); };

    // ─── STAFF CRUD ───
    window.deleteStaff = async (staffId) => {
        const staff = staffList.find(s => s.id === staffId);
        if (!staff) return;
        const confirmed = await window.showCustomModal('Delete Staff', `Permanently delete ${staff.name} ${staff.surname}? This will remove all shifts, payroll, and activity logs.`, 'Delete', 'danger');
        if (!confirmed) return;
        try {
            await supabase.from('staff_shifts').delete().eq('staff_id', staffId);
            await supabase.from('staff_payroll').delete().eq('staff_id', staffId);
            await supabase.from('staff_activity_logs').delete().eq('staff_id', staffId);
            await supabase.from('profiles').delete().eq('id', staffId);
            showToast('Staff permanently deleted', 'success');
            await loadWorkforceData();
        } catch(err) { showToast(err.message, 'error'); }
    };

    window.openStaffForm = async (staffId = null) => {
        const modal = document.getElementById('staff-form-modal');
        const container = document.getElementById('staff-form-container');
        document.getElementById('modal-title').textContent = staffId ? 'Edit Staff Member' : 'Add New Staff';

        let staffData = null;
        if (staffId) {
            const { data } = await supabase.from('profiles').select('*').eq('id', staffId).single();
            staffData = data;
        }

        const jobOptions = `<option value="" disabled ${!staffData?.staff_role ? 'selected' : ''}>Select a Job</option>` +
            Object.keys(JOB_TITLES).map(key =>
            `<option value="${key}" ${staffData?.staff_role === key ? 'selected' : ''}>${key}</option>`
        ).join('');
        const isMobileScanner = staffData?.role === MOBILE_SCANNER_ROLE;

        container.innerHTML = `
            <form id="staff-form" class="space-y-4">
                <div class="form-group" style="margin-bottom:12px;">
                    <label>Account Type *</label>
                    <select name="${staffId ? 'account_type_display' : 'account_type'}" id="account-type-select" ${staffId ? 'disabled' : 'required'}>
                        <option value="" disabled ${!staffId ? 'selected' : ''}>Select Account Type</option>
                        <option value="standard" ${staffId && !isMobileScanner ? 'selected' : ''}>Standard Staff (Console access)</option>
                        <option value="mobile_scanner" ${isMobileScanner ? 'selected' : ''}>Mobile Scanner (standalone — scanner app only)</option>
                    </select>
                    ${staffId ? `<input type="hidden" name="account_type" value="${isMobileScanner ? 'mobile_scanner' : 'standard'}"><div style="font-size:0.65rem;color:var(--muted);margin-top:4px;">Account type can't be changed after creation.</div>` : ''}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>First Name *</label><input type="text" name="name" required value="${escapeHtml(staffData?.name||'')}"></div>
                    <div class="form-group"><label>Surname *</label><input type="text" name="surname" required value="${escapeHtml(staffData?.surname||'')}"></div>
                    <div class="form-group"><label>Email *</label><input type="email" name="email" required value="${escapeHtml(staffData?.email||'')}" ${staffId ? 'readonly style="background:var(--s3);"' : ''}></div>
                    <div class="form-group"><label>Phone</label><input type="tel" name="phone" value="${escapeHtml(staffData?.phone||'')}"></div>
                    ${!staffId ? `<div class="form-group"><label>Password *</label><input type="password" name="password" required></div>` : ''}
                    <div class="form-group"><label>Clock PIN (4-6 digits)</label><input type="password" name="clock_in_pin" maxlength="6" value="${escapeHtml(staffData?.clock_in_pin||'')}"></div>
                    <div class="form-group"><label>Hourly Rate (ZAR) *</label><input type="number" step="0.5" name="hourly_rate" required value="${staffData?.hourly_rate||''}"></div>
                    <div class="form-group" id="job-title-group"><label>Job Title *</label><select name="staff_role" ${isMobileScanner ? 'disabled' : 'required'}>${jobOptions}</select></div>
                    <div class="form-group"><label>Status</label><select name="status"><option value="Active" ${staffData?.status==='Active'?'selected':''}>Active</option><option value="Inactive" ${staffData?.status==='Inactive'?'selected':''}>Inactive</option></select></div>
                </div>
                <div id="module-preview-section" style="background:var(--s2);border-radius:12px;padding:12px;border:1px solid var(--border);">
                    <h4 style="font-size:0.8rem;font-weight:700;color:var(--text);margin-bottom:8px;"><i class="fas fa-desktop" style="color:var(--red);"></i> Module Access (auto-assigned by job title)</h4>
                    <div id="screens-preview" style="font-size:0.75rem;color:var(--muted);">Select a job title to see available modules.</div>
                </div>
                <div id="mobile-scanner-note" style="display:none;background:var(--s2);border-radius:12px;padding:12px;border:1px solid var(--border);font-size:0.75rem;color:var(--muted);">
                    <i class="fas fa-qrcode" style="color:var(--red);"></i> Mobile Scanner is a standalone role — no job title, no dashboard modules. This account logs in straight into <strong>/staff/scanner.html</strong>, separate from the regular staff console.
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
                    <button type="button" class="btn-secondary" onclick="closeStaffForm()">Cancel</button>
                    <button type="submit" class="btn-primary" id="staff-form-submit-btn"><i class="fas fa-save"></i> ${staffId ? 'Update' : 'Create'}</button>
                </div>
            </form>
        `;

        function applyAccountTypeUI(accountType) {
            const jobGroup = document.getElementById('job-title-group');
            const modSection = document.getElementById('module-preview-section');
            const scannerNote = document.getElementById('mobile-scanner-note');
            const staffRoleSelect = container.querySelector('select[name="staff_role"]');
            if (accountType === 'mobile_scanner') {
                jobGroup.style.display = 'none';
                modSection.style.display = 'none';
                scannerNote.style.display = 'block';
                staffRoleSelect.disabled = true;
                staffRoleSelect.required = false;
            } else {
                jobGroup.style.display = '';
                modSection.style.display = '';
                scannerNote.style.display = 'none';
                staffRoleSelect.disabled = false;
                staffRoleSelect.required = true;
            }
        }

        const accountTypeSelect = container.querySelector('#account-type-select');
        accountTypeSelect.addEventListener('change', () => applyAccountTypeUI(accountTypeSelect.value));
        applyAccountTypeUI(accountTypeSelect.value);

        const roleSelect = container.querySelector('select[name="staff_role"]');
        roleSelect.addEventListener('change', () => updateModulePreview(roleSelect.value));
        if (staffData?.staff_role) await updateModulePreview(staffData.staff_role);

        const form = document.getElementById('staff-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('staff-form-submit-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            await saveStaff(staffId);
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-save"></i> ${staffId ? 'Update' : 'Create'}`;
        });

        modal.classList.add('active');
    };

    async function updateModulePreview(jobTitle) {
        const preview = document.getElementById('screens-preview');
        if (!jobTitle || !JOB_TITLES[jobTitle]) {
            preview.innerHTML = '<i class="fas fa-info-circle" style="color:var(--muted);"></i> Select a job title to see which modules they will access.';
            return;
        }
        const { data } = await supabase.from('job_title_modules').select('module_id').eq('job_title', jobTitle);
        const modules = (data||[]).map(d => d.module_id);
        if (!modules.length) {
            preview.innerHTML = `<div style="color:var(--gold);"><i class="fas fa-exclamation-triangle"></i> No modules assigned to "${JOB_TITLES[jobTitle].name}". Go to "Module Permissions" tab to assign.</div>`;
            return;
        }
        preview.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px;">${modules.map(m => `<span class="role-badge"><i class="fas ${MODULE_ICONS[m]||'fa-cube'}"></i> ${MODULE_NAMES[m]||m}</span>`).join('')}</div><div style="font-size:0.6rem;color:var(--muted);margin-top:4px;">${modules.length} module(s) assigned</div>`;
    }

    async function saveStaff(staffId) {
        const form = document.getElementById('staff-form');
        const data = new FormData(form);
        const name = data.get('name')?.trim();
        const surname = data.get('surname')?.trim();
        const email = data.get('email')?.trim();
        const accountType = data.get('account_type') || 'standard';
        const isMobileScanner = accountType === 'mobile_scanner';
        const staffRole = isMobileScanner ? null : data.get('staff_role');
        const hourlyRate = data.get('hourly_rate');
        const password = data.get('password');
        const targetRole = isMobileScanner ? MOBILE_SCANNER_ROLE : 'staff';

        if (!name || !surname || !email || !hourlyRate || (!isMobileScanner && !staffRole)) {
            showToast('Please fill in all required fields', true);
            return;
        }
        if (!staffId && (!password || password.length < 6)) {
            showToast('Password must be at least 6 characters', true);
            return;
        }

        const clockInPin = data.get('clock_in_pin') || null;
        if (clockInPin) {
            // Pre-check for a friendly error message — the DB unique index on
            // clock_in_pin is the real guard, this just avoids a raw
            // constraint-violation message reaching the admin.
            let pinQuery = supabase.from('profiles').select('id, name, surname').eq('clock_in_pin', clockInPin);
            if (staffId) pinQuery = pinQuery.neq('id', staffId);
            const { data: pinOwner } = await pinQuery.maybeSingle();
            if (pinOwner) {
                showToast(`PIN already in use by ${pinOwner.name} ${pinOwner.surname}`, true);
                return;
            }
        }

        try {
            if (staffId) {
                // Update — account type is fixed at creation, so role is left untouched here.
                const updatePayload = {
                    name, surname,
                    phone: data.get('phone') || null,
                    clock_in_pin: data.get('clock_in_pin') || null,
                    staff_role: staffRole,
                    status: data.get('status') || 'Active',
                    hourly_rate: parseFloat(hourlyRate),
                    updated_at: new Date().toISOString()
                };
                const { error } = await supabase.from('profiles').update(updatePayload).eq('id', staffId);
                if (error) throw error;
                showToast('Staff updated!', 'success');
            } else {
                // Create
                // Check if email exists
                const { data: existing } = await supabase.from('profiles').select('email').eq('email', email).maybeSingle();
                if (existing) { showToast('Email already in use', 'error'); return; }

                // Create auth user
                const { data: auth, error: authError } = await supabase.auth.signUp({
                    email, password,
                    options: { data: { name, surname, role: targetRole } }
                });
                if (authError) {
                    if (authError.message.includes('already registered')) {
                        showToast('This email is already registered. If this is a staff member stuck without a role, use Edit instead of Create.', 'error');
                    } else {
                        throw authError;
                    }
                    return;
                }
                if (!auth.user) throw new Error('Failed to create user');

                // Create/repair profile via atomic RPC — this can be safely retried and
                // will NEVER leave the profile without a staff_role, unlike a raw insert.
                // p_role picks which role the profile gets: 'staff' (console + job title)
                // or 'mobile_scanner' (standalone, routes straight to the scanner app).
                const finalizeProfile = () => supabase.rpc('upsert_staff_profile', {
                    p_id: auth.user.id,
                    p_name: name,
                    p_surname: surname,
                    p_email: email,
                    p_phone: data.get('phone') || null,
                    p_staff_role: staffRole,
                    p_clock_in_pin: data.get('clock_in_pin') || null,
                    p_status: data.get('status') || 'Active',
                    p_hourly_rate: parseFloat(hourlyRate),
                    p_role: targetRole
                });

                let { error: profError } = await finalizeProfile();
                if (profError) {
                    // One automatic retry — covers transient network blips, the most
                    // common cause of the old "orphaned auth user" failure mode.
                    console.warn('Profile save failed, retrying once:', profError);
                    ({ error: profError } = await finalizeProfile());
                }
                if (profError) {
                    // Surface this persistently — the auth login now exists even though
                    // the profile failed, so the admin MUST know to retry via Edit.
                    showToast(`Login created but profile save failed: ${profError.message}. Click Edit on "${email}" to retry.`, 'error');
                    console.error('upsert_staff_profile failed after retry:', profError);
                    return;
                }
                showToast(isMobileScanner ? 'Mobile Scanner account created!' : 'Staff created with role assigned!', 'success');
            }
            closeStaffForm();
            await loadWorkforceData();
        } catch (err) {
            console.error(err);
            if (err.message?.includes('profiles_clock_in_pin_unique')) {
                showToast('That PIN was just taken by another staff member — please choose a different one.', true);
            } else {
                showToast(err.message || 'An error occurred', 'error');
            }
        }
    }

    window.closeStaffForm = () => {
        document.getElementById('staff-form-modal').classList.remove('active');
    };
    window.closeStaffProfile = () => {
        document.getElementById('staff-profile-modal').classList.remove('active');
    };
    window.editStaff = (id) => window.openStaffForm(id);

    window.viewStaffProfile = async (id) => {
        const staff = staffList.find(s => s.id === id);
        if (!staff) return;
        const isMobileScanner = staff.role === MOBILE_SCANNER_ROLE;
        const modList = isMobileScanner ? [] : (await supabase.from('job_title_modules').select('module_id').eq('job_title', staff.staff_role || staff.role)).data?.map(d => d.module_id) || [];
        const { data: payslipHistory } = await supabase.from('staff_payroll').select('*').eq('staff_id', id).order('period_end', { ascending: false }).limit(12);
        registerPayrollRecords(payslipHistory || []);
        const container = document.getElementById('staff-profile-container');
        container.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                <div style="width:48px;height:48px;border-radius:50%;background:var(--red-dim);display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:700;color:var(--red);">${getInitials(staff.name, staff.surname)}</div>
                <div><div style="font-size:1rem;font-weight:700;">${escapeHtml(staff.name||'')} ${escapeHtml(staff.surname||'')}</div><div style="color:var(--muted);font-size:0.8rem;">${escapeHtml(staff.email||'')}</div></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                <div><span style="color:var(--muted);font-size:0.6rem;">${isMobileScanner ? 'Account Type' : 'Job Title'}</span><div style="font-weight:600;">${roleLabel(staff)}</div></div>
                <div><span style="color:var(--muted);font-size:0.6rem;">Hourly Rate</span><div style="font-weight:600;">${staff.hourly_rate ? fmtR(staff.hourly_rate) : '—'}</div></div>
                <div><span style="color:var(--muted);font-size:0.6rem;">Status</span><div><span class="status-badge ${staff.status==='Active'?'status-active':'status-inactive'}">${staff.status||'Active'}</span></div></div>
                <div><span style="color:var(--muted);font-size:0.6rem;">Last Seen</span><div style="font-weight:600;">${staff.last_seen ? formatDateTime(staff.last_seen) : 'Never'}</div></div>
            </div>
            ${isMobileScanner
                ? `<div style="color:var(--muted);font-size:0.75rem;"><i class="fas fa-qrcode" style="color:var(--red);"></i> Mobile Scanner accounts skip the module system entirely — they log in straight into the scanner app.</div>`
                : `<div><span style="color:var(--muted);font-size:0.6rem;">Assigned Modules (${modList.length})</span><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">${modList.length ? modList.map(m => `<span class="role-badge"><i class="fas ${MODULE_ICONS[m]||'fa-cube'}"></i> ${MODULE_NAMES[m]||m}</span>`).join('') : '<span style="color:var(--muted);font-size:0.7rem;">No modules assigned</span>'}</div></div>`
            }
            <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:14px;">
                <span style="color:var(--muted);font-size:0.6rem;">Payslip History</span>
                <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
                    ${(payslipHistory && payslipHistory.length) ? payslipHistory.map(r => `
                        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--s2);border-radius:8px;padding:8px 12px;">
                            <div>
                                <div style="font-size:0.75rem;font-weight:600;">${formatDate(r.period_start)} – ${formatDate(r.period_end)}</div>
                                <div style="font-size:0.65rem;color:var(--muted);">${fmtR(r.final_pay)} net · ${r.payment_status === 'paid' ? 'Paid' : 'Pending'}</div>
                            </div>
                            <div style="display:flex;gap:4px;">
                                <button class="btn-sm" onclick="viewPayslip('${r.id}')"><i class="fas fa-eye"></i></button>
                                <button class="btn-sm" onclick="downloadPayslipPDF('${r.id}')"><i class="fas fa-file-pdf"></i></button>
                            </div>
                        </div>
                    `).join('') : '<span style="color:var(--muted);font-size:0.7rem;">No payslips generated yet</span>'}
                </div>
            </div>
        `;
        document.getElementById('staff-profile-modal').classList.add('active');
    };

    window.toggleStaffStatus = async (id, current) => {
        const newStatus = current === 'Active' ? 'Inactive' : 'Active';
        const confirmed = await window.showCustomModal('Change Status', `Change status to ${newStatus}?`, 'Confirm', 'primary');
        if (!confirmed) return;
        try {
            await supabase.from('profiles').update({ status: newStatus }).eq('id', id);
            showToast(`Status updated to ${newStatus}`, 'success');
            await loadWorkforceData();
        } catch(err) { showToast(err.message, 'error'); }
    };

    window.exportStaffList = () => { showToast('Export coming soon', 'info'); };

    // ─── OTHER TABS ───
    function renderPayrollTable(records) {
        currentPayrollBatch = records || [];
        registerPayrollRecords(currentPayrollBatch);
        const tbody = document.getElementById('payroll-table-body');
        if (!currentPayrollBatch.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--muted);">No payroll records for this period yet — select a date range and click Calculate</td></tr>`;
            document.getElementById('mark-all-paid-btn').style.display = 'none';
            return;
        }
        tbody.innerHTML = currentPayrollBatch.map(r => {
            const staff = staffList.find(s => s.id === r.staff_id);
            const name = staff ? `${staff.name||''} ${staff.surname||''}`.trim() : 'Unknown staff';
            const role = staff ? (staff.staff_role || staff.role || 'N/A') : 'N/A';
            const isPaid = r.payment_status === 'paid';
            return `
                <tr>
                    <td>${escapeHtml(name)}</td>
                    <td>${escapeHtml(role)}</td>
                    <td>${(parseFloat(r.hours_worked)||0).toFixed(1)}</td>
                    <td>${fmtR(r.hourly_rate)}</td>
                    <td>${fmtR(r.gross_pay)}</td>
                    <td>-${fmtR(r.deductions)}</td>
                    <td>${fmtR(r.final_pay)}</td>
                    <td><span class="status-badge ${isPaid ? 'status-active' : 'status-inactive'}">${isPaid ? 'Paid' : 'Pending'}</span></td>
                    <td style="display:flex;gap:4px;flex-wrap:wrap;">
                        <button class="btn-sm" title="View payslip" onclick="viewPayslip('${r.id}')"><i class="fas fa-eye"></i></button>
                        <button class="btn-sm" title="Download PDF" onclick="downloadPayslipPDF('${r.id}')"><i class="fas fa-file-pdf"></i></button>
                        ${!isPaid ? `<button class="btn-sm success" title="Mark paid" onclick="markPayrollPaid('${r.id}')"><i class="fas fa-check"></i></button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
        document.getElementById('mark-all-paid-btn').style.display = currentPayrollBatch.some(r => r.payment_status !== 'paid') ? 'inline-block' : 'none';
    }
    window.renderPayrollTable = renderPayrollTable;

    window.calculatePayroll = async () => {
        const start = document.getElementById('payroll-start').value;
        const end = document.getElementById('payroll-end').value;
        if (!start || !end) { showToast('Select both dates', true); return; }
        if (new Date(end) < new Date(start)) { showToast('End date must be after start date', true); return; }
        if (!staffList.length) { showToast('No staff data', true); return; }

        const startDate = new Date(start + 'T00:00:00');
        const endDate = new Date(end + 'T23:59:59');
        const periodDays = Math.max(1, Math.round((endDate - startDate) / 86400000) + 1);

        const tbody = document.getElementById('payroll-table-body');
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--muted);"><i class="fas fa-spinner fa-spin"></i> Calculating payroll...</td></tr>`;

        const rowsToInsert = [];
        for (const s of staffList) {
            const hours = shifts
                .filter(sh => sh.staff_id === s.id && sh.logout_time && new Date(sh.login_time) >= startDate && new Date(sh.login_time) <= endDate)
                .reduce((sum, sh) => sum + (parseFloat(sh.hours_worked) || 0), 0);
            if (hours <= 0) continue;
            const rate = parseFloat(s.hourly_rate) || 0;
            const gross = hours * rate;
            const deductions = calculatePeriodDeductions(gross, periodDays);
            const net = Math.max(gross - deductions.total, 0);
            rowsToInsert.push({
                staff_id: s.id,
                hours_worked: Number(hours.toFixed(2)),
                hourly_rate: rate,
                gross_pay: Number(gross.toFixed(2)),
                deductions: Number(deductions.total.toFixed(2)),
                final_pay: Number(net.toFixed(2)),
                payment_status: 'pending',
                period_start: start,
                period_end: end,
            });
        }

        if (!rowsToInsert.length) {
            renderPayrollTable([]);
            showToast('No completed shifts found in that period', true);
            return;
        }

        try {
            // Clear out any not-yet-paid calculations for this exact period so recalculating doesn't duplicate rows
            await supabase.from('staff_payroll').delete()
                .eq('period_start', start).eq('period_end', end).eq('payment_status', 'pending');
            const { data: inserted, error } = await supabase.from('staff_payroll').insert(rowsToInsert).select('*');
            if (error) throw error;
            payrollRecords = [...inserted, ...payrollRecords.filter(r => !(r.period_start === start && r.period_end === end))];
            renderPayrollTable(inserted);
            showToast('Payroll calculated', 'success');
        } catch (err) {
            console.error('Payroll calc error:', err);
            showToast('Failed to save payroll: ' + err.message, true);
            renderPayrollTable([]);
        }
    };

    window.markPayrollPaid = async (id) => {
        const confirmed = await window.showCustomModal('Mark Paid', 'Mark this payslip as paid?', 'Confirm', 'primary');
        if (!confirmed) return;
        try {
            const { error } = await supabase.from('staff_payroll')
                .update({ payment_status: 'paid' }).eq('id', id);
            if (error) throw error;
            const rec = payrollById.get(id);
            if (rec) rec.payment_status = 'paid';
            renderPayrollTable(currentPayrollBatch);
            showToast('Marked as paid', 'success');
        } catch (err) {
            showToast('Failed to update: ' + err.message, true);
        }
    };

    window.markAllPayrollPaid = async () => {
        const pendingIds = currentPayrollBatch.filter(r => r.payment_status !== 'paid').map(r => r.id);
        if (!pendingIds.length) return;
        const confirmed = await window.showCustomModal('Mark All Paid', `Mark all ${pendingIds.length} shown payslip(s) as paid?`, 'Confirm', 'primary');
        if (!confirmed) return;
        try {
            const { error } = await supabase.from('staff_payroll')
                .update({ payment_status: 'paid' }).in('id', pendingIds);
            if (error) throw error;
            pendingIds.forEach(id => { const rec = payrollById.get(id); if (rec) rec.payment_status = 'paid'; });
            renderPayrollTable(currentPayrollBatch);
            showToast('All marked as paid', 'success');
        } catch (err) {
            showToast('Failed to update: ' + err.message, true);
        }
    };

    window.exportPayrollCSV = () => {
        if (!currentPayrollBatch.length) { showToast('Nothing to export', true); return; }
        const header = ['Staff', 'Job Title', 'Hours', 'Rate', 'Gross', 'Deductions', 'Net', 'Status', 'Period Start', 'Period End'];
        const rows = currentPayrollBatch.map(r => {
            const staff = staffList.find(s => s.id === r.staff_id);
            const name = staff ? `${staff.name || ''} ${staff.surname || ''}`.trim() : 'Unknown';
            const role = staff ? (staff.staff_role || staff.role || 'N/A') : 'N/A';
            return [name, role, r.hours_worked, r.hourly_rate, r.gross_pay, r.deductions, r.final_pay, r.payment_status, r.period_start, r.period_end];
        });
        const csv = [header, ...rows].map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payroll_${currentPayrollBatch[0].period_start}_to_${currentPayrollBatch[0].period_end}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('CSV exported', 'success');
    };

    window.forceLogout = async (shiftId) => {
        const shift = shifts.find(s => s.id === shiftId);
        if (!shift) { showToast('Shift not found — try refreshing', true); return; }
        const staff = staffList.find(st => st.id === shift.staff_id);
        const name = staff ? `${staff.name} ${staff.surname}` : 'this staff member';

        const loginUTC = parseServerTimestamp(shift.login_time);
        const now = new Date();
        const diffMs = now - loginUTC;
        const durationStr = formatDuration(diffMs);

        const confirmed = await window.showCustomModal(
            'Force Clock Out',
            `Clock out ${escapeHtml(name)} now? They've been on shift for ${durationStr} (since ${formatDateTime(shift.login_time)}). This will end their shift at the current time and cannot be undone.`,
            'Force Clock Out',
            'danger'
        );
        if (!confirmed) return;

        try {
            const hours = diffMs / (1000 * 60 * 60);
            const { error } = await supabase
                .from('staff_shifts')
                .update({
                    logout_time: now.toISOString(),
                    status: 'completed',
                    hours_worked: hours,
                    force_logout: true
                })
                .eq('id', shiftId);
            if (error) throw error;

            const { data: { user } = {} } = await supabase.auth.getUser();
            await supabase.from('staff_activity_logs').insert({
                staff_id: shift.staff_id,
                module: 'Attendance',
                action: `Force clocked out by manager after ${durationStr}${user ? ` (by ${user.email})` : ''}`,
                created_at: now.toISOString()
            });

            showToast(`${name} force clocked out (${durationStr})`);
            await loadWorkforceData();
        } catch (err) {
            console.error(err);
            showToast(err.message || 'Failed to force clock out', true);
        }
    };

    // ─── PAYSLIP VIEW / PDF ───
    // Rands logo, transparent PNG, embedded so the payslip PDF never depends
    // on an external asset path being reachable at generation time.
    const RANDS_LOGO_PNG = 'data:image/png;base64,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';

    function payslipBreakdown(record, staff) {
        const name = staff ? `${staff.name || ''} ${staff.surname || ''}`.trim() : 'Unknown staff';
        const role = staff ? (staff.staff_role || staff.role || 'N/A') : 'N/A';
        const gross = parseFloat(record.gross_pay) || 0;
        const totalDeductions = parseFloat(record.deductions) || 0;
        const periodDays = Math.max(1, Math.round((new Date(record.period_end) - new Date(record.period_start)) / 86400000) + 1);
        const est = calculatePeriodDeductions(gross, periodDays); // recompute the PAYE/UIF split for display
        return { name, role, gross, totalDeductions, paye: est.paye, uif: est.uif, net: parseFloat(record.final_pay) || 0, periodDays };
    }

    window.viewPayslip = (id) => {
        const record = payrollById.get(id);
        if (!record) { showToast('Payslip not found', true); return; }
        const staff = staffList.find(s => s.id === record.staff_id);
        const b = payslipBreakdown(record, staff);
        document.getElementById('payslip-container').innerHTML = `
            <div style="text-align:center;margin-bottom:16px;">
                <div style="font-weight:700;font-size:1.1rem;">${escapeHtml(venueInfo.name)}</div>
                ${venueInfo.address ? `<div style="color:var(--muted);font-size:0.7rem;">${escapeHtml(venueInfo.address)}</div>` : ''}
                <div style="color:var(--muted);font-size:0.75rem;margin-top:4px;">Payslip · ${formatDate(record.period_start)} – ${formatDate(record.period_end)}</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
                <div><span style="color:var(--muted);font-size:0.6rem;">Employee</span><div style="font-weight:600;">${escapeHtml(b.name)}</div></div>
                <div><span style="color:var(--muted);font-size:0.6rem;">Job Title</span><div style="font-weight:600;">${escapeHtml(b.role)}</div></div>
                <div><span style="color:var(--muted);font-size:0.6rem;">Hours Worked</span><div style="font-weight:600;">${(parseFloat(record.hours_worked)||0).toFixed(1)}</div></div>
                <div><span style="color:var(--muted);font-size:0.6rem;">Hourly Rate</span><div style="font-weight:600;">${fmtR(record.hourly_rate)}</div></div>
            </div>
            <div style="border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:12px 0;margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Gross Pay</span><span style="font-weight:600;">${fmtR(b.gross)}</span></div>
                <div style="display:flex;justify-content:space-between;padding:4px 0;color:var(--muted);"><span>PAYE (est.)</span><span>-${fmtR(b.paye)}</span></div>
                <div style="display:flex;justify-content:space-between;padding:4px 0;color:var(--muted);"><span>UIF (1%)</span><span>-${fmtR(b.uif)}</span></div>
                <div style="display:flex;justify-content:space-between;padding:4px 0;color:var(--muted);border-top:1px dashed var(--border);margin-top:4px;padding-top:8px;"><span>Total Deductions</span><span>-${fmtR(b.totalDeductions)}</span></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:1.05rem;font-weight:700;margin-bottom:12px;">
                <span>Net Pay</span><span style="color:var(--red);">${fmtR(b.net)}</span>
            </div>
            <div style="text-align:center;"><span class="status-badge ${record.payment_status==='paid'?'status-active':'status-inactive'}">${record.payment_status==='paid'?'Paid':'Pending'}</span></div>
            <div style="color:var(--muted);font-size:0.6rem;margin-top:16px;text-align:center;">PAYE estimated using SARS 2026/27 brackets (annualised method). Confirm with your accountant / SARS before final submission.</div>
        `;
        document.getElementById('payslip-modal').dataset.recordId = id;
        document.getElementById('payslip-modal').classList.add('active');
    };
    window.closePayslip = () => { document.getElementById('payslip-modal').classList.remove('active'); };

    function buildPayslipPDF(record, staff) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const b = payslipBreakdown(record, staff);

        // ---- Rands brand palette — "The Vault" (identical tokens to the
        // staff terminal / standalone payslip design) ----
        const C = {
            void:      [10, 10, 13],
            panel:     [23, 21, 27],
            red:       [227, 6, 19],
            redDeep:   [140, 10, 23],
            champagne: [201, 162, 75],
            bone:      [244, 241, 234],
            boneDim:   [186, 182, 172],
            smoke:     [131, 128, 138],
            hairline:  [42, 39, 48],
        };
        const PAGE_W = 595.28, PAGE_H = 841.89, L = 40, R = 555, CW = R - L;
        const isPaid = record.payment_status === 'paid';

        const setFill = (c) => doc.setFillColor(c[0], c[1], c[2]);
        const setDraw = (c) => doc.setDrawColor(c[0], c[1], c[2]);
        const setText = (c) => doc.setTextColor(c[0], c[1], c[2]);
        // Native PDF character spacing (correctly measured by jsPDF's own
        // width/alignment logic) instead of inserting spacing characters,
        // which broke width calculation for right-aligned labels.
        const trackedText = (str, x, yPos, opts, spacing) => {
            doc.setCharSpace(spacing != null ? spacing : 0.6);
            doc.text(str, x, yPos, opts);
            doc.setCharSpace(0);
        };

        // ---------------- Full dark page background ----------------
        setFill(C.void); doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

        // ---------------- Header ----------------
        const badgeX = L, badgeY = 34, badgeW = 90, badgeH = 50;
        setFill(C.red); doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 8, 8, 'F');
        const logoRatio = 92 / 196; // source logo is 196x92
        const logoW = badgeW - 18, logoH = logoW * logoRatio;
        doc.addImage(RANDS_LOGO_PNG, 'PNG', badgeX + 9, badgeY + (badgeH - logoH) / 2, logoW, logoH);

        const textX = badgeX + badgeW + 18;
        setText(C.bone); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
        doc.text('C', textX, 58);
        const cW = doc.getTextWidth('C');
        setText(C.red); doc.text('a', textX + cW, 58);
        const aW = doc.getTextWidth('a');
        setText(C.bone); doc.text('pe Town', textX + cW + aW, 58);

        setText(C.smoke); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
        trackedText('STAFF ATTENDANCE VAULT', textX, 72, {}, 1.6);

        setText(C.champagne); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
        doc.text('STAFF PAYSLIP', R, 42, { align: 'right' });
        setText(C.smoke); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
        doc.text(`Pay Period: ${formatDate(record.period_start)} – ${formatDate(record.period_end)}`, R, 56, { align: 'right' });

        // status pill
        const pillW = 72, pillH = 18, pillX = R - pillW, pillY = 66;
        setFill(isPaid ? C.champagne : C.panel);
        setDraw(isPaid ? C.champagne : C.boneDim); doc.setLineWidth(0.75);
        doc.roundedRect(pillX, pillY, pillW, pillH, 9, 9, isPaid ? 'F' : 'S');
        setText(isPaid ? C.void : C.boneDim); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
        trackedText(isPaid ? 'PAID' : 'PENDING', pillX + pillW / 2, pillY + 12.5, { align: 'center' }, 1);

        setDraw(C.hairline); doc.setLineWidth(0.75); doc.line(L, 104, R, 104);

        // ---------------- Card panel ----------------
        const panelTop = 122, panelBottom = 630;
        setFill(C.panel); doc.roundedRect(L, panelTop, CW, panelBottom - panelTop, 12, 12, 'F');
        setDraw(C.hairline); doc.setLineWidth(0.75);
        doc.roundedRect(L, panelTop, CW, panelBottom - panelTop, 12, 12, 'S');

        const pad = 24;
        const innerX = L + pad, innerW = CW - pad * 2, colW = innerW / 2;
        let cy = panelTop + 34;

        setText(C.bone); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
        trackedText('EMPLOYEE', innerX, cy, {}, 1);
        trackedText('EMPLOYER', innerX + colW, cy, {}, 1);
        setDraw(C.hairline); doc.line(innerX, cy + 8, innerX + innerW, cy + 8);

        const field = (x, yy, label, value) => {
            setText(C.champagne); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8);
            trackedText(label.toUpperCase(), x, yy, {}, 1);
            setText(C.bone); doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
            doc.text(value, x, yy + 15);
        };

        cy += 34;
        field(innerX, cy, 'Full Name', b.name);
        field(innerX + colW, cy, 'Business', 'Rands Cape Town');

        cy += 34;
        field(innerX, cy, 'Job Title', b.role);
        setText(C.champagne); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8);
        trackedText('SITE ADDRESS', innerX + colW, cy, {}, 1);
        setText(C.bone); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        const addrLines = venueInfo.address ? doc.splitTextToSize(venueInfo.address, colW - 10) : [];
        addrLines.slice(0, 3).forEach((ln, i) => doc.text(ln, innerX + colW, cy + 15 + i * 12));

        cy += Math.max(34, 15 + addrLines.length * 12 + 8);
        field(innerX, cy, 'Hours Worked', (parseFloat(record.hours_worked) || 0).toFixed(2));
        field(innerX + colW, cy, 'Contact Number', venueInfo.phone || 'N/A');

        cy += 34;
        field(innerX, cy, 'Hourly Rate', fmtR(record.hourly_rate));
        field(innerX + colW, cy, 'Pay Period', `${b.periodDays} day(s)`);

        cy += 30;
        setDraw(C.hairline); doc.line(innerX, cy, innerX + innerW, cy);

        // ---------------- Earnings ----------------
        cy += 24;
        setText(C.champagne); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
        trackedText('EARNINGS', innerX, cy, {}, 1);

        const row = (yy, desc, detail, amount, bold) => {
            setText(bold ? C.bone : C.bone);
            doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(10);
            doc.text(desc, innerX, yy);
            if (detail) {
                setText(C.smoke); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
                doc.text(detail, innerX + 175, yy);
            }
            setText(C.bone); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(10);
            doc.text(amount, innerX + innerW, yy, { align: 'right' });
        };

        cy += 20;
        row(cy, 'Ordinary hours worked',
            `${(parseFloat(record.hours_worked) || 0).toFixed(1)} hrs @ ${fmtR(record.hourly_rate)}/hr`,
            fmtR(b.gross));
        cy += 16;
        setDraw(C.hairline); doc.line(innerX, cy, innerX + innerW, cy);
        cy += 18;
        row(cy, 'Gross Pay', '', fmtR(b.gross), true);

        // ---------------- Deductions ----------------
        cy += 28;
        setText(C.champagne); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
        trackedText('DEDUCTIONS', innerX, cy, {}, 1);

        cy += 20;
        row(cy, 'PAYE (income tax)', 'Est. per SARS 2026/27 brackets', '– ' + fmtR(b.paye));
        cy += 18;
        row(cy, 'UIF (employee, 1%)', 'Capped per SARS earnings ceiling', '– ' + fmtR(b.uif));
        cy += 16;
        setDraw(C.hairline); doc.line(innerX, cy, innerX + innerW, cy);
        cy += 18;
        row(cy, 'Total Deductions', '', '– ' + fmtR(b.totalDeductions), true);

        // ---------------- Net pay callout ----------------
        cy += 26;
        const netH = 50;
        setFill(C.redDeep); doc.roundedRect(innerX, cy, innerW, netH, 8, 8, 'F');
        setText(C.bone); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
        doc.text('NET PAY', innerX + 16, cy + 30);
        setText(C.bone); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
        doc.text(fmtR(b.net), innerX + innerW - 16, cy + 32, { align: 'right' });

        // ---------------- Footer ----------------
        let fy = panelBottom + 22;
        setText(C.smoke); doc.setFont('helvetica', 'italic'); doc.setFontSize(7.2);
        const disclaimer = doc.splitTextToSize(
            'PAYE estimated using SARS 2026/27 brackets (annualised method); UIF at 1%, capped. Confirm final liabilities with your accountant or SARS.',
            CW
        );
        doc.text(disclaimer, L, fy);
        fy += disclaimer.length * 9.5 + 10;
        setText(C.smoke); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        doc.text('RANDS CAPE TOWN · ATTENDANCE VAULT · CONFIDENTIAL', PAGE_W / 2, fy, { align: 'center' });
        fy += 12;
        doc.text(`Generated ${new Date().toLocaleDateString('en-ZA')}`, PAGE_W / 2, fy, { align: 'center' });

        return doc;
    }


    window.downloadPayslipPDF = (id) => {
        const record = payrollById.get(id);
        if (!record) { showToast('Payslip not found', true); return; }
        const staff = staffList.find(s => s.id === record.staff_id);
        const doc = buildPayslipPDF(record, staff);
        const name = staff ? `${staff.name || ''}_${staff.surname || ''}`.replace(/\s+/g, '_') : 'staff';
        doc.save(`payslip_${name}_${record.period_start}_to_${record.period_end}.pdf`);
    };

    window.downloadCurrentPayslipPDF = () => {
        const id = document.getElementById('payslip-modal').dataset.recordId;
        if (id) window.downloadPayslipPDF(id);
    };

    // Attendance
    async function renderActiveShifts() {
        const container = document.getElementById('active-shifts-container');
        const active = shifts.filter(s => s.status === 'active');
        if (!active.length) {
            container.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;">No staff clocked in</div>';
            return;
        }
        container.innerHTML = active.map(s => {
            const staff = staffList.find(st => st.id === s.staff_id);
            const name = staff ? `${staff.name} ${staff.surname}` : 'Unknown';
            return `<div class="activity-item" style="display:flex;align-items:center;justify-content:space-between;gap:12px;"><div style="display:flex;gap:10px;align-items:flex-start;"><div class="activity-badge"><i class="fas fa-clock"></i></div><div class="activity-detail"><strong>${escapeHtml(name)}</strong> clocked in at ${formatDateTime(s.login_time)}<br><small>${staff ? roleLabel(staff) : 'Staff'}</small></div></div><button class="btn-sm danger" style="white-space:nowrap;font-size:0.7rem;padding:6px 10px;" onclick="forceLogout('${s.id}')"><i class="fas fa-power-off"></i> Force Clock Out</button></div>`;
        }).join('');
    }

    // Activity feed
    function renderActivityFeed() {
        const container = document.getElementById('activity-feed-container');
        if (!activityLogs.length) {
            container.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;">No recent activity</div>';
            return;
        }
        container.innerHTML = activityLogs.slice(0, 15).map(log => {
            const staff = log.profiles || { name: 'Staff', surname: 'Member' };
            const name = `${staff.name||''} ${staff.surname||''}`.trim() || 'Staff';
            return `<div class="activity-item"><div class="activity-badge"><i class="fas ${log.module==='POS'?'fa-cash-register':log.module==='Kiosk'?'fa-desktop':'fa-user-check'}"></i></div><div class="activity-detail"><strong>${escapeHtml(name)}</strong> ${escapeHtml(log.action||'')}<br><small>${escapeHtml(log.module||'')}</small><div class="activity-time">${formatDateTime(log.created_at)}</div></div></div>`;
        }).join('');
    }

    // ─── MODULE PERMISSIONS ───
    let modulePermissions = {};

    async function loadModulePermissions() {
        try {
            const { data, error } = await supabase.from('job_title_modules').select('job_title, module_id');
            if (error) throw error;
            modulePermissions = {};
            data.forEach(item => {
                if (!modulePermissions[item.job_title]) modulePermissions[item.job_title] = [];
                modulePermissions[item.job_title].push(item.module_id);
            });
            renderModulePermissions();
        } catch(e) {
            console.error(e);
            document.getElementById('module-permissions-container').innerHTML = '<div style="color:var(--red);padding:20px;">Error loading permissions</div>';
        }
    }

    function renderModulePermissions() {
        const container = document.getElementById('module-permissions-container');
        container.innerHTML = Object.keys(JOB_TITLES).map(key => {
            const assigned = modulePermissions[key] || [];
            return `
                <div style="border-bottom:1px solid var(--border);padding:12px 0;">
                    <h4 style="font-weight:600;color:var(--text);margin-bottom:8px;">${JOB_TITLES[key].name}</h4>
                    <div class="module-permissions-grid">
                        ${ALL_MODULES.map(mod => {
                            const checked = assigned.includes(mod);
                            const icon = MODULE_ICONS[mod] || 'fa-cube';
                            const name = MODULE_NAMES[mod] || mod;
                            return `
                                <div class="module-check-item ${checked?'checked':''}" onclick="toggleModuleCheck('${key}','${mod}')">
                                    <input type="checkbox" id="mod_${key.replace(/\s/g,'_')}_${mod}" data-job-title="${key}" data-module-id="${mod}" ${checked?'checked':''} onchange="toggleModuleCheck('${key}','${mod}')">
                                    <label for="mod_${key.replace(/\s/g,'_')}_${mod}"><i class="fas ${icon}"></i> ${name}</label>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    window.toggleModuleCheck = function(jobTitle, moduleId) {
        const checkbox = document.getElementById(`mod_${jobTitle.replace(/\s/g,'_')}_${moduleId}`);
        if (!checkbox) return;
        const parent = checkbox.closest('.module-check-item');
        if (checkbox.checked) parent.classList.add('checked');
        else parent.classList.remove('checked');
    };

    window.saveModulePermissions = async function() {
        const btn = document.getElementById('save-modules-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        try {
            const checkboxes = document.querySelectorAll('#module-permissions-container input[type="checkbox"]');
            const perms = {};
            checkboxes.forEach(cb => {
                const jobTitle = cb.dataset.jobTitle;
                const moduleId = cb.dataset.moduleId;
                if (!perms[jobTitle]) perms[jobTitle] = [];
                if (cb.checked) perms[jobTitle].push(moduleId);
            });
            // Delete all
            await supabase.from('job_title_modules').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            // Insert new
            const inserts = [];
            Object.entries(perms).forEach(([jobTitle, modules]) => {
                modules.forEach(mod => inserts.push({ job_title: jobTitle, module_id: mod }));
            });
            if (inserts.length) await supabase.from('job_title_modules').insert(inserts);
            showToast('Permissions saved!', 'success');
            await loadModulePermissions();
        } catch(e) {
            showToast('Error: '+e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Save All';
        }
    };

    // ─── TABS ───
    function initTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
                document.getElementById(btn.dataset.tab).classList.remove('hidden');
                if (btn.dataset.tab === 'modules-tab') loadModulePermissions();
                if (btn.dataset.tab === 'attendance-tab') renderActiveShifts();
                if (btn.dataset.tab === 'activity-tab') renderActivityFeed();
            });
        });
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
    function renderCharts() {
        // KPIs
        const total = staffList.length;
        const active = staffList.filter(s => s.status === 'Active').length;
        const clockedIn = shifts.filter(s => s.status === 'active').length;
        const avgRate = staffList.reduce((s, p) => s + (p.hourly_rate||0), 0) / (staffList.length||1);
        const totalHours = shifts.reduce((s, sh) => s + (sh.hours_worked||0), 0);
        const estPayroll = totalHours * avgRate;

        document.getElementById('dashKpiGrid').innerHTML = `
            <div class="dash-kpi"><div class="val">${total}</div><div class="label">Total Staff</div><div class="sub">${active} active</div></div>
            <div class="dash-kpi"><div class="val">${clockedIn}</div><div class="label">Clocked In</div></div>
            <div class="dash-kpi"><div class="val">${fmtR(avgRate)}</div><div class="label">Avg Hourly Rate</div></div>
            <div class="dash-kpi"><div class="val">${fmtR(estPayroll)}</div><div class="label">Est. Payroll</div><div class="sub">${totalHours.toFixed(0)} hours</div></div>
        `;

        // Role Distribution
        const roleCount = {};
        staffList.forEach(s => {
            const role = roleLabel(s);
            roleCount[role] = (roleCount[role] || 0) + 1;
        });
        const roleLabels = Object.keys(roleCount);
        const roleData = Object.values(roleCount);
        const ctx1 = document.getElementById('dashRoleChart').getContext('2d');
        if (charts.role) charts.role.destroy();
        charts.role = new Chart(ctx1, {
            type: 'doughnut',
            data: { labels: roleLabels, datasets: [{ data: roleData, backgroundColor: ['#E30613','#f59e0b','#10b981','#8b5cf6','#06b6d4','#f97316','#ec489a'] }] },
            options: { responsive: true, plugins: { legend: { labels: { color: '#71717a', boxWidth: 8 } } } }
        });

        // Staff Growth (last 30 days)
        const days = [...Array(30)].map((_, i) => {
            const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split('T')[0];
        }).reverse();
        const growth = days.map(day => {
            return staffList.filter(s => new Date(s.created_at).toISOString().split('T')[0] <= day).length;
        });
        const ctx2 = document.getElementById('dashGrowthChart').getContext('2d');
        if (charts.growth) charts.growth.destroy();
        charts.growth = new Chart(ctx2, {
            type: 'line',
            data: { labels: days.map(d => d.slice(5)), datasets: [{ label: 'Total Staff', data: growth, borderColor: '#E30613', backgroundColor: 'rgba(227,6,19,0.1)', fill: true, tension: 0.3 }] },
            options: { responsive: true, plugins: { legend: { labels: { color: '#71717a' } } } }
        });

        // Shift Activity
        const shiftStatus = { active:0, completed:0 };
        shifts.forEach(s => {
            if (s.status === 'active') shiftStatus.active++;
            else if (s.status === 'completed') shiftStatus.completed++;
        });
        const ctx3 = document.getElementById('dashShiftChart').getContext('2d');
        if (charts.shift) charts.shift.destroy();
        charts.shift = new Chart(ctx3, {
            type: 'bar',
            data: { labels: ['Active', 'Completed'], datasets: [{ label: 'Shifts', data: [shiftStatus.active, shiftStatus.completed], backgroundColor: ['#E30613','#22c55e'] }] },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#71717a', stepSize: 1 } } } }
        });

        // Hours Trend (last 7 days)
        const weekDays = [...Array(7)].map((_, i) => {
            const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split('T')[0];
        }).reverse();
        const hoursByDay = weekDays.map(day => {
            return shifts.filter(s => s.login_time && s.login_time.startsWith(day))
                .reduce((sum, s) => sum + (s.hours_worked||0), 0);
        });
        const ctx4 = document.getElementById('dashHoursChart').getContext('2d');
        if (charts.hours) charts.hours.destroy();
        charts.hours = new Chart(ctx4, {
            type: 'line',
            data: { labels: weekDays.map(d => d.slice(5)), datasets: [{ label: 'Hours Worked', data: hoursByDay, borderColor: '#E30613', backgroundColor: 'rgba(227,6,19,0.1)', fill: true, tension: 0.3 }] },
            options: { responsive: true, plugins: { legend: { labels: { color: '#71717a' } } } }
        });

        // Payroll Summary
        const pending = payrollRecords.filter(p => p.payment_status === 'pending').length;
        const paid = payrollRecords.filter(p => p.payment_status === 'paid').length;
        const processing = payrollRecords.filter(p => p.payment_status === 'processing').length;
        const ctx5 = document.getElementById('dashPayrollChart').getContext('2d');
        if (charts.payroll) charts.payroll.destroy();
        charts.payroll = new Chart(ctx5, {
            type: 'doughnut',
            data: { labels: ['Pending', 'Paid', 'Processing'], datasets: [{ data: [pending, paid, processing], backgroundColor: ['#f59e0b','#22c55e','#8b5cf6'] }] },
            options: { responsive: true, plugins: { legend: { labels: { color: '#71717a', boxWidth: 8 } } } }
        });
        const totalPaid = payrollRecords.filter(p => p.payment_status === 'paid').reduce((s,p) => s + (p.final_pay||0), 0);
        document.getElementById('dashPayrollStats').innerHTML = `
            <div class="dash-stat-mini"><div class="num">${pending}</div><div class="lbl">Pending</div></div>
            <div class="dash-stat-mini"><div class="num">${paid}</div><div class="lbl">Paid</div></div>
            <div class="dash-stat-mini"><div class="num">${fmtR(totalPaid)}</div><div class="lbl">Total Paid</div></div>
        `;

        // Top Performers (by hours)
        const staffHours = {};
        shifts.forEach(s => {
            if (s.hours_worked && s.staff_id) {
                staffHours[s.staff_id] = (staffHours[s.staff_id] || 0) + s.hours_worked;
            }
        });
        const sorted = Object.entries(staffHours).sort((a,b) => b[1] - a[1]).slice(0,5);
        const topContainer = document.getElementById('dashTopPerformers');
        if (sorted.length) {
            topContainer.innerHTML = sorted.map(([id, hours], idx) => {
                const staff = staffList.find(s => s.id === id);
                const name = staff ? `${staff.name} ${staff.surname}` : 'Unknown';
                return `<div class="dash-activity-item" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.7rem;">
                    <span>${idx+1}. ${escapeHtml(name)}</span>
                    <span style="color:var(--red);font-weight:700;">${hours.toFixed(1)} hrs</span>
                </div>`;
            }).join('');
        } else {
            topContainer.innerHTML = '<div style="color:var(--muted);font-size:0.7rem;padding:8px 0;">No shift data</div>';
        }

        // Alerts
        const alerts = [];
        if (clockedIn === 0 && staffList.length > 0) alerts.push({ level:'warning', title:'No Active Shifts', desc:'No staff currently clocked in.' });
        const inactiveRate = staffList.filter(s => s.status === 'Inactive').length / (staffList.length||1);
        if (inactiveRate > 0.3) alerts.push({ level:'info', title:'High Inactive Rate', desc:`${Math.round(inactiveRate*100)}% of staff inactive` });
        if (shifts.length > 10 && hoursByDay.reduce((a,b)=>a+b,0)/7 < 4) alerts.push({ level:'warning', title:'Low Avg Shift Hours', desc:'Average shift length below 4 hours' });
        const alertDiv = document.getElementById('dashAlerts');
        if (alerts.length) {
            alertDiv.innerHTML = alerts.map(a => `
                <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.7rem;">
                    <i class="fas fa-exclamation-circle" style="color:${a.level==='warning'?'var(--gold)':'#3b82f6'}"></i>
                    <div><strong>${a.title}</strong> · ${a.desc}</div>
                </div>
            `).join('');
        } else {
            alertDiv.innerHTML = '<div style="color:var(--muted);font-size:0.7rem;">No alerts</div>';
        }
    }

    // ─── EVENT LISTENERS ───
    function setupListeners() {
        document.getElementById('search-staff').addEventListener('input', (e) => {
            currentFilters.search = e.target.value;
            currentPage = 1;
            renderStaffTable();
        });
        document.getElementById('filter-role').addEventListener('change', (e) => {
            currentFilters.role = e.target.value;
            currentPage = 1;
            renderStaffTable();
        });
        document.getElementById('filter-status').addEventListener('change', (e) => {
            currentFilters.status = e.target.value;
            currentPage = 1;
            renderStaffTable();
        });
    }

    async function refreshAll() {
        showToast('Refreshing...', 'info');
        await loadWorkforceData();
        if (document.getElementById('dashboardOverlay').classList.contains('open')) renderCharts();
        showToast('Refreshed', 'success');
    }
    window.refreshAll = refreshAll;

    // ─── REALTIME ───
    function setupRealtime() {
        supabase.channel('staff-admin')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadWorkforceData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_shifts' }, () => loadWorkforceData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_activity_logs' }, () => loadWorkforceData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_payroll' }, () => loadWorkforceData())
            .subscribe();
    }

    // ─── INIT ───
    async function init() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { window.parent.location.href = '../../login.html'; return; }
            const { data: venueData } = await supabase.from('venue_settings').select('venue_name, venue_location, contact_phone').limit(1).maybeSingle();
            if (venueData) venueInfo = { name: venueData.venue_name || 'Rands', address: venueData.venue_location || '', phone: venueData.contact_phone || '' };
            await loadWorkforceData();
            setupListeners();
            initTabs();
            setupRealtime();
            // Set default dates for payroll
            const today = new Date().toISOString().split('T')[0];
            const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
            document.getElementById('payroll-start').value = firstDay;
            document.getElementById('payroll-end').value = today;
            // Close overlay on Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    const overlay = document.getElementById('dashboardOverlay');
                    if (overlay.classList.contains('open')) toggleDashboard();
                }
            });
        } catch (err) {
            console.error('Init error:', err);
            showToast('Initialization error', 'error');
        }
    }
    document.addEventListener('DOMContentLoaded', init);
