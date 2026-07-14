    import { supabase } from '../../config/supabase.js';
    window.supabase = supabase;
    
    // ============================================
    // REFACTORED PAYMENT REQUEST SYSTEM
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
    
    let currentWalletStatus = null; // 'blocked' | 'active' | null

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

    const showToast = (message, isError = false) => {
        const toast = DOM.toast();
        if (toast) {
            toast.textContent = message;
            toast.style.background = isError ? '#E30613' : '#1a1a2e';
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        } else alert(message);
    };
    
    const formatBalanceCompact = (amount) => {
        const abs = Math.abs(amount);
        if (abs >= 1_000_000) return `R ${(amount / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
        if (abs >= 100_000)   return `R ${(amount / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
        return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    };

    const updateBalance = (newBalance) => {
        const full = `R ${newBalance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
        const compact = formatBalanceCompact(newBalance);
        if (DOM.balance()) { DOM.balance().textContent = compact; DOM.balance().title = full; }
        if (DOM.shishaBalance()) { DOM.shishaBalance().textContent = compact; DOM.shishaBalance().title = full; }
    };
    window.updateUserBalance = updateBalance;
    
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
    
    // ============================================
    // Payment Listener
    // ============================================
    
    let paymentChannel = null;
    let currentPaymentId = null;
    let isProcessingPayment = false;
    
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
            
            let { data: userProfile, error: profileError } = await supabase
                .from('profiles')
                .select('id')
                .eq('auth_user_id', session.user.id)
                .maybeSingle();
            if (!userProfile) {
                const fb = await supabase.from('profiles').select('id').eq('id', session.user.id).maybeSingle();
                userProfile = fb.data;
                profileError = fb.error;
            }
            if (profileError || !userProfile) throw new Error('Could not find user profile');

            const { data: wallet, error: walletError } = await supabase
                .from('wallets')
                .select('id, balance, status')
                .eq('user_id', userProfile.id)
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
                .eq('user_id', userProfile.id);
            if (updateWalletError) throw new Error('Failed to update Rands Passport Credit');
            
            const { error: transactionError } = await supabase
                .from('wallet_transactions')
                .insert({
                    wallet_id: wallet.id,
                    user_id: userProfile.id,
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
                .eq('user_id', userProfile.id)
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
    
    // ============================================
    // Wallet and user state management
    // ============================================
    
    let currentWalletRowId = null;
    let walletChannel = null;
    
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
    
    // ── Recent Transactions ──────────────────────────────────────────
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

    const performLogout = async () => {
        if (walletChannel) supabase.removeChannel(walletChannel);
        if (paymentChannel) supabase.removeChannel(paymentChannel);
        await supabase.auth.signOut();
        window.location.href = '../login.html';
    };
    
    const loadUserData = async () => {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
            if (DOM.userName()) DOM.userName().textContent = 'Guest';
            if (DOM.cardHolder()) DOM.cardHolder().textContent = 'GUEST';
            if (DOM.cardNumber()) DOM.cardNumber().textContent = '•••• •••• •••• ••••';
            return;
        }
        
        // NOTE: profiles.id is NOT guaranteed to equal the auth session id.
        // Customers registered via WhatsApp (see lib/services/customer.ts /
        // registration.ts) get their profile row created with a DB-generated
        // id *before* any auth user exists; the auth user is only linked
        // afterwards via profiles.auth_user_id. Customers registered via this
        // web flow have profiles.id === auth.users.id. Looking up by
        // auth_user_id (with an id-based fallback for older rows) covers both.
        let { data: profile, error: pErr } = await supabase
            .from('profiles')
            .select('id, name, surname, phone, card_number, card_cvv')
            .eq('auth_user_id', session.user.id)
            .maybeSingle();

        if (pErr) console.error('Profile fetch error:', pErr);

        if (!profile) {
            // Fallback for profiles where id === auth id (legacy/web-registered rows).
            const fallback = await supabase
                .from('profiles')
                .select('id, name, surname, phone, card_number, card_cvv')
                .eq('id', session.user.id)
                .maybeSingle();
            if (fallback.error) console.error('Profile fetch fallback error:', fallback.error);
            profile = fallback.data;
        }

        // Profiles store name/surname separately — there is no full_name
        // column on this table (selecting one used to 400 the whole query
        // and silently break the balance lookup below — see profileId).
        const derivedFullName = profile && (profile.name || profile.surname)
            ? [profile.name, profile.surname].filter(Boolean).join(' ')
            : null;

        const fullName = derivedFullName || session.user.user_metadata?.full_name ||
            [session.user.user_metadata?.name, session.user.user_metadata?.surname].filter(Boolean).join(' ') ||
            'Member';

        // profile.id (the profiles table PK) is what wallets.user_id and all
        // other profile-linked lookups below actually reference — never
        // session.user.id directly. See wallet.ts: "profiles.id -> wallets.user_id".
        const profileId = profile?.id || session.user.id;
        const firstName = fullName.split(' ')[0];
        if (DOM.userName()) DOM.userName().textContent = firstName;
        if (DOM.cardHolder()) DOM.cardHolder().textContent = fullName.toUpperCase();
        
        const phone = profile?.phone || session.user.user_metadata?.phone || '';
        
        try {
            const cardNumber = await getOrCreateCardNumber(profileId);
            if (DOM.cardNumber()) DOM.cardNumber().textContent = formatCardNumber(cardNumber);
        } catch (err) { console.error('Card number error:', err); }
        
        try {
            const cvv = await getOrCreateCvv(profileId);
            if (DOM.cardCvv()) DOM.cardCvv().textContent = cvv;
        } catch (err) { console.error('CVV error:', err); }
        
        const { data: wallet, error: wErr } = await supabase
            .from('wallets')
            .select('id, balance, status')
            .eq('user_id', profileId)
            .maybeSingle();
        if (wErr) console.warn('Wallet query error:', wErr);
        updateBalance((wallet && typeof wallet.balance === 'number') ? wallet.balance : 0);

        applyWalletStatusUI(wallet?.status || null);
        if (currentWalletStatus === 'blocked') {
            showToast('Your Passport is blocked. Contact support for assistance.', true);
        }

       // Show phone number on card back + draw barcode from wallet UUID
if (wallet?.id) {
    // Get the user's phone number from profile
    const phone = profile?.phone || session.user.user_metadata?.phone || '';
    const formattedPhone = phone ? formatPhoneNumber(phone) : 'No phone number';
    if (DOM.phoneDisplay()) DOM.phoneDisplay().textContent = `Passport ID: ${formattedPhone}`;
    generateBarcodeFromId(wallet.id);
    currentWalletRowId = wallet.id;
    setupWalletRealtime();
    loadRecentTransactions(wallet.id);
}
        
        if (profileId) {
            await setupPaymentListener(session.user.id, profileId);
        } else {
            console.error('No profile ID found for payment listener');
        }
    };
    
    // ... existing code ...

document.getElementById('profileIconBtn')?.addEventListener('click', () => window.location.href = 'profile.html');
document.getElementById('logoutBtn')?.addEventListener('click', performLogout);
document.getElementById('acceptRequestBtn')?.addEventListener('click', acceptPayment);
document.getElementById('rejectRequestBtn')?.addEventListener('click', rejectPayment);
document.getElementById('closePopupBtn')?.addEventListener('click', () => {
    document.getElementById('incomingRequestPopup')?.classList.remove('active');
    currentPaymentId = null;
});

// ============================================
// SMART RANDOM GREETING
// ============================================

const greetings = [
    // Local
    { text: "Wamkelekile,", time: "any" },
    { text: "Molo,", time: "any" },
    { text: "Sawubona,", time: "any" },
    { text: "Molweni,", time: "any" },
    { text: "Sanibonani,", time: "any" },

    // Friendly
    { text: "Hello,", time: "any" },
    { text: "Hi there,", time: "any" },
    { text: "Hey,", time: "any" },
    { text: "Welcome,", time: "any" },
    { text: "Welcome back,", time: "any" },

    // Time-based
    { text: "Good morning,", time: "morning" },
    { text: "Good afternoon,", time: "afternoon" },
    { text: "Good evening,", time: "evening" },

    // Concierge style
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
// UPDATED DOMContentLoaded
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    updateGreeting();
    loadUserData();
    // Update greeting every hour
    setInterval(updateGreeting, 3600000);
});

window.addEventListener('beforeunload', () => {
    if (walletChannel) supabase.removeChannel(walletChannel);
    if (paymentChannel) supabase.removeChannel(paymentChannel);
});
