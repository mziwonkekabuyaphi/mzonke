// ===== Constants =====
// Supabase is imported via module import from config

// ===== State =====
let currentWalletId = null;

// ===== DOM Elements =====
// References are accessed directly via document.getElementById()

// ===== Utility Functions =====

// Toast
function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast-message' + (isError ? ' error' : '');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== Avatar Functions =====
async function uploadAvatar(file) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const userId = session.user.id;
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}_${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, file);
    if (uploadError) {
        console.error("Upload error:", uploadError);
        showToast("Upload failed: " + uploadError.message, true);
        return null;
    }
    const { data: publicUrlData } = supabase.storage
        .from('profiles')
        .getPublicUrl(filePath);
    const avatarUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', userId);
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
        avatarDiv.innerHTML =
            `<img src="${avatarUrl}" alt="avatar" style="width:100%; height:100%; object-fit:cover;">`;
    } else {
        avatarDiv.innerHTML = '<i class="fas fa-user-astronaut"></i>';
    }
}

async function loadAvatar() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .maybeSingle();
    displayAvatar(profile?.avatar_url || null);
}

// ===== Update Profile Field =====
async function updateProfileField(field, value) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        showToast("Not authenticated", true);
        return false;
    }
    const updateData = {};
    updateData[field] = value;
    const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', session.user.id);
    if (error) {
        showToast(`Failed to update ${field}: ${error.message}`, true);
        return false;
    }
    return true;
}

// ===== Edit Modal Functions =====
const editModal = document.getElementById('editModal');
const editModalTitle = document.getElementById('editModalTitle');
const editFieldLabel = document.getElementById('editFieldLabel');
const editFieldInput = document.getElementById('editFieldInput');
const editErrorMsg = document.getElementById('editErrorMsg');
const closeEditBtn = document.getElementById('closeEditModalBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const submitEditBtn = document.getElementById('submitEditBtn');

let currentEditField = null;
let currentEditValue = null;

function openEditModal(field, label, currentValue) {
    currentEditField = field;
    currentEditValue = currentValue;
    editModalTitle.textContent = `Edit ${label}`;
    editFieldLabel.textContent = label;
    editFieldInput.value = currentValue;
    editErrorMsg.classList.remove('show');
    editErrorMsg.innerText = '';
    submitEditBtn.disabled = false;
    editModal.classList.add('active');
    setTimeout(() => { editFieldInput.focus();
        editFieldInput.select(); }, 100);
}

function closeEditModal() {
    editModal.classList.remove('active');
    currentEditField = null;
    currentEditValue = null;
}

function showEditError(message) {
    editErrorMsg.innerText = message;
    editErrorMsg.classList.add('show');
    submitEditBtn.disabled = false;
}

// ===== Load All User Data =====
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

    const displayName = profile?.name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] ||
        "Member";
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
    const joinDate = joinDateRaw ? new Date(joinDateRaw).toLocaleDateString('en-ZA', { year: 'numeric',
        month: 'long' }) : "March 2025";
    document.getElementById('joinDate').innerText = joinDate;

    const phoneId = profile?.phone || 'No phone set';
    document.getElementById('passportId').innerText = phoneId;

    const qrDiv = document.getElementById('passportQR');
    if (qrDiv && typeof QRCode !== 'undefined') {
        qrDiv.innerHTML = '';
        new QRCode(qrDiv, {
            text: `RandsVibe:${phoneId}|${session.user.email}`,
            width: 60,
            height: 60,
            colorDark: "#E30613",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    const { data: wallet, error: walletErr } = await supabase
        .from('wallets')
        .select('id, balance')
        .eq('user_id', userId)
        .maybeSingle();
    if (walletErr) console.warn("Wallet error:", walletErr);
    const balance = wallet?.balance || 0;
    currentWalletId = wallet?.id;
    document.getElementById('walletPreview')?.innerText =
        `R ${balance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    document.getElementById('walletStat').innerText =
        `R ${balance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

// ===== Password Change Functions =====
const passwordModal = document.getElementById('passwordModal');
const closePwModalBtn = document.getElementById('closePasswordModalBtn');
const cancelPwBtn = document.getElementById('cancelPasswordBtn');
const submitPwBtn = document.getElementById('submitPasswordChangeBtn');
const currentPwInput = document.getElementById('currentPassword');
const newPwInput = document.getElementById('newPassword');
const confirmPwInput = document.getElementById('confirmPassword');
const pwErrorDiv = document.getElementById('passwordErrorMsg');

function openPasswordModal() {
    currentPwInput.value = '';
    newPwInput.value = '';
    confirmPwInput.value = '';
    pwErrorDiv.classList.remove('show');
    pwErrorDiv.innerText = '';
    submitPwBtn.disabled = false;
    passwordModal.classList.add('active');
}

function closePasswordModal() {
    passwordModal.classList.remove('active');
}

function showPwError(message) {
    pwErrorDiv.innerText = message;
    pwErrorDiv.classList.add('show');
    submitPwBtn.disabled = false;
}

async function changePassword() {
    const currentPassword = currentPwInput.value.trim();
    const newPassword = newPwInput.value.trim();
    const confirmPassword = confirmPwInput.value.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
        showPwError('All fields are required.');
        return;
    }
    if (newPassword.length < 6) {
        showPwError('New password must be at least 6 characters.');
        return;
    }
    if (newPassword !== confirmPassword) {
        showPwError('New password and confirmation do not match.');
        return;
    }

    submitPwBtn.disabled = true;

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
        showPwError('Session expired. Please log in again.');
        submitPwBtn.disabled = false;
        return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
    });

    if (signInError) {
        showPwError('Current password is incorrect.');
        submitPwBtn.disabled = false;
        return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
    });

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

// ===== Logout Function =====
async function performLogout() {
    await supabase.auth.signOut();
    window.location.href = '../login.html';
}

// ===== Event Listeners =====

// Home button
document.getElementById('homeIconBtn')?.addEventListener('click', () => {
    window.location.href = 'home.html';
});

// Avatar upload
document.getElementById('avatarUploadTrigger')?.addEventListener('click', () => {
    document.getElementById('avatarFileInput')?.click();
});

document.getElementById('avatarFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.match('image/jpeg') && !file.type.match('image/png') && !file.type.match('image/webp')) {
        showToast("Only JPG, PNG, WEBP allowed", true);
        return;
    }
    const url = await uploadAvatar(file);
    if (url) {
        displayAvatar(url);
        showToast("Profile picture updated!");
    }
    e.target.value = '';
});

