// ===== Constants =====
// Supabase is imported via module import from config

// ===== State =====
// Vue.js handles the reactive state within the component

// ===== Vue Application =====
import { supabase } from '../config/supabase.js';

window.supabase = supabase;

new Vue({
    el: '#app',

    // ===== Data =====
    data() {
        return {
            walletBalance: 0,
            currentStep: 1,
            topupAmount: 0,
            customAmount: null,
            customMode: false,
            presets: [50, 100, 150, 200, 500],
            selectedPayMethod: 'yoco',
            requestTargetId: '',
            requestNote: '',
            previewRef: '',
            currentRequestId: null,
            voucherCode: '',
            capitecNumber: '',
            sending: false,
            processing: false,
            waitingModalOpen: false,
            remainingSeconds: 120,
            approvalTimer: null,
            toastVisible: false,
            toastMessage: '',
            toastType: '',
            toastIcon: '',
            toastTimer: null,
            realtimeChannel: null,
            yocoProcessing: false
        };
    },

    // ===== Lifecycle Hooks =====
    async mounted() {
        document.getElementById('homeIconBtn').addEventListener('click', () => window.location.href = 'home.html');
        await this.loadUserBalance();
        this.previewRef = this.generateRef();
        this.setupRealtimeListener();

        // Handle Yoco payment callback
        const urlParams = new URLSearchParams(window.location.search);
        const paymentStatus = urlParams.get('payment');
        const txId = urlParams.get('transaction_id');
        if (paymentStatus === 'success' && txId) {
            await this.completeYocoTopUp(txId);
            window.history.replaceState({}, '', window.location.pathname);
        } else if (paymentStatus === 'cancel') {
            this.showToast('Payment was cancelled', 'info');
            window.history.replaceState({}, '', window.location.pathname);
        } else if (paymentStatus === 'failed') {
            this.showToast('Payment failed. Please try again.', 'error');
            window.history.replaceState({}, '', window.location.pathname);
        }
    },

    beforeDestroy() {
        if (this.approvalTimer) clearInterval(this.approvalTimer);
        if (this.realtimeChannel) this.realtimeChannel.unsubscribe();
    },

    // ===== Methods =====

    // ---- Utility ----
    formatPrice(n) {
        return Number(n || 0).toFixed(2);
    },

    formatTime(s) {
        const m = Math.floor(s / 60);
        return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
    },

    generateRef() {
        return Date.now().toString().slice(-8).toUpperCase();
    },

    showToast(msg, type = 'info') {
        if (this.toastTimer) clearTimeout(this.toastTimer);
        const icons = { success: 'fas fa-check-circle', error: 'fas fa-exclamation-circle', info: 'fas fa-info-circle' };
        this.toastMessage = msg;
        this.toastType = type;
        this.toastIcon = icons[type] || icons.info;
        this.toastVisible = true;
        this.toastTimer = setTimeout(() => {
            this.toastVisible = false;
        }, 3500);
    },

    // ---- Balance ----
    async loadUserBalance() {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
            this.showToast("Please log in first", "error");
            setTimeout(() => window.location.href = '../login.html', 1500);
            return;
        }
        const { data: wallet, error: walletErr } = await supabase.from('wallets').select('balance').eq('user_id', session.user.id).maybeSingle();
        if (!walletErr && wallet) this.walletBalance = wallet.balance;
        else this.walletBalance = 0;
    },

    // ---- Amount Selection ----
    selectPreset(amount) {
        this.topupAmount = amount;
        this.customAmount = null;
        this.customMode = false;
    },

    onCustomAmount() {
        if (this.customAmount > 0) {
            this.topupAmount = this.customAmount;
            this.customMode = true;
        }
    },

    goToStep2() {
        if (this.topupAmount < 5) {
            this.showToast('Minimum top-up is R5', 'error');
            return;
        }
        this.previewRef = this.generateRef();
        this.currentStep = 2;
    },

    // ---- Wallet Request ----
    proceedWalletStep() {
        if (!this.requestTargetId || this.requestTargetId.length < 5) {
            this.showToast('Enter a valid wallet ID or phone number', 'error');
            return;
        }
        this.currentStep = 3;
    },

    async sendTopupRequest() {
        if (!this.requestTargetId) {
            this.showToast('Please enter a wallet ID', 'error');
            return;
        }
        this.sending = true;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');
            const { data: myWallet } = await supabase.from('wallets').select('id').eq('user_id', session.user.id).single();
            const { error } = await supabase.from('topup_requests').insert({
                requester_wallet_id: myWallet.id,
                target_identifier: this.requestTargetId,
                amount: this.topupAmount,
                note: this.requestNote || null,
                status: 'pending',
                reference: `TU-${this.previewRef}`,
                created_at: new Date().toISOString()
            });
            if (error) throw error;
            this.showToast(`Request sent to ${this.requestTargetId}`, 'success');
            this.startTimer();
        } catch (err) {
            console.error(err);
            this.showToast('Failed to send request', 'error');
        }
        this.sending = false;
    },

    // ---- Timer ----
    startTimer() {
        this.remainingSeconds = 120;
        this.waitingModalOpen = true;
        if (this.approvalTimer) clearInterval(this.approvalTimer);
        this.approvalTimer = setInterval(() => {
            if (this.remainingSeconds > 0) this.remainingSeconds--;
            else this.cancelRequest();
        }, 1000);
    },

    cancelRequest() {
        if (this.approvalTimer) clearInterval(this.approvalTimer);
        this.waitingModalOpen = false;
        this.showToast('Request cancelled or expired', 'error');
    },

    // ---- Complete Top-up ----
    async completeTopup(amount) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data: wallet, error: fetchErr } = await supabase.from('wallets').select('balance').eq('user_id', session.user.id).single();
        if (fetchErr) return;
        const newBalance = wallet.balance + amount;
        await supabase.from('wallets').update({ balance: newBalance }).eq('user_id', session.user.id);
        await supabase.from('wallet_transactions').insert({
            wallet_id: session.user.id,
            amount: amount,
            type: 'deposit',
            description: `Top-up via ${this.selectedPayMethod === '1voucher' ? '1Voucher' : 'CapitecPay'}`,
            status: 'completed',
            created_at: new Date().toISOString()
        });
        this.walletBalance = newBalance;
        this.showToast(`R${amount.toFixed(2)} added!`, 'success');
        setTimeout(() => window.location.href = 'home.html', 2000);
    },

    // ---- 1Voucher ----
    async processVoucherPayment() {
        if (!this.voucherCode.trim()) {
            this.showToast('Enter voucher code', 'error');
            return;
        }
        if (this.topupAmount <= 0) {
            this.showToast('Select an amount first', 'error');
            return;
        }
        this.processing = true;
        try {
            await new Promise(r => setTimeout(r, 1200));
            const valid = this.voucherCode.length >= 8;
            if (!valid) throw new Error('Invalid voucher');
            await this.completeTopup(this.topupAmount);
        } catch (err) {
            this.showToast('Invalid voucher code', 'error');
        }
        this.processing = false;
    },

    // ---- CapitecPay ----
    async processCapitecPay() {
        if (!this.capitecNumber.trim()) {
            this.showToast('Enter Capitec number', 'error');
            return;
        }
        if (this.topupAmount <= 0) {
            this.showToast('Select an amount first', 'error');
            return;
        }
        this.processing = true;
        try {
            await new Promise(r => setTimeout(r, 1500));
            const accepted = Math.random() > 0.1;
            if (!accepted) throw new Error('Payment declined by bank');
            await this.completeTopup(this.topupAmount);
        } catch (err) {
            this.showToast('CapitecPay failed', 'error');
        }
        this.processing = false;
    },

    // ---- Realtime Listener ----
    setupRealtimeListener() {
        this.realtimeChannel = supabase.channel('topup-approvals').on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'topup_requests',
            filter: `status=eq.approved`
        }, async (payload) => {
            const approved = payload.new;
            if (approved.reference === `TU-${this.previewRef}` && this.waitingModalOpen) {
                clearInterval(this.approvalTimer);
                this.waitingModalOpen = false;
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    const { data: wallet } = await supabase.from('wallets').select('balance').eq('user_id', session.user.id).single();
                    const newBal = wallet.balance + approved.amount;
                    await supabase.from('wallets').update({ balance: newBal }).eq('user_id', session.user.id);
                    await supabase.from('wallet_transactions').insert({
                        wallet_id: session.user.id,
                        amount: approved.amount,
                        type: 'deposit',
                        description: `Top-up from wallet request (${approved.reference})`,
                        status: 'completed',
                        created_at: new Date().toISOString()
                    });
                    this.walletBalance = newBal;
                    this.showToast(`R${approved.amount.toFixed(2)} added from wallet request!`, 'success');
                    setTimeout(() => window.location.href = 'home.html', 2000);
                }
            }
        }).subscribe();
    },

    // ---- Yoco Payment ----
    async startYocoPayment() {
        if (this.topupAmount <= 0 || this.topupAmount < 5) {
            this.showToast('Please select a valid top-up amount (min R5)', 'error');
            return;
        }
        this.yocoProcessing = true;
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) throw new Error('You must be logged in to make a payment');
            const userId = session.user.id;

            const { data: pendingTx, error: insertError } = await supabase
                .from('wallet_transactions')
                .insert({
                    user_id: userId,
                    amount: this.topupAmount,
                    type: 'topup',
                    status: 'pending',
                    provider: 'yoco',
                    direction: 'credit',
                    description: `Yoco card top-up: R${this.formatPrice(this.topupAmount)}`,
                    created_at: new Date().toISOString(),
                    metadata: { payment_method: 'yoco_card' }
                })
                .select('id')
                .single();

            if (insertError) throw new Error('Could not initialize payment. Please try again.');
            const transactionId = pendingTx.id;
            const amountCents = Math.round(this.topupAmount * 100);

            const folderUrl = window.location.origin + window.location.pathname.replace(/[^/]+$/, '');
            const successUrl = `${folderUrl}payment-success.html?payment=success&transaction_id=${transactionId}`;
            const cancelUrl = `${window.location.origin}${window.location.pathname}?payment=cancel`;
            const failureUrl = `${window.location.origin}${window.location.pathname}?payment=failed`;

            const { data: edgeResponse, error: edgeError } = await supabase.functions.invoke('yoco-create-checkout', {
                body: {
                    amount_cents: amountCents,
                    transaction_id: transactionId,
                    currency: 'ZAR',
                    success_url: successUrl,
                    cancel_url: cancelUrl,
                    failure_url: failureUrl
                }
            });

            if (edgeError) {
                console.error('Edge function error:', edgeError);
                await supabase.from('wallet_transactions').update({
                    status: 'failed',
                    metadata: { error: edgeError.message }
                }).eq('id', transactionId);
                throw new Error(edgeError.message || 'Payment gateway error');
            }

            const checkoutUrl = edgeResponse?.checkout_url;
            if (!checkoutUrl) throw new Error('Invalid response from payment gateway');
            window.location.href = checkoutUrl;
        } catch (err) {
            console.error('Yoco payment initiation error:', err);
            this.showToast(err.message || 'Payment initiation failed', 'error');
            this.yocoProcessing = false;
        }
    },

    async completeYocoTopUp(transactionId) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not logged in');

            const { data: tx, error: txError } = await supabase
                .from('wallet_transactions')
                .select('*')
                .eq('id', transactionId)
                .single();

            if (txError || !tx) throw new Error('Transaction not found');
            if (tx.status === 'completed') {
                await this.loadUserBalance();
                return;
            }

            await supabase.from('wallet_transactions').update({ status: 'completed' }).eq('id', transactionId);

            const { data: wallet } = await supabase.from('wallets').select('balance').eq('user_id', session.user.id).single();
            const newBalance = (wallet?.balance || 0) + tx.amount;
            await supabase.from('wallets').update({ balance: newBalance }).eq('user_id', session.user.id);

            this.walletBalance = newBalance;
            this.showToast(`R${tx.amount.toFixed(2)} added to your wallet!`, 'success');
            setTimeout(() => window.location.href = 'home.html', 2000);
        } catch (err) {
            console.error('Complete top-up error:', err);
            this.showToast('Payment verified but failed to update wallet. Contact support.', 'error');
        }
    }
});