// =============================================
//  RANDS EVENT PASS — PASSPORT PAGE LOGIC
// =============================================

import {
showToast, escapeHtml,
loadAccounts, saveAccounts,
loadTransactions, saveTransactions,
loadRefunds, saveRefunds,
addTransaction, logStaffActivity,
YOUR_PHONE,
} from ‘./utils.js’;

// ── Page state ────────────────────────────────
let accounts         = [];
let transactionsMap  = {};
let refundRequests   = [];
let selectedAccountId = null;

// ── Bootstrap ─────────────────────────────────
function init() {
accounts        = loadAccounts();
transactionsMap = loadTransactions();
refundRequests  = loadRefunds();

updateWalletStats();
updateRefundStats();
renderAccountList();
renderRefundRequests();
renderGlobalActivity();

if (accounts.find(a => a.id === YOUR_PHONE)) {
selectAccount(YOUR_PHONE);
}
}

// ── Wallet stats ──────────────────────────────
function updateWalletStats() {
const totalBalance   = accounts.reduce((s, a) => s + a.balance, 0);
const blockedCount   = accounts.filter(a => a.status === ‘Blocked’).length;
const totalTx        = Object.values(transactionsMap).reduce((s, t) => s + t.length, 0);

document.getElementById(‘totalAccounts’).innerText    = accounts.length;
document.getElementById(‘totalBalance’).innerText     = ‘R’ + totalBalance.toFixed(2);
document.getElementById(‘blockedAccounts’).innerText  = blockedCount;
document.getElementById(‘totalTransactions’).innerText = totalTx;
}

// ── Refund stats ──────────────────────────────
function updateRefundStats() {
const pending      = refundRequests.filter(r => r.status === ‘pending’).length;
const approved     = refundRequests.filter(r => r.status === ‘approved’).length;
const rejected     = refundRequests.filter(r => r.status === ‘rejected’).length;
const totalAmount  = refundRequests
.filter(r => r.status === ‘approved’)
.reduce((s, r) => s + (r.amount || 0), 0);

document.getElementById(‘pendingRefunds’).innerText    = pending;
document.getElementById(‘approvedRefunds’).innerText   = approved;
document.getElementById(‘rejectedRefunds’).innerText   = rejected;
document.getElementById(‘totalRefundAmount’).innerText = ‘R’ + totalAmount.toFixed(2);
}

// ── Account list ──────────────────────────────
function renderAccountList() {
const searchTerm = document.getElementById(‘searchAccount’)?.value.toLowerCase() || ‘’;
const filtered   = accounts.filter(a =>
a.id.toLowerCase().includes(searchTerm) ||
(a.name && a.name.toLowerCase().includes(searchTerm))
);
const container = document.getElementById(‘accountList’);

if (!filtered.length) {
container.innerHTML = ‘<div class="empty-state"><span>📭</span><p>No accounts found</p></div>’;
return;
}

container.innerHTML = filtered.map(acc => `<div class="account-item ${selectedAccountId === acc.id ? 'selected' : ''}" onclick="selectAccount('${acc.id}')"> <div class="account-info"> <div class="account-id"> ${escapeHtml(acc.id)} ${acc.id === YOUR_PHONE ? '<span class="your-account-badge"><i class="fas fa-star"></i> YOU</span>' : ''} </div> <div class="account-name">${escapeHtml(acc.name || acc.id)}</div> </div> <div> <div class="account-balance">R${acc.balance.toFixed(2)}</div> <div class="account-status ${acc.status === 'Active' ? 'status-active' : 'status-blocked'}"> ${acc.status || 'Active'} </div> </div> </div>`).join(’’);
}

function selectAccount(accountId) {
selectedAccountId = accountId;
const acc = accounts.find(a => a.id === accountId);
if (!acc) return;

document.getElementById(‘selectedAccountInfo’).style.display = ‘block’;
document.getElementById(‘selectedAccountDisplay’).innerHTML  = `Selected: ${acc.id}`;
document.getElementById(‘selAccountId’).innerText    = acc.id;
document.getElementById(‘selHolderName’).innerText   = acc.name || acc.id;
document.getElementById(‘selBalance’).innerText      = ‘R’ + acc.balance.toFixed(2);

const statusEl        = document.getElementById(‘selStatus’);
statusEl.innerText    = acc.status || ‘Active’;
statusEl.className    = (acc.status === ‘Active’ || !acc.status)
? ‘status-active’
: ‘status-blocked’;

renderAccountTransactions();
renderAccountList();
}

function filterAccounts() { renderAccountList(); }

