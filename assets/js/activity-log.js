// =============================================
//  RANDS EVENT PASS — ACTIVITY LOG PAGE LOGIC
// =============================================

import {
showToast, escapeHtml,
loadActivityLog,
loadAccounts, loadTransactions,
} from ‘./utils.js’;

// ── Bootstrap ─────────────────────────────────
function init() {
updateActivityStats();
renderActivityLog();
renderGlobalActivity();
console.log(‘✅ Activity Log page ready’);
}

// ── Activity stats ────────────────────────────
function updateActivityStats() {
const staffActivity = loadActivityLog();
const today         = new Date().toISOString().slice(0, 10);
const todayActions  = staffActivity.filter(a => a.date === today).length;

document.getElementById(‘totalActions’).innerText = staffActivity.length;
document.getElementById(‘todayActions’).innerText = todayActions;
document.getElementById(‘adminActions’).innerText = staffActivity.length;
}

// ── Activity log list ─────────────────────────
function renderActivityLog() {
const staffActivity = loadActivityLog();
const container     = document.getElementById(‘activityLogList’);

if (!staffActivity.length) {
container.innerHTML = ‘<div class="empty-state"><span>📭</span><p>No activity recorded yet</p></div>’;
return;
}

container.innerHTML = staffActivity.slice(0, 50).map(act => `<div class="activity-item"> <div class="transaction-left"> <div class="transaction-icon"><i class="fas fa-user-cog"></i></div> <div class="transaction-details"> <div class="transaction-type">${act.action.replace(/_/g, ' ')}</div> <div class="transaction-time">${act.time} • ${act.date}</div> <div class="activity-detail-line">${escapeHtml(act.details)}</div> </div> </div> </div>`).join(’’);
}

// ── Global activity feed ──────────────────────
function renderGlobalActivity() {
const container      = document.getElementById(‘globalActivity’);
const accounts       = loadAccounts();
const transactionsMap = loadTransactions();

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

// ── Refresh ───────────────────────────────────
function refreshActivityLog() {
updateActivityStats();
renderActivityLog();
renderGlobalActivity();
showToast(‘Activity log refreshed’, ‘success’);
}

// ── Expose to inline onclick handlers ─────────
Object.assign(window, { refreshActivityLog });

// ── Run ───────────────────────────────────────
init();
