  import { supabase } from '../../config/supabase.js';

  // ─── STATE ───
  let accounts = [];
  let selectedAccountId = null;
  let refundRequests = [];
  let refundFilter = 'pending';
  let modalResolve = null;

  // ─── HELPERS ───
  function escapeHtml(str) { if (!str) return ''; return String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]); }
  function fmtR(val) { return `R${(val||0).toFixed(2)}`; }

  // ─── TOAST ───
  function showToast(message, type='success') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const msg = document.getElementById('toastMessage');
    const icons = { success:'fas fa-check-circle', error:'fas fa-exclamation-circle', warning:'fas fa-exclamation-triangle' };
    icon.className = icons[type] || icons.success;
    msg.innerText = message;
    toast.className = `toast ${type} show`;
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // ─── MODAL ───
  const confirmModal = document.getElementById('confirmModal');
  const confirmMessage = document.getElementById('confirmModalMessage');
  const confirmBtn = document.getElementById('confirmModalConfirm');
  const cancelBtn = document.getElementById('confirmModalCancel');
  function showConfirm(message) {
    return new Promise((resolve) => {
      confirmMessage.innerText = message;
      confirmModal.classList.add('active');
      modalResolve = resolve;
    });
  }
  function closeConfirmModal(confirmed) {
    confirmModal.classList.remove('active');
    if (modalResolve) { modalResolve(confirmed); modalResolve = null; }
  }
  confirmBtn.onclick = () => closeConfirmModal(true);
  cancelBtn.onclick = () => closeConfirmModal(false);
  confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) closeConfirmModal(false); });

  // ─── DATA FETCHING ───
  function fullName(acc) {
    return `${acc.name||''} ${acc.surname||''}`.trim() || acc.email || 'Unknown';
  }
  function formatWhatsapp(val) {
    if (val === true) return 'Verified';
    if (val === false) return 'Not Verified';
    if (typeof val === 'string' && val.trim()) return val.charAt(0).toUpperCase() + val.slice(1).replace(/_/g,' ');
    return '';
  }
  async function loadWallets() {
    try {
      const { data, error } = await supabase
        .from('wallets')
        .select(`id, balance, status, created_at, profiles:user_id (*)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data||[]).map(w => {
        const p = w.profiles || {};
        // WhatsApp status column name isn't confirmed — check the common variants so this
        // keeps working whichever one the profiles table actually uses.
        const whatsappRaw = p.whatsapp_status ?? p.whatsapp_verified ?? p.whatsapp_opted_in ?? p.whatsapp ?? p.whatsapp_number ?? null;
        return {
          id: w.id,
          balance: parseFloat(w.balance) || 0,
          status: w.status === 'blocked' ? 'Blocked' : 'Active',
          user_id: p.id || null,
          name: p.name || 'Unknown',
          surname: p.surname || '',
          email: p.email || '',
          phone: p.phone || '',
          profile_created_at: p.created_at || w.created_at,
          whatsapp: formatWhatsapp(whatsappRaw),
          created_at: w.created_at
        };
      });
    } catch(err) { showToast('Load passports error: '+err.message, 'error'); return []; }
  }

  async function fetchWalletTransactions(walletId) {
    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('wallet_id', walletId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data||[]).map(tx => ({
        desc: tx.description || (tx.type === 'topup' ? 'Top Up' : 'Transaction'),
        amount: parseFloat(tx.amount),
        type: tx.type || '',
        date: tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '',
        time: tx.created_at ? new Date(tx.created_at).toLocaleTimeString() : '',
        raw_date: tx.created_at || null
      }));
    } catch(err) { return []; }
  }

  async function addTransaction(walletId, amount, description, type) {
    try {
      await supabase.from('wallet_transactions').insert({
        wallet_id: walletId,
        amount: amount,
        type: type || (amount > 0 ? 'topup' : 'adjustment'),
        description: description,
        created_at: new Date().toISOString()
      });
    } catch(err) { console.error(err); }
  }

  async function updateWalletBalance(walletId, amountDelta, description, type) {
    if (!walletId || !amountDelta) return false;
    try {
      const { data: wallet } = await supabase.from('wallets').select('balance').eq('id', walletId).single();
      if (!wallet) throw new Error('Passport not found');
      const newBalance = (wallet.balance || 0) + amountDelta;
      if (newBalance < 0) {
        const proceed = await showConfirm(`This will take the balance to ${fmtR(newBalance)} (negative). Continue anyway?`);
        if (!proceed) return false;
      }
      await supabase.from('wallets').update({ balance: newBalance }).eq('id', walletId);
      await addTransaction(walletId, amountDelta, description, type);
      return true;
    } catch(err) { showToast('Balance update failed: '+err.message, 'error'); return false; }
  }

  async function setWalletStatus(walletId, newStatus) {
    try {
      const supabaseStatus = newStatus === 'Active' ? 'active' : 'blocked';
      const { data, error } = await supabase
        .from('wallets')
        .update({ status: supabaseStatus })
        .eq('id', walletId)
        .select('id, status');
      if (error) throw error;
      if (!data || data.length === 0) {
        // Update ran without a thrown error but touched 0 rows — almost always a
        // Row Level Security policy silently blocking the write. Surface this
        // instead of pretending it worked.
        throw new Error('No rows updated — check RLS policy on "wallets" table for UPDATE permissions');
      }
      return true;
    } catch(err) { showToast('Status update failed: '+err.message, 'error'); return false; }
  }

  // ─── REFUNDS ───
  let recentTxGlobal = []; // last 30 days, all wallets — powers dashboard KPIs + activity feed
  function isToday(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr), now = new Date();
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
  }
  function daysAgo(dateStr) {
    if (!dateStr) return Infinity;
    return (Date.now() - new Date(dateStr).getTime()) / 86400000;
  }
  async function loadRecentActivity() {
    try {
      const since = new Date(Date.now() - 30*24*60*60*1000).toISOString();
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('wallet_id, amount, type, description, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      recentTxGlobal = data || [];
    } catch(err) { console.error('loadRecentActivity failed:', err); recentTxGlobal = []; }
  }

  async function loadRefundRequests() {
    try {
      const { data, error } = await supabase
        .from('refund_requests')
        .select('*, profiles:customer_id (name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      refundRequests = (data||[]).map(r => ({
        id: r.id,
        customer_id: r.customer_id,
        customer_name: r.profiles?.name || 'Unknown',
        amount: parseFloat(r.amount),
        reason: r.reason,
        status: r.status,
        created_at: r.created_at
      }));
      updateRefundPendingBadge();
      renderRefundRequests();
      updateStats();
    } catch(err) {
      console.error('loadRefundRequests failed:', err);
      refundRequests = [];
      renderRefundRequests();
      showToast('Could not load refund requests: ' + (err.message || err), 'error');
    }
  }

  function updateRefundPendingBadge() {
    const pendingCount = refundRequests.filter(r => r.status === 'pending').length;
    const badge = document.getElementById('refundPendingBadge');
    badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
    badge.innerText = pendingCount;
  }

  function setRefundFilter(status) {
    refundFilter = status;
    document.querySelectorAll('.refund-filter-tab').forEach(el => el.classList.toggle('active', el.dataset.status === status));
    renderRefundRequests();
  }

  function renderRefundRequests() {
    const container = document.getElementById('refundRequestsList');
    const filtered = refundFilter === 'all' ? refundRequests : refundRequests.filter(r => r.status === refundFilter);
    if (!filtered.length) { container.innerHTML = `<div style="color:var(--muted);padding:20px;text-align:center;">No ${refundFilter === 'all' ? '' : refundFilter} refund requests</div>`; return; }
    container.innerHTML = filtered.map(req => `
      <div class="refund-item">
        <div><div class="account-id">${escapeHtml(req.customer_name)}</div><div class="account-name">${escapeHtml(req.reason || 'No reason')}</div></div>
        <div><div class="account-balance">${fmtR(req.amount)}</div><div class="account-status status-${req.status}">${req.status.toUpperCase()}</div>
          ${req.status === 'pending' ? `<div style="margin-top:6px;display:flex;gap:4px;"><button class="action-btn small success" data-refund-id="${req.id}" data-action="approve">Approve</button><button class="action-btn small danger" data-refund-id="${req.id}" data-action="reject">Reject</button></div>` : ''}
        </div>
      </div>
    `).join('');
    document.querySelectorAll('[data-refund-id]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = btn.dataset.refundId, action = btn.dataset.action;
        if (action === 'approve') await approveRefund(id);
        else await rejectRefund(id);
      });
    });
  }

  async function approveRefund(id) {
    if (!await showConfirm('Approve refund?')) return;
    await supabase.from('refund_requests').update({ status: 'approved', processed_at: new Date().toISOString() }).eq('id', id);
    await loadRefundRequests();
    await refreshData();
    showToast('Refund approved', 'success');
  }

  async function rejectRefund(id) {
    if (!await showConfirm('Reject refund?')) return;
    await supabase.from('refund_requests').update({ status: 'rejected' }).eq('id', id);
    await loadRefundRequests();
    showToast('Refund rejected', 'warning');
  }

  async function createManualRefund(customerId, amount, reason) {
    if (!await showConfirm(`Issue manual refund of ${fmtR(amount)}?`)) return false;
    const { data: wallet } = await supabase.from('wallets').select('id, balance').eq('user_id', customerId).single();
    if (!wallet) { showToast('Passport not found', 'error'); return false; }
    const newBalance = (wallet.balance || 0) + amount;
    await supabase.from('wallets').update({ balance: newBalance }).eq('id', wallet.id);
    await addTransaction(wallet.id, amount, `Manual refund: ${reason || 'Admin adjustment'}`);
    await supabase.from('refund_requests').insert({
      customer_id: customerId,
      amount,
      reason: reason || 'Manual refund',
      status: 'approved',
      processed_at: new Date().toISOString()
    });
    showToast(`Manual refund of ${fmtR(amount)} issued`, 'success');
    return true;
  }

  // ─── ACCOUNT UI ───
  let accountPage = 0;
  const ACCOUNTS_PAGE_SIZE = 12;
  async function renderAccountList() {
    const searchTerm = document.getElementById('globalSearch')?.value.toLowerCase() || '';
    const statusVal = document.getElementById('statusFilter')?.value || 'all';
    const sortVal = document.getElementById('sortField')?.value || 'reg_desc';
    let filtered = accounts;
    if (searchTerm) {
      filtered = accounts.filter(acc =>
        acc.name?.toLowerCase().includes(searchTerm) ||
        acc.surname?.toLowerCase().includes(searchTerm) ||
        acc.email?.toLowerCase().includes(searchTerm) ||
        acc.phone?.toLowerCase().includes(searchTerm) ||
        acc.id?.toLowerCase().includes(searchTerm)
      );
    }
    if (statusVal !== 'all') filtered = filtered.filter(acc => acc.status === statusVal);
    filtered = [...filtered].sort((a,b) => {
      if (sortVal === 'reg_asc') return new Date(a.profile_created_at||0) - new Date(b.profile_created_at||0);
      if (sortVal === 'balance_desc') return (b.balance||0) - (a.balance||0);
      if (sortVal === 'name_asc') return fullName(a).localeCompare(fullName(b));
      return new Date(b.profile_created_at||0) - new Date(a.profile_created_at||0); // reg_desc default
    });

    const container = document.getElementById('accountList');
    const countEl = document.getElementById('accountResultCount');
    if (countEl) countEl.innerText = `(${filtered.length})`;
    if (!filtered.length) {
      container.innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center;">No Passports found</div>';
      document.getElementById('accountPagination').innerHTML = '';
      return;
    }
    const totalPages = Math.max(1, Math.ceil(filtered.length / ACCOUNTS_PAGE_SIZE));
    if (accountPage >= totalPages) accountPage = totalPages - 1;
    if (accountPage < 0) accountPage = 0;
    const pageItems = filtered.slice(accountPage * ACCOUNTS_PAGE_SIZE, (accountPage + 1) * ACCOUNTS_PAGE_SIZE);

    container.innerHTML = pageItems.map(acc => `
      <div class="account-item ${selectedAccountId === acc.id ? 'selected' : ''}" data-id="${acc.id}">
        <div><div class="account-id">${escapeHtml(fullName(acc))}</div><div class="account-name">${escapeHtml(acc.email)} • Passport: ${acc.id.slice(0,8)}</div></div>
        <div><div class="account-balance">${fmtR(acc.balance)}</div><div class="account-status ${acc.status === 'Active' ? 'status-active' : 'status-blocked'}">${acc.status}</div></div>
      </div>
    `).join('');
    document.querySelectorAll('.account-item').forEach(el => el.addEventListener('click', () => selectAccount(el.dataset.id)));

    const pagEl = document.getElementById('accountPagination');
    pagEl.innerHTML = `
      <span>Page ${accountPage+1} of ${totalPages}</span>
      <div style="display:flex; gap:6px;">
        <button class="action-btn small" id="acctPrevPage" ${accountPage===0?'disabled':''}>Prev</button>
        <button class="action-btn small" id="acctNextPage" ${accountPage>=totalPages-1?'disabled':''}>Next</button>
      </div>`;
    const prevBtn = document.getElementById('acctPrevPage');
    const nextBtn = document.getElementById('acctNextPage');
    if (prevBtn) prevBtn.addEventListener('click', () => { accountPage--; renderAccountList(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { accountPage++; renderAccountList(); });
  }

  let currentTransactions = []; // full unfiltered history for the selected customer
  function setProfileTab(tab) {
    document.querySelectorAll('.profile-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
    document.querySelectorAll('.profile-tab-panel').forEach(el => el.style.display = el.id === `profileTab-${tab}` ? 'block' : 'none');
  }

  function renderTransactionList() {
    const typeVal = document.getElementById('txTypeFilter')?.value || 'all';
    const dateVal = document.getElementById('txDateFilter')?.value || 'all';
    let list = currentTransactions;
    if (typeVal !== 'all') {
      list = list.filter(tx => {
        const t = (tx.type || '').toLowerCase();
        if (typeVal === 'topup') return t === 'topup';
        if (typeVal === 'purchase') return t.includes('purchase') || t.includes('payment');
        if (typeVal === 'refund') return t.includes('refund');
        if (typeVal === 'deduction') return t === 'deduction';
        if (typeVal === 'adjustment') return (t === 'adjustment' || t === '') ;
        return true;
      });
    }
    if (dateVal !== 'all') {
      list = list.filter(tx => {
        if (dateVal === 'today') return isToday(tx.raw_date);
        if (dateVal === '7d') return daysAgo(tx.raw_date) <= 7;
        if (dateVal === '30d') return daysAgo(tx.raw_date) <= 30;
        return true;
      });
    }
    const txContainer = document.getElementById('accountTransactions');
    document.getElementById('txCount').innerText = ` (${list.length} of ${currentTransactions.length})`;
    if (!list.length) { txContainer.innerHTML = '<div style="color:var(--muted);padding:8px 0;text-align:center;">No matching transactions</div>'; return; }
    txContainer.innerHTML = list.map(tx => {
      const positive = tx.amount >= 0;
      return `
      <div class="transaction-item">
        <div class="transaction-left">
          <div class="transaction-icon"><i class="fas fa-arrow-${positive ? 'up' : 'down'}"></i></div>
          <div><div class="transaction-type">${escapeHtml(tx.desc)}</div><div class="transaction-time">${tx.date} ${tx.time}</div></div>
        </div>
        <div class="transaction-amount ${positive ? 'amount-positive' : 'amount-negative'}">${positive ? '+' : '-'}${fmtR(Math.abs(tx.amount))}</div>
      </div>`;
    }).join('');
  }

  async function selectAccount(walletId) {
    selectedAccountId = walletId;
    const acc = accounts.find(a => a.id === walletId);
    if (!acc) return;
    document.getElementById('selCustomerName').innerText = acc.name || '-';
    document.getElementById('selSurname').innerText = acc.surname || '-';
    document.getElementById('selEmail').innerText = acc.email || '-';
    document.getElementById('selPhone').innerText = acc.phone || '-';
    const joined = acc.profile_created_at ? new Date(acc.profile_created_at).toLocaleDateString() : 'N/A';
    document.getElementById('selJoinedDate').innerText = joined;
    document.getElementById('selWalletId').innerText = acc.id;
    document.getElementById('selBalance').innerText = fmtR(acc.balance);
    const isActive = acc.status === 'Active';
    const statusSpan = document.getElementById('selStatus');
    statusSpan.innerText = isActive ? 'ACTIVE' : 'PASSPORT BLOCKED';
    statusSpan.className = isActive ? 'status-chip active' : 'status-chip blocked';
    const waRow = document.getElementById('selWhatsappRow');
    if (acc.whatsapp) {
      waRow.style.display = 'flex';
      document.getElementById('selWhatsapp').innerText = acc.whatsapp;
    } else {
      waRow.style.display = 'none';
    }
    document.getElementById('selectedAccountDisplay').innerHTML = `Selected: ${fullName(acc)}`;
    document.getElementById('selectedAccountInfo').style.display = 'block';

    // Passport header card
    document.getElementById('phCustomerName').innerText = fullName(acc);
    document.getElementById('phWalletId').innerText = acc.id;
    document.getElementById('phBalance').innerText = fmtR(acc.balance);
    const phStatus = document.getElementById('phStatus');
    phStatus.innerText = isActive ? 'ACTIVE' : 'BLOCKED';
    phStatus.className = isActive ? 'status-chip active' : 'status-chip blocked';

    const transactions = await fetchWalletTransactions(walletId);
    currentTransactions = transactions;
    document.getElementById('selLastActivity').innerText = transactions.length ? `${transactions[0].date} ${transactions[0].time}` : (joined !== 'N/A' ? `Registered ${joined}` : '-');
    renderTransactionList();

    // Passport tab: this customer's own funds added / spent / deducted / refunds
    const added = transactions.filter(t => t.amount > 0 && t.type !== 'refund').reduce((s,t)=>s+t.amount,0);
    const deducted = Math.abs(transactions.filter(t => t.amount < 0 && t.type === 'deduction').reduce((s,t)=>s+t.amount,0));
    const spent = Math.abs(transactions.filter(t => t.amount < 0 && t.type !== 'deduction').reduce((s,t)=>s+t.amount,0));
    const custRefunds = refundRequests.filter(r => r.customer_id === acc.user_id && r.status === 'approved').reduce((s,r)=>s+(r.amount||0),0);
    document.getElementById('custWalletStats').innerHTML = `
      <div class="dash-stat-mini"><div class="num">${fmtR(added)}</div><div class="lbl">Total Added</div></div>
      <div class="dash-stat-mini"><div class="num">${fmtR(spent)}</div><div class="lbl">Total Spent</div></div>
      <div class="dash-stat-mini"><div class="num">${fmtR(deducted)}</div><div class="lbl">Corrections</div></div>
      <div class="dash-stat-mini"><div class="num">${fmtR(custRefunds)}</div><div class="lbl">Refunded</div></div>
    `;

    // Activity tab: registration + transactions + refund requests, chronological
    const events = [];
    if (acc.profile_created_at) events.push({ ts: acc.profile_created_at, icon:'fa-user-plus', color:'#3b82f6', text:'Registered a Passport' });
    transactions.forEach(t => {
      const positive = t.amount >= 0;
      events.push({ ts: t.raw_date, icon: positive?'fa-arrow-up':'fa-arrow-down', color: positive?'var(--green)':'var(--red)', text: `${escapeHtml(t.desc)} — ${positive?'+':'-'}${fmtR(Math.abs(t.amount))}` });
    });
    refundRequests.filter(r => r.customer_id === acc.user_id).forEach(r => {
      events.push({ ts: r.created_at, icon:'fa-hand-holding-usd', color:'var(--gold)', text:`Refund request ${r.status} — ${fmtR(r.amount)}` });
    });
    events.sort((a,b) => new Date(b.ts) - new Date(a.ts));
    const activityEl = document.getElementById('customerActivityFeed');
    activityEl.innerHTML = events.length ? events.map(e => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.72rem;">
        <i class="fas ${e.icon}" style="color:${e.color};width:14px;"></i>
        <div style="flex:1;">${e.text}</div>
        <div style="color:var(--muted);font-size:0.62rem;white-space:nowrap;">${e.ts ? new Date(e.ts).toLocaleString() : ''}</div>
      </div>`).join('') : '<div style="color:var(--muted);padding:10px 0;">No activity yet</div>';

    // Connected tab: tickets (soft match on phone, clearly labeled)
    loadConnectedServices(walletId, acc.phone);

    renderAccountList();
  }

  async function loadConnectedServices(walletId, phone) {
    const el = document.getElementById('customerConnectedServices');
    el.innerHTML = '<div style="color:var(--muted);padding:10px 0;">Loading…</div>';

    let ticketsHtml = '';
    if (!phone) {
      ticketsHtml = `<div style="color:var(--muted);font-size:0.72rem;">No phone number on file — tickets can't be matched.</div>`;
    } else {
      try {
        const { data: tix, error: tixErr } = await supabase
          .from('tickets')
          .select('id, issued_at, status, customer_phone, ticket_types(name, price)')
          .eq('customer_phone', phone);
        if (tixErr) throw tixErr;
        ticketsHtml = (tix && tix.length)
          ? tix.map(t => `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.72rem;">${escapeHtml(t.ticket_types?.name || 'Ticket')} — ${t.status} ${t.issued_at ? '· ' + new Date(t.issued_at).toLocaleDateString() : ''}</div>`).join('')
          : '<div style="color:var(--muted);font-size:0.72rem;padding-bottom:6px;">No tickets found for this phone number</div>';
      } catch(err) {
        ticketsHtml = `<div style="color:var(--muted);font-size:0.72rem;">Tickets unavailable: ${escapeHtml(err.message)}</div>`;
      }
    }
    el.innerHTML = `
      <div style="font-weight:700;font-size:0.72rem;color:var(--red);margin-bottom:8px;"><i class="fas fa-ticket-alt"></i> Tickets <span style="color:var(--muted);font-weight:500;">(matched by phone number — not a guaranteed account link)</span></div>
      ${ticketsHtml}
    `;
  }


  // ─── STATS ───
  async function updateStats() {
    const totalAccounts = accounts.length;
    const totalBalance = accounts.reduce((s,a)=>s+(a.balance||0),0);
    const blocked = accounts.filter(a=>a.status==='Blocked').length;
    document.getElementById('totalAccounts').innerText = totalAccounts;
    document.getElementById('totalBalance').innerText = fmtR(totalBalance);
    document.getElementById('blockedAccounts').innerText = blocked;
    const { count } = await supabase.from('wallet_transactions').select('*',{count:'exact',head:true});
    document.getElementById('totalTransactions').innerText = count || 0;
    const pending = refundRequests.filter(r=>r.status==='pending').length;
    const approved = refundRequests.filter(r=>r.status==='approved').length;
    const totalAmt = refundRequests.filter(r=>r.status==='approved').reduce((s,r)=>s+(r.amount||0),0);
    document.getElementById('pendingRefunds').innerText = pending;
    document.getElementById('approvedRefunds').innerText = approved;
    document.getElementById('totalRefundAmount').innerText = fmtR(totalAmt);
  }

  // ─── REFRESH ───
  async function refreshData() {
    showToast('Loading...', 'info');
    accounts = await loadWallets();
    if (selectedAccountId && !accounts.find(a=>a.id===selectedAccountId)) selectedAccountId = null;
    if (!selectedAccountId && accounts.length) selectedAccountId = accounts[0].id;
    if (selectedAccountId) await selectAccount(selectedAccountId);
    renderAccountList();
    updateStats();
    // Reload refunds + recent activity
    await loadRefundRequests();
    await loadRecentActivity();
    // If dashboard open, refresh charts
    if (document.getElementById('dashboardOverlay').classList.contains('open')) renderCharts();
    showToast(`Loaded ${accounts.length} Passports`, 'success');
  }

  // ─── ACTIONS ───
  async function topUp(amount, walletId) {
    if (!walletId || !(amount > 0)) return false;
    if (await updateWalletBalance(walletId, amount, `Admin Top Up: +${fmtR(amount)}`, 'topup')) {
      await refreshData();
      showToast(`${fmtR(amount)} added`, 'success');
      return true;
    }
    return false;
  }

  async function deductFunds(amount, walletId, reason) {
    if (!walletId || !(amount > 0)) return false;
    const desc = reason ? `Admin Correction: -${fmtR(amount)} (${reason})` : `Admin Correction: -${fmtR(amount)}`;
    if (await updateWalletBalance(walletId, -amount, desc, 'deduction')) {
      await refreshData();
      showToast(`${fmtR(amount)} deducted`, 'success');
      return true;
    }
    return false;
  }

  async function blockAccount(walletId) {
    if (!await showConfirm('Block this Passport?')) return;
    if (await setWalletStatus(walletId, 'Blocked')) {
      await addTransaction(walletId, 0, 'Blocked by admin');
      await refreshData();
      showToast('Passport blocked', 'warning');
    }
  }

  async function unblockAccount(walletId) {
    if (!await showConfirm('Unblock this Passport?')) return;
    if (await setWalletStatus(walletId, 'Active')) {
      await addTransaction(walletId, 0, 'Unblocked by admin');
      await refreshData();
      showToast('Passport unblocked', 'success');
    }
  }

  async function deleteAccount(walletId) {
    if (!walletId) return;
    const acc = accounts.find(a => a.id === walletId);
    const label = acc ? (fullName(acc) || walletId) : walletId;
    const ok = await showConfirm(
      `Permanently delete the Passport account for "${label}"? This removes their Passport and transaction history. This cannot be undone.`
    );
    if (!ok) return;
    try {
      // Remove dependent rows first so the Passport delete doesn't hit FK constraints.
      await supabase.from('wallet_transactions').delete().eq('wallet_id', walletId);
      const { data, error } = await supabase
        .from('wallets')
        .delete()
        .eq('id', walletId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        // Delete ran without a thrown error but touched 0 rows — almost always a
        // Row Level Security policy silently blocking the write. Surface this
        // instead of pretending it worked.
        throw new Error('No rows deleted — check RLS policy on "wallets" table for DELETE permissions');
      }
      if (selectedAccountId === walletId) {
        selectedAccountId = null;
        document.getElementById('selectedAccountInfo').style.display = 'none';
        document.getElementById('selectedAccountDisplay').innerHTML = 'None selected';
      }
      await refreshData();
      showToast('Passport account deleted', 'success');
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
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
  let charts = {};
  function renderCharts() {
    // KPI Grid
    const totalBal = accounts.reduce((s,a)=>s+(a.balance||0),0);
    const totalAcc = accounts.length;
    const blocked = accounts.filter(a=>a.status==='Blocked').length;
    const activeCustomers = totalAcc - blocked;
    const newCustomers7d = accounts.filter(a => daysAgo(a.profile_created_at) <= 7).length;
    const activeRecentlyWalletIds = new Set(recentTxGlobal.filter(t => daysAgo(t.created_at) <= 7).map(t => t.wallet_id));
    const activeRecently = activeRecentlyWalletIds.size;
    const fundsAddedToday = recentTxGlobal.filter(t => isToday(t.created_at) && t.amount > 0).reduce((s,t)=>s+t.amount,0);
    const fundsSpentToday = Math.abs(recentTxGlobal.filter(t => isToday(t.created_at) && t.amount < 0 && t.type !== 'deduction').reduce((s,t)=>s+t.amount,0));
    const txToday = recentTxGlobal.filter(t => isToday(t.created_at)).length;
    const pendingRef = refundRequests.filter(r=>r.status==='pending').length;
    const approvedRef = refundRequests.filter(r=>r.status==='approved').length;
    const refAmount = refundRequests.filter(r=>r.status==='approved').reduce((s,r)=>s+(r.amount||0),0);
    document.getElementById('dashKpiGrid').innerHTML = `
      <div class="dash-kpi"><div class="val">${totalAcc}</div><div class="label">Total Customers</div></div>
      <div class="dash-kpi"><div class="val">${activeCustomers}</div><div class="label">Active Customers</div></div>
      <div class="dash-kpi"><div class="val">${newCustomers7d}</div><div class="label">New (7 Days)</div></div>
      <div class="dash-kpi"><div class="val">${activeRecently}</div><div class="label">Active Recently (7d)</div></div>
      <div class="dash-kpi"><div class="val">${fmtR(totalBal)}</div><div class="label">Total Passport Balance</div></div>
      <div class="dash-kpi"><div class="val">${fmtR(fundsAddedToday)}</div><div class="label">Added Today</div></div>
      <div class="dash-kpi"><div class="val">${fmtR(fundsSpentToday)}</div><div class="label">Spent Today</div></div>
      <div class="dash-kpi"><div class="val">${txToday}</div><div class="label">Transactions Today</div></div>
      <div class="dash-kpi"><div class="val">${blocked}</div><div class="label">Blocked</div></div>
      <div class="dash-kpi"><div class="val">${pendingRef}</div><div class="label">Pending Refunds</div></div>
      <div class="dash-kpi"><div class="val">${approvedRef}</div><div class="label">Approved Refunds</div></div>
      <div class="dash-kpi"><div class="val">${fmtR(refAmount)}</div><div class="label">Refunded Amount</div></div>
    `;

    // Refund status mini
    const totalRef = pendingRef + approvedRef;
    document.getElementById('dashRefundStats').innerHTML = `
      <div class="dash-stat-mini"><div class="num">${pendingRef}</div><div class="lbl">Pending</div></div>
      <div class="dash-stat-mini"><div class="num">${approvedRef}</div><div class="lbl">Approved</div></div>
      <div class="dash-stat-mini"><div class="num">${totalRef}</div><div class="lbl">Total</div></div>
    `;

    // Charts
    // Balance distribution: <100, 100-500, 500-2000, >2000
    const ranges = { '<R100':0, 'R100-500':0, 'R500-2000':0, 'R2000+':0 };
    accounts.forEach(a => {
      const b = a.balance || 0;
      if (b < 100) ranges['<R100']++;
      else if (b < 500) ranges['R100-500']++;
      else if (b < 2000) ranges['R500-2000']++;
      else ranges['R2000+']++;
    });
    const ctx1 = document.getElementById('dashBalanceChart').getContext('2d');
    if (charts.balance) charts.balance.destroy();
    charts.balance = new Chart(ctx1, {
      type: 'doughnut',
      data: { labels: Object.keys(ranges), datasets: [{ data: Object.values(ranges), backgroundColor: ['#E30613','#f59e0b','#10b981','#8b5cf6'] }] },
      options: { responsive: true, plugins: { legend: { labels: { color: '#71717a', boxWidth: 8 } } } }
    });

    // Transaction volume — real counts from the last 7 days
    const dayLabels = [];
    const volumes = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      dayLabels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
      const count = recentTxGlobal.filter(t => {
        const td = new Date(t.created_at);
        return td.getFullYear()===d.getFullYear() && td.getMonth()===d.getMonth() && td.getDate()===d.getDate();
      }).length;
      volumes.push(count);
    }
    const ctx2 = document.getElementById('dashTxChart').getContext('2d');
    if (charts.tx) charts.tx.destroy();
    charts.tx = new Chart(ctx2, {
      type: 'bar',
      data: { labels: dayLabels, datasets: [{ label: 'Transactions', data: volumes, backgroundColor: '#E30613', borderRadius: 4 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#71717a', stepSize: 1 } } } }
    });

    // Refund status chart
    const ctx3 = document.getElementById('dashRefundChart').getContext('2d');
    if (charts.refund) charts.refund.destroy();
    charts.refund = new Chart(ctx3, {
      type: 'doughnut',
      data: { labels: ['Pending','Approved'], datasets: [{ data: [pendingRef, approvedRef], backgroundColor: ['#f59e0b','#10b981'] }] },
      options: { responsive: true, plugins: { legend: { labels: { color: '#71717a', boxWidth: 8 } } } }
    });

    // Alerts
    const alerts = [];
    if (pendingRef > 5) alerts.push({ level:'warning', title:'Many pending refunds', desc:`${pendingRef} requests waiting` });
    if (blocked > accounts.length * 0.1) alerts.push({ level:'warning', title:'High blocked rate', desc:`${blocked} Passports blocked` });
    if (totalAcc === 0) alerts.push({ level:'info', title:'No Passports', desc:'Add your first Passport' });
    document.getElementById('dashAlerts').innerHTML = alerts.map(a =>
      `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.7rem;">
        <i class="fas fa-exclamation-circle" style="color:${a.level==='warning'?'var(--gold)':'#3b82f6'}"></i>
        <div><strong>${a.title}</strong> · ${a.desc}</div>
      </div>`
    ).join('') || '<div style="color:var(--muted);font-size:0.7rem;">No alerts</div>';

    // Recent Activity — real registrations + Passport transactions, merged and sorted
    const walletNameMap = {};
    accounts.forEach(a => { walletNameMap[a.id] = fullName(a); });
    const regEvents = accounts
      .filter(a => a.profile_created_at)
      .map(a => ({ ts: a.profile_created_at, icon: 'fa-user-plus', color: '#3b82f6', text: `${fullName(a)} registered a Passport` }));
    const txEvents = recentTxGlobal.map(t => {
      const name = walletNameMap[t.wallet_id] || 'Customer';
      const positive = t.amount >= 0;
      const label = t.type === 'topup' ? 'Passport top-up' : t.type === 'deduction' ? 'balance correction' : (t.type || 'Passport adjustment');
      return { ts: t.created_at, icon: positive ? 'fa-arrow-up' : 'fa-arrow-down', color: positive ? 'var(--green)' : 'var(--red)', text: `${name} — ${positive?'+':'-'}${fmtR(Math.abs(t.amount))} ${label}` };
    });
    const refundEvents = refundRequests
      .filter(r => daysAgo(r.created_at) <= 30)
      .map(r => ({ ts: r.created_at, icon: 'fa-hand-holding-usd', color: 'var(--gold)', text: `Refund ${r.status} — ${r.customer_name} (${fmtR(r.amount)})` }));
    const feed = [...regEvents, ...txEvents, ...refundEvents]
      .filter(e => e.ts)
      .sort((a,b) => new Date(b.ts) - new Date(a.ts))
      .slice(0, 10);
    const feedEl = document.getElementById('dashActivityFeed');
    if (feedEl) {
      feedEl.innerHTML = feed.length ? feed.map(e => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.72rem;">
          <i class="fas ${e.icon}" style="color:${e.color};width:14px;"></i>
          <div style="flex:1;">${escapeHtml(e.text)}</div>
          <div style="color:var(--muted);font-size:0.62rem;white-space:nowrap;">${new Date(e.ts).toLocaleString()}</div>
        </div>`).join('') : '<div style="color:var(--muted);font-size:0.7rem;">No recent activity</div>';
    }
  }

  // ─── INIT ───
  async function init() {
    await refreshData();

    // Event listeners
    document.getElementById('topUpBtn').addEventListener('click', () => {
      if (!selectedAccountId) return showToast('Select account', 'error');
      const acc = accounts.find(a=>a.id===selectedAccountId);
      document.getElementById('modalAccountId').innerText = acc ? fullName(acc) : selectedAccountId;
      document.getElementById('topUpModal').classList.add('active');
    });
    document.getElementById('closeTopUpModalBtn').addEventListener('click', () => document.getElementById('topUpModal').classList.remove('active'));
    document.getElementById('confirmTopUpBtn').addEventListener('click', async () => {
      const amt = parseFloat(document.getElementById('modalTopupAmount').value);
      if (await topUp(amt, selectedAccountId)) {
        document.getElementById('topUpModal').classList.remove('active');
        document.getElementById('modalTopupAmount').value = '';
      }
    });
    document.getElementById('quickTopUpBtn').addEventListener('click', async () => {
      const amt = parseFloat(document.getElementById('quickTopupAmount').value);
      await topUp(amt, selectedAccountId);
    });
    document.getElementById('deductBtn').addEventListener('click', () => {
      if (!selectedAccountId) return showToast('Select account', 'error');
      const acc = accounts.find(a=>a.id===selectedAccountId);
      document.getElementById('deductModalAccountId').innerText = acc ? fullName(acc) : selectedAccountId;
      document.getElementById('deductModalBalance').innerText = acc ? fmtR(acc.balance) : '-';
      document.getElementById('modalDeductAmount').value = '';
      document.getElementById('modalDeductReason').value = '';
      document.getElementById('deductModal').classList.add('active');
    });
    document.getElementById('closeDeductModalBtn').addEventListener('click', () => document.getElementById('deductModal').classList.remove('active'));
    document.getElementById('confirmDeductBtn').addEventListener('click', async () => {
      const amt = parseFloat(document.getElementById('modalDeductAmount').value);
      const reason = document.getElementById('modalDeductReason').value.trim();
      if (!(amt > 0)) return showToast('Enter a valid amount', 'error');
      if (await deductFunds(amt, selectedAccountId, reason)) {
        document.getElementById('deductModal').classList.remove('active');
      }
    });
    document.getElementById('blockBtn').addEventListener('click', () => { if (selectedAccountId) blockAccount(selectedAccountId); else showToast('Select account', 'error'); });
    document.getElementById('unblockBtn').addEventListener('click', () => { if (selectedAccountId) unblockAccount(selectedAccountId); else showToast('Select account', 'error'); });
    document.getElementById('deleteAccountBtn').addEventListener('click', () => { if (selectedAccountId) deleteAccount(selectedAccountId); else showToast('Select account', 'error'); });
    document.getElementById('manualRefundBtn').addEventListener('click', () => {
      if (!selectedAccountId) return showToast('Select account', 'error');
      const acc = accounts.find(a=>a.id===selectedAccountId);
      document.getElementById('manualRefundCustomer').innerText = acc ? fullName(acc) : selectedAccountId;
      document.getElementById('manualRefundModal').classList.add('active');
    });
    document.getElementById('confirmManualRefundBtn').addEventListener('click', async () => {
      const amt = parseFloat(document.getElementById('manualRefundAmount').value);
      const reason = document.getElementById('manualRefundReason').value.trim();
      const acc = accounts.find(a=>a.id===selectedAccountId);
      if (acc && amt > 0) await createManualRefund(acc.user_id, amt, reason);
      document.getElementById('manualRefundModal').classList.remove('active');
    });
    document.getElementById('closeManualRefundModalBtn').addEventListener('click', () => document.getElementById('manualRefundModal').classList.remove('active'));
    document.getElementById('refreshBtnHeader').addEventListener('click', refreshData);
    document.getElementById('refreshRefundsBtn').addEventListener('click', loadRefundRequests);
    document.querySelectorAll('.refund-filter-tab').forEach(tab => tab.addEventListener('click', () => setRefundFilter(tab.dataset.status)));

    // Presets
    document.querySelectorAll('.preset-btn[data-amount]').forEach(btn => btn.addEventListener('click', () => {
      const amt = btn.dataset.amount;
      if (amt) document.getElementById('quickTopupAmount').value = amt;
    }));
    document.querySelectorAll('[data-modal-amount]').forEach(btn => btn.addEventListener('click', () => {
      const amt = btn.dataset.modalAmount;
      if (amt) document.getElementById('modalTopupAmount').value = amt;
    }));
    document.querySelectorAll('[data-modal-deduct-amount]').forEach(btn => btn.addEventListener('click', () => {
      const amt = btn.dataset.modalDeductAmount;
      if (amt) document.getElementById('modalDeductAmount').value = amt;
    }));
    document.getElementById('globalSearch').addEventListener('input', () => { accountPage = 0; renderAccountList(); });
    document.getElementById('statusFilter').addEventListener('change', () => { accountPage = 0; renderAccountList(); });
    document.getElementById('sortField').addEventListener('change', () => { accountPage = 0; renderAccountList(); });
    document.querySelectorAll('.profile-tab').forEach(el => el.addEventListener('click', () => setProfileTab(el.dataset.tab)));
    document.getElementById('txTypeFilter').addEventListener('change', renderTransactionList);
    document.getElementById('txDateFilter').addEventListener('change', renderTransactionList);

    // Close overlay on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const overlay = document.getElementById('dashboardOverlay');
        if (overlay.classList.contains('open')) toggleDashboard();
      }
    });
  }

  init();
