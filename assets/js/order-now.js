  // NOTE: path adjusted for this file's new location (assets/js/order-now.js).
  // Originally this was inline in passport/order-now.html, where
  // '../config/supabase.js' reached <root>/config/supabase.js. From
  // assets/js/, reaching the same <root>/config/supabase.js needs one more
  // '../' — if your actual folder layout differs, this is the only line
  // that needs adjusting.
  import { supabase } from '../../config/supabase.js';
  Vue.config.productionTip = false;

  new Vue({
    el: '#app',
    data: {
      searchQuery: '',
      activeCategory: 'all',
      activeSub: 'vodka',
      products: [],
      loadingProducts: true,
      cart: [],
      pendingQtys: {},
      loggedInUser: null,
      userId: null,
      userPhone: '',
      userName: '',
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
      currentCheckoutAttemptId: null,
      // Business hours — shared by generateTimeSlots() and isBusinessOpen so
      // the "open now" gate and the schedule picker's slot window can never
      // drift apart.
      OPEN_HOUR: 12,
      CLOSE_HOUR: 22,
      // Ticks forward every 30s purely to force isBusinessOpen (and any
      // button bound to it) to re-evaluate live — without this, a customer
      // who has the page open right as closing time hits would still see
      // "Collect Now" enabled until their next unrelated re-render.
      nowTick: Date.now(),
    },
    computed: {
      cartItemCount() { return this.cart.reduce((s,i)=>s+i.quantity,0); },
      cartTotal() { return this.cart.reduce((s,i)=>s+i.price*i.quantity,0); },
      filteredProducts() {
        let list = this.products;
        if (this.activeCategory !== 'all') {
          if (this.activeCategory === 'spirits') list = list.filter(p => p.category === this.activeSub);
          else {
            const cat = this.mainCategories.find(c => c.id === this.activeCategory);
            const dbCats = cat ? cat.dbCategories : [this.activeCategory];
            list = list.filter(p => dbCats.includes(p.category));
          }
        }
        if (this.searchQuery) list = list.filter(p => p.name.toLowerCase().includes(this.searchQuery.toLowerCase()));
        return list;
      },
      // NOTE: these ids used to be 'beer'/'wine'/'non-alc' etc, which never
      // matched anything — actual products.category values in the DB are
      // 'beers', 'ciders', 'champagne', 'sparkling wine', 'cognac', 'gin',
      // 'liqueur', 'tequila', 'vodka', 'whiskey', 'soft drinks', 'butcher'.
      // Every tab except Butcher was silently showing zero products.
      //
      // 'shisha' has no tab on purpose — shisha is handled by its own
      // separate system, not through this products table/menu.
      mainCategories() {
        return [
          { id:'all', name:'All', icon:'fas fa-border-all', dbCategories: [] },
          { id:'beer', name:'Beer & Cider', icon:'fas fa-beer-mug-empty', dbCategories: ['beers','ciders'] },
          { id:'wine', name:'Wine & Bubbly', icon:'fas fa-wine-glass', dbCategories: ['champagne','sparkling wine'] },
          { id:'spirits', name:'Spirits', icon:'fas fa-crown', dbCategories: ['cognac','gin','liqueur','tequila','vodka','whiskey'] },
          { id:'soft drinks', name:'Non-Alc', icon:'fas fa-droplet', dbCategories: ['soft drinks'] },
          { id:'butcher', name:'Butcher', icon:'fas fa-utensils', dbCategories: ['butcher'] }
        ];
      },
      spiritSubs() {
        return [
          { id:'vodka', name:'Vodka', icon:'fas fa-snowflake' },
          { id:'whiskey', name:'Whiskey', icon:'fas fa-whiskey-glass' },
          { id:'gin', name:'Gin', icon:'fas fa-martini-glass' },
          { id:'cognac', name:'Cognac', icon:'fas fa-wine-bottle' },
          { id:'tequila', name:'Tequila', icon:'fas fa-pepper-hot' },
          { id:'liqueur', name:'Liqueur', icon:'fas fa-flask' }
        ];
      },
      currentCategoryLabel() {
        if (this.searchQuery) return 'Search Results';
        if (this.activeCategory === 'all') return 'All Items';
        if (this.activeCategory === 'spirits') return 'Spirits: '+this.activeSub;
        const c = this.mainCategories.find(c=>c.id===this.activeCategory);
        return c ? c.name : '';
      },
      // True only between OPEN_HOUR and CLOSE_HOUR, same-day. Both checkout
      // buttons (Collect Now + Schedule Later) bind to this in the template
      // — outside these hours the venue takes no orders at all, immediate
      // or scheduled, so both go disabled together rather than just hiding
      // the "now" option.
      isBusinessOpen() {
        void this.nowTick; // dependency so this recomputes on the timer tick below
        const now = new Date();
        const hour = now.getHours() + now.getMinutes() / 60;
        return hour >= this.OPEN_HOUR && hour < this.CLOSE_HOUR;
      }
    },
    async mounted() {
      await this.initAuthAndWallet();
      await this.loadProductsFromSupabase();
      this.generateTimeSlots();
      this.startPollingOrders();
      // Keeps isBusinessOpen (and the two checkout buttons bound to it) live
      // across the open/close boundary without needing a page refresh.
      setInterval(() => { this.nowTick = Date.now(); }, 30000);
    },
    methods: {
      formatPrice(n) { return Number(n).toFixed(2); },
      getQty(id) { return this.pendingQtys[id] || 0; },
      incrementQty(p) { this.$set(this.pendingQtys, p.id, (this.pendingQtys[p.id]||0) + 1); },
      decrementQty(p) { let q = this.pendingQtys[p.id]||0; if (q>0) this.$set(this.pendingQtys, p.id, q-1); },
      
      // Vendor here is only for the cart UI (grouping/labels + the tracker
      // modal's icon logic below) — the authoritative vendor/product_type
      // used to actually create the order is recomputed server-side inside
      // place_web_order() from the live product row, so a stale cart can
      // never write a wrong/stale value.
      addToCart(p) {
        let qty = this.pendingQtys[p.id] || 1;
        let vendor = (p.category === 'butcher') ? 'The Butcher Shop' : 'Rands Smart Counter';
        let existing = this.cart.find(i => i.id === p.id && i.vendor === vendor);
        if (existing) existing.quantity += qty;
        else this.cart.push({ ...p, quantity: qty, vendor });
        this.$set(this.pendingQtys, p.id, 0);
        this.showToast(`${p.name} added`);
      },

      // --- cart editing (view / remove / adjust quantity before checkout) ---
      openCartModal() { this.cartModalVisible = true; },
      closeCartModal() { this.cartModalVisible = false; },
      incrementCartItem(item) { item.quantity += 1; },
      decrementCartItem(item) {
        if (item.quantity > 1) { item.quantity -= 1; return; }
        // Quantity would drop to 0 — same as removing the line entirely.
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
      goHome() { window.location.href = 'home.html'; },
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
        if (!session) { this.showToast('Please login first'); setTimeout(() => { window.location.href = 'login.html'; }, 1500); return; }
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
          .select('id, phone, name')
          .eq('auth_user_id', session.user.id)
          .maybeSingle();
        if (profileError || !profile) {
          console.error(profileError);
          this.showToast('Could not load your profile — please try logging in again');
          setTimeout(() => { window.location.href = 'login.html'; }, 1500);
          return;
        }
        this.userId = profile.id;
        this.userPhone = profile.phone || '';
        this.userName = profile.name || '';
        this.userEmail = session.user.email || session.user.user_metadata?.full_name || 'Customer';
        await this.fetchWalletBalance();
      },
      async fetchWalletBalance() {
        if (!this.userId) return 0;
        const { data, error } = await supabase.from('wallets').select('balance, status, block_reason').eq('user_id', this.userId).maybeSingle();
        if (error) console.error(error);
        this.walletBalance = data?.balance ?? 0;
        // Same check as tickets.js's initAuth: a wallet with status
        // 'blocked' (set by admin) must stop purchases here too — this
        // page previously never looked at status/block_reason at all, so a
        // blocked wallet could still buy, defeating the block entirely.
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

      // Same-day only, and only slots that haven't passed yet. Used to build
      // a static 12:00-22:00 list regardless of the current time, so at (say)
      // 3pm the dropdown still offered 12:00/1:00/2:00 — picking one of those
      // used to silently roll scheduleLater() into TOMORROW at that hour,
      // which is wrong: this venue doesn't take next-day bookings. "Today
      // orders end today" — a past slot is filtered out entirely, never
      // offered and never rolled forward.
      generateTimeSlots() {
        const MIN_LEAD_MINUTES = 15;

        const now = new Date();
        const earliest = new Date(now.getTime() + MIN_LEAD_MINUTES * 60000);

        let times = [];
        for (let h = this.OPEN_HOUR; h <= this.CLOSE_HOUR; h++) {
          for (const m of h === this.CLOSE_HOUR ? [0] : [0, 30]) {
            const slot = new Date(now);
            slot.setHours(h, m, 0, 0);
            if (slot >= earliest) times.push(`${h}:${m === 0 ? '00' : '30'}`);
          }
        }
        this.timeSlots = times;
      },

      async startCheckout() {
        if (this.cartItemCount === 0) return;
        if (!this.loggedInUser) { this.showToast('Session expired'); window.location.href = 'login.html'; return; }
        await this.fetchWalletBalance();
        if (this.isWalletBlocked) { this.showToast(this.walletBlockReason); return; }
        const total = this.cartTotal;
        if (this.walletBalance < total) { this.showToast(`Insufficient balance. Available: R${this.formatPrice(this.walletBalance)}`); return; }
        this.pendingTotal = total;
        this.pendingCartSnapshot = [...this.cart];
        this.currentCheckoutAttemptId = crypto.randomUUID();
        // Re-generate here, not just once at mounted() — a customer who
        // loaded the page at noon and checks out at 6pm must not still see
        // noon's now-past slots.
        this.generateTimeSlots();
        this.selectedSlot = null;
        this.collectModalVisible = true;
      },

      // Single atomic call: place_web_order() re-prices every line against
      // the live products table, splits into one order per vendor, writes
      // both orders.items (so booze/butcher shop-floor screens can see it)
      // and order_items (for customer-facing tracking), and debits the
      // wallet — all inside one Postgres transaction. If anything fails
      // partway (bad product, insufficient funds, etc.) NOTHING is
      // written, including the wallet debit — this replaces the old
      // deduct-then-insert sequence that could leave someone charged with
      // no order if a later step failed.
      //
      // p_payment_attempt_id makes retries safe: if this call is
      // resubmitted (e.g. flaky connection) with the same attempt id, the
      // DB returns the original result instead of charging twice.
      async processOrderDeductionAndCreate(scheduledFor = null) {
        if (!this.pendingCartSnapshot.length) throw new Error('Cart empty');
        const attemptId = this.currentCheckoutAttemptId || (this.currentCheckoutAttemptId = crypto.randomUUID());
        const items = this.pendingCartSnapshot.map(item => ({ product_id: item.id, quantity: item.quantity }));

        const { data, error } = await supabase.rpc('place_web_order', {
          p_items: items,
          p_scheduled_for: scheduledFor,
          p_payment_attempt_id: attemptId
        });
        if (error) throw new Error(this.friendlyCheckoutError(error.message));

        this.currentCheckoutAttemptId = null;
        this.cart = [];
        this.pendingCartSnapshot = [];
        this.collectModalVisible = false;
        if (typeof data?.wallet_balance === 'number') this.walletBalance = data.wallet_balance;
        // scheduledFor is a UTC ISO string (correct for storage — see
        // scheduleLater's .toISOString()) but showing that raw string to the
        // customer displayed the wrong-looking hour (2 hours "behind" in
        // SAST/UTC+2). new Date(...).toLocaleTimeString() converts it back
        // to the browser's local time for display, same moment either way.
        const scheduledLabel = scheduledFor
          ? new Date(scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : null;
        this.showToast(scheduledLabel ? `Order scheduled for ${scheduledLabel}` : 'Order placed!');
        await this.fetchWalletBalance();
        this.openTrackModal();
      },
      friendlyCheckoutError(msg) {
        if (!msg) return 'Something went wrong, please try again';
        if (msg.includes('INSUFFICIENT_FUNDS')) return 'Insufficient wallet balance';
        if (msg.includes('WALLET_BLOCKED')) return msg.split('WALLET_BLOCKED:')[1]?.trim() || 'Your wallet is blocked';
        if (msg.includes('PRODUCT_UNAVAILABLE')) return `No longer available: ${msg.split('PRODUCT_UNAVAILABLE:')[1]?.trim() || 'an item in your cart'}`;
        if (msg.includes('PRODUCT_NOT_FOUND')) return 'An item in your cart no longer exists';
        if (msg.includes('CART_EMPTY')) return 'Your cart is empty';
        return msg;
      },

      async collectNow() {
        // Backstop for the disabled button — covers a modal left open
        // across the closing-time boundary, or the button being reached
        // some other way than a live-bound click.
        if (!this.isBusinessOpen) { this.showToast("We're closed right now — please check back during business hours"); return; }
        try { await this.processOrderDeductionAndCreate(null); } catch (err) { this.showToast(`Payment failed: ${err.message}`); await this.fetchWalletBalance(); }
      },
      async scheduleLater() {
        if (!this.isBusinessOpen) { this.showToast("We're closed right now — please check back during business hours"); return; }
        if (!this.selectedSlot) { this.showToast('Select a time slot'); return; }
        const now = new Date();
        const [hour, minute] = this.selectedSlot.split(':').map(Number);
        const scheduledDate = new Date(now);
        scheduledDate.setHours(hour, minute, 0, 0);
        // Defensive re-check, not a fallback path: generateTimeSlots() should
        // never have offered a past slot in the first place, but if this modal
        // was left open across the cutoff (e.g. it was 2:50 when opened, it's
        // 3:05 now), the previously-valid "3:00" selection is now stale.
        // Reject outright — same-day only, never roll into tomorrow.
        if (scheduledDate <= now) {
          this.showToast("That time's already passed — please pick a later slot");
          this.generateTimeSlots();
          this.selectedSlot = null;
          return;
        }
        try { await this.processOrderDeductionAndCreate(scheduledDate.toISOString()); this.selectedSlot = null; } catch (err) { this.showToast(`Scheduling failed: ${err.message}`); await this.fetchWalletBalance(); }
      },
      closeCollectModal() { this.collectModalVisible = false; this.pendingCartSnapshot = []; this.currentCheckoutAttemptId = null; },

      async fetchUserActiveOrders() {
        if (!this.userId) return [];
        const { data, error } = await supabase.from('orders').select(`*, order_items(*)`).eq('user_id', this.userId).in('status', ['pending', 'placed', 'preparing', 'ready']).order('created_at', { ascending: false });
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
          let activeIdx = (order.status === 'pending' || order.status === 'placed') ? 0 : (order.status === 'preparing' ? 1 : 2);
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
      startPollingOrders() { setInterval(() => { if (this.trackModalVisible) this.renderTrackModal(); }, 3500); },
      openTrackModal() {
        if (!this.loggedInUser) return;
        this.trackModalVisible = true;
        document.getElementById('trackModal').classList.add('open');
        this.renderTrackModal();
        if (window.tvInterval) clearInterval(window.tvInterval);
        window.tvInterval = setInterval(() => { if (this.trackModalVisible) this.renderTrackModal(); }, 3000);
      },
      closeTrackModal() {
        this.trackModalVisible = false;
        document.getElementById('trackModal').classList.remove('open');
        if (window.tvInterval) clearInterval(window.tvInterval);
      }
    }
  });
