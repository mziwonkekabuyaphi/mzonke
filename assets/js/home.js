// ============================================
// Constants
// ============================================

import { supabase } from '../../config/supabase.js';
window.supabase = supabase;

// ============================================
// DOM Elements
// ============================================

const DOM = {
    userName: () => document.getElementById('userNameDisplay'),
    cardHolder: () => document.getElementById('cardHolderName'),
    cardNumber: () => document.getElementById('dynamicCardNumber'),
    cardCvv: () => document.getElementById('dynamicCvv'),
    phoneDisplay: () => document.getElementById('accountPhoneNumber'),
    balance: () => document.getElementById('realWalletBalance'),
    shishaBalance: () => document.getElementById('shishaWalletBalance'),
    barcodeInner: () => document.getElementById('barcodeInner'),
    toast: () => document.getElementById('customToast')
};

// ============================================
// State
// ============================================

let currentWalletStatus = null;
let currentWalletRowId = null;
let paymentChannel = null;
let currentPaymentId = null;
let isProcessingPayment = false;
let walletChannel = null;

// Vibe meter state
let currentEventId = null;
let vibeUpdateInterval = null;
let vibeEventChannel = null;

// ============================================
// Utility Functions
// ============================================

const formatPhoneNumber = (phone) => {
    if (!phone) return '—';
    const cleaned = phone.toString().replace(/\D/g, '');
    return cleaned.replace(/(\d{3})(?=\d)/g, '$1 ');
};

const formatCardNumber = (walletNumber) => {
    if (!walletNumber) return '•••• •••• •••• ••••';
    const str = String(walletNumber);
    const groups = str.match(/.{1,4}/g);
    return groups ? groups.join(' ') : str;
};

