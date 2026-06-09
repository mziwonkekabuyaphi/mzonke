/**
 * modules/wallet.js
 * Wallet module — fully preserves all logic from rands-kiosk.html:
 * - Phone, Wallet ID, and User ID lookup methods
 * - Balance display, top-up, transaction history
 * - QR code display
 */

let ctx = {};
let currentWalletData = null;
let currentWalletUser = null;
let selectedTopupAmount = 0;
let activeAuthMethod = 'phone';

export function load(context) {
  ctx = context;
  showWalletAuthForm();
}

// ─── AUTH FORM ────────────────────────────────────────────────────────────────
function showWalletAuthForm() {
  const container = document.getElementById('walletScreenContent');
  if (!container) return;

  container.innerHTML = `
    <div style="max-width:600px;margin:0 auto;">
      <div style="font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:800;color:var(--white);margin-bottom:6px;">Access Your Wallet</div>
      <p style="font-size:0.85rem;color:var(--muted);line-height:1.5;margin-bottom:2rem;">Enter your details to access your Rands wallet balance and transaction history.</p>

      <div class="wallet-auth-options">
        <div class="wallet-auth-method ${activeAuthMethod === 'phone' ? 'active' : ''}" onclick="walletSetMethod('phone')">
          <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.69a16 16 0 0 0 5.62 5.62l.95-.94a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          <span>Phone Number</span>
        </div>
        <div class="wallet-auth-method ${activeAuthMethod === 'walletid' ? 'active' : ''}" onclick="walletSetMethod('walletid')">
          <svg viewBox="0 0 24 24"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>
          <span>Wallet ID</span>
        </div>
        <div class="wallet-auth-method ${activeAuthMethod === 'userid' ? 'active' : ''}" onclick="walletSetMethod('userid')">
          <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>User ID</span>
        </div>
      </div>

      <div class="wallet-auth-form" id="wallet-auth-input-area">
        ${getAuthInputHTML()}
      </div>

      <div class="section-divider"><span>Or</span></div>
      <div class="sub-grid" style="grid-template-columns:repeat(2,1fr);">
        <div class="sub-card" onclick="walletShowTopUp()">
          <div class="sc-icon"><svg viewBox="0 0 24 24" fill="var(--red)"><path d="M12 5v14M5 12l7-7 7 7"/></svg></div>
          <div class="sc-title">Top Up</div>
          <div class="sc-desc">Add funds to your Rands wallet</div>
          <div class="sc-cta">Add Funds <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
        <div class="sub-card" onclick="walletShowQrScanner()">
          <div class="sc-icon"><svg viewBox="0 0 24 24" fill="var(--red)"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h.01M14 20h.01M20 14h.01M20 20h.01M20 17h.01M17 20h.01M17 14h.01"/></svg></div>
          <div class="sc-title">Scan QR</div>
          <div class="sc-desc">Scan your wallet QR code to access</div>
          <div class="sc-cta">Scan <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
      </div>
    </div>
  `;
}

function getAuthInputHTML() {
  if (activeAuthMethod === 'phone') {
    return `
      <div class="field-group">
        <label class="field-label">Phone Number</label>
        <input type="tel" id="wallet-phone-input" class="field-input" placeholder="e.g. 0821234567" onkeyup="if(event.key==='Enter') lookupWalletByPhone()">
      </div>
      <button class="btn-primary btn-full" onclick="lookupWalletByPhone()">
        <i class="fas fa-search"></i> Find My Wallet
      </button>
    `;
  }
  if (activeAuthMethod === 'walletid') {
    return `
      <div class="field-group">
        <label class="field-label">Wallet ID</label>
        <input type="text" id="wallet-id-input" class="field-input" placeholder="Enter your wallet ID" onkeyup="if(event.key==='Enter') lookupWalletByWalletId()">
      </div>
      <button class="btn-primary btn-full" onclick="lookupWalletByWalletId()">
        <i class="fas fa-search"></i> Find My Wallet
      </button>
    `;
  }
  return `
    <div class="field-group">
      <label class="field-label">User ID</label>
      <input type="text" id="wallet-userid-input" class="field-input" placeholder="Enter your user ID" onkeyup="if(event.key==='Enter') lookupWalletByUserId()">
    </div>
    <button class="btn-primary btn-full" onclick="lookupWalletByUserId()">
      <i class="fas fa-search"></i> Find My Wallet
    </button>
  `;
}

