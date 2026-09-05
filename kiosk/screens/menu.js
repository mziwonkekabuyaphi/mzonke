/**
 * screens/menu.js
 *
 * Buy & Order / Menu screen for the Rands kiosk SPA.
 *
 * This is a direct migration of the former standalone `kiosk-menu.html`
 * + `kiosk-menu.js` pair into an SPA screen module, following the same
 * pattern established by screens/welcome.js and screens/scanner.js. The
 * markup and Vue 2 app options below are preserved verbatim from the
 * original files -- this is NOT a rewrite, redesign, or refactor of the
 * Menu's business logic, Supabase queries, cart math, ticket flow, or
 * payment/checkout behavior.
 *
 * Unlike Welcome/Scanner, this screen's original implementation is a
 * single Vue 2 app mounted on #app (not vanilla DOM), so on top of the
 * usual html/init/cleanup shape, this module also has to:
 *   - load the Vue 2 CDN build once (via kiosk.js's ensureScript, the
 *     same caching approach ensureStylesheet() already uses for CSS)
 *   - keep a module-scope reference to the mounted Vue instance so
 *     cleanup() can call $destroy() on it (the original page never
 *     needed this, since a full page reload did the teardown for free)
 *   - store the `resize` listener's handler so cleanup() can remove it
 *     (the original inline arrow function had no stored reference)
 *   - spawn floating particles inside init() (guarded by the same
 *     `initialized` flag pattern welcome.js uses) instead of once at
 *     module-import time, so a fresh #particles element gets populated
 *     every time this screen is navigated to, instead of writing into
 *     a node that's about to be discarded by kiosk.js's innerHTML swap
 *
 * The only behavioral change from the original is goBackToStart(),
 * which now calls window.kioskNavigate('welcome') instead of doing a
 * full-page window.location.href='kiosk-start.html' reload -- Welcome
 * is itself now an SPA screen, so the old target no longer exists.
 * Checkout still does a real window.location.href='payment.html', since
 * Payment has not been migrated yet -- left untouched on purpose.
 *
 * The CSS for this screen lives in ./menu.css and is loaded by
 * kiosk.js when this screen is first navigated to, same as every
 * other registered screen.
 */

import { ensureScript } from '../kiosk.js';