const formatBalanceCompact = (amount) => {
    const abs = Math.abs(amount);
    if (abs >= 1_000_000) return `R ${(amount / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
    if (abs >= 100_000)   return `R ${(amount / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
};

const showToast = (message, isError = false) => {
    const toast = DOM.toast();
    if (toast) {
        toast.textContent = message;
        toast.style.background = isError ? '#E30613' : '#1a1a2e';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    } else alert(message);
};

const generateBarcodeFromId = (idString) => {
    const barcodeInner = DOM.barcodeInner();
    if (!barcodeInner || !idString) return;
    
    barcodeInner.innerHTML = '';
    idString = String(idString).replace(/-/g, '');
    
    let binaryPattern = [];
    for (let i = 0; i < idString.length; i++) {
        const charCode = idString.charCodeAt(i);
        for (let bit = 0; bit < 8; bit++) binaryPattern.push((charCode >> bit) & 1);
    }
    
    const startPattern = [1,0,1,1,0,0,1,0];
    const stopPattern = [1,1,0,0,1,0,1,1];
    const fullPattern = [...startPattern, ...binaryPattern, ...stopPattern];
    
    let totalWidth = 0;
    const barData = [];
    
    for (let i = 0; i < fullPattern.length; i++) {
        const isBar = i % 2 === 0;
        if (isBar && fullPattern[i] === 1) {
            const w = (fullPattern[i+1] === 1) ? 3 : ((fullPattern[i-1] === 1) ? 2 : 1);
            totalWidth += w;
            barData.push({ type: 'bar', w, tall: true });
        } else if (isBar && fullPattern[i] === 0) {
            totalWidth += 1;
            barData.push({ type: 'space', w: 1 });
        } else if (!isBar && fullPattern[i] === 1) {
            totalWidth += 1;
            barData.push({ type: 'bar', w: 1, tall: true });
        } else {
            totalWidth += 1;
            barData.push({ type: 'space', w: 1 });
        }
    }
    
    const scaleFactor = 100 / Math.max(totalWidth, 1);
    barData.forEach(bar => {
        const el = document.createElement('div');
        if (bar.type === 'bar') {
            el.className = 'bar tall';
            el.style.width = (bar.w * scaleFactor) + '%';
            el.style.background = '#1a1a1a';
            el.style.height = '100%';
        } else {
            el.style.width = (bar.w * scaleFactor) + '%';
            el.style.flexShrink = '0';
            el.style.background = 'transparent';
        }
        barcodeInner.appendChild(el);
    });
};

// ============================================
// UI Functions
// ============================================

const applyWalletStatusUI = (status) => {
    currentWalletStatus = status || null;
    const cardElem = document.getElementById('headerBalanceCard');
    const subElem = document.getElementById('balanceSubText');
    if (currentWalletStatus === 'blocked') {
        if (cardElem) cardElem.classList.add('is-blocked');
        if (subElem) subElem.textContent = '🔒 Passport blocked — contact support to unlock';
    } else {
        if (cardElem) cardElem.classList.remove('is-blocked');
        if (subElem) subElem.textContent = 'Available for cashless spending and Tickets';
    }
};

const updateBalance = (newBalance) => {
    const full = `R ${newBalance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    const compact = formatBalanceCompact(newBalance);
    if (DOM.balance()) { DOM.balance().textContent = compact; DOM.balance().title = full; }
    if (DOM.shishaBalance()) { DOM.shishaBalance().textContent = compact; DOM.shishaBalance().title = full; }
};
window.updateUserBalance = updateBalance;

const loadRecentTransactions = async (walletId) => {
    const list = document.getElementById('txList');
    if (!list) return;
    if (!walletId) { list.innerHTML = '<div class="tx-empty">No wallet found.</div>'; return; }
    
    list.innerHTML = '<div class="tx-empty">Loading…</div>';
    try {
        const { data: txs, error } = await supabase
            .from('wallet_transactions')
            .select('amount, type, direction, description, created_at')
            .eq('wallet_id', walletId)
            .order('created_at', { ascending: false })
            .limit(6);
        
        if (error) throw error;
        if (!txs || txs.length === 0) {
            list.innerHTML = '<div class="tx-empty">No transactions yet.</div>';
            return;
        }
        
        list.innerHTML = txs.map(tx => {
            const isCredit = (tx.direction || tx.type || '').toLowerCase() === 'credit';
            const cls      = isCredit ? 'credit' : 'debit';
            const icon     = isCredit ? 'fa-arrow-down' : 'fa-arrow-up';
            const sign     = isCredit ? '+' : '-';
            const amt      = Math.abs(parseFloat(tx.amount || 0)).toFixed(2);
            const desc     = tx.description || (isCredit ? 'Top-up' : 'Payment');
            const date     = new Date(tx.created_at).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            return `
            <div class="tx-item">
                <div class="tx-icon-wrap ${cls}"><i class="fas ${icon}"></i></div>
                <div class="tx-info">
                    <div class="tx-desc">${desc.replace(/</g,'&lt;')}</div>
                    <div class="tx-date">${date}</div>
                </div>
                <div class="tx-amount ${cls}">${sign}R${amt}</div>
            </div>`;
        }).join('');
    } catch (err) {
        console.error('Transaction load error:', err);
        list.innerHTML = '<div class="tx-empty">Could not load transactions.</div>';
    }
};
window.loadRecentTransactions = loadRecentTransactions;

// ============================================
// API Functions
// ============================================

const getOrCreateCardNumber = async (userId) => {
    const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('card_number')
        .eq('id', userId)
        .maybeSingle();
    
    if (fetchError) throw fetchError;
    if (profile?.card_number) return profile.card_number;
    
    let cardNumber = '';
    let isUnique = false;
    while (!isUnique) {
        const prefix = '4';
        const randomDigits = Math.floor(Math.random() * 1000000000000000).toString().padStart(15, '0');
        cardNumber = prefix + randomDigits;
        const { data: existing } = await supabase
            .from('profiles')
            .select('card_number')
            .eq('card_number', cardNumber)
            .maybeSingle();
        if (!existing) isUnique = true;
    }
    
    await supabase.from('profiles').update({ card_number: cardNumber }).eq('id', userId);
    return cardNumber;
};

const getOrCreateCvv = async (userId) => {
    const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('card_cvv')
        .eq('id', userId)
        .maybeSingle();
    
    if (fetchError) throw fetchError;
    if (profile?.card_cvv) return profile.card_cvv;
    
    const cvv = Math.floor(100 + Math.random() * 899).toString();
    await supabase.from('profiles').update({ card_cvv: cvv }).eq('id', userId);
    return cvv;
};

const setupWalletRealtime = () => {
    if (walletChannel) supabase.removeChannel(walletChannel);
    if (!currentWalletRowId) return;
    walletChannel = supabase.channel(`wallet-${currentWalletRowId}`)
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'wallets', 
            filter: `id=eq.${currentWalletRowId}` 
        }, async (payload) => { 
            if (payload.new?.balance !== undefined) {
                updateBalance(payload.new.balance);
                loadRecentTransactions(currentWalletRowId);
            }
            if (payload.new?.status !== undefined && payload.new.status !== currentWalletStatus) {
                const wasBlocked = currentWalletStatus === 'blocked';
                applyWalletStatusUI(payload.new.status);
                if (!wasBlocked && currentWalletStatus === 'blocked') {
                    showToast('Your Passport has just been blocked. Contact support for assistance.', true);
                } else if (wasBlocked && currentWalletStatus !== 'blocked') {
                    showToast('Your Passport has been unblocked!', false);
                }
            }
        })
        .subscribe();
};

const setupPaymentListener = async (userId, profileId) => {
    if (paymentChannel) {
        await supabase.removeChannel(paymentChannel);
        paymentChannel = null;
    }
    if (!profileId) {
        console.error('No profile ID provided for payment listener');
        return;
    }
    console.log('Setting up payment listener for profile:', profileId);
    
    paymentChannel = supabase.channel(`payment-requests-${profileId}`)
        .on('postgres_changes', { 
            event: '*',
            schema: 'public', 
            table: 'payment_requests'
        }, async (payload) => {
            const request = payload.new;
            if (!request) return;
            if (request.customer_profile_id !== profileId) return;
            if (request.status !== 'pending') return;
            if (request.expires_at && new Date(request.expires_at) < new Date()) return;
            if (currentPaymentId === request.id) return;
            
            console.log('Valid payment request received:', request.id);
            currentPaymentId = request.id;
            
            let senderName = 'Kiosk';
            if (request.kiosk_id) {
                try {
                    const { data: kiosk } = await supabase
                        .from('kiosks')
                        .select('name')
                        .eq('id', request.kiosk_id)
                        .single();
                    if (kiosk) senderName = kiosk.name;
                } catch (e) { console.error('Error fetching kiosk:', e); }
            } else if (request.metadata?.source === 'rands_kiosk') {
                senderName = 'Rands Kiosk';
            }
            
            document.getElementById('popupSenderName').textContent = senderName;
            document.getElementById('popupAmount').textContent = `R ${(request.total_amount || 0).toFixed(2)}`;
            document.getElementById('popupReason').textContent = request.request_message || `Payment for ${request.request_type || 'order'}`;
            
            const popup = document.getElementById('incomingRequestPopup');
            if (popup) popup.classList.add('active');
            
            try {
                const audio = new Audio('https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3');
                audio.volume = 0.3;
                audio.play().catch(e => console.log('Audio play failed:', e));
            } catch(e) {}
        })
        .subscribe((status) => {
            console.log('Payment channel subscription status:', status);
        });
};

const acceptPayment = async () => {
    if (isProcessingPayment) {
        console.log('Payment already processing, ignoring duplicate click');
        showToast('Payment already processing...', false);
        return;
    }
    if (!currentPaymentId) {
        console.error('No payment request ID available');
        showToast('No active payment request', true);
        return;
    }
    
    const acceptBtn = document.getElementById('acceptRequestBtn');
    const rejectBtn = document.getElementById('rejectRequestBtn');
    isProcessingPayment = true;
    if (acceptBtn) { acceptBtn.disabled = true; acceptBtn.textContent = 'Processing...'; }
    if (rejectBtn) rejectBtn.disabled = true;
    
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');
        
        const { data: userProfile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', session.user.id)
            .single();
        if (profileError) throw new Error('Could not find user profile');
        
        const { data: wallet, error: walletError } = await supabase
            .from('wallets')
            .select('id, balance, status')
            .eq('user_id', session.user.id)
            .single();
        if (walletError || !wallet) throw new Error('Could not find passport');
        if (wallet.status === 'blocked') throw new Error('This Passport is blocked. Contact support for assistance.');
        
        const { data: payment, error: paymentError } = await supabase
            .from('payment_requests')
            .select('*')
            .eq('id', currentPaymentId)
            .single();
        if (paymentError || !payment) throw new Error('Payment request not found');
        if (payment.status !== 'pending') throw new Error(`Payment request is already ${payment.status}. Cannot process.`);
        if (payment.expires_at && new Date(payment.expires_at) < new Date()) throw new Error('Payment request has expired');
        if (payment.customer_profile_id !== userProfile.id) throw new Error('This payment request is not for you');
        if (wallet.balance < payment.total_amount) throw new Error(`Insufficient balance. Need R${payment.total_amount}, have R${wallet.balance}`);
        
        const newBalance = wallet.balance - payment.total_amount;
        const { error: updateWalletError } = await supabase
            .from('wallets')
            .update({ balance: newBalance })
            .eq('id', wallet.id)
            .eq('user_id', session.user.id);
        if (updateWalletError) throw new Error('Failed to update Rands Passport Credit');
        
        const { error: transactionError } = await supabase
            .from('wallet_transactions')
            .insert({
                wallet_id: wallet.id,
                user_id: session.user.id,
                amount: -payment.total_amount,
                type: 'payment',
                direction: 'debit',
                description: `Payment: ${payment.request_message || 'Kiosk order'}`,
                status: 'completed',
                metadata: { 
                    payment_request_id: currentPaymentId, 
                    order_id: payment.order_id,
                    request_type: payment.request_type
                }
            });
        if (transactionError) {
            await supabase.from('wallets').update({ balance: wallet.balance }).eq('id', wallet.id);
            throw new Error('Failed to create transaction record');
        }
        
        const { error: updatePaymentError } = await supabase
            .from('payment_requests')
            .update({ 
                status: 'approved', 
                approved_at: new Date().toISOString(),
                approved_by: session.user.id
            })
            .eq('id', currentPaymentId)
            .eq('status', 'pending');
        if (updatePaymentError) throw new Error('Failed to update payment request');
        
        if (payment.order_id) {
            await supabase
                .from('orders')
                .update({ payment_status: 'paid', status: 'placed' })
                .eq('id', payment.order_id);
        }
        
        showToast(`✅ Payment of R${payment.total_amount} approved!`, false);
        document.getElementById('incomingRequestPopup').classList.remove('active');
        currentPaymentId = null;
        
        const { data: newWalletData } = await supabase
            .from('wallets')
            .select('balance')
            .eq('user_id', session.user.id)
            .single();
        updateBalance(newWalletData?.balance || 0);
        
    } catch (err) {
        console.error('Accept payment error:', err);
        showToast(err.message || 'Payment failed', true);
    } finally {
        isProcessingPayment = false;
        if (acceptBtn) { acceptBtn.disabled = false; acceptBtn.textContent = 'Accept & Pay'; }
        if (rejectBtn) rejectBtn.disabled = false;
    }
};

const rejectPayment = async () => {
    if (isProcessingPayment) {
        console.log('Payment already processing, ignoring duplicate click');
        return;
    }
    if (!currentPaymentId) {
        console.error('No payment request ID available');
        showToast('No active payment request', true);
        return;
    }
    
    const rejectBtn = document.getElementById('rejectRequestBtn');
    const acceptBtn = document.getElementById('acceptRequestBtn');
    isProcessingPayment = true;
    if (rejectBtn) { rejectBtn.disabled = true; rejectBtn.textContent = 'Rejecting...'; }
    if (acceptBtn) acceptBtn.disabled = true;
    
    try {
        const { data: payment, error: paymentError } = await supabase
            .from('payment_requests')
            .select('status')
            .eq('id', currentPaymentId)
            .single();
        if (paymentError) throw new Error('Payment request not found');
        if (payment.status !== 'pending') throw new Error(`Cannot reject - payment is already ${payment.status}`);
        
        const { error: updateError } = await supabase
            .from('payment_requests')
            .update({ status: 'rejected' })
            .eq('id', currentPaymentId)
            .eq('status', 'pending');
        if (updateError) throw new Error('Failed to reject payment request');
        
        showToast('❌ Payment request rejected', false);
        document.getElementById('incomingRequestPopup').classList.remove('active');
        currentPaymentId = null;
        
    } catch (err) {
        console.error('Reject payment error:', err);
        showToast(err.message || 'Failed to reject request', true);
    } finally {
        isProcessingPayment = false;
        if (rejectBtn) { rejectBtn.disabled = false; rejectBtn.textContent = 'Decline'; }
        if (acceptBtn) acceptBtn.disabled = false;
    }
};

const loadUserData = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
        if (DOM.userName()) DOM.userName().textContent = 'Guest';
        if (DOM.cardHolder()) DOM.cardHolder().textContent = 'GUEST';
        if (DOM.cardNumber()) DOM.cardNumber().textContent = '•••• •••• •••• ••••';
        return;
    }
    
    const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, phone, card_number, card_cvv')
        .eq('id', session.user.id)
        .maybeSingle();
    
    if (pErr) console.error('Profile fetch error:', pErr);
    
    const fullName = profile?.full_name || session.user.user_metadata?.full_name || 'Member';
    const firstName = fullName.split(' ')[0];
    if (DOM.userName()) DOM.userName().textContent = firstName;
    if (DOM.cardHolder()) DOM.cardHolder().textContent = fullName.toUpperCase();
    
    const phone = profile?.phone || session.user.user_metadata?.phone || '';
    
    try {
        const cardNumber = await getOrCreateCardNumber(session.user.id);
        if (DOM.cardNumber()) DOM.cardNumber().textContent = formatCardNumber(cardNumber);
    } catch (err) { console.error('Card number error:', err); }
    
    try {
        const cvv = await getOrCreateCvv(session.user.id);
        if (DOM.cardCvv()) DOM.cardCvv().textContent = cvv;
    } catch (err) { console.error('CVV error:', err); }
    
    const { data: wallet, error: wErr } = await supabase
        .from('wallets')
        .select('id, balance, status')
        .eq('user_id', session.user.id)
        .maybeSingle();
    if (wErr) console.warn('Wallet query error:', wErr);
    updateBalance((wallet && typeof wallet.balance === 'number') ? wallet.balance : 0);

    applyWalletStatusUI(wallet?.status || null);
    if (currentWalletStatus === 'blocked') {
        showToast('Your Passport is blocked. Contact support for assistance.', true);
    }

    // Show phone number on card back + draw barcode from wallet UUID
    if (wallet?.id) {
        const phone = profile?.phone || session.user.user_metadata?.phone || '';
        const formattedPhone = phone ? formatPhoneNumber(phone) : 'No phone number';
        if (DOM.phoneDisplay()) DOM.phoneDisplay().textContent = `Passport ID: ${formattedPhone}`;
        generateBarcodeFromId(wallet.id);
        currentWalletRowId = wallet.id;
        setupWalletRealtime();
        loadRecentTransactions(wallet.id);
    }
    
    if (profile?.id) {
        await setupPaymentListener(session.user.id, profile.id);
    } else {
        console.error('No profile ID found for payment listener');
    }
};

const performLogout = async () => {
    if (walletChannel) supabase.removeChannel(walletChannel);
    if (paymentChannel) supabase.removeChannel(paymentChannel);
    await supabase.auth.signOut();
    window.location.href = '../login.html';
};

// ============================================
// Vibe Meter Functions
// ============================================

async function loadCurrentEvent() {
    if (!window.supabase) { console.warn('[VibeMeter] Supabase client not ready yet'); return; }
    try {
        console.log('[VibeMeter] Fetching active event...');
        const { data: event, error } = await window.supabase
            .from('events')
            .select('id, name, start_time, end_time, status, is_active')
            .eq('is_active', true)
            .order('start_time', { ascending: true })
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        if (!event) {
            console.log('[VibeMeter] No active event found');
            document.getElementById('vibeEventName').textContent = 'No active events';
            document.getElementById('vibeEventStatus').innerHTML = '<i class="fas fa-calendar-alt"></i> No Event';
            document.getElementById('vibeEventStatus').style.background = '#e5e7eb';
            document.getElementById('vibeEventStatus').style.color = '#6b7280';
            return null;
        }
        console.log('[VibeMeter] Active event loaded:', event.id, event.name);
        currentEventId = event.id;
        document.getElementById('vibeEventName').textContent = event.name;
        const eventDate = new Date(event.start_time);
        document.getElementById('vibeEventDate').textContent = eventDate.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const now = new Date();
        const startTime = new Date(event.start_time);
        const endTime = event.end_time ? new Date(event.end_time) : null;
        const isLive = now >= startTime && (!endTime || now <= endTime);
        const isPast = endTime ? now > endTime : now > startTime;
        if (isLive) {
            document.getElementById('vibeEventStatus').innerHTML = '<i class="fas fa-calendar-day"></i> LIVE NOW';
            document.getElementById('vibeEventStatus').style.background = '#10b981';
            document.getElementById('vibeEventStatus').style.color = 'white';
        } else if (isPast) {
            document.getElementById('vibeEventStatus').innerHTML = '<i class="fas fa-calendar-check"></i> Past Event';
            document.getElementById('vibeEventStatus').style.background = '#9ca3af';
            document.getElementById('vibeEventStatus').style.color = 'white';
        } else {
            document.getElementById('vibeEventStatus').innerHTML = '<i class="fas fa-calendar-alt"></i> Upcoming';
            document.getElementById('vibeEventStatus').style.background = '#f3f4f6';
            document.getElementById('vibeEventStatus').style.color = '#E30613';
        }
        return event;
    } catch (err) {
        console.error('[VibeMeter] Error loading event:', err);
        document.getElementById('vibeEventName').textContent = 'Error loading event';
        return null;
    }
}

async function getTotalTicketsSold(eventId) {
    const { data, error } = await window.supabase
        .from('ticket_types')
        .select('sold')
        .eq('event_id', eventId);
    if (error) { console.error('[VibeMeter] Error getting ticket sales:', error); return 0; }
    const total = data.reduce((total, tt) => total + (tt.sold || 0), 0);
    console.log('[VibeMeter] Total tickets sold for event', eventId, '=', total);
    return total;
}

function updateVibeDisplay(totalSold, checkedIn) {
    let vibePercent = 0;
    if (totalSold > 0) { vibePercent = Math.min(100, Math.round((checkedIn / totalSold) * 100)); }
    const percentSpan   = document.getElementById('vibePercentage');
    const vibeBarFill   = document.getElementById('vibeBarFill');
    const statsSpan     = document.getElementById('vibeStatsText');
    if (percentSpan)   percentSpan.textContent = `${vibePercent}%`;
    if (vibeBarFill) {
        vibeBarFill.style.width = `${vibePercent}%`;
        if (vibePercent < 30)      { vibeBarFill.style.background = 'linear-gradient(90deg, #E30613, #ff6b6b)'; }
        else if (vibePercent < 70) { vibeBarFill.style.background = 'linear-gradient(90deg, #ff8c00, #ffd700)'; }
        else                        { vibeBarFill.style.background = 'linear-gradient(90deg, #10b981, #34d399)'; }
    }
    if (statsSpan) {
        if (vibePercent < 30)      { statsSpan.innerHTML = '😴 Low Energy • Need more people inside!'; }
        else if (vibePercent < 70) { statsSpan.innerHTML = '🎵 Building Up • Getting lively!'; }
        else if (vibePercent < 90) { statsSpan.innerHTML = '🔥 High Energy • The party is on!'; }
        else                        { statsSpan.innerHTML = '⚡ MAXIMUM VIBE • ABSOLUTE MADNESS!'; }
    }
}

async function updateVibeMeter() {
    if (!currentEventId || !window.supabase) { console.warn('[VibeMeter] Skipping update — no event or supabase client'); return; }
    try {
        const totalSold = await getTotalTicketsSold(currentEventId);
        const { count: checkedIn, error: checkError } = await window.supabase
            .from('checkins')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', currentEventId)
            .eq('status', 'valid');
        let checkedInCount = 0;
        if (checkError) {
            console.warn('[VibeMeter] checkins query failed, falling back to tickets.checked_in:', checkError);
            const { count: ticketCheckins, error: ticketError } = await window.supabase
                .from('tickets')
                .select('*', { count: 'exact', head: true })
                .eq('event_id', currentEventId)
                .eq('checked_in', true);
            if (!ticketError) {
                checkedInCount = ticketCheckins || 0;
                console.log('[VibeMeter] Fallback checked-in count:', checkedInCount);
            } else {
                console.error('[VibeMeter] Both checkins and tickets queries failed:', ticketError);
            }
        } else {
            checkedInCount = checkedIn || 0;
            console.log('[VibeMeter] Checked-in count:', checkedInCount, '/ Sold:', totalSold);
        }
        updateVibeDisplay(totalSold, checkedInCount);
    } catch (err) { console.error('[VibeMeter] Error updating vibe meter:', err); }
}

function setupVibeRealtime() {
    if (vibeEventChannel && window.supabase) { window.supabase.removeChannel(vibeEventChannel); vibeEventChannel = null; }
    if (!currentEventId || !window.supabase) return;
    vibeEventChannel = window.supabase.channel(`vibe-${currentEventId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins', filter: `event_id=eq.${currentEventId}` }, async () => { await updateVibeMeter(); })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ticket_types', filter: `event_id=eq.${currentEventId}` }, async () => { await updateVibeMeter(); })
        .subscribe((status) => { console.log('Vibe channel subscription status:', status); });
}

async function initVibeMeter() {
    if (!window.supabase) { console.warn('[VibeMeter] Supabase not ready, retrying in 2s...'); setTimeout(initVibeMeter, 2000); return; }
    console.log('[VibeMeter] Initializing...');
    const event = await loadCurrentEvent();
    if (event) {
        await updateVibeMeter();
        setupVibeRealtime();
        if (vibeUpdateInterval) clearInterval(vibeUpdateInterval);
        vibeUpdateInterval = setInterval(updateVibeMeter, 30000);
        console.log('[VibeMeter] Init complete, polling every 30s');
    } else {
        console.log('[VibeMeter] No event to initialize meter for');
    }
}

window.debugVibeMeter = async function() {
    console.log('=== VIBE METER DEBUG ===');
    console.log('Supabase available:', !!window.supabase);
    if (window.supabase) {
        const { data: events, error: eventsError } = await window.supabase.from('events').select('id, name, start_time, is_active').eq('is_active', true);
        console.log('Active events:', events); console.log('Events error:', eventsError);
        if (currentEventId) { const { count } = await window.supabase.from('checkins').select('*', { count: 'exact' }).eq('event_id', currentEventId); console.log(`Checkins for event ${currentEventId}:`, count); }
        const { data: ticketTypes } = await window.supabase.from('ticket_types').select('event_id, name, sold');
        console.log('Ticket types sales:', ticketTypes);
    }
    console.log('Current event ID:', currentEventId); console.log('=== END DEBUG ===');
};

// ============================================
// Smart Greeting
// ============================================

const greetings = [
    { text: "Wamkelekile,", time: "any" },
    { text: "Molo,", time: "any" },
    { text: "Sawubona,", time: "any" },
    { text: "Molweni,", time: "any" },
    { text: "Sanibonani,", time: "any" },
    { text: "Hello,", time: "any" },
    { text: "Hi there,", time: "any" },
    { text: "Hey,", time: "any" },
    { text: "Welcome,", time: "any" },
    { text: "Welcome back,", time: "any" },
    { text: "Good morning,", time: "morning" },
    { text: "Good afternoon,", time: "afternoon" },
    { text: "Good evening,", time: "evening" },
    { text: "It's great to see you,", time: "any" },
    { text: "Happy to have you back,", time: "any" },
    { text: "Welcome to Rands,", time: "any" },
    { text: "Thanks for reaching out,", time: "any" },
];

function getSmartGreeting() {
    const hour = new Date().getHours();
    let timeOfDay = 'any';
    
    if (hour < 12) timeOfDay = 'morning';
    else if (hour < 17) timeOfDay = 'afternoon';
    else if (hour < 21) timeOfDay = 'evening';
    else timeOfDay = 'any';
    
    const filtered = greetings.filter(g => g.time === timeOfDay || g.time === 'any');
    const available = filtered.length > 0 ? filtered : greetings.filter(g => g.time === 'any');
    
    return available[Math.floor(Math.random() * available.length)].text;
}

function updateGreeting() {
    const greetingEl = document.querySelector('.greeting');
    if (greetingEl) {
        greetingEl.textContent = getSmartGreeting();
    }
}

// ============================================
// Card Interactions
// ============================================

const cardStage = document.getElementById('cardStage');
let flipped = false;

if (cardStage) {
    cardStage.addEventListener('click', (e) => {
        e.stopPropagation();
        flipped = !flipped;
        cardStage.classList.toggle('flipped', flipped);
        if (flipped) {
            cardStage.style.animation = 'none';
        } else {
            setTimeout(() => {
                cardStage.style.animation = 'floatCard 4s ease-in-out infinite';
            }, 300);
        }
    });
}

const flipperElem = document.getElementById('cardFlipper');

if (cardStage && flipperElem) {
    cardStage.addEventListener('pointermove', (e) => {
        const rect = cardStage.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * 100;
        const py = ((e.clientY - rect.top) / rect.height) * 100;
        cardStage.style.setProperty('--mx', px + '%');
        cardStage.style.setProperty('--my', py + '%');
        if (flipped) return;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / (rect.width / 2);
        const dy = (e.clientY - cy) / (rect.height / 2);
        flipperElem.style.transform = `rotateY(${dx * 8}deg) rotateX(${-dy * 6}deg)`;
    });
    
    cardStage.addEventListener('pointerleave', () => {
        cardStage.style.setProperty('--mx', '50%');
        cardStage.style.setProperty('--my', '35%');
        if (flipped) return;
        flipperElem.style.transform = '';
    });
}

const cardFrontElem = document.getElementById('cardFront');
const cardBackElem = document.getElementById('cardBack');
let pressTimer = null;

function randomFrontGradient() {
    const hue1 = Math.floor(Math.random() * 360);
    const hue2 = (hue1 + 40 + Math.random() * 100) % 360;
    const hue3 = (hue2 + 30 + Math.random() * 80) % 360;
    const hue4 = (hue1 + 180) % 360;
    const hue5 = (hue2 + 210) % 360;
    const sat1 = 60 + Math.random() * 32;
    const sat2 = 55 + Math.random() * 32;
    const sat3 = 60 + Math.random() * 28;
    const lit1 = 25 + Math.random() * 28;
    const lit2 = 20 + Math.random() * 22;
    const lit3 = 15 + Math.random() * 24;
    return `linear-gradient(135deg, hsl(${hue1}, ${sat1}%, ${lit1}%) 0%, hsl(${hue2}, ${sat2}%, ${lit2}%) 25%, hsl(${hue3}, ${sat3}%, ${lit3}%) 50%, hsl(${hue4}, ${sat1 - 10}%, ${lit1 - 5}%) 75%, hsl(${hue5}, ${sat2 - 5}%, ${lit2 - 4}%) 100%)`;
}

function randomBackGradient() {
    const hueA = Math.floor(Math.random() * 360);
    const hueB = (hueA + 50) % 360;
    const hueC = (hueB + 70) % 360;
    return `linear-gradient(135deg, hsl(${hueA}, 68%, 10%) 0%, hsl(${hueB}, 62%, 16%) 30%, hsl(${hueC}, 72%, 8%) 55%, hsl(${(hueA + 120) % 360}, 68%, 12%) 80%, hsl(${(hueB + 90) % 360}, 65%, 6%) 100%)`;
}

function randomizeCardColors() {
    if (!cardFrontElem || !cardBackElem) return;
    const newFront = randomFrontGradient();
    const newBack = randomBackGradient();
    cardFrontElem.style.background = newFront;
    cardBackElem.style.background = newBack;
    if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(30);
    if (cardStage) {
        cardStage.style.filter = 'drop-shadow(0 0 12px rgba(220, 60, 80, 0.8))';
        setTimeout(() => {
            if (cardStage) cardStage.style.filter = '';
        }, 200);
    }
    const burstElem = document.getElementById('cardBurst');
    if (burstElem) {
        burstElem.classList.remove('play');
        void burstElem.offsetWidth;
        burstElem.classList.add('play');
    }
    
    // Refresh artwork
    addLuxuryCardArtwork();
}

function startLongPress(e) {
    if (flipped) return;
    pressTimer = setTimeout(() => {
        randomizeCardColors();
        if (cardStage) cardStage.classList.add('long-press-active');
        setTimeout(() => {
            if (cardStage) cardStage.classList.remove('long-press-active');
        }, 280);
    }, 380);
}

function cancelLongPress() {
    if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
    }
    if (cardStage) cardStage.classList.remove('long-press-active');
}