window.walletSetMethod = function(method) {
  activeAuthMethod = method;
  showWalletAuthForm();
};

// ─── LOOKUP FUNCTIONS (preserved exactly) ─────────────────────────────────────
window.lookupWalletByPhone = async function() {
  const phone = document.getElementById('wallet-phone-input')?.value?.trim();
  if (!phone) { ctx.toast('Please enter a phone number'); return; }
  ctx.toast('Looking up wallet...');
  try {
    const normalised = phone.replace(/\s+/g, '').replace(/^0/, '+27');
    let { data: user, error } = await ctx.supabase.from('users').select('*')
      .or(`phone.eq.${phone},phone.eq.${normalised}`).limit(1).single();
    if (error || !user) throw new Error('No account found for this phone number');
    currentWalletUser = user;
    const { data: wallet, error: wErr } = await ctx.supabase.from('wallets').select('*').eq('user_id', user.id).single();
    if (wErr || !wallet) throw new Error('No wallet found for this account');
    currentWalletData = wallet;
    await renderWalletDashboard();
  } catch (err) { ctx.toast(err.message || 'Wallet not found'); }
};

window.lookupWalletByWalletId = async function() {
  const wid = document.getElementById('wallet-id-input')?.value?.trim();
  if (!wid) { ctx.toast('Please enter a wallet ID'); return; }
  ctx.toast('Looking up wallet...');
  try {
    const { data: wallet, error } = await ctx.supabase.from('wallets').select('*').eq('wallet_id', wid).single();
    if (error || !wallet) throw new Error('Wallet not found');
    currentWalletData = wallet;
    const { data: user } = await ctx.supabase.from('users').select('*').eq('id', wallet.user_id).single();
    currentWalletUser = user || { name: 'Customer', id: wallet.user_id };
    await renderWalletDashboard();
  } catch (err) { ctx.toast(err.message || 'Wallet not found'); }
};