export const html = `<div id="bg-canvas"></div>
<div id="particles"></div>
<div id="app" v-cloak>
  <!-- MAIN KIOSK APP -->
  <!-- Renamed from id="kiosk-app" -- that id is also used by the outer
       shell (and, per the shared screen pattern, likely by other screens
       like Welcome). Because kiosk.js's screen loader appends each
       screen's stylesheet without removing the previous one on navigate,
       any left-over #kiosk-app rules from a prior screen's CSS were
       still matching this element and shifting/offsetting the whole
       Menu layout. A screen-specific id makes that impossible. -->
  <div id="menu-kiosk-app">

    <header class="k-header">
      <div class="k-brand" @click="resetToHome">
        <img src="../assets/images/rands-logo2.png" alt="Rands" class="k-logo-img" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' rx=\'20\' fill=\'%23E30613\'/%3E%3Ctext x=\'50\' y=\'65\' font-size=\'40\' text-anchor=\'middle\' fill=\'white\'%3ER%3C/text%3E%3C/svg%3E'">
        <div>
          <div class="k-venue">Rands<span style="color:var(--red);">.</span></div>
          <div class="k-tagline">Self-Service · Order Here</div>
        </div>
      </div>

      <div class="k-search">
        <i class="fas fa-search"></i>
        <input type="text" v-model="searchQuery" placeholder="Search menu... e.g. inyama, beer, whiskey">
        <i class="fas fa-times" v-if="searchQuery" @click="searchQuery=''" style="color:var(--text3);cursor:pointer;font-size:11px;"></i>
      </div>

      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <button class="k-cart-btn" @click="cartOpen = !cartOpen">
          <i class="fas fa-bag-shopping"></i>
          <span class="k-cart-count" v-if="cartItemCount > 0">{{ cartItemCount }}</span>
          <span v-if="cartItemCount > 0">R {{ formatPrice(cartTotal) }}</span>
          <span v-else>Cart</span>
        </button>
        <div class="back-to-home" @click="goBackToStart">
          <i class="fas fa-arrow-left"></i> <span>Back to Main Kiosk</span>
        </div>
      </div>
    </header>

    <div class="k-body">
      <nav class="cat-rail" :class="{'mobile-open': mobileCatOpen}">
        <div class="cat-rail-inner">

          <!-- HOME SIDEBAR MODE -->
          <transition name="sidebar-slide">
            <div v-if="sidebarMode === 'home'" key="home">
              <div v-for="cat in homeSidebarCategories" :key="cat.id"
                   class="cat-item"
                   :class="{active: activeCategory === cat.id, 'cat-parent': cat.isParent}"
                   @click="cat.isParent ? enterSpiritsMode() : selectCategory(cat.id)">
                <i :class="cat.icon"></i>
                <span class="cat-label">{{ cat.name }}</span>
                <i v-if="cat.isParent" class="fas fa-chevron-right parent-arrow"></i>
                <span class="cat-count" v-if="!cat.isParent && cat.id !== 'all' && cat.id !== 'tickets'">{{ productCountByCategory(cat.id) }}</span>
              </div>
            </div>
          </transition>

          <!-- PREMIUM SPIRITS MODE -->
          <transition name="sidebar-slide">
            <div v-if="sidebarMode === 'spirits'" key="spirits">
              <!-- Back button -->
              <div class="cat-back-btn" @click="exitSpiritsMode">
                <i class="fas fa-arrow-left"></i>
                <span class="cat-back-label">All Categories</span>
              </div>
              <!-- Header -->
              <div class="cat-spirits-header">
                <i class="fas fa-glass-whiskey"></i>
                <span class="cat-spirits-title">Premium Spirits</span>
              </div>
              <div class="cat-divider"></div>
              <!-- Spirit children -->
              <div v-for="cat in spiritsChildCategories" :key="cat.id"
                   class="cat-item"
                   :class="{active: activeCategory === cat.id}"
                   @click="selectCategory(cat.id)">
                <i :class="cat.icon"></i>
                <span class="cat-label">{{ cat.name }}</span>
                <span class="cat-count">{{ productCountByCategory(cat.id) }}</span>
              </div>
            </div>
          </transition>

        </div>
      </nav>

      <div class="k-main">
        <div class="k-hero" v-if="activeCategory === 'all' && !searchQuery">
          <div v-for="(slide, idx) in heroSlides" :key="idx"
               class="hero-slide"
               :style="{backgroundImage: \`linear-gradient(90deg,rgba(0,0,0,0.7),rgba(0,0,0,0.25)),url('\${slide.bgImage}')\`, opacity: heroIndex===idx?1:0, zIndex: heroIndex===idx?1:0}">
            <div class="hero-text">
              <div class="hero-eyebrow">{{ slide.eyebrow }}</div>
              <div class="hero-title">{{ slide.title }}</div>
              <div class="hero-sub">{{ slide.desc }}</div>
            </div>
            <button class="hero-cta" @click="quickHeroAction">{{ slide.cta }}</button>
          </div>
          <div class="hero-dots">
            <div v-for="(s,i) in heroSlides" :key="i" class="hdot" :class="{active:heroIndex===i}" @click="heroIndex=i"></div>
          </div>
        </div>

        <div class="k-toolbar">
          <span class="section-label" v-if="activeCategory === 'tickets'">Events</span>
          <span class="section-label" v-else-if="searchQuery">Results for "{{ searchQuery }}"</span>
          <span class="section-label" v-else>{{ activeCategoryName }}</span>

          <template v-if="activeCategory === 'all' && !searchQuery">
            <button class="chip" v-for="cat in mainCategories.slice(1)" :key="cat.id" @click="selectCategory(cat.id)">
              <i :class="cat.icon" style="font-size:10px;"></i> {{ cat.name }}
            </button>
          </template>

          <span class="result-count" v-if="activeCategory !== 'tickets'">{{ filteredProducts.length }} item{{ filteredProducts.length !== 1 ? 's' : '' }}</span>
        </div>

        <div class="k-scroll">
          <div v-if="activeCategory === 'tickets'">
            <div class="k-loading" v-if="loadingEvents"><div class="spinner"></div></div>
            <div class="k-empty" v-else-if="eventsList.length === 0">
              <i class="fas fa-calendar-alt"></i>
              <h3>No events available</h3>
              <p>Check back soon for upcoming events</p>
            </div>
            <div class="events-grid" v-else>
              <div v-for="event in eventsList" :key="event.id" class="event-card" @click="openEventModal(event)">
                <div class="event-img">
                  <img :src="getEventBannerImage(event)" alt="Event" @error="handleEventImageError(event)" loading="lazy">
                  <div class="ev-date-tag"><i class="far fa-calendar-alt"></i> {{ formatEventDate(event.start_time) }}</div>
                </div>
                <div class="event-body">
                  <div class="event-name">{{ event.name }}</div>
                  <div class="event-loc"><i class="fas fa-map-marker-alt"></i> {{ event.location || 'Rands Venue' }}</div>
                  <div class="event-footer">
                    <div class="ev-price"><span>From</span>R {{ formatPrice(event.min_price || 0) }}</div>
                    <button class="ev-btn" @click.stop="openEventModal(event)"><i class="fas fa-ticket-alt"></i> Buy</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else>
            <div class="k-loading" v-if="loadingProducts"><div class="spinner"></div></div>
            <div class="k-empty" v-else-if="filteredProducts.length === 0">
              <i class="fas fa-search"></i>
              <h3>No items found</h3>
              <p>Try adjusting your search or category</p>
            </div>
            <div class="products-grid" v-else>
              <div v-for="(product, pidx) in filteredProducts" :key="product.id"
                   class="prod-card" :style="{animationDelay: Math.min(pidx*0.04,0.4)+'s'}"
                   @click="openProductModal(product)">
                <div class="prod-img">
                  <img :src="product.image || 'https://picsum.photos/seed/'+product.id+'/400/300'"
                       :alt="product.name" loading="lazy">
                  <span v-if="product.alcohol" class="alcohol-tag"><i class="fas fa-wine-bottle"></i> 18+</span>
                  <span v-if="pidx < 3 && activeCategory === 'all'" class="pop-badge"><i class="fas fa-fire"></i> Popular</span>
                </div>
                <div class="prod-body">
                  <div class="prod-name">{{ product.name }}</div>
                  <div class="prod-desc">{{ product.description || 'Premium selection from Rands' }}</div>
                  <div class="prod-footer">
                    <div class="prod-price"><span>R</span> {{ formatPrice(product.price) }}</div>
                    <div class="qty-stepper" v-if="cartQty(product.id) > 0" @click.stop>
                      <button class="step-btn minus" @click="stepDown(product)">−</button>
                      <span class="step-qty">{{ cartQty(product.id) }}</span>
                      <button class="step-btn plus" @click="stepUp(product)">+</button>
                    </div>
                    <button v-else class="add-btn" @click.stop="quickAddToCart(product)" title="Add to order">
                      <i class="fas fa-plus"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="cart-panel" :class="{open: cartOpen}">
        <div class="cart-inner">
          <div class="cart-head">
            <div class="cart-head-title"><i class="fas fa-bag-shopping" style="color:var(--red);"></i> Your Order <span v-if="cartItemCount > 0" style="background:var(--red);color:white;border-radius:99px;padding:1px 7px;font-size:10px;">{{ cartItemCount }}</span></div>
            <div class="cart-close" @click="cartOpen = false"><i class="fas fa-times"></i></div>
          </div>
          <div class="cart-items" v-if="cart.length > 0">
            <div v-for="(item, idx) in cart" :key="idx" class="cart-item">
              <img class="ci-img" :src="item.image || 'https://picsum.photos/seed/'+item.id+'/100/100'" :alt="item.name">
              <div class="ci-info">
                <div class="ci-name">{{ item.name }}</div>
                <div class="ci-price">R {{ formatPrice(item.price * item.quantity) }}</div>
                <div class="ci-controls">
                  <button class="ci-step rm" @click="updateCartQty(item, item.quantity - 1)">−</button>
                  <span class="ci-qty">{{ item.quantity }}</span>
                  <button class="ci-step add" @click="updateCartQty(item, item.quantity + 1)">+</button>
                  <button @click="removeCartItem(item)" style="margin-left:auto;background:none;border:none;color:var(--text3);font-size:12px;cursor:pointer;"><i class="fas fa-trash-alt"></i></button>
                </div>
              </div>
            </div>
          </div>
          <div class="cart-empty" v-else><i class="fas fa-bag-shopping"></i><p>Your order is empty.<br>Add items to get started.</p></div>
          <div class="cart-foot" v-if="cart.length > 0">
            <div class="cart-line"><span>Subtotal</span><span>R {{ formatPrice(cartTotal) }}</span></div>
            <div class="cart-line"><span>VAT (15%)</span><span>R {{ formatPrice(cartTotal * 0.15) }}</span></div>
            <div class="cart-line total"><span>Total</span><span>R {{ formatPrice(cartTotal) }}</span></div>
            <button class="checkout-btn" @click="startCheckout" :disabled="cartItemCount === 0"><i class="fas fa-lock"></i> Checkout · R {{ formatPrice(cartTotal) }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- MODALS -->
  <div class="modal-bg" :class="{open: productModalOpen}" @click.self="productModalOpen=false">
    <div class="modal-box" v-if="selectedProduct">
      <div class="modal-img"><img :src="selectedProduct.image || 'https://picsum.photos/seed/'+selectedProduct.id+'/400/300'" :alt="selectedProduct.name"><span v-if="selectedProduct.alcohol" class="alcohol-tag" style="top:12px;right:12px;"><i class="fas fa-wine-bottle"></i> 18+</span></div>
      <div class="modal-body">
        <div class="modal-name">{{ selectedProduct.name }}</div>
        <div class="modal-desc">{{ selectedProduct.description || 'Premium selection from Rands Cape Town.' }}</div>
        <div class="modal-price"><span>R </span>{{ formatPrice(selectedProduct.price) }}<span style="margin-left:4px;font-size:12px;"> per item</span></div>
        <div class="modal-qty-row"><button class="modal-step" @click="modalQty = Math.max(1, modalQty - 1)">−</button><span class="modal-qty-num">{{ modalQty }}</span><button class="modal-step" @click="modalQty++">+</button></div>
        <button class="modal-add-btn" @click="addModalToCart"><i class="fas fa-bag-shopping"></i> Add {{ modalQty }} to Order · R {{ formatPrice(selectedProduct.price * modalQty) }}</button>
      </div>
    </div>
  </div>

  <div class="modal-bg" :class="{open: eventModalOpen}" @click.self="closeEventModal">
    <div class="modal-box" v-if="selectedEvent">
      <div class="modal-img" style="height:160px;"><img :src="getEventBannerImage(selectedEvent)" :alt="selectedEvent.name"></div>
      <div class="modal-body" style="padding-bottom:8px;"><div class="modal-name">{{ selectedEvent.name }}</div><div class="modal-desc" style="display:flex;align-items:center;gap:6px;"><i class="fas fa-map-marker-alt" style="color:var(--red);font-size:11px;"></i> {{ selectedEvent.location || 'Rands Cape Town' }}</div></div>
      <div v-if="loadingTicketTypes" class="k-loading" style="padding:24px;"><div class="spinner"></div></div>
      <div v-else>
        <div v-for="ticket in ticketTypes" :key="ticket.id" class="ticket-row"><div><div class="t-name">{{ ticket.name }}</div><div class="t-price">R {{ formatPrice(ticket.price) }}</div></div><button class="t-add-btn" @click="addTicketToCart(ticket)"><i class="fas fa-plus"></i> Add</button></div>
        <div v-if="ticketTypes.length === 0" style="padding:20px;text-align:center;font-size:12px;color:var(--text3);">No ticket types available</div>
      </div>
      <button class="modal-close-btn" @click="closeEventModal">Close</button>
    </div>
  </div>

  <div class="toast-wrap"><div class="toast" :class="[{show: toastVisible}, toastType]"><i :class="toastIcon"></i> {{ toastMessage }}</div></div>
  <div v-if="(cartOpen || mobileCatOpen) && isMobile" @click="cartOpen=false; mobileCatOpen=false;" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:29;"></div>
</div>`;