// ── Account transactions ──────────────────────
function renderAccountTransactions() {
const container = document.getElementById(‘accountTransactions’);
if (!selectedAccountId) {
container.innerHTML = ‘<div class="empty-state"><span>📭</span><p>Select an account</p></div>’;
return;
}
const txs = transactionsMap[selectedAccountId] || [];
if (!txs.length) {
container.innerHTML = ‘<div class="empty-state"><span>📭</span><p>No transactions yet</p></div>’;
return;
}
container.innerHTML = txs.slice(0, 8).map(tx => `<div class="transaction-item"> <div class="transaction-left"> <div class="transaction-icon"> <i class="fas ${tx.amount > 0 ? 'fa-arrow-up' : 'fa-arrow-down'}"></i> </div> <div class="transaction-details"> <div class="transaction-type">${escapeHtml(tx.desc)}</div> <div class="transaction-time">${tx.time || tx.date}</div> </div> </div> <div class="transaction-amount ${tx.amount > 0 ? 'amount-positive' : 'amount-negative'}"> ${tx.amount > 0 ? '+' : ''}R${Math.abs(tx.amount).toFixed(2)} </div> </div>`).join(’’);
}

// ── Global activity feed ──────────────────────
function renderGlobalActivity() {
const container = document.getElementById(‘globalActivity’);
let allTx = [];
for (const accId in transactionsMap) {
transactionsMap[accId].forEach(tx => {
allTx.push({
…tx,
accountId:   accId,
accountName: accounts.find(a => a.id === accId)?.name || accId,
});
});
}
allTx.sort((a, b) => new Date(b.date) - new Date(a.date));
const recent = allTx.slice(0, 12);

if (!recent.length) {
container.innerHTML = ‘<div class="empty-state"><span>📭</span><p>No recent activity</p></div>’;
return;
}
container.innerHTML = recent.map(tx => `<div class="transaction-item"> <div class="transaction-left"> <div class="transaction-icon"> <i class="fas ${tx.amount > 0 ? 'fa-arrow-up' : 'fa-arrow-down'}"></i> </div> <div class="transaction-details"> <div class="transaction-type">${escapeHtml(tx.desc)}</div> <div class="transaction-time">${tx.accountName}</div> </div> </div> <div class="transaction-amount ${tx.amount > 0 ? 'amount-positive' : 'amount-negative'}"> ${tx.amount > 0 ? '+' : ''}R${Math.abs(tx.amount).toFixed(2)} </div> </div>`).join(’’);
}

// ── Refund requests ───────────────────────────
function renderRefundRequests() {
const container = document.getElementById(‘refundRequestsList’);
if (!refundRequests.length) {
container.innerHTML = ‘<div class="empty-state"><span>📭</span><p>No refund requests</p></div>’;
return;
}
container.innerHTML = refundRequests.map(req => `<div class="refund-item"> <div class="refund-info"> <div class="refund-id">#${req.id}</div> <div class="refund-details">${escapeHtml(req.userPhone || req.userId)} • ${req.reason || 'No reason'}</div> </div> <div> <div class="refund-amount">R${(req.amount || 0).toFixed(2)}</div> <div class="refund-status ${ req.status === 'pending'  ? 'status-pending'  : req.status === 'approved' ? 'status-approved' : 'status-rejected' }">${req.status?.toUpperCase() || 'PENDING'}</div> ${req.status === 'pending' ?`
<div style="display:flex; gap:5px; margin-top:8px;">
<button class="action-btn success" style="padding:4px 10px; font-size:0.6rem;"
onclick="approveRefund(${req.id})">Approve</button>
<button class="action-btn danger" style="padding:4px 10px; font-size:0.6rem;"
onclick="rejectRefund(${req.id})">Reject</button>
</div>`: ''} </div> </div>`).join(’’);
}

function approveRefund(refundId) {
const refund = refundRequests.find(r => r.id === refundId);
if (!refund) return;
refund.status      = ‘approved’;
refund.processedAt = new Date().toISOString();
saveRefunds(refundRequests);
logStaffActivity(‘APPROVE_REFUND’, `Approved refund #${refundId}`, refund.userId);
showToast(`Refund #${refundId} approved`, ‘success’);
updateRefundStats();
renderRefundRequests();
}

function rejectRefund(refundId) {
const refund = refundRequests.find(r => r.id === refundId);
if (!refund) return;
refund.status = ‘rejected’;
saveRefunds(refundRequests);
logStaffActivity(‘REJECT_REFUND’, `Rejected refund #${refundId}`, refund.userId);
showToast(`Refund #${refundId} rejected`, ‘warning’);
updateRefundStats();
renderRefundRequests();
}

function refreshRefunds() {
refundRequests = loadRefunds();
updateRefundStats();
renderRefundRequests();
showToast(‘Refunds refreshed’, ‘success’);
}