window.lookupWalletByUserId = async function() {
  const uid = document.getElementById('wallet-userid-input')?.value?.trim();
  if (!uid) { ctx.toast('Please enter a user ID'); return; }
  ctx.toast('Looking up wallet...');
  try {
    const { data: wallet, error } = await ctx.supabase.from('wallets').select('*').eq('user_id', uid).single();
    if (error || !wallet) throw new Error('Wallet not found for this user');
    currentWalletData = wallet;
    const { data: user } = await ctx.supabase.from('users').select('*').eq('id', uid).single();
    currentWalletUser = user || { name: 'Customer', id: uid };
    await renderWalletDashboard();
  } catch (err) { ctx.toast(err.message || 'Wallet not found'); }
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
window.renderWalletDashboard = async function() {
  const container = document.getElementById('walletScreenContent');
  if (!container || !currentWalletData) return;

  // Load transactions
  let transactions = [];
  try {
    const { data: txData } = await ctx.supabase.from('wallet_transactions').select('*')
      .eq('wallet_id', currentWalletData.id).order('created_at', { ascending: false }).limit(10);
    transactions = txData || [];
  } catch (e) { console.warn('Transactions load error:', e); }

  container.innerHTML = `
    <div style="max-width:700px;margin:0 auto;">
      <div class="wallet-balance-card">
        <div class="wallet-info-label">Available Balance</div>
        <div class="wallet-balance-amount"><small>R </small>${ctx.formatPrice(currentWalletData.balance || 0)}</div>
        <div class="wallet-info-row" style="margin-top:1.2rem;padding-top:1.2rem;border-top:1px solid rgba(255,255,255,0.1);">
          <div class="wallet-info-item">
            <div class="wallet-info-label">Customer</div>
            <div class="wallet-info-value" style="font-family:'Inter',sans-serif;">${currentWalletUser?.name || 'Customer'}</div>
          </div>
          <div class="wallet-info-item">
            <div class="wallet-info-label">Wallet ID</div>
            <div class="wallet-info-value">${currentWalletData.wallet_id || 'N/A'}</div>
          </div>
          <div class="wallet-info-item">
            <div class="wallet-info-label">Status</div>
            <div class="wallet-info-value" style="color:var(--green)">${currentWalletData.status || 'Active'}</div>
          </div>
        </div>
      </div>

      <div class="wallet-actions">
        <button class="btn-primary" onclick="showTopUpScreen()">
          <i class="fas fa-plus"></i> Top Up
        </button>
        <button class="btn-secondary" onclick="showWalletQR()">
          <i class="fas fa-qrcode"></i> My QR Code
        </button>
        <button class="btn-secondary" onclick="walletBack()">
          <i class="fas fa-sign-out-alt"></i> Sign Out
        </button>
      </div>

      <div class="section-divider" style="margin-top:2rem"><span>Transaction History</span></div>

      ${transactions.length === 0
        ? `<div class="empty-state" style="padding:2rem;text-align:center;opacity:0.5"><i class="fas fa-receipt" style="font-size:2rem;color:var(--muted);margin-bottom:8px;display:block"></i><div>No transactions yet</div></div>`
        : `<div class="transaction-history">
            ${transactions.map(tx => `
              <div class="transaction-item">
                <div class="transaction-info">
                  <div class="transaction-date">${new Date(tx.created_at).toLocaleDateString('en-ZA', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
                  <div class="transaction-desc">${tx.description || tx.type || 'Transaction'}</div>
                </div>
                <div>
                  <div class="transaction-amount ${tx.direction === 'credit' ? 'credit' : 'debit'}">
                    ${tx.direction === 'credit' ? '+' : '-'}R ${ctx.formatPrice(Math.abs(tx.amount))}
                  </div>
                  <div class="transaction-status completed">${tx.status || 'completed'}</div>
                </div>
              </div>
            `).join('')}
          </div>`
      }
    </div>
  `;
};

// ─── TOP-UP ───────────────────────────────────────────────────────────────────
window.showTopUpScreen = function() {
  const container = document.getElementById('walletScreenContent');
  if (!container) return;
  selectedTopupAmount = 0;

  container.innerHTML = `
    <div style="max-width:600px;margin:0 auto;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.5rem">
        <button class="back-btn" onclick="renderWalletDashboard()">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back
        </button>
        <div style="font-family:'Playfair Display',serif;font-size:1.3rem;font-weight:800;color:var(--white)">Top Up Wallet</div>
      </div>

      <div style="background:var(--glass);border:1px solid var(--border);border-radius:var(--r-xl);padding:1.5rem;margin-bottom:1.5rem;">
        <div class="wallet-info-label">Current Balance</div>
        <div style="font-family:'Playfair Display',serif;font-size:2rem;font-weight:800;color:var(--white);margin-top:4px">R ${ctx.formatPrice(currentWalletData?.balance || 0)}</div>
      </div>

      <div class="section-divider"><span>Select Amount</span></div>
      <div class="topup-options" id="topup-amounts">
        ${[50, 100, 150, 200, 300, 500].map(amt => `
          <button class="topup-amount" id="topup-${amt}" onclick="selectTopupAmount(${amt})">R ${amt}</button>
        `).join('')}
      </div>

      <div class="section-divider"><span>Or Enter Custom Amount</span></div>
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:1.5rem;">
        <div class="field-group" style="flex:1;margin:0">
          <input type="number" id="topup-custom-input" class="field-input" placeholder="Enter amount" min="10" step="10">
        </div>
        <button class="btn-secondary" onclick="selectCustomAmount()">Set</button>
      </div>

      <button class="btn-primary btn-full" onclick="processTopup()" style="margin-top:0.5rem;">
        <i class="fas fa-credit-card"></i> Pay & Top Up
        ${selectedTopupAmount > 0 ? `— R ${ctx.formatPrice(selectedTopupAmount)}` : ''}
      </button>
    </div>
  `;
};

window.selectTopupAmount = function(amount) {
  selectedTopupAmount = amount;
  document.querySelectorAll('.topup-amount').forEach(el => el.classList.remove('selected'));
  const btn = document.getElementById(`topup-${amount}`);
  if (btn) btn.classList.add('selected');
  ctx.toast(`Selected R${amount}`);
};

window.selectCustomAmount = function() {
  const custom = document.getElementById('topup-custom-input')?.value;
  if (custom && parseFloat(custom) > 0) {
    selectedTopupAmount = parseFloat(custom);
    document.querySelectorAll('.topup-amount').forEach(el => el.classList.remove('selected'));
    ctx.toast(`Selected R${selectedTopupAmount}`);
  } else {
    ctx.toast('Please enter a valid amount');
  }
};

window.processTopup = async function() {
  if (!selectedTopupAmount || selectedTopupAmount <= 0) { ctx.toast('Please select a top-up amount'); return; }
  if (!currentWalletData) { ctx.toast('Please look up your wallet first'); return; }
  ctx.toast(`Processing payment of R${selectedTopupAmount}...`);
  try {
    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 1500));
    const newBalance = (currentWalletData.balance || 0) + selectedTopupAmount;
    const { error: updateError } = await ctx.supabase.from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', currentWalletData.id);
    if (updateError) throw updateError;
    const { error: txError } = await ctx.supabase.from('wallet_transactions').insert({
      wallet_id: currentWalletData.id,
      user_id: currentWalletUser.id,
      amount: selectedTopupAmount,
      type: 'topup', direction: 'credit', status: 'completed',
      description: `Wallet top-up of R${selectedTopupAmount}`,
      created_at: new Date().toISOString(),
    });
    if (txError) throw txError;
    currentWalletData.balance = newBalance;
    ctx.toast(`✓ Successfully topped up R${selectedTopupAmount}!`);
    await window.renderWalletDashboard();
  } catch (err) {
    console.error('Top-up error:', err);
    ctx.toast('Payment failed. Please try again.');
  }
};

