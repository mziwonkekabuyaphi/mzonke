/**
 * modules/menu.js
 * Menu & Bar ordering module.
 * Preserves all product loading, category filtering, search, cart, and checkout logic
 * from kiosk-menu.html. Converted from Vue to vanilla JS.
 */

let ctx = {};
let activeCategory = 'all';
let searchQuery = '';
let heroIndex = 0;
let heroTimer = null;

const heroSlides = [
  { title: 'The Butcher Shop', desc: 'Fresh. Flame. Flavour.', cta: 'Order Now', action: 'butcher' },
  { title: 'Khayelitsha Vibes', desc: '#See Your Vibes', cta: 'Explore Drinks', action: 'spirits' },
  { title: 'The Next Big Vibe', desc: 'Secure Your Spot Early', cta: 'Get Tickets', action: 'tickets' },
];

const mainCategories = [
  { id: 'all',         name: 'All Items',       icon: 'fas fa-border-all' },
  { id: 'beer',        name: 'Beer',             icon: 'fas fa-beer-mug-empty' },
  { id: 'spirits',     name: 'Premium Spirits',  icon: 'fas fa-crown' },
  { id: 'wine',        name: 'Wine',             icon: 'fas fa-wine-glass' },
  { id: 'soft drinks', name: 'Soft Drinks',      icon: 'fas fa-droplet' },
  { id: 'food',        name: 'Food',             icon: 'fas fa-utensils' },
  { id: 'butcher',     name: 'The Butcher',      icon: 'fas fa-drumstick-bite' },
  { id: 'tickets',     name: 'Event Tickets',    icon: 'fas fa-ticket-alt' },
];

export async function load(context) {
  ctx = context;
  const body = document.getElementById('menu-screen-body');
  if (!body) return;

  // Render layout shell
  body.innerHTML = `
    <div class="menu-layout" id="menu-layout">
      <div class="menu-sidebar" id="menu-sidebar"></div>
      <div class="menu-main" id="menu-main">
        <div class="menu-search-bar">
          <div class="menu-search-wrap">
            <i class="fas fa-search"></i>
            <input type="text" id="menu-search" placeholder="Search menu… e.g. burger, beer, wine" oninput="menuSearch(this.value)">
          </div>
        </div>
        <div id="menu-hero-wrap"></div>
        <div id="menu-products"></div>
      </div>
    </div>
    <div class="floating-cart" id="floating-cart" onclick="openCartDrawer()" style="display:none;">
      <i class="fas fa-shopping-bag"></i>
      <span class="cart-badge">0</span>
      <span class="cart-total-text">R 0.00</span>
    </div>
  `;

  renderSidebar();
  renderHero();

  // Load products if not already loaded
  if (!ctx.state.products || ctx.state.products.length === 0) {
    showProductsSkeleton();
    await loadProducts();
  }

  renderProducts();
  ctx.updateAllCartBadges();
}

function renderSidebar() {
  const sidebar = document.getElementById('menu-sidebar');
  if (!sidebar) return;
  sidebar.innerHTML = mainCategories.map(cat => `
    <div class="sidebar-item ${activeCategory === cat.id ? 'active' : ''}" onclick="menuSelectCategory('${cat.id}')">
      <i class="${cat.icon}"></i>
      <span>${cat.name}</span>
    </div>
  `).join('');
}

