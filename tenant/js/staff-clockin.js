    import { supabase } from '../../config/supabase.js';

    const pinInput = document.getElementById('pinInput');
    const clockBtn = document.getElementById('clockBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const activeShiftsDiv = document.getElementById('activeShiftsList');
    const rosterCount = document.getElementById('rosterCount');

    function showToast(msg, isError = false) {
        const toast = document.getElementById('toast');
        toast.innerHTML = `<i class="fas ${isError ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i>${msg}`;
        toast.style.background = isError ? 'linear-gradient(135deg,#8c0a17,#3d0410)' : 'linear-gradient(135deg,#201d25,#17151b)';
        toast.style.borderColor = isError ? '#e30613' : '#c9a24b';
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 3000);
    }

    // Supabase/PostgREST already returns timestamptz values with their offset
    // baked in (e.g. "2026-08-04T00:05:08.593+00:00"). Blindly appending "Z"
    // to a string that already has an offset produces an unparseable date,
    // which silently corrupts hours_worked (NaN -> null on save). Only add
    // "Z" if the string genuinely has no timezone info.
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

    async function loadActiveShifts() {
        try {
            const { data: shifts, error } = await supabase
                .from('staff_shifts')
                .select('*, staff_id')
                .eq('status', 'active')
                .order('login_time', { ascending: false });
            if (error) throw error;

            rosterCount.textContent = shifts.length;

            if (!shifts.length) {
                activeShiftsDiv.innerHTML = '<div class="roster-empty">No one on shift</div>';
                return;
            }

            const staffIds = [...new Set(shifts.map(s => s.staff_id))];
            const { data: staffProfiles } = await supabase
                .rpc('get_staff_names', { p_ids: staffIds });

            const staffMap = new Map();
            staffProfiles?.forEach(p => staffMap.set(p.id, `${p.name} ${p.surname}`));

            let html = '';
            for (const shift of shifts) {
                const staffName = staffMap.get(shift.staff_id) || 'Unknown';
                const loginUTC = parseServerTimestamp(shift.login_time);
                const now = new Date();
                const durationMs = now - loginUTC;
                const durationStr = formatDuration(durationMs);
                const loginLocal = loginUTC.toLocaleTimeString();
                html += `
                    <div class="shift-item" data-login="${shift.login_time}">
                        <div class="staff-id">
                            <span class="status-dot"></span>
                            <div>
                                <div class="staff-name">${staffName}</div>
                                <div class="staff-since">Since ${loginLocal}</div>
                            </div>
                        </div>
                        <div class="staff-elapsed">${durationStr}</div>
                    </div>
                `;
            }
            activeShiftsDiv.innerHTML = html;
        } catch (err) {
            console.error(err);
            activeShiftsDiv.innerHTML = '<div class="roster-error">Error loading shifts</div>';
        }
    }

    async function validateStaffByPin(pin) {
        const { data, error } = await supabase
            .rpc('validate_staff_pin', { p_pin: pin });
        if (error) throw error;
        return data && data.length ? data[0] : null;
    }

    async function getActiveShift(staffId) {
        const { data, error } = await supabase
            .from('staff_shifts')
            .select('*')
            .eq('staff_id', staffId)
            .eq('status', 'active')
            .maybeSingle();
        if (error) throw error;
        return data;
    }

    async function clockIn(staff) {
        const { error } = await supabase
            .from('staff_shifts')
            .insert({
                staff_id: staff.id,
                login_time: new Date().toISOString(),
                status: 'active',
                login_method: 'pin_kiosk',
                kiosk_id: 'web-terminal'
            });
        if (error) throw error;
        await supabase.from('staff_activity_logs').insert({
            staff_id: staff.id,
            module: 'Attendance',
            action: 'Clocked in via web terminal',
            created_at: new Date().toISOString()
        });
        showToast(`${staff.name} ${staff.surname} – Clocked IN at ${new Date().toLocaleTimeString()}`);
        await loadActiveShifts();
    }

    async function clockOut(shift, staff) {
        const now = new Date();
        const loginUTC = parseServerTimestamp(shift.login_time);
        const diffMs = now - loginUTC;
        const hours = diffMs / (1000 * 60 * 60);
        const { error } = await supabase
            .from('staff_shifts')
            .update({
                logout_time: now.toISOString(),
                status: 'completed',
                hours_worked: hours
            })
            .eq('id', shift.id);
        if (error) throw error;

        const durationStr = formatDuration(diffMs);
        await supabase.from('staff_activity_logs').insert({
            staff_id: staff.id,
            module: 'Attendance',
            action: `Clocked out after ${durationStr}`,
            created_at: new Date().toISOString()
        });
        showToast(`${staff.name} ${staff.surname} – Clocked OUT (${durationStr})`);
        await loadActiveShifts();
    }

    async function handleClockAction() {
        const pin = pinInput.value.trim();
        if (!pin || !/^\d{4,6}$/.test(pin)) {
            showToast('Please enter a valid 4‑6 digit PIN', true);
            return;
        }

        clockBtn.disabled = true;
        clockBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        try {
            const staff = await validateStaffByPin(pin);
            if (!staff) {
                showToast('PIN not recognised. Please check with manager.', true);
                return;
            }

            const active = await getActiveShift(staff.id);
            if (active) {
                await clockOut(active, staff);
                pinInput.value = '';
            } else {
                await clockIn(staff);
                pinInput.value = '';
            }
        } catch (err) {
            console.error(err);
            showToast('Error: ' + err.message, true);
        } finally {
            clockBtn.disabled = false;
            clockBtn.innerHTML = 'Clock In / Out';
            pinInput.dispatchEvent(new Event('input'));
            pinInput.focus();
        }
    }

    function setupKeypad() {
        const keypad = document.getElementById('keypad');
        keypad.addEventListener('click', (e) => {
            const btn = e.target.closest('.key');
            if (!btn) return;
            const digit = btn.dataset.digit;
            const action = btn.dataset.action;
            if (digit) {
                if (pinInput.value.length < 6) {
                    pinInput.value += digit;
                }
            } else if (action === 'delete') {
                pinInput.value = pinInput.value.slice(0, -1);
            } else if (action === 'clear') {
                pinInput.value = '';
            }
            pinInput.dispatchEvent(new Event('input'));
            pinInput.focus();
        });
    }

    pinInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleClockAction();
        }
    });

    clockBtn.addEventListener('click', handleClockAction);
    refreshBtn.addEventListener('click', () => loadActiveShifts());

    setupKeypad();
    pinInput.focus();
    // Roster is no longer auto-loaded on landing or polled on an interval —
    // it now only loads when the user taps "Refresh to see shifts".

    /* ---- Purely decorative additions below : do not touch clock-in logic ---- */

    // Tumbler-style PIN dot indicator, mirrors pinInput length
    const pinDots = document.querySelectorAll('.pin-dot');
    pinInput.addEventListener('input', () => {
        const len = pinInput.value.length;
        pinDots.forEach((d, i) => d.classList.toggle('filled', i < len));
    });

    // Live header clock
    const liveClockEl = document.getElementById('liveClock');
    function tickClock() {
        const now = new Date();
        const time = now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const date = now.toLocaleDateString('en-ZA', { weekday: 'short', day: '2-digit', month: 'short' });
        liveClockEl.innerHTML = `${date} <span>·</span> ${time}`;
    }
    tickClock();
    setInterval(tickClock, 1000);

    // Live-ticking elapsed time on roster rows between the 15s data refreshes
    setInterval(() => {
        document.querySelectorAll('.shift-item[data-login]').forEach(row => {
            const loginUTC = parseServerTimestamp(row.dataset.login);
            const el = row.querySelector('.staff-elapsed');
            if (el) el.textContent = formatDuration(new Date() - loginUTC);
        });
    }, 1000);
