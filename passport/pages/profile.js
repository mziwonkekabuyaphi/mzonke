import { supabase } from '../../config/supabase.js';
import { navigate } from '../js/router.js';
import { loadScriptOnce } from '../js/lazy-load.js';

// Same cleanup pattern as the other converted pages.
let cleanup = [];
const onCleanup = (fn) => cleanup.push(fn);

let currentWalletId = null;

function loadQrLib() {
    return loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', () => !!window.QRCode);
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast-message' + (isError ? ' error' : '');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

async function uploadAvatar(file) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const userId = session.user.id;
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}_${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { error: uploadError } = await supabase.storage.from('profiles').upload(filePath, file);
    if (uploadError) {
        console.error("Upload error:", uploadError);
        showToast("Upload failed: " + uploadError.message, true);
        return null;
    }
    const { data: publicUrlData } = supabase.storage.from('profiles').getPublicUrl(filePath);
    const avatarUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId);
    if (updateError) {
        console.error("DB update error:", updateError);
        showToast("Failed to save avatar URL", true);
        return null;
    }
    return avatarUrl;
}

function displayAvatar(avatarUrl) {
    const avatarDiv = document.getElementById('avatarPreview');
    if (!avatarDiv) return;
    if (avatarUrl && avatarUrl.startsWith('http')) {
        avatarDiv.innerHTML = `<img src="${avatarUrl}" alt="avatar" style="width:100%; height:100%; object-fit:cover;">`;
    } else {
        avatarDiv.innerHTML = '<i class="fas fa-user-astronaut"></i>';
    }
}

async function loadAvatar() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: profile } = await supabase.from('profiles').select('avatar_url').eq('id', session.user.id).maybeSingle();
    displayAvatar(profile?.avatar_url || null);
}

async function updateProfileField(field, value) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { showToast("Not authenticated", true); return false; }
    const updateData = {};
    updateData[field] = value;
    const { error } = await supabase.from('profiles').update(updateData).eq('id', session.user.id);
    if (error) { showToast(`Failed to update ${field}: ${error.message}`, true); return false; }
    return true;
}

