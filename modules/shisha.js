/**
 * modules/shisha.js
 * Shisha lounge booking module.
 * Loads shisha products/flavours and session options from Supabase.
 */

let ctx = {};
let shishaProducts = [];
let selectedFlavours = [];

export async function load(context) {
  ctx = context;
  const body = document.getElementById('shisha-screen-body');
  if (!body) return;

  body.innerHTML = `<div class="loading-skeleton"><div class="sk-grid"><div class="sk-card"></div><div class="sk-card"></div><div class="sk-card"></div></div></div>`;

  await loadShishaProducts();
  renderShisha(body);
}

async function loadShishaProducts() {
  try {
    const { data, error } = await ctx.supabase
      .from('products')
      .select('*')
      .ilike('category', 'shisha');
    if (error) throw error;
    shishaProducts = (data || []).map(p => ({
      ...p,
      price: p.price || p.unit_price || 0,
      description: p.description || 'Premium shisha experience',
    }));
    if (shishaProducts.length === 0 && ctx.state.products?.length) {
      shishaProducts = ctx.state.products.filter(p => (p.category || '').toLowerCase() === 'shisha');
    }
  } catch (e) {
    console.error('Shisha load error:', e);
    shishaProducts = getDemoShisha();
  }
}

const sessionOptions = [
  { id: 's1', name: '1 Hour Session',   price: 150, duration: '60 min', desc: 'Perfect for a quick relaxing session' },
  { id: 's2', name: '2 Hour Session',   price: 250, duration: '120 min', desc: 'Ideal for a longer lounge experience' },
  { id: 's3', name: 'VIP Table 3 hrs',  price: 450, duration: '180 min', desc: 'Premium table service with dedicated staff' },
];

const locationOptions = [
  { id: 'l1', name: 'Main Lounge',   icon: '🏠', desc: 'Indoor air-conditioned lounge area' },
  { id: 'l2', name: 'Rooftop Deck',  icon: '🌆', desc: 'Open air rooftop with city views' },
  { id: 'l3', name: 'VIP Booth',     icon: '⭐', desc: 'Private VIP booth with premium service' },
];

let selectedSession = null;
let selectedLocation = null;

function renderShisha(body) {
  body.innerHTML = `
    <div style="margin-bottom:1.5rem">
      <div style="font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:800;color:var(--white);margin-bottom:6px;">Book Your Shisha Session</div>
      <p style="font-size:0.85rem;color:var(--muted);line-height:1.5;">Choose your session duration, preferred location, and flavours. Add to cart to checkout.</p>
    </div>

    <div class="section-divider"><span>Step 1 — Choose Session</span></div>
    <div class="sub-grid" id="shisha-sessions">
      ${sessionOptions.map(s => `
        <div class="sub-card ${selectedSession === s.id ? 'sub-card--selected' : ''}" id="sess-${s.id}" onclick="shishaSelectSession('${s.id}')">
          <div class="sc-icon" style="${selectedSession === s.id ? 'background:var(--red);border-color:var(--red)' : ''}">
            <svg viewBox="0 0 24 24" fill="currentColor" style="color:${selectedSession === s.id ? 'white' : 'var(--red)'}"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>
          </div>
          <div class="sc-title">${s.name}</div>
          <div class="sc-desc">${s.desc}</div>
          <div style="font-family:'Playfair Display',serif;font-size:1.3rem;font-weight:800;color:var(--red);">R ${ctx.formatPrice(s.price)}</div>
          ${selectedSession === s.id ? `<div style="position:absolute;top:1rem;right:1rem;background:var(--red);border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-check" style="color:white;font-size:0.7rem"></i></div>` : ''}
        </div>
      `).join('')}
    </div>

    <div class="section-divider" style="margin-top:2rem"><span>Step 2 — Choose Location</span></div>
    <div class="sub-grid" id="shisha-locations">
      ${locationOptions.map(l => `
        <div class="sub-card ${selectedLocation === l.id ? 'sub-card--selected' : ''}" id="loc-${l.id}" onclick="shishaSelectLocation('${l.id}')">
          <div class="sc-icon" style="${selectedLocation === l.id ? 'background:var(--red);border-color:var(--red)' : ''}">
            <span style="font-size:1.5rem">${l.icon}</span>
          </div>
          <div class="sc-title">${l.name}</div>
          <div class="sc-desc">${l.desc}</div>
          ${selectedLocation === l.id ? `<div style="position:absolute;top:1rem;right:1rem;background:var(--red);border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-check" style="color:white;font-size:0.7rem"></i></div>` : ''}
        </div>
      `).join('')}
    </div>

    <div class="section-divider" style="margin-top:2rem"><span>Step 3 — Choose Flavour</span></div>
    <div class="sub-grid">
      ${shishaProducts.length > 0
        ? shishaProducts.map(p => shishaFlavourCardHTML(p)).join('')
        : getDemoShisha().map(p => shishaFlavourCardHTML(p)).join('')
      }
    </div>

    <div id="shisha-add-bar" style="display:none;margin-top:2rem;background:linear-gradient(135deg,rgba(227,6,19,0.12),rgba(0,0,0,0));border:1px solid var(--red-border);border-radius:var(--r-xl);padding:1.5rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;">
      <div>
        <div style="font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:800;color:var(--white)" id="shisha-summary-text">Select session &amp; location above</div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:4px" id="shisha-price-text">—</div>
      </div>
      <button class="btn-primary" onclick="shishaAddToCart()" id="shisha-cart-btn" disabled style="opacity:0.5">
        <i class="fas fa-plus-circle"></i> Add to Cart
      </button>
    </div>
  `;

  document.getElementById('shisha-add-bar').style.display = 'flex';
  updateShishaBar();
}

