// ===== Constants =====
// Supabase is imported via module import from config

// ===== State =====
let currentUser = null;
let walletId = null;
let allTransactions = [];
let displayedTransactions = [];
let currentOffset = 0;
const PAGE_SIZE = 15;
let isLoading = false;
let activeChip = "all";

// ===== DOM Elements =====
const balanceEl = document.getElementById("currentBalanceSpan");
const balanceStat = document.getElementById("balanceStat");
const totalSpentEl = document.getElementById("totalSpentSpan");
const totalDepositedEl = document.getElementById("totalDepositedSpan");
const refundedCashEl = document.getElementById("totalRewardsSpan");
const txCountSpan = document.getElementById("txCountSpan");
const txCountStat = document.getElementById("txCountStat");
const transactionsContainer = document.getElementById("transactionsList");
const loadMoreContainer = document.getElementById("loadMoreContainer");

// ===== Utility Functions =====
function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast-message' + (isError ? ' error' : '');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ===== Category Helper =====
function getTxCategory(tx) {
    const type = tx.type?.toLowerCase() || '';
    if (type === 'deposit') return 'deposit';
    if (type === 'purchase') return 'purchase';
    if (type === 'ticket') return 'ticket';
    if (type === 'refund') return 'refund';
    if (type === 'reward') return 'reward';
    if (tx.description?.toLowerCase().includes('refund')) return 'refund';
    if (tx.description?.toLowerCase().includes('cashback')) return 'reward';
    return 'other';
}

// ===== Summary Stats =====
function updateSummaryStats() {
    let totalSpent = 0,
        totalDeposited = 0,
        refundedCash = 0;
    for (const tx of allTransactions) {
        const cat = getTxCategory(tx);
        const amount = Number(tx.amount) || 0;
        const isSuccess = tx.status === 'success' || tx.status === 'completed' || tx.status === 'paid' || tx.status === 'refunded';
        if (!isSuccess) continue;

        if (cat === 'purchase' || cat === 'ticket') {
            totalSpent += Math.abs(amount);
        } else if (cat === 'deposit') {
            totalDeposited += Math.abs(amount);
        } else if (cat === 'refund' || cat === 'reward') {
            refundedCash += Math.abs(amount);
        } else {
            if (amount < 0) totalSpent += Math.abs(amount);
            else if (amount > 0) totalDeposited += amount;
        }
    }
    totalSpentEl.innerText = `R${totalSpent.toFixed(2)}`;
    totalDepositedEl.innerText = `R${totalDeposited.toFixed(2)}`;
    refundedCashEl.innerText = `R${refundedCash.toFixed(2)}`;
    txCountSpan.innerText = allTransactions.length;
    txCountStat.innerText = allTransactions.length;
}

// ===== Wallet Functions =====
async function fetchWalletBalance() {
    if (!walletId) return;
    const { data, error } = await supabase.from('wallets').select('balance').eq('id', walletId).single();
    if (!error && data) {
        const formatted = `R${(data.balance || 0).toFixed(2)}`;
        balanceEl.innerText = formatted;
        balanceStat.innerText = formatted;
    }
}

async function loadAllTransactions() {
    if (!walletId) return [];
    const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('wallet_id', walletId)
        .order('created_at', { ascending: false });
    if (error) {
        console.error("Error loading transactions:", error);
        return [];
    }
    allTransactions = data || [];
    updateSummaryStats();
    await fetchWalletBalance();
    return allTransactions;
}

// ===== Filter Functions =====
function getFilteredTransactions() {
    if (activeChip === "all") return [...allTransactions];
    let filtered = [];
    for (const tx of allTransactions) {
        const cat = getTxCategory(tx);
        if (activeChip === "deposits" && cat === "deposit") filtered.push(tx);
        else if (activeChip === "purchases" && (cat === "purchase" || cat === "ticket")) filtered.push(tx);
        else if (activeChip === "tickets" && cat === "ticket") filtered.push(tx);
        else if (activeChip === "refunds" && cat === "refund") filtered.push(tx);
        else if (activeChip === "failed" && tx.status === "failed") filtered.push(tx);
        else if (activeChip === "pending" && (tx.status === "pending" || tx.status === "processing")) filtered.push(tx);
    }
    return filtered;
}