// Edit Name buttons
document.getElementById('editProfileBtn')?.addEventListener('click', () => {
    const currentName = document.getElementById('fullName').innerText;
    openEditModal('name', 'Full Name', currentName);
});

document.getElementById('editNameIcon')?.addEventListener('click', () => {
    const currentName = document.getElementById('displayFullName').innerText;
    openEditModal('name', 'Full Name', currentName);
});

document.getElementById('editPhoneIcon')?.addEventListener('click', () => {
    const currentPhone = document.getElementById('displayPhone').innerText;
    const val = currentPhone === '—' ? '' : currentPhone;
    openEditModal('phone', 'Phone Number', val);
});

// Edit modal close handlers
closeEditBtn?.addEventListener('click', closeEditModal);
cancelEditBtn?.addEventListener('click', closeEditModal);
editModal?.addEventListener('click', (e) => {
    if (e.target === editModal) closeEditModal();
});

// Edit modal submit
submitEditBtn?.addEventListener('click', async () => {
    const newValue = editFieldInput.value.trim();
    if (!newValue) {
        showEditError('Value cannot be empty.');
        return;
    }
    if (currentEditField === 'phone') {
        const digits = newValue.replace(/\D/g, '');
        if (digits.length < 10) {
            showEditError('Phone must have at least 10 digits.');
            return;
        }
        let formatted = newValue;
        if (!formatted.startsWith('+') && !formatted.startsWith('0')) {
            formatted = '+' + formatted;
        }
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
            document.getElementById('username').innerText =
                `@${newValue.toLowerCase().replace(/\s/g, '')}`;
            document.getElementById('displayFullName').innerText = newValue;
            showToast("Name updated!");
            loadAllUserData();
        }
        closeEditModal();
        return;
    }
    closeEditModal();
});

// QR Modal
const qrBtn = document.getElementById('stylishQRBtn');
const qrModal = document.getElementById('qrModal');
const closeQR = document.getElementById('closeQRModal');

if (qrBtn) {
    qrBtn.addEventListener('click', async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const phoneId = document.getElementById('passportId').innerText;
        const container = document.getElementById('modalQRContainer');
        container.innerHTML = '';
        new QRCode(container, {
            text: `RandsVibe:${phoneId}|${session.user.email}`,
            width: 180,
            height: 180,
            colorDark: "#E30613",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
        qrModal.classList.add('active');
    });
}

if (closeQR) closeQR.addEventListener('click', () => qrModal.classList.remove('active'));
qrModal?.addEventListener('click', (e) => {
    if (e.target === qrModal) qrModal.classList.remove('active');
});

// Action items
document.querySelectorAll('.action-item').forEach(el => {
    el.addEventListener('click', async () => {
        const action = el.getAttribute('data-action');
        if (action === 'mytickets') window.location.href = 'tickets.html';
        else if (action === 'history') showToast("📊 Transaction history (coming soon)");
        else if (action === 'notifications') showToast("🔔 Notifications");
        else if (action === 'security') showToast("🔐 2FA & security settings");
        else if (action === 'settings') showToast("⚙️ App preferences");
        else if (action === 'help') showToast("💬 support@randsvibe.com");
    });
});

// Password change
document.getElementById('changePwdBtn')?.addEventListener('click', openPasswordModal);
closePwModalBtn?.addEventListener('click', closePasswordModal);
cancelPwBtn?.addEventListener('click', closePasswordModal);
passwordModal?.addEventListener('click', (e) => {
    if (e.target === passwordModal) closePasswordModal();
});
submitPwBtn?.addEventListener('click', changePassword);

// Biometric toggle
const bioToggle = document.getElementById('biometricToggle');
if (bioToggle) {
    bioToggle.addEventListener('change', (e) =>
        showToast(e.target.checked ? "✅ Biometrics enabled" : "❌ Biometrics disabled")
    );
}

// Sessions button
document.getElementById('sessionsBtn')?.addEventListener('click', () =>
    showToast("📱 Active sessions: this device only")
);

// Logout
document.getElementById('logoutBtnMain')?.addEventListener('click', performLogout);

// ===== Initialization =====
loadAllUserData().catch(console.warn);
loadAvatar();