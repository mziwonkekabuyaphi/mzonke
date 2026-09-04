  import { supabase } from '../../config/supabase.js';

  new Vue({
    el: '#app',
    data: {
      cartOpen: false,
      mobileCatOpen: false,
      sidebarMode: 'home', /* 'home' | 'spirits' */
      isMobile: window.innerWidth < 768,
      checkingOut: false,
      checkoutMsg: 'Preparing your order...',
      searchQuery: '',
      activeCategory: (new URLSearchParams(window.location.search)).get('category') || 'all',
      loadingProducts: true,
      loadingEvents: false,
      loadingTicketTypes: false,
      products: [],
      eventsList: [],
      ticketTypes: [],
      cart: [],
      productModalOpen: false,
      selectedProduct: null,
      modalQty: 1,
      eventModalOpen: false,
      selectedEvent: null,
      toastVisible: false,
      toastMessage: '',
      toastType: 'success',
      toastIcon: 'fas fa-check-circle',
      heroIndex: 0,
      heroSlides: [
        { eyebrow: 'BUTCHER SHOP', title: 'Fresh. Flame. Flavour.', desc: 'Hand-selected cuts cooked to perfection', cta: 'Order Now', action: 'butcher', bgImage: '../assets/images/butcher-kiosk-banner.png' },
        { eyebrow: 'PREMIUM SPIRITS', title: 'Khayelitsha Vibes', desc: 'Curated selection of premium spirits', cta: 'Explore', action: 'spirits', bgImage: '../assets/images/vibe-kiosk-banner.png' },
        { eyebrow: 'UPCOMING EVENTS', title: 'The Next Big Vibe', desc: 'Secure your spot before it sells out', cta: 'Get Tickets', action: 'tickets', bgImage: '../assets/images/event-kiosk-banner.png' }
      ],
      _heroTimer: null,
    },
    computed: {
      cartItemCount() { return this.cart.reduce((s, i) => s + i.quantity, 0); },
      cartTotal() { return this.cart.reduce((s, i) => s + i.price * i.quantity, 0); },
      /* ── SPIRITS CHILD CATEGORIES ── */
      spiritsChildCategories() {
        return [
  { id: 'cognac',  name: 'Cognac',  icon: 'fas fa-wine-glass-alt' },
  { id: 'whiskey', name: 'Whiskey', icon: 'fas fa-whiskey-glass' },
  { id: 'vodka',   name: 'Vodka',   icon: 'fas fa-glass-cheers' },
  { id: 'tequila', name: 'Tequila', icon: 'fas fa-martini-glass' }, // Best choice
  { id: 'liqueur', name: 'Liqueur', icon: 'fas fa-cocktail' },
  { id: 'gin',     name: 'Gin',     icon: 'fas fa-seedling' },
];
      },
      /* ── HOME SIDEBAR TOP-LEVEL ── */
      homeSidebarCategories() {
        return [
          { id: 'all',           name: 'All Items',       icon: 'fas fa-border-all' },
          { id: 'beers',         name: 'Beers',           icon: 'fas fa-beer-mug-empty' },
          { id: 'champagne',     name: 'Champagne',       icon: 'fas fa-champagne-glasses' },
          { id: 'ciders',        name: 'Ciders',          icon: 'fas fa-apple-alt' },
          { id: 'soft drinks',   name: 'Soft Drinks',     icon: 'fas fa-droplet' },
          { id: 'sparkling wine',name: 'Sparkling Wine',  icon: 'fas fa-wine-bottle' },
          { id: 'premium-spirits', name: 'Premium Spirits', icon: 'fas fa-glass-whiskey', isParent: true },
          { id: 'butcher',       name: 'The Butcher',     icon: 'fas fa-utensils' },
          { id: 'tickets',       name: 'Event Tickets',   icon: 'fas fa-ticket-alt' },
        ];
      },
      /* Legacy flat list (used by toolbar chips, category name lookups, etc.) */
      mainCategories() {
        return [
  { id: 'all',            name: 'All Items',      icon: 'fas fa-border-all' },
  { id: 'beers',          name: 'Beers',          icon: 'fas fa-beer-mug-empty' },
  { id: 'champagne',      name: 'Champagne',      icon: 'fas fa-champagne-glasses' },
  { id: 'ciders',         name: 'Ciders',         icon: 'fas fa-apple-whole' },
  { id: 'cognac',         name: 'Cognac',         icon: 'fas fa-wine-glass' },
  { id: 'gin',            name: 'Gin',            icon: 'fas fa-martini-glass' },
  { id: 'liqueur',        name: 'Liqueur',        icon: 'fas fa-glass-cheers' },
  { id: 'soft drinks',    name: 'Soft Drinks',    icon: 'fas fa-glass-water' },
  { id: 'sparkling wine', name: 'Sparkling Wine', icon: 'fas fa-wine-bottle' },
  { id: 'tequila',        name: 'Tequila',        icon: 'fas fa-martini-glass' },
  { id: 'vodka',          name: 'Vodka',          icon: 'fas fa-whiskey-glass' },
  { id: 'whiskey',        name: 'Whiskey',        icon: 'fas fa-whiskey-glass' },
  { id: 'butcher',        name: 'The Butcher',    icon: 'fas fa-drumstick-bite' },
  { id: 'tickets',        name: 'Event Tickets',  icon: 'fas fa-ticket' },
];
      },
      activeCategoryName() { const c = this.mainCategories.find(c => c.id === this.activeCategory); return c ? c.name : 'All Items'; },
      filteredProducts() {
        let list = this.products;
        if (this.activeCategory !== 'all') list = list.filter(p => (p.category || '').toLowerCase() === this.activeCategory.toLowerCase());
        if (this.searchQuery.trim()) { const q = this.searchQuery.toLowerCase(); list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)); }
        return list;
      },
    },
    async mounted() {
      const saved = localStorage.getItem('rands_kiosk_cart');
      if (saved) { try { this.cart = JSON.parse(saved); localStorage.removeItem('rands_kiosk_cart'); } catch(e){} }
      window.addEventListener('resize', () => { this.isMobile = window.innerWidth < 768; });
      this._heroTimer = setInterval(() => { this.heroIndex = (this.heroIndex + 1) % this.heroSlides.length; }, 10000);
      await this.loadProducts();
      await this.loadEvents();
    },
    methods: {
      formatPrice(n) { return Number(n).toFixed(2); },
      formatEventDate(d) { return d ? new Date(d).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'; },
      showToast(msg, type = 'success') { this.toastMessage = msg; this.toastType = type; this.toastIcon = type === 'error' ? 'fas fa-exclamation-triangle' : 'fas fa-check-circle'; this.toastVisible = true; setTimeout(() => this.toastVisible = false, 3000); },
      getEventBannerImage(e) { return e?.banner_url || e?.image_url || e?.image || '../assets/images/event-banner.png'; },
      handleEventImageError(e) { if (e.banner_url !== '../assets/images/event-banner.png') e.banner_url = '../assets/images/event-banner.png'; },
      async loadProducts() { this.loadingProducts = true; try { const { data } = await supabase.from('products').select('*'); this.products = (data || []).map(p => ({ ...p, price: p.price || 0, category: p.category, description: p.description })); } catch(e) { console.warn(e); } finally { this.loadingProducts = false; } },
      async loadEvents() { this.loadingEvents = true; try { const { data } = await supabase.from('events').select('*').eq('is_active', true).eq('status', 'active'); this.eventsList = data || []; for (const ev of this.eventsList) { const { data: tix } = await supabase.from('ticket_types').select('price').eq('event_id', ev.id).order('price').limit(1); ev.min_price = tix?.[0]?.price || ev.base_price || 0; } } catch(e) { console.error(e); } finally { this.loadingEvents = false; } },
      async openEventModal(e) { this.selectedEvent = e; this.eventModalOpen = true; this.loadingTicketTypes = true; try { const { data } = await supabase.from('ticket_types').select('*').eq('event_id', e.id); this.ticketTypes = data || []; } catch(e) { this.ticketTypes = []; } finally { this.loadingTicketTypes = false; } },
      closeEventModal() { this.eventModalOpen = false; this.selectedEvent = null; this.ticketTypes = []; },
      addTicketToCart(t) { const item = { id: t.id, name: `${this.selectedEvent.name} - ${t.name}`, price: t.price, quantity: 1, image: this.getEventBannerImage(this.selectedEvent), event_id: this.selectedEvent.id, ticket_type_id: t.id, itemType: 'ticket' }; const existing = this.cart.find(i => i.id === t.id && i.event_id === this.selectedEvent.id); if (existing) existing.quantity++; else this.cart.push(item); this.showToast(`${t.name} ticket added!`); this.closeEventModal(); this.cartOpen = true; },
      addToCartInternal(p, q) { const existing = this.cart.find(i => i.id === p.id && i.itemType !== 'ticket'); if (existing) existing.quantity += q; else this.cart.push({ ...p, quantity: q, itemType: 'menu' }); this.showToast(`${p.name} added`); },
      updateCartQty(i, n) { if (n <= 0) this.cart = this.cart.filter(ii => ii !== i); else i.quantity = n; },
      removeCartItem(i) { this.cart = this.cart.filter(ii => ii !== i); },
      startCheckout() { if (this.cartItemCount === 0) return this.showToast('Cart empty', 'error'); localStorage.setItem('rands_kiosk_cart', JSON.stringify(this.cart)); this.checkingOut = true; this.checkoutMsg = 'Preparing order...'; setTimeout(() => { this.checkoutMsg = 'Redirecting to payment...'; }, 900); setTimeout(() => { window.location.href = 'payment.html'; }, 1600); },
      cartQty(id) { const i = this.cart.find(i => i.id === id && i.itemType !== 'ticket'); return i ? i.quantity : 0; },
      productCountByCategory(cid) { return this.products.filter(p => (p.category || '').toLowerCase() === cid.toLowerCase()).length; },
      enterSpiritsMode() {
        this.sidebarMode = 'spirits';
        /* Auto-select cognac as a default if nothing spirit is active */
        const spiritIds = ['cognac','whiskey','vodka','tequila','liqueur','gin'];
        if (!spiritIds.includes(this.activeCategory)) {
          this.activeCategory = 'cognac';
          this.searchQuery = '';
        }
      },
      exitSpiritsMode() {
        this.sidebarMode = 'home';
        this.activeCategory = 'all';
        this.searchQuery = '';
      },
      selectCategory(id) { this.activeCategory = id; this.searchQuery = ''; this.mobileCatOpen = false; },
      resetToHome() { this.activeCategory = 'all'; this.searchQuery = ''; this.sidebarMode = 'home'; },
      openProductModal(p) { this.selectedProduct = p; this.modalQty = 1; this.productModalOpen = true; },
      addModalToCart() { if (this.selectedProduct) this.addToCartInternal(this.selectedProduct, this.modalQty); this.productModalOpen = false; this.cartOpen = true; },
      quickAddToCart(p) { this.addToCartInternal(p, 1); },
      stepUp(p) { const ex = this.cart.find(i => i.id === p.id && i.itemType !== 'ticket'); if (ex) ex.quantity++; else this.addToCartInternal(p, 1); },
      stepDown(p) { const ex = this.cart.find(i => i.id === p.id && i.itemType !== 'ticket'); if (ex) { if (ex.quantity > 1) ex.quantity--; else this.cart = this.cart.filter(i => i !== ex); } },
      quickHeroAction() { const a = this.heroSlides[this.heroIndex].action; if (a === 'butcher') this.activeCategory = 'butcher'; else if (a === 'spirits') this.activeCategory = 'spirits'; else if (a === 'tickets') this.activeCategory = 'tickets'; },
      goBackToStart() { window.location.href = 'kiosk-start.html'; },
    },
    beforeDestroy() { if (this._heroTimer) clearInterval(this._heroTimer); }
  });

  // Spawn floating particles — matches kiosk-start
  (function() {
    const c = document.getElementById('particles');
    if (!c) return;
    for (let i = 0; i < 28; i++) {
      const e = document.createElement('div');
      e.className = 'pt';
      e.style.cssText = `left:${Math.random()*100}%;width:${1+Math.random()*2.2}px;height:${1+Math.random()*2.2}px;background:${Math.random()>0.5?'#E30613':'rgba(255,255,255,0.25)'};--d:${8+Math.random()*13}s;--dl:${-(Math.random()*16)}s;--sx:${Math.random()*80-40}px`;
      c.appendChild(e);
    }
  })();