if (cardStage) {
    cardStage.addEventListener('mousedown', startLongPress);
    cardStage.addEventListener('mouseup', cancelLongPress);
    cardStage.addEventListener('mouseleave', cancelLongPress);
    cardStage.addEventListener('touchstart', startLongPress, { passive: false });
    cardStage.addEventListener('touchend', cancelLongPress);
    cardStage.addEventListener('touchcancel', cancelLongPress);
}

// ============================================
// Card Artwork Generator
// ============================================

function addLuxuryCardArtwork() {
    function getArtworkContainer(parent) {
        let container = parent.querySelector('.card-artwork');
        if (!container) {
            container = document.createElement('div');
            container.className = 'card-artwork';
            parent.insertBefore(container, parent.firstChild);
        }
        return container;
    }
    
    function generateRandomArtworkSVG() {
        const viewBox = "0 0 100 100";
        const elements = [];
        const count = Math.floor(Math.random() * 8) + 5;
        const palettes = ['rgba(255,255,255,0.2)', 'rgba(255,215,0,0.25)', 'rgba(227,6,19,0.2)', 'rgba(255,255,255,0.35)', 'rgba(255,180,40,0.2)', 'rgba(200,220,255,0.15)'];
        for (let i = 0; i < count; i++) {
            const cx = Math.random() * 100, cy = Math.random() * 100, rx = Math.random() * 18 + 6, ry = Math.random() * 14 + 4;
            const strokeColor = palettes[Math.floor(Math.random() * palettes.length)], strokeWidth = Math.random() * 1.5 + 0.6, rotate = Math.random() * 360;
            const fill = Math.random() > 0.7 ? `rgba(255,255,255,0.05)` : 'none';
            elements.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rotate} ${cx} ${cy})" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="${fill}" stroke-linecap="round" />`);
        }
        for (let i = 0; i < 4; i++) {
            const cx = Math.random() * 100, cy = Math.random() * 100, r = Math.random() * 20 + 10;
            const start = Math.random() * 360, end = start + 60 + Math.random() * 120;
            elements.push(`<path d="M ${cx + r * Math.cos(start * Math.PI/180)} ${cy + r * Math.sin(start * Math.PI/180)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(end * Math.PI/180)} ${cy + r * Math.sin(end * Math.PI/180)}" stroke="rgba(255,255,255,0.25)" stroke-width="1.2" fill="none" />`);
        }
        for (let i = 0; i < 12; i++) {
            const cx = Math.random() * 100, cy = Math.random() * 100;
            elements.push(`<circle cx="${cx}" cy="${cy}" r="${Math.random() * 1.5 + 0.5}" fill="rgba(255,215,0,0.4)" />`);
        }
        return `<svg viewBox="${viewBox}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${elements.join('')}</svg>`;
    }
    
    function refreshArtwork() {
        const front = document.getElementById('cardFront');
        const back = document.getElementById('cardBack');
        if (front) getArtworkContainer(front).innerHTML = generateRandomArtworkSVG();
        if (back) getArtworkContainer(back).innerHTML = generateRandomArtworkSVG();
    }
    
    refreshArtwork();
}

