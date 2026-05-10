// =============================================
//  RANDS EVENT PASS — SHARED UTILITIES
//  Import with: import { showToast, escapeHtml, … } from ‘../assets/js/utils.js’;
// =============================================

// ── Storage keys ──────────────────────────────
export const ACCOUNTS_KEY     = ‘rands_accounts_v2’;
export const TRANSACTIONS_KEY = ‘rands_transactions’;
export const TICKETS_KEY      = ‘rands_tickets’;
export const REFUNDS_KEY      = ‘rands_refund_requests’;
export const ACTIVITY_KEY     = ‘rands_staff_activity’;

// ── App constants ─────────────────────────────
export const YOUR_PHONE   = ‘0635713652’;
export const YOUR_NAME    = ‘Mziwonke KaBuyaphi’;
export const YOUR_BALANCE = 12580.50;

// ── Toast notification ────────────────────────
export function showToast(message, type = ‘success’) {
const toast    = document.getElementById(‘toast’);
const iconEl   = document.getElementById(‘toastIcon’);
const msgEl    = document.getElementById(‘toastMessage’);

iconEl.innerText = type === ‘success’ ? ‘✅’ : type === ‘error’ ? ‘❌’ : ‘⚠️’;
msgEl.innerText  = message;
toast.className  = `toast ${type} show`;
setTimeout(() => toast.classList.remove(‘show’), 2500);
}

// ── XSS-safe HTML escape ──────────────────────
export function escapeHtml(text) {
if (!text) return ‘’;
const div = document.createElement(‘div’);
div.textContent = text;
return div.innerHTML;
}

// ── localStorage helpers ──────────────────────
export function loadAccounts() {
const stored = localStorage.getItem(ACCOUNTS_KEY);
const accounts = stored ? JSON.parse(stored) : [];
// Always ensure the admin account exists
if (!accounts.find(a => a.id === YOUR_PHONE)) {
accounts.push({ id: YOUR_PHONE, name: YOUR_NAME, balance: YOUR_BALANCE, status: ‘Active’ });
}
return accounts;
}

export function saveAccounts(accounts) {
localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function loadTransactions() {
const stored = localStorage.getItem(TRANSACTIONS_KEY);
return stored ? JSON.parse(stored) : {};
}

export function saveTransactions(transactionsMap) {
localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactionsMap));
}

export function loadTickets() {
const stored = localStorage.getItem(TICKETS_KEY);
return stored ? JSON.parse(stored) : [];
}

export function loadRefunds() {
const stored = localStorage.getItem(REFUNDS_KEY);
return stored ? JSON.parse(stored) : [];
}

export function saveRefunds(refundRequests) {
localStorage.setItem(REFUNDS_KEY, JSON.stringify(refundRequests));
}

export function loadActivityLog() {
const stored = localStorage.getItem(ACTIVITY_KEY);
return stored ? JSON.parse(stored) : [];
}

// ── Staff activity logger ─────────────────────
export function logStaffActivity(action, details, targetId) {
const activity = loadActivityLog();
activity.unshift({
id:        Date.now(),
action,
details,
targetId,
timestamp: new Date().toISOString(),
time:      new Date().toLocaleTimeString(),
date:      new Date().toISOString().slice(0, 10),
admin:     ‘Administrator’,
});
const trimmed = activity.slice(0, 200);
localStorage.setItem(ACTIVITY_KEY, JSON.stringify(trimmed));
}

// ── Add transaction helper ────────────────────
export function addTransaction(accountId, desc, amount) {
const map = loadTransactions();
if (!map[accountId]) map[accountId] = [];
map[accountId].unshift({
desc,
amount,
date: new Date().toISOString().slice(0, 10),
time: new Date().toLocaleTimeString(),
});
saveTransactions(map);
}