// ─── QR CODE ──────────────────────────────────────────────────────────────────
window.showWalletQR = function() {
  const container = document.getElementById('walletScreenContent');
  if (!container || !currentWalletData) return;

  container.innerHTML = `
    <div style="max-width:440px;margin:0 auto;text-align:center;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.5rem;justify-content:center">
        <button class="back-btn" onclick="renderWalletDashboard()">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back
        </button>
        <div style="font-family:'Playfair Display',serif;font-size:1.3rem;font-weight:800;color:var(--white)">Your Wallet QR</div>
      </div>
      <div style="background:var(--glass);border:1px solid var(--border);border-radius:var(--r-xl);padding:2rem;margin-bottom:1.5rem;">
        <div class="wallet-info-row" style="justify-content:center;margin-bottom:1.5rem;">
          <div class="wallet-info-item" style="text-align:center">
            <div class="wallet-info-label">Customer</div>
            <div class="wallet-info-value" style="font-family:'Inter',sans-serif">${currentWalletUser?.name || 'Customer'}</div>
          </div>
          <div class="wallet-info-item" style="text-align:center">
            <div class="wallet-info-label">Balance</div>
            <div class="wallet-info-value" style="font-family:'Playfair Display',serif;font-size:1.1rem;color:var(--green)">R ${ctx.formatPrice(currentWalletData.balance || 0)}</div>
          </div>
        </div>
        <div id="walletQRCode" style="display:inline-block;background:white;padding:12px;border-radius:16px;"></div>
        <div style="font-size:0.72rem;color:var(--muted);margin-top:12px;letter-spacing:2px;">${currentWalletData.wallet_id || 'WALLET'}</div>
      </div>
      <button class="btn-primary btn-full" onclick="ctx.toast('QR code sent to printer')">
        <i class="fas fa-print"></i> Print QR Code
      </button>
    </div>
  `;

  const qrEl = document.getElementById('walletQRCode');
  if (qrEl && typeof QRCode !== 'undefined') {
    new QRCode(qrEl, {
      text: JSON.stringify({ wallet_id: currentWalletData.wallet_id, user_id: currentWalletUser?.id, name: currentWalletUser?.name }),
      width: 180, height: 180, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H,
    });
  } else if (qrEl) {
    qrEl.innerHTML = `<div style="width:180px;height:180px;background:var(--red);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-direction:column;color:white;font-family:monospace;font-size:10px">RANDS WALLET<br>${(currentWalletData.wallet_id || '').slice(-8)}</div>`;
  }
};

// ─── TOP UP (from home) ────────────────────────────────────────────────────────
window.walletShowTopUp = function() {
  if (!currentWalletData) {
    showWalletAuthForm();
    ctx.toast('Please log in to your wallet first');
    return;
  }
  window.showTopUpScreen();
};

window.walletShowQrScanner = function() {
  ctx.toast('QR scanner: point phone camera at your wallet QR code');
};

window.walletBack = function() {
  currentWalletData = null;
  currentWalletUser = null;
  showWalletAuthForm();
};

// Export for use in admin
window.showWalletAuthForm = showWalletAuthForm;