// ============================================
// Refund Feature
// ============================================

let submittingRefund = false;

function initRefundFeature() {
    const refundModalOverlay = document.getElementById('refundModalOverlay');
    const submitBtn = document.getElementById('refundSubmitBtn');
    const cancelBtn = document.getElementById('refundCancelBtn');
    
    if (cancelBtn && !cancelBtn.hasAttribute('data-refund-cancel')) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (refundModalOverlay) refundModalOverlay.classList.remove('active');
        });
        cancelBtn.setAttribute('data-refund-cancel', 'true');
    }
    
    if (!submitBtn || submitBtn.hasAttribute('data-refund-listener')) return;
    submitBtn.setAttribute('data-refund-listener', 'true');
    
    submitBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (submittingRefund) return;
        
        const amountInput = document.getElementById('refundAmount');
        const orderIdInput = document.getElementById('refundOrderId');
        const reasonSelect = document.getElementById('refundReason');
        const amount = parseFloat(amountInput?.value);
        const orderId = orderIdInput?.value?.trim();
        const reason = reasonSelect?.value;
        
        if (!amount || amount <= 0) {
            showAlert('Please enter a valid refund amount.');
            return;
        }
        if (!orderId) {
            showAlert('Please enter Order ID.');
            return;
        }
        if (!reason) {
            showAlert('Please select a reason.');
            return;
        }
        
        submittingRefund = true;
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;
        
        try {
            const { error: insertError } = await window.supabase.rpc('request_refund', {
                p_order_id: orderId,
                p_amount: amount,
                p_reason: reason
            });
            if (insertError) throw insertError;
            showAlert('✅ Refund request submitted!');
            if (amountInput) amountInput.value = '';
            if (orderIdInput) orderIdInput.value = '';
            if (reasonSelect) reasonSelect.value = '';
            if (refundModalOverlay) refundModalOverlay.classList.remove('active');
        } catch (err) {
            console.error(err);
            showAlert('❌ Failed to submit refund request.');
        } finally {
            submittingRefund = false;
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}