function renderHero() {
  const wrap = document.getElementById('menu-hero-wrap');
  if (!wrap || activeCategory !== 'all') { if (wrap) wrap.innerHTML = ''; return; }
  const slide = heroSlides[heroIndex];
  wrap.innerHTML = `
    <div class="menu-hero" style="margin-bottom:1.5rem;border-radius:var(--r-xl);overflow:hidden;background:linear-gradient(135deg,#1a1a2e,#0a0a15);position:relative;min-height:200px;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:3rem 3.5rem;min-height:200px;">
        <div>
          <div style="font-size:0.65rem;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:var(--red);margin-bottom:10px;">Featured</div>
          <div style="font-family:'Playfair Display',serif;font-size:2rem;font-weight:800;color:white;margin-bottom:8px;">${slide.title}</div>
          <p style="color:rgba(255,255,255,0.8);font-size:1rem;">${slide.desc}</p>
        </div>
        <button class="btn-primary" onclick="menuSelectCategory('${slide.action}')">${slide.cta}</button>
      </div>
      <div style="position:absolute;bottom:14px;left:50%;transform:translateX(-50%);display:flex;gap:10px;">
        ${heroSlides.map((_, i) => `<div onclick="menuSetHero(${i})" style="width:${i===heroIndex?'28':'8'}px;height:8px;background:${i===heroIndex?'var(--red)':'rgba(255,255,255,0.3)'};border-radius:10px;cursor:pointer;transition:all 0.3s;"></div>`).join('')}
      </div>
    </div>
  `;
  clearInterval(heroTimer);
  heroTimer = setInterval(() => { heroIndex = (heroIndex + 1) % heroSlides.length; renderHero(); }, 10000);
}

async function loadProducts() {
  try {
    const { data, error } = await ctx.supabase.from('products').select('*');
    if (error) throw error;
    ctx.state.products = (data || []).map(p => ({
      ...p,
      price: p.price || p.unit_price || 0,
      category: (p.category || p.product_type || '').toLowerCase(),
      description: p.description || p.product_description || 'Premium selection from Rands',
    }));
  } catch (e) {
    console.warn('Products load error:', e);
    ctx.state.products = getDemoProducts();
  }
}

async function loadEvents() {
  try {
    const { data: events, error } = await ctx.supabase
      .from('events').select('*').eq('is_active', true).eq('status', 'active');
    if (error) throw error;
    ctx.state.eventsList = events || [];
    for (const event of ctx.state.eventsList) {
      const { data: tickets } = await ctx.supabase
        .from('ticket_types').select('price').eq('event_id', event.id)
        .order('price', { ascending: true }).limit(1);
      event.min_price = tickets?.[0]?.price || event.base_price || 0;
    }
  } catch (e) {
    console.error('Events load error:', e);
    ctx.state.eventsList = [];
  }
}

function getFilteredProducts() {
  let list = ctx.state.products || [];
  if (activeCategory !== 'all') {
    list = list.filter(p => p.category === activeCategory);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
  }
  return list;
}

function showProductsSkeleton() {
  const el = document.getElementById('menu-products');
  if (el) el.innerHTML = `<div class="loading-skeleton"><div class="sk-grid"><div class="sk-card"></div><div class="sk-card"></div><div class="sk-card"></div><div class="sk-card"></div><div class="sk-card"></div><div class="sk-card"></div></div></div>`;
}

function renderProducts() {
  const el = document.getElementById('menu-products');
  if (!el) return;

  // Events tab
  if (activeCategory === 'tickets') {
    renderEventsGrid(el);
    return;
  }

  const list = getFilteredProducts();
  if (list.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:4rem 2rem;opacity:0.5"><i class="fas fa-search" style="font-size:3rem;color:var(--muted);margin-bottom:1rem;display:block"></i><div style="font-size:1.2rem;font-weight:700;color:var(--white)">No items found</div><div style="font-size:0.85rem;color:var(--muted);margin-top:6px">Try adjusting your search or category</div></div>`;
    return;
  }

  el.innerHTML = `<div class="products-grid">${list.map(p => productCardHTML(p)).join('')}</div>`;
}

