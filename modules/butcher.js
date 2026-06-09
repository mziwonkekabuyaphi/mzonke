/**
 * modules/butcher.js
 * Butcher platter builder module.
 * Loads products WHERE category='butcher' from Supabase.
 * Preserves all logic from rands-kiosk.html butcher section.
 */

let ctx = {};
let butcherProducts = [];

export async function load(context) {
  ctx = context;
  const body = document.getElementById('butcher-screen-body');
  if (!body) return;

  body.innerHTML = `<div class="loading-skeleton"><div class="sk-grid"><div class="sk-card"></div><div class="sk-card"></div><div class="sk-card"></div><div class="sk-card"></div></div></div>`;

  await loadButcherProducts();
  renderButcher(body);
}

async function loadButcherProducts() {
  try {
    // First try dedicated butcher products table
    const { data, error } = await ctx.supabase
      .from('products')
      .select('*')
      .ilike('category', 'butcher');

    if (error) throw error;
    butcherProducts = (data || []).map(p => ({
      ...p,
      price: p.price || p.unit_price || 0,
      description: p.description || p.product_description || 'Premium cut from our master butcher',
    }));

    // Fallback: also check state.products if already loaded
    if (butcherProducts.length === 0 && ctx.state.products?.length) {
      butcherProducts = ctx.state.products.filter(p => (p.category || '').toLowerCase() === 'butcher');
    }
  } catch (e) {
    console.error('Butcher load error:', e);
    butcherProducts = getDemoButcherProducts();
  }
}

function renderButcher(body) {
  if (butcherProducts.length === 0) {
    body.innerHTML = `
      <div style="text-align:center;padding:5rem 2rem;opacity:0.5">
        <div style="font-size:4rem;margin-bottom:1rem">🥩</div>
        <div style="font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:800;color:var(--white);margin-bottom:8px;">No Cuts Available</div>
        <div style="font-size:0.9rem;color:var(--muted);">Check back soon for today's selection.</div>
      </div>`;
    return;
  }

  body.innerHTML = `
    <div style="margin-bottom:2rem;">
      <div style="font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:800;color:var(--white);margin-bottom:6px;">Build Your Platter</div>
      <p style="font-size:0.85rem;color:var(--muted);line-height:1.5;">Select your premium cuts below. Add multiple items to create your custom platter. Each cut is freshly prepared by our master butcher.</p>
    </div>

    <div class="section-divider"><span>Available Cuts · ${butcherProducts.length} items</span></div>

    <div class="products-grid">
      ${butcherProducts.map(p => butcherCardHTML(p)).join('')}
    </div>

    <div style="margin-top:2rem;background:var(--glass);border:1px solid var(--red-border);border-radius:var(--r-xl);padding:1.5rem;">
      <div style="font-size:0.65rem;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:var(--red);margin-bottom:8px;">🥩 Butcher's Note</div>
      <p style="font-size:0.82rem;color:var(--silver);line-height:1.5;">All cuts are sourced from premium South African farms. Cooking time: 15–25 minutes. Please notify staff of any dietary requirements.</p>
    </div>
  `;
}

function butcherCardHTML(p) {
  const img = p.image_url || p.image || '';
  return `
    <div class="product-card" onclick="butcherOpenProduct('${p.id}')">
      <div class="product-img">
        ${img
          ? `<img src="${img}" alt="${p.name}" onerror="this.parentElement.innerHTML='<div class=product-img-placeholder>🥩</div>'">`
          : `<div class="product-img-placeholder">🥩</div>`
        }
        ${p.weight ? `<span class="alcohol-tag" style="background:var(--charcoal);border:1px solid var(--border)">${p.weight}</span>` : ''}
      </div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-description">${p.description || ''}</div>
        <div class="product-price">R ${ctx.formatPrice(p.price)}</div>
        <button class="quick-add" onclick="event.stopPropagation(); butcherQuickAdd('${p.id}')">
          <i class="fas fa-plus-circle"></i> Add to Platter
        </button>
      </div>
    </div>
  `;
}

