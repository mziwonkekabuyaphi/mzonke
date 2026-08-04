import { supabase } from '../../config/supabase.js';
import { navigate } from '../js/router.js';
import { loadScriptOnce } from '../js/lazy-load.js';

// Unlike the other converted pages, this one does NOT keep module-scope
// state across navigate-away-and-back. Vue owns a real DOM tree rooted at
// #orderApp, and the router replaces that DOM entirely on every navigation
// — so the Vue instance has to be destroyed and rebuilt fresh each visit
// (its $el would otherwise point at nodes that no longer exist). Practical
// effect: the cart empties if you leave the order page and come back,
// same as it always did on a full page reload in the old multi-page app —
// not a regression, just worth knowing since every other converted page
// in this app deliberately keeps its state warm.
let vueInstance = null;
let pollInterval = null;   // was a bare setInterval in mounted(), never cleared — see init()
let trackInterval = null;  // was window.tvInterval — see openTrackModal/closeTrackModal

function loadVue() {
    return loadScriptOnce('https://unpkg.com/vue@2/dist/vue.js', () => !!window.Vue);
}

export default {
    async init() {
        await loadVue();
        window.Vue.config.productionTip = false;

        vueInstance = new window.Vue({
            el: '#orderApp',
            data: {
                searchQuery: '',
                activeCategory: 'all',
                activeSub: 'rum',
                products: [],
                loadingProducts: true,
                cart: [],
                pendingQtys: {},
                loggedInUser: null,
                userId: null,
                userEmail: '',
                walletBalance: 0,
                isWalletBlocked: false,
                walletBlockReason: '',
                collectModalVisible: false,
                cartModalVisible: false,
                pendingTotal: 0,
                pendingCartSnapshot: [],
                timeSlots: [],
                selectedSlot: null,
                trackModalVisible: false,
            },
            computed: {
                cartItemCount() { return this.cart.reduce((s,i)=>s+i.quantity,0); },
                cartTotal() { return this.cart.reduce((s,i)=>s+i.price*i.quantity,0); },
                filteredProducts() {
                    let list = this.products;
                    if (this.activeCategory !== 'all') {
                        if (this.activeCategory === 'spirits') list = list.filter(p => p.category === this.activeSub);
                        else list = list.filter(p => p.category === this.activeCategory);
                    }
                    if (this.searchQuery) list = list.filter(p => p.name.toLowerCase().includes(this.searchQuery.toLowerCase()));
                    return list;
                },
                mainCategories() {
                    return [
                        { id:'all', name:'All', icon:'fas fa-border-all' },
                        { id:'beer', name:'Beer', icon:'fas fa-beer-mug-empty' },
                        { id:'wine', name:'Wine', icon:'fas fa-wine-glass' },
                        { id:'spirits', name:'Spirits', icon:'fas fa-crown' },
                        { id:'non-alc', name:'Non-Alc', icon:'fas fa-droplet' },
                        { id:'butcher', name:'Butcher', icon:'fas fa-utensils' }
                    ];
                },
                spiritSubs() {
                    return [{ id:'rum', name:'Rum', icon:'fas fa-umbrella-beach' },{ id:'vodka', name:'Vodka', icon:'fas fa-snowflake' },{ id:'whisky', name:'Whisky', icon:'fas fa-whiskey-glass' },{ id:'cognac', name:'Cognac', icon:'fas fa-wine-bottle' }];
                },
                currentCategoryLabel() {
                    if (this.searchQuery) return 'Search Results';
                    if (this.activeCategory === 'all') return 'All Items';
                    if (this.activeCategory === 'spirits') return 'Spirits: '+this.activeSub;
                    const c = this.mainCategories.find(c=>c.id===this.activeCategory);
                    return c ? c.name : '';
                }
            },
            async mounted() {
                await this.initAuthAndWallet();
                await this.loadProductsFromSupabase();
                this.generateTimeSlots();
                this.startPollingOrders();
            },
            methods: {
                formatPrice(n) { return Number(n).toFixed(2); },
                getQty(id) { return this.pendingQtys[id] || 0; },
                incrementQty(p) { this.$set(this.pendingQtys, p.id, (this.pendingQtys[p.id]||0) + 1); },
                decrementQty(p) { let q = this.pendingQtys[p.id]||0; if (q>0) this.$set(this.pendingQtys, p.id, q-1); },

                mapCategoryToProductType(category) {
                    const map = { 'beer':'beer', 'wine':'wine', 'spirits':'spirits', 'butcher':'butcher', 'non-alc':'food' };
                    return map[category] || 'other';
                },

                addToCart(p) {
                    let qty = this.pendingQtys[p.id] || 1;
                    let vendor = (p.category === 'butcher') ? 'The Butcher Shop' : 'Rands Smart Counter';
                    let product_type = this.mapCategoryToProductType(p.category);
                    let existing = this.cart.find(i => i.id === p.id && i.vendor === vendor);
                    if (existing) existing.quantity += qty;
                    else this.cart.push({ ...p, quantity: qty, vendor, product_type });
                    this.$set(this.pendingQtys, p.id, 0);
                    this.showToast(`${p.name} added`);
                },

                openCartModal() { this.cartModalVisible = true; },
                closeCartModal() { this.cartModalVisible = false; },
                incrementCartItem(item) { item.quantity += 1; },
                decrementCartItem(item) {
                    if (item.quantity > 1) { item.quantity -= 1; return; }
                    this.removeCartItem(item);
                },
                removeCartItem(item) {
                    const idx = this.cart.findIndex(i => i === item);
                    if (idx === -1) return;
                    this.cart.splice(idx, 1);
                    this.showToast(`${item.name} removed`);
                },
                checkoutFromCartModal() {
                    this.cartModalVisible = false;
                    this.startCheckout();
                },

                selectCategory(id) { this.activeCategory = id; this.searchQuery = ''; },
                // Was window.location.href = 'home.html' — router.navigate()
                // does an in-SPA transition instead of a full page reload.
                goHome() { navigate('home'); },
                showToast(msg) {
                    let toast = document.getElementById('globalToast');
                    toast.innerText = msg;
                    toast.classList.add('show');
                    setTimeout(() => toast.classList.remove('show'), 2500);
                },
                getProductImage(product) { return (product.image && product.image.trim()) ? product.image : 'https://placehold.co/300x200?text=No+Image'; },
                handleImageError(event) { event.target.src = 'https://placehold.co/300x200?text=No+Image'; },

                async initAuthAndWallet() {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session) { this.showToast('Please login first'); setTimeout(() => { window.location.href = '../login.html'; }, 1500); return; }
                    this.loggedInUser = session.user;
                    // IMPORTANT: wallets.user_id and orders.user_id both reference
                    // profiles.id, NOT auth.users.id (session.user.id) — these are
                    // different UUIDs for the same person. Using session.user.id
                    // directly here silently matched no wallet row for any customer
                    // (wallet balance always read back as 0, "Insufficient balance"
                    // even with real funds; order history always empty too), and
                    // would have caused every order insert below to fail its
                    // orders.user_id -> profiles.id foreign key outright.
                    const { data: profile, error: profileError } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('auth_user_id', session.user.id)
                        .maybeSingle();
                    if (profileError || !profile) {
                        console.error(profileError);
                        this.showToast('Could not load your profile — please try logging in again');
                        setTimeout(() => { window.location.href = '../login.html'; }, 1500);
                        return;
                    }
                    this.userId = profile.id;
                    this.userEmail = session.user.email || session.user.user_metadata?.full_name || 'Customer';
                    await this.fetchWalletBalance();
                },
                async fetchWalletBalance() {
                    if (!this.userId) return 0;
                    const { data, error } = await supabase.from('wallets').select('balance, status, block_reason').eq('user_id', this.userId).maybeSingle();
                    if (error) console.error(error);
                    this.walletBalance = data?.balance ?? 0;
                    this.isWalletBlocked = (data?.status || '').toLowerCase() === 'blocked';
                    this.walletBlockReason = data?.block_reason || 'Your wallet has been blocked. Please contact support for assistance.';
                    return this.walletBalance;
                },

                async loadProductsFromSupabase() {
                    this.loadingProducts = true;
                    try {
                        const { data, error } = await supabase.from('products').select('*').eq('is_available', true).order('name');
                        if (error) throw error;
                        this.products = data || [];
                    } catch (err) { console.error(err); this.showToast('Failed to load menu'); this.products = []; }
                    finally { this.loadingProducts = false; }
                },

                generateTimeSlots() {
                    let times = [];
                    for (let h=12; h<=22; h++) { times.push(`${h}:00`); if (h !== 22) times.push(`${h}:30`); }
                    this.timeSlots = times;
                },

                async startCheckout() {
                    if (this.cartItemCount === 0) return;
                    if (!this.loggedInUser) { this.showToast('Session expired'); window.location.href = '../login.html'; return; }
                    await this.fetchWalletBalance();
                    if (this.isWalletBlocked) { this.showToast(this.walletBlockReason); return; }
                    const total = this.cartTotal;
                    if (this.walletBalance < total) { this.showToast(`Insufficient balance. Available: R${this.formatPrice(this.walletBalance)}`); return; }
                    this.pendingTotal = total;
                    this.pendingCartSnapshot = [...this.cart];
                    this.collectModalVisible = true;
                },

                async processOrderDeductionAndCreate(scheduledFor = null) {
                    if (!this.pendingCartSnapshot.length) throw new Error('Cart empty');
                    const total = this.pendingTotal;
                    const { data: newBalance, error: deductError } = await supabase.rpc('deduct_wallet_balance', { p_user_id: this.userId, p_amount: total });
                    if (deductError) throw new Error(deductError.message);
                    this.walletBalance = newBalance;

                    const ordersByVendor = {};
                    this.pendingCartSnapshot.forEach(item => { if (!ordersByVendor[item.vendor]) ordersByVendor[item.vendor] = []; ordersByVendor[item.vendor].push(item); });
                    const isScheduled = !!scheduledFor;

                    for (const [vendor, items] of Object.entries(ordersByVendor)) {
                        const orderTotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                        const { data: orderData, error: orderError } = await supabase
                            .from('orders')
                            .insert({
                                user_id: this.userId,
                                total: orderTotal,
                                status: isScheduled ? 'scheduled' : 'pending',
                                payment_method: 'wallet',
                                payment_status: 'paid',
                                scheduled_for: isScheduled ? scheduledFor : null,
                                vendor: vendor,
                                order_number: 'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 10000)
                            })
                            .select()
                            .single();
                        if (orderError) throw new Error(`Order insert failed: ${orderError.message}`);

                        const orderItems = items.map(item => ({
                            order_id: orderData.id,
                            product_type: item.product_type,
                            product_id: String(item.id),
                            product_name: item.name,
                            quantity: Number(item.quantity),
                            unit_price: Number(item.price),
                            subtotal: Number(item.price) * Number(item.quantity)
                        }));
                        const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
                        if (itemsError) throw new Error(`Order items insert failed: ${itemsError.message}`);
                    }
                    this.cart = [];
                    this.pendingCartSnapshot = [];
                    this.collectModalVisible = false;
                    this.showToast(scheduledFor ? `Order scheduled for ${scheduledFor}` : 'Order placed!');
                    await this.fetchWalletBalance();
                    this.openTrackModal();
                },

                async collectNow() { try { await this.processOrderDeductionAndCreate(null); } catch (err) { this.showToast(`Payment failed: ${err.message}`); await this.fetchWalletBalance(); } },
                async scheduleLater() {
                    if (!this.selectedSlot) { this.showToast('Select a time slot'); return; }
                    const now = new Date();
                    const [hour, minute] = this.selectedSlot.split(':').map(Number);
                    const scheduledDate = new Date(now);
                    scheduledDate.setHours(hour, minute, 0, 0);
                    if (scheduledDate <= now) scheduledDate.setDate(scheduledDate.getDate() + 1);
                    try { await this.processOrderDeductionAndCreate(scheduledDate.toISOString()); this.selectedSlot = null; } catch (err) { this.showToast(`Scheduling failed: ${err.message}`); await this.fetchWalletBalance(); }
                },
                closeCollectModal() { this.collectModalVisible = false; this.pendingCartSnapshot = []; },

                async fetchUserActiveOrders() {
                    if (!this.userId) return [];
                    const { data, error } = await supabase.from('orders').select(`*, order_items(*)`).eq('user_id', this.userId).in('status', ['pending', 'preparing', 'ready']).order('created_at', { ascending: false });
                    if (error) { console.error(error); return []; }
                    return data || [];
                },
                async fetchScheduledOrders() {
                    if (!this.userId) return [];
                    const { data, error } = await supabase.from('orders').select(`*, order_items(*)`).eq('user_id', this.userId).eq('status', 'scheduled').order('scheduled_for', { ascending: true });
                    if (error) return [];
                    return data || [];
                },
                async activatePendingScheduled() {
                    if (!this.userId) return;
                    const now = new Date().toISOString();
                    await supabase.from('orders').update({ status: 'pending', scheduled_for: null }).eq('user_id', this.userId).eq('status', 'scheduled').lt('scheduled_for', now);
                },
                async renderTrackModal() {
                    if (!this.userId || !this.trackModalVisible) return;
                    await this.activatePendingScheduled();
                    const activeOrders = await this.fetchUserActiveOrders();
                    const scheduled = await this.fetchScheduledOrders();
                    const readyCount = activeOrders.filter(o => o.status === 'ready').length;
                    document.getElementById('tvActiveCount').innerText = activeOrders.length;
                    document.getElementById('tvReadyCount').innerText = readyCount;
                    const preparing = activeOrders.find(o => o.status === 'preparing');
                    document.getElementById('tvServing').innerText = preparing ? `#${preparing.order_number}` : '—';
                    let ordersHtml = '';
                    for (const order of activeOrders) {
                        const steps = order.vendor === 'Rands Smart Counter' ? [
                            { key:'pending', label:'Placed', icon:'fas fa-clipboard-list' },
                            { key:'preparing', label:'Ice Bucket', icon:'fas fa-ice-cream' },
                            { key:'ready', label:'Ready', icon:'fas fa-hand-peace' }
                        ] : [
                            { key:'pending', label:'Placed', icon:'fas fa-clipboard-list' },
                            { key:'preparing', label:'Preparing', icon:'fas fa-fire' },
                            { key:'ready', label:'Ready', icon:'fas fa-hand-peace' }
                        ];
                        let activeIdx = order.status === 'pending' ? 0 : (order.status === 'preparing' ? 1 : 2);
                        const itemsList = order.order_items?.map(it => `${it.quantity}x ${it.product_name}`).join(', ') || '';
                        ordersHtml += `<div class="order-card ${order.status === 'ready' ? 'ready-glow' : ''}"><div class="card-header"><span>#${order.order_number}</span><span><i class="fas ${order.vendor === 'Rands Smart Counter' ? 'fa-beer-mug-empty' : 'fa-utensils'}"></i> ${order.vendor === 'Rands Smart Counter' ? 'Smart Counter' : 'Kitchen'}</span><span>${order.status.toUpperCase()}</span></div><div class="timeline"><div class="step-row">${steps.map((s,idx) => `<div class="step ${idx<activeIdx ? 'completed' : (idx===activeIdx ? 'active' : '')}"><div class="step-icon"><i class="${s.icon}"></i></div><div>${s.label}</div></div>`).join('')}</div></div><div style="padding:12px;">${itemsList}<div style="font-weight:bold; margin-top:8px; color:var(--red);">R${order.total.toFixed(2)}</div></div></div>`;
                    }
                    if (activeOrders.length === 0) ordersHtml = '<div class="empty-state">No active orders</div>';
                    document.getElementById('trackOrdersGrid').innerHTML = ordersHtml;
                    let bookedHtml = '';
                    if (scheduled.length) {
                        bookedHtml = `<div style="padding:12px 20px;"><h3 style="display:flex; gap:8px;"><i class="fas fa-calendar-alt" style="color:var(--red);"></i> Scheduled Orders</h3></div><div class="orders-grid">${scheduled.map(b => {
                            const itemsList = b.order_items?.map(it => `${it.quantity}x ${it.product_name}`).join(', ') || '';
                            const scheduledTime = b.scheduled_for ? new Date(b.scheduled_for).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'pending';
                            return `<div class="order-card"><div class="card-header"><span>#${b.order_number}</span><span><i class="fas fa-calendar-alt"></i> ${scheduledTime}</span></div><div style="padding:12px;">${itemsList}<div style="font-weight:bold; margin-top:8px; color:var(--red);">R${b.total.toFixed(2)}</div></div></div>`;
                        }).join('')}</div>`;
                    }
                    document.getElementById('bookedGridSection').innerHTML = bookedHtml;
                },
                // FLAG (fixed, not silent): this was a bare setInterval in the
                // original mounted() with no cleanup anywhere — harmless on a
                // full page reload, but in the SPA it would stack another
                // 3500ms poll on every navigate-away-and-back to this route.
                // Stored on module-scope `pollInterval` and cleared in
                // destroy() below.
                startPollingOrders() {
                    pollInterval = setInterval(() => { if (this.trackModalVisible) this.renderTrackModal(); }, 3500);
                },
                openTrackModal() {
                    if (!this.loggedInUser) return;
                    this.trackModalVisible = true;
                    document.getElementById('trackModal').classList.add('open');
                    this.renderTrackModal();
                    // FLAG (fixed, not silent): was `window.tvInterval` — a real
                    // global. Moved to module-scope `trackInterval` so destroy()
                    // can also catch it if the page is torn down while this
                    // modal happens to be open (the original only cleared it on
                    // closeTrackModal, which never runs if you navigate away
                    // with the modal still up).
                    if (trackInterval) clearInterval(trackInterval);
                    trackInterval = setInterval(() => { if (this.trackModalVisible) this.renderTrackModal(); }, 3000);
                },
                closeTrackModal() {
                    this.trackModalVisible = false;
                    document.getElementById('trackModal').classList.remove('open');
                    if (trackInterval) { clearInterval(trackInterval); trackInterval = null; }
                }
            }
        });
    },

    destroy() {
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        if (trackInterval) { clearInterval(trackInterval); trackInterval = null; }
        if (vueInstance) { vueInstance.$destroy(); vueInstance = null; }
    }
};