// ===== Render Functions =====
function renderTransactions() {
    const toShow = displayedTransactions;
    if (toShow.length === 0 && !isLoading) {
        transactionsContainer.innerHTML =
            `<div class="empty-state"><i class="fas fa-receipt"></i><p>No transactions found</p></div>`;
        loadMoreContainer.innerHTML = "";
        return;
    }
    let html = "";
    for (const tx of toShow) {
        const amount = Number(tx.amount) || 0;
        const isPositive = (tx.type === 'refund' || tx.type === 'reward' || amount > 0);
        const sign = isPositive ? "+" : "-";
        const amountClass = isPositive ? "positive" : "negative";
        const formattedAmount = `${sign} R${Math.abs(amount).toFixed(2)}`;
        let statusClass = "status-success";
        let statusText = tx.status?.charAt(0).toUpperCase() + tx.status?.slice(1) || "Success";
        if (tx.status === "pending") { statusClass = "status-pending";
            statusText = "Pending"; } else if (tx.status === "failed") { statusClass = "status-failed";
            statusText = "Failed"; } else if (tx.status === "refunded") { statusClass = "status-refunded";
            statusText = "Refunded"; }
        const dateObj = tx.created_at ? new Date(tx.created_at) : new Date();
        const formattedDate =
            `${dateObj.toLocaleDateString()} • ${dateObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
        const refId = tx.provider_reference || tx.id.slice(-8).toUpperCase();
        let icon = "fa-exchange-alt";
        const cat = getTxCategory(tx);
        if (cat === "deposit") icon = "fa-plus-circle";
        else if (cat === "purchase") icon = "fa-shopping-bag";
        else if (cat === "ticket") icon = "fa-ticket-alt";
        else if (cat === "refund") icon = "fa-undo-alt";
        else if (cat === "reward") icon = "fa-gift";
        const merchant = tx.description || tx.type || "Transaction";
        const typeLabel = tx.type ? tx.type.charAt(0).toUpperCase() + tx.type.slice(1) : "Activity";
        html += `
                <div class="transaction-card">
                    <div class="tx-icon"><i class="fas ${icon}"></i></div>
                    <div class="tx-details">
                        <div class="tx-title">
                            <span class="tx-merchant">${escapeHtml(merchant)}</span>
                            <span class="tx-amount ${amountClass}">${formattedAmount}</span>
                        </div>
                        <div class="tx-type">${typeLabel}</div>
                        <div class="tx-meta">
                            <span><i class="far fa-calendar-alt"></i> ${formattedDate}</span>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                            <span class="ref-id"><i class="fas fa-hashtag"></i> ${refId}</span>
                        </div>
                    </div>
                </div>
            `;
    }
    transactionsContainer.innerHTML = html;
    const filteredTotal = getFilteredTransactions().length;
    if (currentOffset < filteredTotal) {
        loadMoreContainer.innerHTML =
            `<button class="load-more-btn" id="loadMoreBtn"><i class="fas fa-arrow-down"></i> Load more transactions</button>`;
        document.getElementById("loadMoreBtn")?.addEventListener("click", loadMoreTransactions);
    } else {
        loadMoreContainer.innerHTML = `<button class="load-more-btn" disabled style="opacity:0.5;">✨ All transactions loaded</button>`;
    }
}

// ===== Pagination =====
async function loadMoreTransactions() {
    if (isLoading) return;
    isLoading = true;
    loadMoreContainer.innerHTML =
        `<div class="skeleton-card"><div class="skeleton-icon"></div><div class="skeleton-text"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>`;
    await new Promise(resolve => setTimeout(resolve, 300));
    const filtered = getFilteredTransactions();
    const nextOffset = currentOffset + PAGE_SIZE;
    const newItems = filtered.slice(currentOffset, nextOffset);
    if (newItems.length > 0) {
        displayedTransactions.push(...newItems);
        currentOffset = nextOffset;
    }
    renderTransactions();
    isLoading = false;
}

function resetPaginationAndFilter() {
    const filtered = getFilteredTransactions();
    currentOffset = PAGE_SIZE;
    displayedTransactions = filtered.slice(0, PAGE_SIZE);
    renderTransactions();
}

async function refreshAllData() {
    await loadAllTransactions();
    resetPaginationAndFilter();
}

// ===== Filter Pills =====
function initFilterPills() {
    const pillOptions = ["all", "deposits", "purchases", "tickets", "refunds", "failed", "pending"];
    const pillLabels = {
        all: "All",
        deposits: "Deposits",
        purchases: "Purchases",
        tickets: "Tickets",
        refunds: "Refunds",
        failed: "Failed",
        pending: "Pending"
    };
    const row = document.getElementById("filterPillsRow");
    row.innerHTML = pillOptions.map(opt =>
            `<div class="filter-pill ${opt === activeChip ? 'active' : ''}" data-filter="${opt}">${pillLabels[opt]}</div>`
            ).join('');
    document.querySelectorAll(".filter-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            activeChip = pill.dataset.filter;
            document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            const filtered = getFilteredTransactions();
            currentOffset = PAGE_SIZE;
            displayedTransactions = filtered.slice(0, PAGE_SIZE);
            renderTransactions();
        });
    });
}

// ===== Auth & Wallet Init =====
async function initAuthAndWallet() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = '../login.html';
        return false;
    }
    currentUser = session.user;
    const { data: wallet, error: walletErr } = await supabase.from('wallets').select('id').eq('user_id', currentUser.id)
        .single();
    if (walletErr) {
        const { data: newWallet, error: createErr } = await supabase.from('wallets').insert({ user_id: currentUser.id,
            balance: 0 }).select().single();
        if (createErr) {
            console.error(createErr);
            return false;
        }
        walletId = newWallet.id;
    } else {
        walletId = wallet.id;
    }
    return true;
}

async function loadData() {
    if (!walletId) return;
    transactionsContainer.innerHTML = `
            <div class="skeleton-card"><div class="skeleton-icon"></div><div class="skeleton-text"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
            <div class="skeleton-card"><div class="skeleton-icon"></div><div class="skeleton-text"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>`;
    await loadAllTransactions();
    const filtered = getFilteredTransactions();
    currentOffset = PAGE_SIZE;
    displayedTransactions = filtered.slice(0, PAGE_SIZE);
    renderTransactions();
}

// ===== PDF Export =====
async function exportStatementPDF() {
    const exportContainer = document.createElement('div');
    exportContainer.style.background = '#ffffff';
    exportContainer.style.padding = '24px';
    exportContainer.style.fontFamily = 'Inter, sans-serif';
    exportContainer.style.width = '100%';
    exportContainer.style.maxWidth = '800px';
    exportContainer.style.margin = '0 auto';

    const headerHtml = `
            <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #E30613; padding-bottom: 16px;">
                <h1 style="color: #E30613; font-weight: 800;">Rands Wallet Statement</h1>
                <p style="color: #475569;">Generated on ${new Date().toLocaleString()}</p>
                <p style="font-size: 0.8rem; color: #64748b;">User: ${currentUser?.email || 'Member'}</p>
                <p style="font-size: 0.8rem; font-weight:600;">Current Balance: ${balanceEl.innerText}</p>
            </div>
        `;

    let fullHtml = `<h3 style="margin: 20px 0 12px;">📜 Transaction History (${activeChip.toUpperCase()})</h3><table style="width:100%; border-collapse:collapse;">`;
    const txsToExport = displayedTransactions;
    if (txsToExport.length === 0) {
        fullHtml += `<tr><td style="padding: 20px; text-align: center;">No transactions found for this filter</td></tr>`;
    } else {
        fullHtml +=
            `<thead><tr style="background:#f1f5f9;"><th style="padding:10px; text-align:left;">Date</th><th>Description</th><th style="text-align:right;">Amount</th><th>Status</th></tr></thead><tbody>`;
        for (const tx of txsToExport) {
            const amount = Number(tx.amount) || 0;
            const sign = amount > 0 ? '+' : '-';
            const formattedAmount = `${sign} R${Math.abs(amount).toFixed(2)}`;
            const date = tx.created_at ? new Date(tx.created_at).toLocaleString() : '-';
            const desc = tx.description || tx.type || 'Transaction';
            const status = tx.status || 'completed';
            fullHtml += `<tr style="border-bottom:1px solid #e2e8f0;">
                    <td style="padding:8px;">${date}</td>
                    <td>${escapeHtml(desc)}</td>
                    <td style="text-align:right;">${formattedAmount}</td>
                    <td><span style="background:${status === 'success' ? '#e6f7e6' : '#fee2e2'}; padding:2px 8px; border-radius:20px;">${status}</span></td>
                </tr>`;
        }
        fullHtml += `</tbody>`;
    }
    fullHtml += `</table><p style="margin-top: 20px; font-size:0.7rem; color:#94a3b8;">Rands Wallet • Secure cashless ecosystem</p>`;
    exportContainer.innerHTML = headerHtml + fullHtml;

    const opt = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: `rands_statement_${new Date().toISOString().slice(0,19)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, letterRendering: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(exportContainer).save();
    showToast("PDF downloaded successfully");
}

// ===== Event Listeners =====
document.getElementById('homeIconBtn')?.addEventListener('click', () => {
    window.location.href = 'home.html';
});

document.getElementById("exportPdfBtn")?.addEventListener("click", exportStatementPDF);

document.getElementById("resetFilterBtn")?.addEventListener("click", () => {
    activeChip = "all";
    document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
    const allPill = document.querySelector('.filter-pill[data-filter="all"]');
    if (allPill) allPill.classList.add("active");
    const filtered = getFilteredTransactions();
    currentOffset = PAGE_SIZE;
    displayedTransactions = filtered.slice(0, PAGE_SIZE);
    renderTransactions();
});

// ===== Initialization =====
(async () => {
    const ok = await initAuthAndWallet();
    if (!ok) return;
    initFilterPills();
    await loadData();
})();