// Module-scope state for SPA lifecycle management. None of this existed
// in the original kiosk-menu.js -- it's the minimum needed so this
// screen can be mounted, unmounted, and re-mounted cleanly by kiosk.js's
// navigate(), instead of relying on a full page reload to reset state.
let vueApp = null;
let resizeHandler = null;
let initialized = false;

/**
 * Mounts the Menu screen's Vue 2 app onto #app. Must be called AFTER
 * `html` has been inserted into the DOM (e.g. via kiosk.js's
 * navigate()), since Vue's `el: '#app'` option looks the element up by
 * id exactly as the original kiosk-menu.js did when it ran as its own
 * page's bottom-of-body module script.
 *
 * @param {{ supabase: import('@supabase/supabase-js').SupabaseClient }} deps
 */
export async function init({ supabase }) {
  if (initialized) return;
  initialized = true;

  // Menu is the first screen that needs a JS library beyond ES module
  // imports -- Vue 2's CDN build attaches itself to `window.Vue` as a
  // side effect, so it has to be present before `new Vue(...)` below.
  // ensureScript() caches this the same way ensureStylesheet() caches
  // CSS links, so repeat navigations to Menu don't re-fetch it.
  await ensureScript('https://unpkg.com/vue@2/dist/vue.js');

  vueApp = new Vue({
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
      // Hardcoded starting point — these render instantly on first paint
      // so the hero never flashes empty. mounted()'s loadHeroSlides()
      // then swaps this for live rows from kiosk_menu_slides (managed in
      // kiosk-admin.html's "Menu Banners" tab); if that fetch fails or
      // the table has no active rows, these three stay exactly as-is.
      heroSlides: [
        { eyebrow: 'BUTCHER SHOP', title: 'Fresh. Flame. Flavour.', desc: 'Hand-selected cuts cooked to perfection', cta: 'Order Now', action: 'butcher', bgImage: '../assets/images/butcher-kiosk-banner.png' },
        { eyebrow: 'PREMIUM SPIRITS', title: 'Khayelitsha Vibes', desc: 'Curated selection of premium spirits', cta: 'Explore', action: 'whiskey', bgImage: '../assets/images/vibe-kiosk-banner.png' },
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
      // SPA change: store the handler so cleanup() can remove it -- the
      // original inline arrow function here had no stored reference,
      // which would otherwise stack a new permanent `resize` listener
      // on `window` every time this screen is re-navigated to.
      resizeHandler = () => { this.isMobile = window.innerWidth < 768; };
      window.addEventListener('resize', resizeHandler);
      this._heroTimer = setInterval(() => { this.heroIndex = (this.heroIndex + 1) % this.heroSlides.length; }, 10000);
      await this.loadHeroSlides();
      await this.loadProducts();
      await this.loadEvents();
    },
    methods: {
      formatPrice(n) { return Number(n).toFixed(2); },
      formatEventDate(d) { return d ? new Date(d).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'; },
      // Reads the admin-managed hero banners. Only ever *replaces* the
      // built-in fallback slides above -- never clears them -- so a
      // network hiccup, a table with zero active rows, or every row
      // being outside its start/end window all just leave the fallback
      // on screen instead of an empty hero.
      async loadHeroSlides() {
        try {
          const { data, error } = await supabase.from('kiosk_menu_slides').select('*').eq('is_active', true).order('display_order', { ascending: true });
          if (error || !data) { console.warn('loadHeroSlides: falling back to defaults', error); return; }
          const now = new Date();
          const live = data.filter(s => (!s.starts_at || new Date(s.starts_at) <= now) && (!s.ends_at || new Date(s.ends_at) >= now));
          if (!live.length) return;
          this.heroSlides = live.map(s => ({
            eyebrow: s.eyebrow || '',
            title: s.title,
            desc: s.description || '',
            cta: s.cta_label || 'Explore',
            action: s.target_category || 'all',
            bgImage: s.image_url || '../assets/images/butcher-kiosk-banner.png',
          }));
          this.heroIndex = 0;
        } catch (e) {
          console.warn('loadHeroSlides: falling back to defaults', e);
        }
      },
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
      // Was a 3-way if/else hardcoded to 'butcher'/'spirits'/'tickets' --
      // now that banners come from kiosk-admin's "Menu Banners" tab, a
      // banner's target can be any product category (or 'tickets' or
      // 'all'), so this just hands off to the same selectCategory() the
      // sidebar itself uses, instead of only recognizing 3 fixed values.
      quickHeroAction() { this.selectCategory(this.heroSlides[this.heroIndex].action || 'all'); },
      // SPA change (only intentional behavioral difference from the
      // original): Welcome is now an SPA screen too, not a standalone
      // kiosk-start.html page, so this navigates via kiosk.js's router
      // instead of doing a full-page reload to a page that no longer
      // exists at that path.
      goBackToStart() { window.kioskNavigate('welcome'); },
    },
    beforeDestroy() { if (this._heroTimer) clearInterval(this._heroTimer); }
  });

  // Spawn floating particles -- verbatim from kiosk-menu.js, moved
  // inside init() (guarded by the `initialized` check above) instead of
  // running once at module-import time. kiosk.js replaces #kiosk-screen's
  // entire innerHTML on every navigate(), so the #particles element is a
  // brand new DOM node each time this screen is (re)entered; spawning at
  // module-import time would only ever populate the very first instance
  // of that node, leaving it empty on every subsequent visit.
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
}

/**
 * Tears down everything this screen started, so navigating away and
 * back doesn't leak timers, duplicate the `resize` listener, or crash
 * on remounting into a fresh #app node. Called by kiosk.js immediately
 * before it replaces #kiosk-screen's content with the next screen.
 */
export function cleanup() {
  // Destroy the Vue instance -- this also runs Vue's own beforeDestroy
  // hook above, which clears _heroTimer. Without this, re-navigating to
  // Menu would try to mount a second Vue app on a stale/replaced #app
  // element while the old instance (and its watchers/timers) lingers.
  if (vueApp) {
    vueApp.$destroy();
    vueApp = null;
  }

  // Remove the `resize` listener registered in mounted() above. This is
  // attached to `window` itself (not to anything inside #kiosk-screen),
  // so it would otherwise survive the DOM swap and stack a duplicate on
  // every subsequent visit to this screen.
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }

  // Allow a clean re-init (including a fresh particle spawn) next time
  // this screen is navigated to.
  initialized = false;
}
