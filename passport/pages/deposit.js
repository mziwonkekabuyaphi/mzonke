import { supabase } from '../../config/supabase.js';
import { loadScriptOnce } from '../js/lazy-load.js';

// NOTE: this is built from the inline <script> inside the uploaded
// deposit.html, NOT the separately-uploaded deposit.js. The two had
// diverged — deposit.js was an older version that credited
// wallets/wallet_transactions directly from the browser on "successful"
// 1Voucher/CapitecPay/wallet-approval events. That's a client-side write
// to balance-affecting tables, which customers shouldn't have — and per
// the comments already in deposit.html, RLS already blocks it, but it was
// still a live fraud *attempt* surface worth not carrying forward. The
// staff/webhook verification. Using that version as the source of truth.

let vueInstance = null;
let isDestroyed = false;

function loadVue() {
    return loadScriptOnce('https://unpkg.com/vue@2/dist/vue.js', () => !!window.Vue);
}

export default {
    async init() {
        isDestroyed = false;
        await loadVue();
        window.Vue.config.productionTip = false;

        vueInstance = new window.Vue({
            el: '#depositApp',
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
                    yocoProcessing: false,
                    profileId: null,
                    walletId: null
                };
            },
            async mounted() {
                // Was document.getElementById('homeIconBtn').addEventListener(...)
                // — dropped, the fragment's home icon uses data-link="home" and
                // the router's global click delegation handles it.
                await this.loadUserBalance();
                this.previewRef = this.generateRef();
                this.setupRealtimeListener();

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
                if (this.toastTimer) clearTimeout(this.toastTimer);
            },
            methods: {
                formatPrice(n) { return Number(n || 0).toFixed(2); },
                formatTime(s) { const m = Math.floor(s / 60); return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`; },
                generateRef() { return Date.now().toString().slice(-8).toUpperCase(); },
                showToast(msg, type = 'info') {
                    if (this.toastTimer) clearTimeout(this.toastTimer);
                    const icons = { success: 'fas fa-check-circle', error: 'fas fa-exclamation-circle', info: 'fas fa-info-circle' };
                    this.toastMessage = msg;
                    this.toastType = type;
                    this.toastIcon = icons[type] || icons.info;
                    this.toastVisible = true;
                    this.toastTimer = setTimeout(() => { this.toastVisible = false; }, 3500);
                },
                // Resolves the current auth session into the profiles.id that
                // wallets.user_id / wallet_transactions.user_id actually
                // reference. Do NOT use session.user.id directly anywhere else
                // in this file — for accounts that linked a second auth method
                // (e.g. Google), the auth ID and the profile ID differ.
                async resolveIdentity() {
                    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                    if (sessionError || !session) {
                        this.showToast("Please log in first", "error");
                        setTimeout(() => window.location.href = '../login.html', 1500);
                        return null;
                    }
                    if (this.profileId && this.walletId) return session;

                    let { data: profile, error: profileErr } = await supabase
                        .from('profiles').select('id').eq('auth_user_id', session.user.id).maybeSingle();
                    if (!profile) {
                        ({ data: profile, error: profileErr } = await supabase
                            .from('profiles').select('id').eq('id', session.user.id).maybeSingle());
                    }
                    if (profileErr || !profile) {
                        this.showToast('Could not load your account. Please log in again.', 'error');
                        return null;
                    }
                    this.profileId = profile.id;

                    const { data: wallet, error: walletErr } = await supabase
                        .from('wallets').select('id, balance').eq('user_id', this.profileId).maybeSingle();
                    if (walletErr || !wallet) {
                        this.showToast('Could not load your wallet.', 'error');
                        return null;
                    }
                    this.walletId = wallet.id;
                    this.walletBalance = wallet.balance;
                    return session;
                },
                async loadUserBalance() {
                    this.profileId = null; this.walletId = null; // force a fresh read of balance
                    const session = await this.resolveIdentity();
                    if (!session) return;
                    const { data: wallet } = await supabase.from('wallets').select('balance').eq('id', this.walletId).maybeSingle();
                    this.walletBalance = wallet ? wallet.balance : 0;
                },
                selectPreset(amount) { this.topupAmount = amount; this.customAmount = null; this.customMode = false; },
                onCustomAmount() { if (this.customAmount > 0) { this.topupAmount = this.customAmount; this.customMode = true; } },
                goToStep2() { if (this.topupAmount < 5) { this.showToast('Minimum top-up is R5', 'error'); return; } this.previewRef = this.generateRef(); this.currentStep = 2; },
                proceedWalletStep() { if (!this.requestTargetId || this.requestTargetId.length < 5) { this.showToast('Enter a valid wallet ID or phone number', 'error'); return; } this.currentStep = 3; },
                async sendTopupRequest() {
                    if (!this.requestTargetId) { this.showToast('Please enter a wallet ID', 'error'); return; }
                    this.sending = true;
                    try {
                        const session = await this.resolveIdentity();
                        if (!session) throw new Error('Not authenticated');
                        const { error } = await supabase.from('topup_requests').insert({
                            requester_wallet_id: this.walletId,
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
                    } catch (err) { console.error(err); this.showToast('Failed to send request', 'error'); }
                    this.sending = false;
                },
                startTimer() {
                    this.remainingSeconds = 120;
                    this.waitingModalOpen = true;
                    if (this.approvalTimer) clearInterval(this.approvalTimer);
                    this.approvalTimer = setInterval(() => { if (this.remainingSeconds > 0) this.remainingSeconds--; else this.cancelRequest(); }, 1000);
                },
                cancelRequest() {
                    if (this.approvalTimer) clearInterval(this.approvalTimer);
                    this.waitingModalOpen = false;
                    this.showToast('Request cancelled or expired', 'error');
                },
                // 1Voucher and CapitecPay have no real verification integration
                // yet — this submits a 'pending' transaction for staff to
                // verify and approve manually, rather than crediting the wallet
                // straight from the browser (see file header note).
                async submitForManualReview(amount, method, details) {
                    const session = await this.resolveIdentity();
                    if (!session) return false;
                    const { error } = await supabase.from('wallet_transactions').insert({
                        user_id: this.profileId,
                        wallet_id: this.walletId,
                        amount: amount,
                        type: 'topup',
                        direction: 'credit',
                        payment_method: method,
                        description: `Top-up via ${method}${details ? ' — ' + details : ''}`,
                        status: 'pending',
                        created_at: new Date().toISOString()
                    });
                    return !error;
                },
                async processVoucherPayment() {
                    if (!this.voucherCode.trim()) { this.showToast('Enter voucher code', 'error'); return; }
                    if (this.topupAmount <= 0) { this.showToast('Select an amount first', 'error'); return; }
                    this.processing = true;
                    const ok = await this.submitForManualReview(this.topupAmount, '1voucher', `code ending ${this.voucherCode.slice(-4)}`);
                    this.processing = false;
                    if (ok) {
                        this.showToast('Voucher submitted — funds will be added once verified.', 'success');
                        // Was window.location.href = 'home.html' — router navigation instead.
                        setTimeout(() => { if (!isDestroyed) window.location.hash = '#/home'; }, 2000);
                    } else {
                        this.showToast('Could not submit voucher. Please try again.', 'error');
                    }
                },
                async processCapitecPay() {
                    if (!this.capitecNumber.trim()) { this.showToast('Enter Capitec number', 'error'); return; }
                    if (this.topupAmount <= 0) { this.showToast('Select an amount first', 'error'); return; }
                    this.processing = true;
                    const ok = await this.submitForManualReview(this.topupAmount, 'capitecpay', this.capitecNumber);
                    this.processing = false;
                    if (ok) {
                        this.showToast('Request submitted — funds will be added once payment is confirmed.', 'success');
                        setTimeout(() => { if (!isDestroyed) window.location.hash = '#/home'; }, 2000);
                    } else {
                        this.showToast('Could not submit request. Please try again.', 'error');
                    }
                },
                setupRealtimeListener() {
                    this.realtimeChannel = supabase.channel('topup-approvals').on('postgres_changes', {
                        event: 'UPDATE', schema: 'public', table: 'topup_requests', filter: `status=eq.approved`
                    }, async (payload) => {
                        const approved = payload.new;
                        if (approved.reference === `TU-${this.previewRef}` && this.waitingModalOpen) {
                            clearInterval(this.approvalTimer);
                            this.waitingModalOpen = false;
                            // Crediting the wallet here was removed in the source
                            // version — customers have no write access to
                            // wallets/wallet_transactions by design, and it was
                            // targeting the wrong id anyway. This just reflects
                            // whatever balance is actually in the database.
                            await this.loadUserBalance();
                            this.showToast(`Request approved! Refreshing your balance...`, 'success');
                            setTimeout(() => { if (!isDestroyed) window.location.hash = '#/home'; }, 2000);
                        }
                    }).subscribe();
                },
                async startYocoPayment() {
                    if (this.topupAmount <= 0 || this.topupAmount < 5) {
                        this.showToast('Please select a valid top-up amount (min R5)', 'error');
                        return;
                    }
                    this.yocoProcessing = true;
                    try {
                        const session = await this.resolveIdentity();
                        if (!session) throw new Error('You must be logged in to make a payment');

                        const { data: pendingTx, error: insertError } = await supabase
                            .from('wallet_transactions')
                            .insert({
                                user_id: this.profileId,
                                wallet_id: this.walletId,
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

                        // Yoco needs a real, publicly reachable success/cancel URL
                        // to redirect back to. In the old multi-page app that was
                        // this page's own file path (deposit.html); in the SPA
                        // everything lives behind index.html + a hash route, so
                        // redirect back to the deposit route with the same query
                        // params mounted() already knows how to read.
                        const baseUrl = `${window.location.origin}${window.location.pathname}`;
                        const successUrl = `${baseUrl}?payment=success&transaction_id=${transactionId}#/deposit`;
                        const cancelUrl = `${baseUrl}?payment=cancel#/deposit`;
                        const failureUrl = `${baseUrl}?payment=failed#/deposit`;

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
                    const session = await this.resolveIdentity();
                    if (!session) return;

                    this.showToast('Confirming your payment...', 'info');
                    const maxAttempts = 10; // ~20s
                    for (let attempt = 0; attempt < maxAttempts; attempt++) {
                        if (isDestroyed) return; // page was navigated away from mid-poll
                        const { data: tx, error: txError } = await supabase
                            .from('wallet_transactions')
                            .select('status, amount')
                            .eq('id', transactionId)
                            .maybeSingle();

                        if (txError || !tx) {
                            this.showToast('Could not find that transaction. Contact support if you were charged.', 'error');
                            return;
                        }
                        if (tx.status === 'completed') {
                            await this.loadUserBalance();
                            this.showToast(`R${Number(tx.amount).toFixed(2)} added to your wallet!`, 'success');
                            setTimeout(() => { if (!isDestroyed) window.location.hash = '#/home'; }, 2000);
                            return;
                        }
                        if (tx.status === 'failed') {
                            this.showToast('Payment did not go through.', 'error');
                            return;
                        }
                        await new Promise(r => setTimeout(r, 2000));
                    }
                    if (!isDestroyed) this.showToast("Payment is still confirming — check your balance shortly. We'll credit it automatically once confirmed.", 'info');
                }
            }
        });
    },

    destroy() {
        isDestroyed = true;
        if (vueInstance) { vueInstance.$destroy(); vueInstance = null; }
    }
};