function productCardHTML(p) {
  const img = p.image_url || p.image || '';
  return `
    <div class="product-card" onclick="menuOpenProduct('${p.id}')">
      <div class="product-img">
        ${img ? `<img src="${img}" alt="${p.name}" onerror="this.parentElement.innerHTML='<div class=product-img-placeholder>🍽️</div>'">` : `<div class="product-img-placeholder">🍽️</div>`}
        ${p.alcohol ? `<span class="alcohol-tag"><i class="fas fa-wine-bottle"></i> Alcohol</span>` : ''}
      </div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-description">${p.description || ''}</div>
        <div class="product-price">R ${ctx.formatPrice(p.price)}</div>
        <button class="quick-add" onclick="event.stopPropagation(); menuQuickAdd('${p.id}')">
          <i class="fas fa-plus-circle"></i> Add to Order
        </button>
      </div>
    </div>
  `;
}

async function renderEventsGrid(el) {
  if (!ctx.state.eventsList || ctx.state.eventsList.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:2rem;opacity:0.5"><i class="fas fa-spinner fa-pulse" style="font-size:2rem;color:var(--red);margin-bottom:1rem;display:block"></i><div>Loading events...</div></div>`;
    await loadEvents();
  }
  if (ctx.state.eventsList.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:4rem;opacity:0.5"><i class="fas fa-calendar-alt" style="font-size:3rem;color:var(--muted);margin-bottom:1rem;display:block"></i><div style="font-size:1.1rem;font-weight:700">No events available</div><div style="font-size:0.85rem;color:var(--muted);margin-top:6px">Check back soon!</div></div>`;
    return;
  }
  el.innerHTML = `<div class="events-grid">${ctx.state.eventsList.map(ev => eventCardHTML(ev)).join('')}</div>`;
}

function eventCardHTML(ev) {
  const img = ev.banner_url || ev.image_url || ev.banner || ev.image || '';
  const date = ev.start_time ? new Date(ev.start_time).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
  return `
    <div class="event-card" onclick="menuOpenEvent('${ev.id}')">
      <div class="event-poster">
        ${img ? `<img src="${img}" alt="${ev.name}" onerror="this.style.display='none'">` : ''}
        <div class="ep-bg"></div>
        <div class="event-date-badge"><i class="far fa-calendar-alt"></i> ${date}</div>
        <div class="ep-content">
          <div class="ep-tag">Live Event</div>
          <div class="ep-name">${ev.name}</div>
        </div>
      </div>
      <div class="event-card-body">
        <div class="ec-meta">
          <span class="ec-chip"><svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${ev.location || 'Rands Venue'}</span>
        </div>
        <div class="ec-footer">
          <div class="ec-price"><span style="font-size:0.7rem;color:var(--muted);display:block;font-family:'Inter',sans-serif;">from</span>R ${ctx.formatPrice(ev.min_price || 0)}</div>
          <button class="btn-primary" style="padding:8px 18px;font-size:0.65rem;" onclick="event.stopPropagation(); menuOpenEvent('${ev.id}')"><i class="fas fa-ticket-alt"></i> Buy Ticket</button>
        </div>
      </div>
    </div>
  `;
}