function shishaFlavourCardHTML(p) {
  return `
    <div class="sub-card" onclick="shishaQuickAdd('${p.id}')">
      <div class="sc-icon">
        <svg viewBox="0 0 24 24" fill="var(--red)"><path d="M12 22V12M12 12c0-4 4-5 4-9a4 4 0 0 0-8 0c0 4 4 5 4 9M8 22h8M7 19h10"/></svg>
      </div>
      <div class="sc-title">${p.name}</div>
      <div class="sc-desc">${p.description || 'Premium shisha flavour'}</div>
      <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:800;color:var(--red)">R ${ctx.formatPrice(p.price)}</div>
      <div class="sc-cta">Add to Cart <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></div>
    </div>
  `;
}

window.shishaSelectSession = function(id) {
  selectedSession = id;
  // Update selected states
  sessionOptions.forEach(s => {
    const el = document.getElementById(`sess-${s.id}`);
    if (el) el.style.borderColor = s.id === id ? 'var(--red)' : '';
  });
  updateShishaBar();
  renderShisha(document.getElementById('shisha-screen-body'));
};

window.shishaSelectLocation = function(id) {
  selectedLocation = id;
  updateShishaBar();
  renderShisha(document.getElementById('shisha-screen-body'));
};

function updateShishaBar() {
  const btn = document.getElementById('shisha-cart-btn');
  const summary = document.getElementById('shisha-summary-text');
  const priceEl = document.getElementById('shisha-price-text');
  if (!btn) return;

  const sess = sessionOptions.find(s => s.id === selectedSession);
  const loc = locationOptions.find(l => l.id === selectedLocation);

  if (sess && loc) {
    btn.disabled = false;
    btn.style.opacity = '1';
    if (summary) summary.textContent = `${sess.name} · ${loc.name}`;
    if (priceEl) priceEl.textContent = `R ${ctx.formatPrice(sess.price)} — tap Add to Cart`;
  } else {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    if (summary) summary.textContent = !sess ? 'Select a session above' : 'Now select a location';
    if (priceEl) priceEl.textContent = '—';
  }
}

window.shishaAddToCart = function() {
  const sess = sessionOptions.find(s => s.id === selectedSession);
  const loc = locationOptions.find(l => l.id === selectedLocation);
  if (!sess || !loc) { ctx.toast('Please select a session and location'); return; }

  ctx.addToCart({
    id: `shisha-${sess.id}-${loc.id}`,
    name: `Shisha: ${sess.name} · ${loc.name}`,
    price: sess.price,
    quantity: 1,
    image: '',
    itemType: 'shisha',
    alcohol: false,
    description: `${sess.duration} session at ${loc.name}`,
  });
  selectedSession = null;
  selectedLocation = null;
  renderShisha(document.getElementById('shisha-screen-body'));
};

window.shishaQuickAdd = function(id) {
  const all = [...shishaProducts, ...getDemoShisha()];
  const p = all.find(x => x.id === id || x.id === parseInt(id));
  if (!p) return;
  ctx.addToCart({
    id: p.id,
    name: `Shisha: ${p.name}`,
    price: p.price,
    quantity: 1,
    image: '',
    itemType: 'shisha',
    alcohol: false,
    description: p.description || 'Shisha flavour',
  });
};

function getDemoShisha() {
  return [
    { id: 'sh1', name: 'Double Apple',   description: 'Classic double apple blend', price: 180 },
    { id: 'sh2', name: 'Mint Lemon',     description: 'Refreshing mint and citrus', price: 180 },
    { id: 'sh3', name: 'Grape Mint',     description: 'Sweet grape with cool mint', price: 190 },
    { id: 'sh4', name: 'Watermelon Ice', description: 'Fresh watermelon with ice', price: 190 },
    { id: 'sh5', name: 'Blueberry',      description: 'Premium blueberry blend',    price: 200 },
    { id: 'sh6', name: 'Custom Mix',     description: 'Create your own flavour combination', price: 220 },
  ];
}