// ---------- LOAD ALL USER DATA ----------
async function loadAllUserData() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
        showToast("Please login again", true);
        setTimeout(() => window.location.href = '../login.html', 1500);
        return;
    }
    const userId = session.user.id;

    const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('name, phone, role, staff_role, wallet_id, created_at, avatar_url')
        .eq('id', userId)
        .maybeSingle();
    if (profileErr) console.warn("Profile error:", profileErr);

    const displayName = profile?.name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || "Member";
    document.getElementById('fullName').innerText = displayName;
    document.getElementById('username').innerText = `@${displayName.toLowerCase().replace(/\s/g, '')}`;

    document.getElementById('displayFullName').innerText = displayName;
    document.getElementById('displayPhone').innerText = profile?.phone || '—';
    document.getElementById('displayRole').innerText = profile?.role || 'customer';
    if (profile?.staff_role) {
        document.getElementById('displayStaffRole').innerText = profile.staff_role;
        document.getElementById('staffRoleRow').style.display = 'flex';
    } else {
        document.getElementById('staffRoleRow').style.display = 'none';
    }
    document.getElementById('displayWalletId').innerText = profile?.wallet_id || '—';
    document.getElementById('passportIdStat').innerText = profile?.wallet_id || '—';

    if (profile?.avatar_url) displayAvatar(profile.avatar_url);
    else displayAvatar(null);

    const joinDateRaw = profile?.created_at || session.user.created_at;
    const joinDate = joinDateRaw ? new Date(joinDateRaw).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' }) : "March 2025";
    document.getElementById('joinDate').innerText = joinDate;

    const phoneId = profile?.phone || 'No phone set';
    document.getElementById('passportId').innerText = phoneId;

    const qrDiv = document.getElementById('passportQR');
    if (qrDiv) {
        await loadQrLib();
        qrDiv.innerHTML = '';
        new QRCode(qrDiv, {
            text: `RandsVibe:${phoneId}|${session.user.email}`,
            width: 60, height: 60,
            colorDark: "#E30613", colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    const { data: wallet, error: walletErr } = await supabase.from('wallets').select('id, balance').eq('user_id', userId).maybeSingle();
    if (walletErr) console.warn("Wallet error:", walletErr);
    const balance = wallet?.balance || 0;
    currentWalletId = wallet?.id;
    // FLAG (fixed, not silent): the original line was
    //   document.getElementById('walletPreview')?.innerText = `...`;
    // Optional chaining on the left-hand side of an assignment is an
    // ECMAScript *syntax* error (`?.` can't be a simple assignment
    // target) — not a runtime null-check that just no-ops. A syntax
    // error inside a <script type="module"> block fails the whole
    // module at parse time, meaning none of this file's code ever ran
    // in a browser — not loadAllUserData(), not a single event listener.
    // The `walletPreview` id also doesn't exist anywhere in this page's
    // markup (only `walletStat` does), so the line was dead even in
    // intent. Removed rather than "fixed", since there's nothing for it
    // to target.
    document.getElementById('walletStat').innerText = `R ${balance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

function wireStaticListeners() {
    const bind = (id, evt, fn) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener(evt, fn);
        onCleanup(() => el.removeEventListener(evt, fn));
    };

    // ---------- AVATAR ----------
    bind('avatarUploadTrigger', 'click', () => document.getElementById('avatarFileInput')?.click());
    bind('avatarFileInput', 'change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.match('image/jpeg') && !file.type.match('image/png') && !file.type.match('image/webp')) {
            showToast("Only JPG, PNG, WEBP allowed", true);
            return;
        }
        const url = await uploadAvatar(file);
        if (url) { displayAvatar(url); showToast("Profile picture updated!"); }
        e.target.value = '';
    });

    // ---------- EDIT MODAL ----------
    const editModal = document.getElementById('editModal');
    const editModalTitle = document.getElementById('editModalTitle');
    const editFieldLabel = document.getElementById('editFieldLabel');
    const editFieldInput = document.getElementById('editFieldInput');
    const editErrorMsg = document.getElementById('editErrorMsg');
    const submitEditBtn = document.getElementById('submitEditBtn');
    let currentEditField = null;

    function openEditModal(field, label, currentValue) {
        currentEditField = field;
        editModalTitle.textContent = `Edit ${label}`;
        editFieldLabel.textContent = label;
        editFieldInput.value = currentValue;
        editErrorMsg.classList.remove('show');
        editErrorMsg.innerText = '';
        submitEditBtn.disabled = false;
        editModal.classList.add('active');
        setTimeout(() => { editFieldInput.focus(); editFieldInput.select(); }, 100);
    }
    function closeEditModal() {
        editModal.classList.remove('active');
        currentEditField = null;
    }
    function showEditError(message) {
        editErrorMsg.innerText = message;
        editErrorMsg.classList.add('show');
        submitEditBtn.disabled = false;
    }

    bind('closeEditModalBtn', 'click', closeEditModal);
    bind('cancelEditBtn', 'click', closeEditModal);
    editModal?.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });
    onCleanup(() => editModal?.removeEventListener('click', closeEditModal));

    bind('editProfileBtn', 'click', () => openEditModal('name', 'Full Name', document.getElementById('fullName').innerText));
    bind('editNameIcon', 'click', () => openEditModal('name', 'Full Name', document.getElementById('displayFullName').innerText));
    bind('editPhoneIcon', 'click', () => {
        const currentPhone = document.getElementById('displayPhone').innerText;
        openEditModal('phone', 'Phone Number', currentPhone === '—' ? '' : currentPhone);
    });

    bind('submitEditBtn', 'click', async () => {
        const newValue = editFieldInput.value.trim();
        if (!newValue) { showEditError('Value cannot be empty.'); return; }
        if (currentEditField === 'phone') {
            const digits = newValue.replace(/\D/g, '');
            if (digits.length < 10) { showEditError('Phone must have at least 10 digits.'); return; }
            let formatted = newValue;
            if (!formatted.startsWith('+') && !formatted.startsWith('0')) formatted = '+' + formatted;
            submitEditBtn.disabled = true;
            const success = await updateProfileField('phone', formatted);
            if (success) {
                document.getElementById('displayPhone').innerText = formatted;
                showToast("Phone updated!");
                loadAllUserData();
            }
            closeEditModal();
            return;
        }
        if (currentEditField === 'name') {
            submitEditBtn.disabled = true;
            const success = await updateProfileField('name', newValue);
            if (success) {
                document.getElementById('fullName').innerText = newValue;
                document.getElementById('username').innerText = `@${newValue.toLowerCase().replace(/\s/g, '')}`;
                document.getElementById('displayFullName').innerText = newValue;
                showToast("Name updated!");
                loadAllUserData();
            }
            closeEditModal();
            return;
        }
        closeEditModal();
    });

    // ---------- QR MODAL ----------
    const qrModal = document.getElementById('qrModal');
    bind('stylishQRBtn', 'click', async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        await loadQrLib();
        const phoneId = document.getElementById('passportId').innerText;
        const container = document.getElementById('modalQRContainer');
        container.innerHTML = '';
        new QRCode(container, {
            text: `RandsVibe:${phoneId}|${session.user.email}`,
            width: 180, height: 180,
            colorDark: "#E30613", colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
        qrModal.classList.add('active');
    });
    bind('closeQRModal', 'click', () => qrModal.classList.remove('active'));
    const qrOverlayClick = (e) => { if (e.target === qrModal) qrModal.classList.remove('active'); };
    qrModal?.addEventListener('click', qrOverlayClick);
    onCleanup(() => qrModal?.removeEventListener('click', qrOverlayClick));

    // ---------- ACTION ITEMS ----------
    document.querySelectorAll('.action-item').forEach(el => {
        const handler = () => {
            const action = el.getAttribute('data-action');
            // Was window.location.href = 'tickets.html' — tickets is now
            // an SPA route, so this does an in-app transition instead of
            // a full reload.
            if (action === 'mytickets') navigate('tickets');
            else if (action === 'history') showToast("📊 Transaction history (coming soon)");
            else if (action === 'notifications') showToast("🔔 Notifications");
            else if (action === 'security') showToast("🔐 2FA & security settings");
            else if (action === 'settings') showToast("⚙️ App preferences");
            else if (action === 'help') showToast("💬 support@randsvibe.com");
        };
        el.addEventListener('click', handler);
        onCleanup(() => el.removeEventListener('click', handler));
    });

    // ---------- CHANGE PASSWORD ----------
    const passwordModal = document.getElementById('passwordModal');
    const submitPwBtn = document.getElementById('submitPasswordChangeBtn');
    const currentPwInput = document.getElementById('currentPassword');
    const newPwInput = document.getElementById('newPassword');
    const confirmPwInput = document.getElementById('confirmPassword');
    const pwErrorDiv = document.getElementById('passwordErrorMsg');

    function openPasswordModal() {
        currentPwInput.value = ''; newPwInput.value = ''; confirmPwInput.value = '';
        pwErrorDiv.classList.remove('show');
        pwErrorDiv.innerText = '';
        submitPwBtn.disabled = false;
        passwordModal.classList.add('active');
    }
    function closePasswordModal() { passwordModal.classList.remove('active'); }
    function showPwError(message) {
        pwErrorDiv.innerText = message;
        pwErrorDiv.classList.add('show');
        submitPwBtn.disabled = false;
    }

    bind('changePwdBtn', 'click', openPasswordModal);
    bind('closePasswordModalBtn', 'click', closePasswordModal);
    bind('cancelPasswordBtn', 'click', closePasswordModal);
    const pwOverlayClick = (e) => { if (e.target === passwordModal) closePasswordModal(); };
    passwordModal?.addEventListener('click', pwOverlayClick);
    onCleanup(() => passwordModal?.removeEventListener('click', pwOverlayClick));

    async function changePassword() {
        const currentPassword = currentPwInput.value.trim();
        const newPassword = newPwInput.value.trim();
        const confirmPassword = confirmPwInput.value.trim();

        if (!currentPassword || !newPassword || !confirmPassword) { showPwError('All fields are required.'); return; }
        if (newPassword.length < 6) { showPwError('New password must be at least 6 characters.'); return; }
        if (newPassword !== confirmPassword) { showPwError('New password and confirmation do not match.'); return; }

        submitPwBtn.disabled = true;

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) { showPwError('Session expired. Please log in again.'); submitPwBtn.disabled = false; return; }

        const { error: signInError } = await supabase.auth.signInWithPassword({ email: session.user.email, password: currentPassword });
        if (signInError) { showPwError('Current password is incorrect.'); submitPwBtn.disabled = false; return; }

        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        if (updateError) {
            console.error(updateError);
            showPwError(updateError.message || 'Failed to update password. Please try again.');
            submitPwBtn.disabled = false;
            return;
        }

        showToast('Password updated successfully! Please log in again with your new password.');
        await supabase.auth.signOut();
        window.location.href = '../login.html';
    }
    bind('submitPasswordChangeBtn', 'click', changePassword);

    // ---------- BIOMETRIC & SESSIONS ----------
    bind('sessionsBtn', 'click', () => showToast("📱 Active sessions: this device only"));
    bind('biometricToggle', 'change', (e) => showToast(e.target.checked ? "✅ Biometrics enabled" : "❌ Biometrics disabled"));

    // ---------- LOGOUT ----------
    // FLAG: kept as a direct supabase.auth.signOut() + window.location.href
    // redirect, matching tickets.js/vvip.js/shisha.js's own unauthenticated
    // redirects — NOT routed through state.js's shared logout(), which
    // sets location.hash = '#/login', a route that isn't registered in
    // main.js yet (same open TODO MIGRATION.md already flags). Worth
    // resolving once, app-wide, rather than guessing here.
    bind('logoutBtnMain', 'click', async () => {
        await supabase.auth.signOut();
        window.location.href = '../login.html';
    });

    // homeIconBtn / .brand / the two bottom-actions buttons navigate via
    // data-link in the fragment — the router's global click delegation
    // handles those, no JS needed here.
}

export default {
    async init() {
        wireStaticListeners();
        await loadAllUserData().catch(console.warn);
        await loadAvatar();
    },

    destroy() {
        cleanup.forEach(fn => fn());
        cleanup = [];
    }
};