// ─── PRODUCT MODAL ────────────────────────────────────────────────────────────
window.menuOpenProduct = function(id) {
  const p = (ctx.state.products || []).find(x => x.id === id || x.id === parseInt(id));
  if (!p) return;
  let qty = 1;

  const modal = document.getElementById('product-modal');
  const body = document.getElementById('product-modal-body');
  if (!modal || !body) return;

  const render = () => {
    body.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">${p.name}</div>
        <button class="modal-close" onclick="document.getElementById('product-modal').classList.remove('open')">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        ${p.image_url || p.image ? `<img src="${p.image_url || p.image}" style="width:100%;height:200px;object-fit:contain;border-radius:var(--r-lg);background:var(--ash);padding:12px;margin-bottom:1rem;" onerror="this.style.display='none'">` : ''}
        <p style="color:var(--silver);line-height:1.6;margin-bottom:1rem;">${p.description || 'Premium selection from Rands'}</p>
        <div style="font-family:'Playfair Display',serif;font-size:2rem;font-weight:800;color:var(--red);margin-bottom:1.5rem;">R ${ctx.formatPrice(p.price)}</div>
        <div style="display:flex;align-items:center;gap:20px;justify-content:center;margin-bottom:1.5rem;">
          <button onclick="this.parentElement.querySelector('.modal-qty-val').textContent=Math.max(1,parseInt(this.parentElement.querySelector('.modal-qty-val').textContent)-1); currentModalQty=Math.max(1,currentModalQty-1);" style="width:48px;height:48px;border-radius:50%;background:var(--glass-high);border:1px solid var(--border);color:white;font-size:1.4rem;font-weight:700;cursor:pointer;">−</button>
          <span class="modal-qty-val" style="font-size:1.6rem;font-weight:800;min-width:48px;text-align:center;">${qty}</span>
          <button onclick="this.parentElement.querySelector('.modal-qty-val').textContent=parseInt(this.parentElement.querySelector('.modal-qty-val').textContent)+1; currentModalQty++;" style="width:48px;height:48px;border-radius:50%;background:var(--glass-high);border:1px solid var(--border);color:white;font-size:1.4rem;font-weight:700;cursor:pointer;">+</button>
        </div>
        <button class="btn-primary btn-full" onclick="menuAddModalToCart('${p.id}')">
          <i class="fas fa-shopping-cart"></i> Add to Cart · <span id="modal-qty-display">${qty}</span> item(s)
        </button>
      </div>
    `;
  };
  window.currentModalQty = qty;
  render();
  modal.classList.add('open');
};

window.menuAddModalToCart = function(id) {
  const p = (ctx.state.products || []).find(x => x.id === id || x.id === parseInt(id));
  if (!p) return;
  const qtyEl = document.querySelector('#product-modal .modal-qty-val');
  const qty = qtyEl ? parseInt(qtyEl.textContent) : 1;
  ctx.addToCart({ id: p.id, name: p.name, price: p.price, quantity: qty, image: p.image_url || p.image, itemType: 'menu', alcohol: p.alcohol || false, description: p.description });
  document.getElementById('product-modal')?.classList.remove('open');
};

window.menuQuickAdd = function(id) {
  const p = (ctx.state.products || []).find(x => x.id === id || x.id === parseInt(id));
  if (!p) return;
  ctx.addToCart({ id: p.id, name: p.name, price: p.price, quantity: 1, image: p.image_url || p.image, itemType: 'menu', alcohol: p.alcohol || false, description: p.description });
};

// ─── EVENT MODAL ──────────────────────────────────────────────────────────────
window.menuOpenEvent = async function(id) {
  const ev = (ctx.state.eventsList || []).find(e => e.id === id);
  if (!ev) return;

  const modal = document.getElementById('event-modal');
  const body = document.getElementById('event-modal-body');
  if (!modal || !body) return;

  body.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${ev.name}</div>
      <button class="modal-close" onclick="document.getElementById('event-modal').classList.remove('open')">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:1.2rem">
        ${ev.banner_url || ev.image_url ? `<img src="${ev.banner_url || ev.image_url}" style="width:72px;height:72px;border-radius:var(--r-md);object-fit:cover;" onerror="this.style.display='none'">` : ''}
        <div>
          <div style="font-size:0.75rem;color:var(--muted);margin-bottom:4px"><i class="fas fa-map-marker-alt" style="color:var(--red)"></i> ${ev.location || 'Rands Venue'}</div>
          <div style="font-size:0.75rem;color:var(--muted)"><i class="fas fa-calendar-alt" style="color:var(--red)"></i> ${ev.start_time ? new Date(ev.start_time).toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' }) : 'TBD'}</div>
        </div>
      </div>
      <div id="ticket-types-body">
        <div style="text-align:center;padding:2rem;opacity:0.6"><i class="fas fa-spinner fa-pulse" style="font-size:1.5rem;color:var(--red)"></i></div>
      </div>
    </div>
  `;
  modal.classList.add('open');

  // Load ticket types
  try {
    const { data, error } = await ctx.supabase.from('ticket_types').select('*').eq('event_id', ev.id);
    if (error) throw error;
    ctx.state.ticketTypes = data || [];
    const ttBody = document.getElementById('ticket-types-body');
    if (!ttBody) return;
    if (ctx.state.ticketTypes.length === 0) {
      ttBody.innerHTML = `<div style="text-align:center;padding:1.5rem;opacity:0.6">No ticket types available</div>`;
      return;
    }
    ttBody.innerHTML = ctx.state.ticketTypes.map(t => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px;border-bottom:1px solid var(--border);gap:12px">
        <div>
          <div style="font-weight:700;color:var(--white);margin-bottom:3px">${t.name}</div>
          <div style="font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:800;color:var(--red)">R ${ctx.formatPrice(t.price)}</div>
        </div>
        <button class="btn-primary" style="padding:8px 18px;font-size:0.65rem;white-space:nowrap;" onclick="menuAddTicket('${ev.id}','${t.id}','${t.name.replace(/'/g,"\\'")}',${t.price})">
          <i class="fas fa-plus"></i> Add
        </button>
      </div>
    `).join('') + `<button class="btn-ghost" onclick="document.getElementById('event-modal').classList.remove('open')" style="margin-top:1rem">Close</button>`;
  } catch (e) {
    const ttBody = document.getElementById('ticket-types-body');
    if (ttBody) ttBody.innerHTML = `<div style="text-align:center;padding:1.5rem;color:var(--red)">Error loading ticket types</div>`;
  }
};

window.menuAddTicket = function(eventId, ticketTypeId, ticketTypeName, price) {
  const ev = (ctx.state.eventsList || []).find(e => e.id === eventId);
  if (!ev) return;
  ctx.addToCart({
    id: ticketTypeId,
    name: `${ev.name} — ${ticketTypeName}`,
    price: parseFloat(price),
    quantity: 1,
    image: ev.banner_url || ev.image_url || '',
    itemType: 'ticket',
    event_id: eventId,
    ticket_type_id: ticketTypeId,
    ticket_type_name: ticketTypeName,
    alcohol: false,
    description: `${ticketTypeName} ticket for ${ev.name}`,
  });
  document.getElementById('event-modal')?.classList.remove('open');
};

// ─── CATEGORY / SEARCH ────────────────────────────────────────────────────────
window.menuSelectCategory = function(id) {
  activeCategory = id;
  searchQuery = '';
  const searchEl = document.getElementById('menu-search');
  if (searchEl) searchEl.value = '';
  renderSidebar();
  if (id === 'all') renderHero(); else { const hw = document.getElementById('menu-hero-wrap'); if (hw) hw.innerHTML = ''; }
  renderProducts();
};

window.menuSearch = function(q) {
  searchQuery = q;
  renderProducts();
};

window.menuSetHero = function(idx) {
  heroIndex = idx;
  renderHero();
};

// ─── DEMO DATA (fallback when offline) ────────────────────────────────────────
function getDemoProducts() {
  return [
    { id: 'd1', name: 'Castle Lager', description: 'Crisp South African lager', price: 45, category: 'beer', alcohol: true },
    { id: 'd2', name: 'Heineken', description: 'Premium Dutch lager', price: 55, category: 'beer', alcohol: true },
    { id: 'd3', name: 'Jack Daniels 25ml', description: "Tennessee whiskey", price: 95, category: 'spirits', alcohol: true },
    { id: 'd4', name: 'Coca-Cola', description: 'Ice cold Coke 330ml', price: 30, category: 'soft drinks', alcohol: false },
    { id: 'd5', name: 'Ribeye Steak', description: 'Premium grass-fed ribeye 300g', price: 320, category: 'butcher', alcohol: false },
    { id: 'd6', name: 'Chicken Wings', description: 'Spicy grilled wings 500g', price: 140, category: 'food', alcohol: false },
  ];
}