// ── Account actions ───────────────────────────
function blockSelectedAccount() {
if (!selectedAccountId) { showToast(‘Select an account first’, ‘error’); return; }
const acc = accounts.find(a => a.id === selectedAccountId);
if (acc.status === ‘Blocked’) { showToast(‘Already blocked’, ‘warning’); return; }
acc.status = ‘Blocked’;
saveAccounts(accounts);
addTransaction(selectedAccountId, ‘Account Blocked by Admin’, 0);
logStaffActivity(‘BLOCK_ACCOUNT’, `Blocked account ${selectedAccountId}`, selectedAccountId);
updateWalletStats();
renderAccountList();
selectAccount(selectedAccountId);
showToast(`${selectedAccountId} blocked`, ‘warning’);
}

function unblockSelectedAccount() {
if (!selectedAccountId) { showToast(‘Select an account first’, ‘error’); return; }
const acc = accounts.find(a => a.id === selectedAccountId);
if (acc.status === ‘Active’) { showToast(‘Already active’, ‘warning’); return; }
acc.status = ‘Active’;
saveAccounts(accounts);
addTransaction(selectedAccountId, ‘Account Unblocked by Admin’, 0);
logStaffActivity(‘UNBLOCK_ACCOUNT’, `Unblocked account ${selectedAccountId}`, selectedAccountId);
updateWalletStats();
renderAccountList();
selectAccount(selectedAccountId);
showToast(`${selectedAccountId} unblocked`, ‘success’);
}

// ── Top-up ────────────────────────────────────
function quickTopUp() {
if (!selectedAccountId) { showToast(‘Select an account first’, ‘error’); return; }
const amount = parseFloat(document.getElementById(‘quickTopupAmount’).value);
if (isNaN(amount) || amount <= 0) { showToast(‘Enter valid amount’, ‘error’); return; }
const acc = accounts.find(a => a.id === selectedAccountId);
acc.balance += amount;
saveAccounts(accounts);
transactionsMap = loadTransactions();           // re-read fresh map
addTransaction(selectedAccountId, `Admin Top Up: +R${amount.toFixed(2)}`, amount);
transactionsMap = loadTransactions();           // reload after write
logStaffActivity(‘TOP_UP’, `Topped up ${selectedAccountId} with R${amount.toFixed(2)}`, selectedAccountId);
updateWalletStats();
renderAccountList();
document.getElementById(‘selBalance’).innerText = ‘R’ + acc.balance.toFixed(2);
renderAccountTransactions();
renderGlobalActivity();
showToast(`R${amount.toFixed(2)} added`, ‘success’);
}

function openTopUpModal() {
if (!selectedAccountId) { showToast(‘Select an account first’, ‘error’); return; }
document.getElementById(‘modalAccountId’).innerText = selectedAccountId;
document.getElementById(‘topUpModal’).classList.add(‘active’);
}

function confirmTopUp() {
const amount = parseFloat(document.getElementById(‘modalTopupAmount’).value);
if (isNaN(amount) || amount <= 0) { showToast(‘Enter valid amount’, ‘error’); return; }
const acc = accounts.find(a => a.id === selectedAccountId);
acc.balance += amount;
saveAccounts(accounts);
addTransaction(selectedAccountId, `Admin Top Up: +R${amount.toFixed(2)}`, amount);
transactionsMap = loadTransactions();
logStaffActivity(‘TOP_UP’, `Topped up ${selectedAccountId} with R${amount.toFixed(2)}`, selectedAccountId);
updateWalletStats();
renderAccountList();
document.getElementById(‘selBalance’).innerText = ‘R’ + acc.balance.toFixed(2);
renderAccountTransactions();
renderGlobalActivity();
showToast(`R${amount.toFixed(2)} added`, ‘success’);
closeModal();
}

function closeModal() { document.getElementById(‘topUpModal’).classList.remove(‘active’); }

function setQuickAmount(amt) { document.getElementById(‘quickTopupAmount’).value = amt; }
function setModalAmount(amt)  { document.getElementById(‘modalTopupAmount’).value = amt; }

function refreshData() {
accounts        = loadAccounts();
transactionsMap = loadTransactions();
refundRequests  = loadRefunds();
updateWalletStats();
updateRefundStats();
renderAccountList();
renderGlobalActivity();
if (selectedAccountId) selectAccount(selectedAccountId);
showToast(‘Refreshed’, ‘success’);
}

// ── Expose to inline onclick handlers ─────────
Object.assign(window, {
selectAccount, filterAccounts,
blockSelectedAccount, unblockSelectedAccount,
quickTopUp, openTopUpModal, confirmTopUp, closeModal,
setQuickAmount, setModalAmount,
approveRefund, rejectRefund, refreshRefunds, refreshData,
});

// ── Run ───────────────────────────────────────
init();