function showAlert(message) {
    const alertModal = document.getElementById('alertModalOverlay');
    const alertBody = document.querySelector('#alertModalOverlay .alert-modal-body');
    if (alertModal && alertBody) {
        alertBody.innerHTML = message;
        alertModal.classList.add('active');
    } else alert(message);
}

// ============================================
// Event Listeners
// ============================================

document.getElementById('profileIconBtn')?.addEventListener('click', () => window.location.href = 'profile.html');
document.getElementById('logoutBtn')?.addEventListener('click', performLogout);
document.getElementById('acceptRequestBtn')?.addEventListener('click', acceptPayment);
document.getElementById('rejectRequestBtn')?.addEventListener('click', rejectPayment);
document.getElementById('closePopupBtn')?.addEventListener('click', () => {
    document.getElementById('incomingRequestPopup')?.classList.remove('active');
    currentPaymentId = null;
});

// Service Bar
const vibeHistoryBtn = document.getElementById('vibeHistoryBtn');
if (vibeHistoryBtn) vibeHistoryBtn.addEventListener('click', () => window.location.href = './statement.html');

const buyHereBtn = document.getElementById('buyHereBtn');
const buyHereModal = document.getElementById('buyHereModalOverlay');
const closeBuyHereModal = document.getElementById('closeBuyHereModal');
if (buyHereBtn && buyHereModal) buyHereBtn.addEventListener('click', () => buyHereModal.classList.add('active'));
if (closeBuyHereModal && buyHereModal) closeBuyHereModal.addEventListener('click', () => buyHereModal.classList.remove('active'));
if (buyHereModal) buyHereModal.addEventListener('click', (e) => {
    if (e.target === buyHereModal) buyHereModal.classList.remove('active');
});
document.querySelectorAll('.buyhere-card').forEach(card => {
    card.addEventListener('click', () => {
        const url = card.getAttribute('data-url');
        if (url) {
            document.getElementById('buyHereModalOverlay')?.classList.remove('active');
            window.location.href = url;
        }
    });
});