window.butcherOpenProduct = function(id) {
  const p = butcherProducts.find(x => x.id === id || x.id === parseInt(id));
  if (!p) return;

  const modal = document.getElementById('product-modal');
  const body = document.getElementById('product-modal-body');
  if (!modal || !body) return;

  body.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${p.name}</div>
      <button class="modal-close" onclick="document.getElementById('product-modal').classList.remove('open')">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">
      ${p.image_url || p.image ? `<img src="${p.image_url || p.image}" style="width:100%;height:200px;object-fit:contain;border-radius:var(--r-lg);background:var(--ash);padding:12px;margin-bottom:1rem;" onerror="this.style.display='none'">` : `<div style="text-align:center;font-size:5rem;margin-bottom:1rem;">🥩</div>`}
      <p style="color:var(--silver);line-height:1.6;margin-bottom:8px;">${p.description || 'Premium cut from our master butcher'}</p>
      ${p.weight ? `<div style="font-size:0.72rem;color:var(--muted);margin-bottom:12px"><i class="fas fa-weight-hanging" style="color:var(--red)"></i> Weight: ${p.weight}</div>` : ''}
      ${p.cooking_time ? `<div style="font-size:0.72rem;color:var(--muted);margin-bottom:12px"><i class="fas fa-fire" style="color:var(--red)"></i> Cook time: ${p.cooking_time}</div>` : ''}
      <div style="font-family:'Playfair Display',serif;font-size:2rem;font-weight:800;color:var(--red);margin:1rem 0;">R ${ctx.formatPrice(p.price)}</div>
      <div style="display:flex;align-items:center;gap:20px;justify-content:center;margin-bottom:1.5rem;">
        <button id="btch-minus" onclick="butcherModalQtyChange(-1)" style="width:48px;height:48px;border-radius:50%;background:var(--glass-high);border:1px solid var(--border);color:white;font-size:1.4rem;font-weight:700;cursor:pointer;">−</button>
        <span id="btch-qty" style="font-size:1.6rem;font-weight:800;min-width:48px;text-align:center;">1</span>
        <button id="btch-plus" onclick="butcherModalQtyChange(1)" style="width:48px;height:48px;border-radius:50%;background:var(--glass-high);border:1px solid var(--border);color:white;font-size:1.4rem;font-weight:700;cursor:pointer;">+</button>
      </div>
      <button class="btn-primary btn-full" onclick="butcherAddToCart('${p.id}')">
        <i class="fas fa-plus-circle"></i> Add to Platter
      </button>
    </div>
  `;
  window._butcherModalQty = 1;
  window._butcherCurrentId = p.id;
  modal.classList.add('open');
};

window.butcherModalQtyChange = function(delta) {
  window._butcherModalQty = Math.max(1, (window._butcherModalQty || 1) + delta);
  const el = document.getElementById('btch-qty');
  if (el) el.textContent = window._butcherModalQty;
};

window.butcherAddToCart = function(id) {
  const p = butcherProducts.find(x => x.id === id || x.id === parseInt(id));
  if (!p) return;
  const qty = window._butcherModalQty || 1;
  ctx.addToCart({ id: p.id, name: `Butcher: ${p.name}`, price: p.price, quantity: qty, image: p.image_url || p.image, itemType: 'butcher', alcohol: false, description: p.description });
  document.getElementById('product-modal')?.classList.remove('open');
};

window.butcherQuickAdd = function(id) {
  const p = butcherProducts.find(x => x.id === id || x.id === parseInt(id));
  if (!p) return;
  ctx.addToCart({ id: p.id, name: `Butcher: ${p.name}`, price: p.price, quantity: 1, image: p.image_url || p.image, itemType: 'butcher', alcohol: false, description: p.description });
};

function getDemoButcherProducts() {
  return [
    { id: 'b1', name: 'Ribeye Steak',    description: 'Premium 300g grass-fed ribeye', price: 320, weight: '300g', cooking_time: '20 min' },
    { id: 'b2', name: 'T-Bone Steak',    description: 'Classic 400g T-bone, perfectly marbled', price: 380, weight: '400g', cooking_time: '25 min' },
    { id: 'b3', name: 'Sirloin Steak',   description: 'Lean and tender 250g sirloin', price: 280, weight: '250g', cooking_time: '15 min' },
    { id: 'b4', name: 'Lamb Chops',      description: 'Four premium lamb chops with herbs', price: 260, weight: '350g', cooking_time: '20 min' },
    { id: 'b5', name: 'Pork Ribs',       description: 'Full rack slow-smoked pork ribs', price: 240, weight: '500g', cooking_time: '30 min' },
    { id: 'b6', name: 'Boerewors 500g',  description: 'Traditional South African boerewors', price: 120, weight: '500g', cooking_time: '15 min' },
  ];
}