// Refund Modal
const refundModal = document.getElementById('refundModalOverlay');
const closeRefundModal = document.getElementById('closeRefundModal');
if (closeRefundModal && refundModal) closeRefundModal.addEventListener('click', () => refundModal.classList.remove('active'));
if (refundModal) refundModal.addEventListener('click', (e) => {
    if (e.target === refundModal) refundModal.classList.remove('active');
});

// Top-up & Pay Now
const topUpBtn = document.getElementById('instantTopUpBtn');
const payNowBtn = document.getElementById('payNowBtn');
if (topUpBtn) topUpBtn.addEventListener('click', () => window.location.href = 'deposit.html');
if (payNowBtn) payNowBtn.addEventListener('click', () => window.location.href = 'pay-now.html');

// Festival Banner
const openFestivalBtn = document.getElementById('openFestivalBannerBtn');
if (openFestivalBtn) openFestivalBtn.addEventListener('click', () => window.location.href = './festival-banner.html');

// See All Transactions
document.getElementById('txSeeAllBtn')?.addEventListener('click', () => {
    window.location.href = './statement.html';
});

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    updateGreeting();
    loadUserData();
    // Update greeting every hour
    setInterval(updateGreeting, 3600000);
    
    // Init refund feature
    initRefundFeature();
    
    // Init vibe meter
    setTimeout(initVibeMeter, 1500);
    
    // Add card artwork
    addLuxuryCardArtwork();
});

window.addEventListener('beforeunload', () => {
    if (walletChannel) supabase.removeChannel(walletChannel);
    if (paymentChannel) supabase.removeChannel(paymentChannel);
});