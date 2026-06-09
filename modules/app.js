/**
 * RANDS KIOSK SPA — app.js
 * Main application controller.
 * Handles: navigation, global cart, checkout, screensaver, admin, stats, feed.
 * All Supabase/business logic preserved exactly from original files.
 */

import { createClient } from '@supabase/supabase-js';

// ─── SUPABASE ────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://yrtujcynqafgynsjdkxi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlydHVqY3lucWFmZ3luc2pka3hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI3MzgwMjMsImV4cCI6MjA1ODMxNDAyM30.jXQMxN0Yf3bgCSmImEhBQcEMEF0SvnxRLjmPkzpAL0w';
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── GLOBAL STATE ────────────────────────────────────────────────────────────
export const state = {
  cart: [],
  eventsList: [],
  products: [],
  lockers: [],
  ticketTypes: [],
};

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
const screenStack = [];

export function openScreen(id) {
  const el = document.getElementById(id);
  if (!el) return;
  // Hide all module screens (not home)
  document.querySelectorAll('.screen:not(#home-screen)').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  el.scrollTop = 0;
  screenStack.push(id);
  resetInactivityTimer();
}

export function closeScreen() {
  screenStack.pop();
  const prev = screenStack[screenStack.length - 1];
  document.querySelectorAll('.screen:not(#home-screen)').forEach(s => s.classList.remove('active'));
  if (prev && prev !== 'home-screen') {
    document.getElementById(prev)?.classList.add('active');
  }
  resetInactivityTimer();
}

window.openScreen = openScreen;
window.closeScreen = closeScreen;

// ─── TOAST ───────────────────────────────────────────────────────────────────
let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
window.toast = toast;

// ─── GLOBAL CART ─────────────────────────────────────────────────────────────
export function addToCart(item) {
  // item: { id, name, price, quantity, image, itemType, alcohol, event_id, ticket_type_id, description }
  const existing = state.cart.find(c => c.id === item.id && c.itemType === item.itemType && c.event_id === item.event_id);
  if (existing) {
    existing.quantity += (item.quantity || 1);
  } else {
    state.cart.push({ ...item, quantity: item.quantity || 1 });
  }
  toast(`✓ ${item.name} added to cart`);
  renderCart();
  updateAllCartBadges();
}

export function removeFromCart(id, itemType, event_id) {
  state.cart = state.cart.filter(c => !(c.id === id && c.itemType === itemType && c.event_id === event_id));
  renderCart();
  updateAllCartBadges();
}

export function updateCartQty(id, itemType, event_id, delta) {
  const item = state.cart.find(c => c.id === id && c.itemType === itemType && c.event_id === event_id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) removeFromCart(id, itemType, event_id);
  else { renderCart(); updateAllCartBadges(); }
}

function getCartTotal() { return state.cart.reduce((s, i) => s + i.price * i.quantity, 0); }
function getCartCount() { return state.cart.reduce((s, i) => s + i.quantity, 0); }
function formatPrice(n) { return Number(n).toFixed(2); }

export function renderCart() {
  const itemsEl = document.getElementById('drawer-items');
  const footerEl = document.getElementById('drawer-footer');
  const subtotalEl = document.getElementById('drawer-subtotal');
  const totalEl = document.getElementById('drawer-total');
  if (!itemsEl) return;

  if (state.cart.length === 0) {
    itemsEl.innerHTML = `<div class="empty-cart"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg><p>Your cart is empty</p></div>`;
    if (footerEl) footerEl.style.display = 'none';
    return;
  }

  itemsEl.innerHTML = state.cart.map(item => `
    <div class="cart-item">
      <img class="cart-item-img" src="${item.image || 'https://picsum.photos/seed/${item.id}/70/70'}" onerror="this.style.opacity='0.3'">
      <div class="cart-item-details">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-meta">${item.itemType === 'ticket' ? 'Event Ticket' : item.itemType === 'locker' ? 'Locker Rental' : 'Menu Item'}</div>
        <div class="cart-item-price">R ${formatPrice(item.price)} each</div>
        <div class="cart-qty-control">
          <button class="qty-btn" onclick="updateCartQty('${item.id}','${item.itemType}','${item.event_id || ''}', -1)">−</button>
          <span style="min-width:28px;text-align:center;font-weight:700">${item.quantity}</span>
          <button class="qty-btn" onclick="updateCartQty('${item.id}','${item.itemType}','${item.event_id || ''}', 1)">+</button>
          <button class="qty-remove" onclick="removeFromCart('${item.id}','${item.itemType}','${item.event_id || ''}')" title="Remove">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div style="font-family:'Playfair Display',serif;font-size:1rem;font-weight:800;color:var(--white);flex-shrink:0;">R ${formatPrice(item.price * item.quantity)}</div>
    </div>
  `).join('');

  const total = getCartTotal();
  if (subtotalEl) subtotalEl.textContent = `R ${formatPrice(total)}`;
  if (totalEl) totalEl.textContent = `R ${formatPrice(total)}`;
  if (footerEl) footerEl.style.display = 'block';
}

function updateAllCartBadges() {
  const count = getCartCount();
  const total = getCartTotal();

  // Menu cart button
  const menuBtn = document.getElementById('menu-cart-btn');
  const menuCount = document.getElementById('menu-cart-count');
  if (menuBtn) menuBtn.style.display = count > 0 ? 'inline-flex' : 'none';
  if (menuCount) menuCount.textContent = count > 0 ? `${count} item${count > 1 ? 's' : ''} · R ${formatPrice(total)}` : '';

  // Home cart badge
  const homeBadge = document.getElementById('home-cart-badge');
  if (homeBadge) {
    if (count > 0) {
      homeBadge.style.display = 'inline-flex';
      homeBadge.textContent = `${count} item${count > 1 ? 's' : ''} · R ${formatPrice(total)}`;
    } else {
      homeBadge.style.display = 'none';
    }
  }

  // Floating cart (menu screen)
  const fc = document.getElementById('floating-cart');
  if (fc) {
    fc.style.display = count > 0 ? 'flex' : 'none';
    const badge = fc.querySelector('.cart-badge');
    const totalEl = fc.querySelector('.cart-total-text');
    if (badge) badge.textContent = count;
    if (totalEl) totalEl.textContent = `R ${formatPrice(total)}`;
  }
}
window.updateCartQty = updateCartQty;
window.removeFromCart = removeFromCart;

// ─── CART DRAWER ─────────────────────────────────────────────────────────────
export function openCartDrawer() {
  document.getElementById('cart-drawer')?.classList.add('open');
  document.getElementById('cart-overlay')?.classList.add('open');
}
export function closeCartDrawer() {
  document.getElementById('cart-drawer')?.classList.remove('open');
  document.getElementById('cart-overlay')?.classList.remove('open');
}
window.openCartDrawer = openCartDrawer;
window.closeCartDrawer = closeCartDrawer;

// ─── CHECKOUT ────────────────────────────────────────────────────────────────
let checkoutStep = 1;
let selectedPayMethod = 'yoco';
let yocoInstance = null;
let orderNumber = '';
let generatedTickets = [];
let voucherCode = '';

export function startCheckout() {
  if (getCartCount() === 0) { toast('Your cart is empty'); return; }
  closeCartDrawer();
  checkoutStep = 1;
  selectedPayMethod = 'yoco';
  renderCheckout();
  document.getElementById('checkout-modal')?.classList.add('open');
}
export function closeCheckoutModal() {
  document.getElementById('checkout-modal')?.classList.remove('open');
  checkoutStep = 1;
}
window.startCheckout = startCheckout;
window.closeCheckoutModal = closeCheckoutModal;

function renderCheckout() {
  const body = document.getElementById('checkout-body');
  if (!body) return;

  const total = getCartTotal();
  const steps = ['Review', 'Payment', 'Complete'];

  body.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">Checkout</div>
      <button class="modal-close" onclick="closeCheckoutModal()">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="checkout-steps">
        ${steps.map((s, i) => `<div class="checkout-step ${i + 1 === checkoutStep ? 'active' : i + 1 < checkoutStep ? 'done' : ''}">${s}</div>`).join('')}
      </div>
      ${checkoutStep === 1 ? renderCheckoutStep1(total) : ''}
      ${checkoutStep === 2 ? renderCheckoutStep2(total) : ''}
      ${checkoutStep === 3 ? renderCheckoutStep3() : ''}
    </div>
  `;

  if (checkoutStep === 2 && selectedPayMethod === 'yoco') {
    initYoco();
  }
}

function renderCheckoutStep1(total) {
  return `
    <h3 style="font-family:'Playfair Display',serif;margin-bottom:1rem;">Review Your Order</h3>
    <div style="margin-bottom:1.5rem;">
      ${state.cart.map(i => `
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:0.9rem;color:var(--silver)">${i.quantity}× ${i.name}</span>
          <span style="font-weight:700;color:var(--white)">R ${formatPrice(i.price * i.quantity)}</span>
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:14px 0 0;font-size:1.1rem;font-weight:800">
        <span>Total</span><span style="font-family:'Playfair Display',serif;font-size:1.4rem;color:var(--white)">R ${formatPrice(total)}</span>
      </div>
    </div>
    <button class="btn-primary btn-full" onclick="goCheckoutStep(2)">Continue to Payment</button>
    <button class="btn-ghost" onclick="closeCheckoutModal()">Cancel</button>
  `;
}

function renderCheckoutStep2(total) {
  return `
    <h3 style="font-family:'Playfair Display',serif;margin-bottom:1rem;">Select Payment</h3>
    <div class="pay-option-card ${selectedPayMethod === 'yoco' ? 'selected' : ''}" onclick="selectPayMethod('yoco')">
      <i class="fas fa-credit-card"></i>
      <div><strong>Card Payment</strong><p>Visa, Mastercard, Apple Pay via Yoco</p></div>
    </div>
    <div class="pay-option-card ${selectedPayMethod === 'cash' ? 'selected' : ''}" onclick="selectPayMethod('cash')">
      <i class="fas fa-money-bill-wave"></i>
      <div><strong>Cash</strong><p>Pay at the counter</p></div>
    </div>
    <div class="pay-option-card ${selectedPayMethod === 'voucher' ? 'selected' : ''}" onclick="selectPayMethod('voucher')">
      <i class="fas fa-ticket-alt"></i>
      <div><strong>1Voucher</strong><p>Redeem airtime/data voucher</p></div>
    </div>
    <div class="pay-option-card ${selectedPayMethod === 'wallet' ? 'selected' : ''}" onclick="selectPayMethod('wallet')">
      <i class="fas fa-wallet"></i>
      <div><strong>Rands Wallet</strong><p>Pay with your venue wallet balance</p></div>
    </div>

    ${selectedPayMethod === 'yoco' ? `
      <div class="yoco-card-container"><div id="yoco-card-element" class="yoco-card-frame"></div></div>
      <button class="btn-primary btn-full" onclick="processYocoPayment()" id="yoco-pay-btn">
        <i class="fas fa-lock"></i> Pay R ${formatPrice(total)}
      </button>
    ` : ''}

    ${selectedPayMethod === 'cash' ? `
      <div style="background:var(--glass);border:1px solid var(--border);border-radius:var(--r-lg);padding:1.5rem;text-align:center;margin:14px 0">
        <i class="fas fa-coins" style="font-size:2.5rem;color:var(--red);margin-bottom:12px;display:block"></i>
        <p style="margin-bottom:14px;color:var(--silver)">Please pay R ${formatPrice(total)} at the counter</p>
        <button class="btn-primary btn-full" onclick="completeCashPayment()" style="background:#059669;box-shadow:0 8px 24px rgba(5,150,105,0.3)">
          <i class="fas fa-check"></i> Mark as Paid
        </button>
      </div>
    ` : ''}

    ${selectedPayMethod === 'voucher' ? `
      <div style="margin:14px 0">
        <div class="field-group">
          <label class="field-label">Voucher Code</label>
          <input type="text" id="voucher-input" class="field-input" placeholder="Enter 16-digit voucher PIN" value="${voucherCode}">
        </div>
        <button class="btn-primary btn-full" onclick="processVoucherPayment()" style="background:#8B5CF6;box-shadow:0 8px 24px rgba(139,92,246,0.3)">
          <i class="fas fa-ticket-alt"></i> Redeem Voucher
        </button>
      </div>
    ` : ''}

    <button class="btn-ghost" onclick="goCheckoutStep(1)">← Back to Review</button>
  `;
}

function renderCheckoutStep3() {
  return `
    <div class="success-body">
      <div class="success-icon">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="success-title">Order Placed!</div>
      <div class="success-sub">Your order has been received and is being processed.</div>
      <div class="success-code">${orderNumber}</div>
      <button class="btn-primary" onclick="showReceiptModal()">
        <i class="fas fa-receipt"></i> View Tickets & Receipt
      </button>
      <button class="btn-secondary" onclick="finalizeSuccess()">Done</button>
    </div>
  `;
}

window.goCheckoutStep = function(n) {
  checkoutStep = n;
  renderCheckout();
};
window.selectPayMethod = function(method) {
  selectedPayMethod = method;
  renderCheckout();
  if (method === 'yoco') setTimeout(initYoco, 100);
};

// ─── YOCO ─────────────────────────────────────────────────────────────────────
function initYoco() {
  if (window.YocoSDK) {
    if (!yocoInstance) {
      yocoInstance = new window.YocoSDK({ publicKey: 'pk_live_8f6d8c3b9a2e4d7f1c5e8a9b3d6f2c4e' });
    }
    setTimeout(() => {
      const el = document.getElementById('yoco-card-element');
      if (el && el.childElementCount === 0) yocoInstance.mount({ cardContainer: 'yoco-card-element' });
    }, 150);
  } else {
    setTimeout(initYoco, 500);
  }
}

window.processYocoPayment = async function() {
  if (!yocoInstance) { toast('Payment system initialising...'); return; }
  const btn = document.getElementById('yoco-pay-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }
  try {
    const result = await yocoInstance.createToken();
    if (result.error) throw new Error(result.error.message);
    orderNumber = `RANDS-${Date.now()}`;
    await saveOrderAndCreateTickets('card');
    checkoutStep = 3;
    renderCheckout();
  } catch (err) {
    toast(err.message);
    if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-lock"></i> Pay R ${formatPrice(getCartTotal())}`; }
  }
};

window.completeCashPayment = async function() {
  orderNumber = `CASH-${Date.now()}`;
  await saveOrderAndCreateTickets('cash');
  checkoutStep = 3;
  renderCheckout();
};

window.processVoucherPayment = async function() {
  const code = document.getElementById('voucher-input')?.value;
  if (!code || code.length < 8) { toast('Enter valid voucher code'); return; }
  voucherCode = code;
  orderNumber = `VCH-${Date.now()}`;
  await saveOrderAndCreateTickets('voucher');
  checkoutStep = 3;
  renderCheckout();
};

// ─── ORDER CREATION ───────────────────────────────────────────────────────────
async function saveOrderAndCreateTickets(paymentMethod) {
  try {
    const { error: orderError } = await supabase.from('orders').insert({
      customer_name: 'Guest', customer_phone: null,
      total_amount: getCartTotal(), payment_method: paymentMethod,
      payment_status: 'paid', status: 'placed', source: 'kiosk',
      order_number: orderNumber,
      items: state.cart.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, type: i.itemType, description: i.description, alcohol: i.alcohol || false }))
    });
    if (orderError) throw orderError;

    // Create ticket records for event tickets
    const ticketItems = state.cart.filter(i => i.itemType === 'ticket');
    generatedTickets = [];
    for (const ticketItem of ticketItems) {
      for (let j = 0; j < ticketItem.quantity; j++) {
        const ticketId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${j}`;
        const { data: newTicket, error: ticketError } = await supabase.from('tickets').insert({
          id: ticketId, event_id: ticketItem.event_id,
          ticket_type_id: ticketItem.ticket_type_id,
          customer_phone: null, status: 'issued',
          issued_at: new Date().toISOString(), checked_in: false,
          ticket_type: ticketItem.ticket_type_name?.toLowerCase().includes('vip') ? 'vip' : 'general',
          qr_token: `TKT-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
        }).select().single();
        if (!ticketError && newTicket) generatedTickets.push(newTicket);
      }
    }
    toast('✓ Order placed successfully!');
  } catch (err) {
    console.error('Order error:', err);
    toast('Order saved (offline mode)');
  }
}

// ─── RECEIPT ──────────────────────────────────────────────────────────────────
window.showReceiptModal = function() {
  const modal = document.getElementById('receipt-modal');
  const body = document.getElementById('receipt-modal-body');
  if (!modal || !body) return;

  const ticketItems = state.cart.filter(i => i.itemType === 'ticket');
  const otherItems = state.cart.filter(i => i.itemType !== 'ticket');

  let html = `
    <div class="modal-header">
      <div class="modal-title"><i class="fas fa-receipt" style="color:var(--red);margin-right:8px;"></i>Order Summary</div>
      <button class="modal-close" onclick="document.getElementById('receipt-modal').classList.remove('open')">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="receipt-content" id="receipt-print-area">
      <div class="receipt-header">
        <h3>RANDS KIOSK</h3>
        <div>${new Date().toLocaleString()}</div>
        <div>ORDER: ${orderNumber}</div>
      </div>
  `;

  // Tickets
  for (const ticket of generatedTickets) {
    const event = state.eventsList.find(e => e.id === ticket.event_id);
    const manualCode = ticket.id.slice(-8).toUpperCase();
    const qrId = `qr-${ticket.id.replace(/[^a-zA-Z0-9]/g, '')}`;
    html += `
      <div class="ticket-item">
        <div class="ticket-header">
          <h4>RANDS EVENTS</h4>
          <div style="font-size:10px">PREMIUM ADMISSION TICKET</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:bold;margin:10px 0">${(event?.name || 'Event').toUpperCase()}</div>
          ${ticket.ticket_type === 'vip' ? '<div class="vip-badge">★★★★★ VIP ACCESS ★★★★★</div>' : ''}
        </div>
        <div style="border-top:1px dashed #000;border-bottom:1px dashed #000;padding:10px 0;margin:10px 0">
          <div><strong>DATE:</strong> ${event?.start_time ? new Date(event.start_time).toLocaleDateString('en-ZA', { day:'numeric', month:'long', year:'numeric' }).toUpperCase() : 'TBD'}</div>
          <div><strong>TIME:</strong> ${event?.start_time ? new Date(event.start_time).toLocaleTimeString('en-ZA', { hour:'2-digit', minute:'2-digit' }) : 'TBD'}</div>
          <div><strong>VENUE:</strong> ${(event?.location || 'RANDS LIFESTYLE').toUpperCase()}</div>
          <div><strong>TYPE:</strong> ${ticket.ticket_type?.toUpperCase() || 'GENERAL'}</div>
        </div>
        <div style="text-align:center;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:10px 0;margin:10px 0">
          <div style="font-size:10px">TICKET ID</div>
          <div style="font-size:14px;font-weight:bold;letter-spacing:1px">${ticket.id}</div>
          <div style="font-size:10px;margin-top:4px">MANUAL: ${manualCode}</div>
        </div>
        <div class="qr-container"><div id="${qrId}"></div><div style="font-size:10px;margin-top:8px">SCAN FOR ENTRY</div></div>
        <div style="text-align:center;font-size:9px;margin-top:8px">NO REFUNDS · VALID FOR ONE ENTRY</div>
        <div style="text-align:center;font-size:10px;font-weight:bold;margin-top:6px">RANDS.CO.ZA</div>
      </div>
    `;
    setTimeout(() => {
      const container = document.getElementById(qrId);
      if (container && typeof QRCode !== 'undefined') {
        new QRCode(container, {
          text: JSON.stringify({ ticket_id: ticket.id, event_id: ticket.event_id, ticket_type: ticket.ticket_type, manual_code: manualCode }),
          width: 120, height: 120, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H
        });
      }
    }, 100);
  }

  // Other items receipt
  if (otherItems.length > 0) {
    html += `<div style="border:1px solid #ccc;padding:15px;margin-top:20px;border-radius:8px">
      <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:10px;margin-bottom:15px"><h3>KITCHEN / BAR ORDER</h3></div>`;
    otherItems.forEach(item => {
      html += `<div style="display:flex;justify-content:space-between;margin:8px 0"><span>${item.quantity} x ${item.name}</span><span>R ${formatPrice(item.price * item.quantity)}</span></div>`;
    });
    html += `<div style="border-top:1px solid #000;margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;font-weight:bold"><span>TOTAL</span><span>R ${formatPrice(getCartTotal())}</span></div></div>`;
  }

  html += `</div>
    <div style="padding:1.2rem 1.5rem;display:flex;gap:10px;border-top:1px solid var(--border);background:rgba(0,0,0,0.3)">
      <button class="btn-primary" style="flex:1;" onclick="printReceipt()"><i class="fas fa-print"></i> Print</button>
      <button class="btn-secondary" style="flex:1;" onclick="finalizeSuccess()"><i class="fas fa-check"></i> Done</button>
    </div>
  `;

  body.innerHTML = html;
  modal.classList.add('open');
  setTimeout(() => { document.getElementById('receipt-modal').classList.remove('open'); printReceipt(); }, 500);
};

window.printReceipt = function() {
  const content = document.getElementById('receipt-print-area');
  if (!content) return;
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rands Tickets & Receipt</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;padding:20px;background:white}
    .ticket-item{border:2px solid #000;margin-bottom:20px;padding:15px;border-radius:8px;page-break-after:always}
    .ticket-item:last-child{page-break-after:auto}.ticket-header{text-align:center;border-bottom:2px dashed #000;padding-bottom:10px;margin-bottom:12px}
    .qr-container{text-align:center;margin:15px 0}@media print{body{padding:0}}</style></head>
    <body>${content.innerHTML}<script>setTimeout(()=>{window.print();setTimeout(()=>window.close(),1000)},500)<\/script></body></html>`);
  win.document.close();
};

window.finalizeSuccess = function() {
  state.cart = [];
  generatedTickets = [];
  orderNumber = '';
  renderCart();
  updateAllCartBadges();
  closeCheckoutModal();
  document.getElementById('receipt-modal')?.classList.remove('open');
  toast('🎉 Enjoy your Rands experience!');
};

// ─── STATS ────────────────────────────────────────────────────────────────────
async function updateStats() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [checkins, orders, lockers, events] = await Promise.all([
      supabase.from('checkins').select('*', { count: 'exact', head: true }).gte('scanned_at', today),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('lockers').select('*', { count: 'exact', head: true }).eq('status', 'rented'),
      supabase.from('events').select('*', { count: 'exact', head: true }).eq('is_active', true).gte('start_time', new Date().toISOString()),
    ]);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = (v || 0).toLocaleString(); };
    set('stat-checkins', checkins.count);
    set('stat-orders', orders.count);
    set('stat-lockers', lockers.count);
    set('stat-events', events.count);
  } catch (err) { console.error('Stats error:', err); }
}

window.updateStats = updateStats;

// ─── FEATURED EVENT BANNER ────────────────────────────────────────────────────
async function loadFeaturedEvent() {
  try {
    const { data } = await supabase.from('events').select('*').eq('is_active', true).order('start_time', { ascending: true }).limit(1).single();
    if (!data) return;
    const titleEl = document.getElementById('fe-title');
    const metaEl = document.getElementById('fe-meta');
    const priceEl = document.getElementById('fe-price');
    if (titleEl) titleEl.textContent = data.name;
    if (metaEl) metaEl.innerHTML = `
      <div class="fe-detail"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${data.start_time ? new Date(data.start_time).toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' }) : 'TBD'}</div>
      <div class="fe-detail"><svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${data.location || 'Rands Venue'}</div>
    `;
    if (priceEl) priceEl.innerHTML = `<span>from</span>R ${(data.base_price || 0).toFixed(0)}`;
  } catch (e) {
    const titleEl = document.getElementById('fe-title');
    if (titleEl) titleEl.textContent = 'Events at Rands';
  }
}

// ─── LIVE FEED ────────────────────────────────────────────────────────────────
function buildFeed() {
  const msgs = [
    "🎟️ Tickets selling fast for Rooftop Party",
    "🍾 New bottle stored in Locker 42",
    "🥩 Butcher Queue now serving #27",
    "💳 Wallet top-up completed",
    "🎶 DJ set starts at 22:00",
    "🔒 Lockers available on Level 2",
    "⭐ VVIP packages available tonight"
  ];
  const el = document.getElementById('feedScroll');
  if (el) {
    const all = [...msgs, ...msgs];
    el.innerHTML = all.map(m => `<span class="feed-item"><span class="feed-sep"></span>${m}</span>`).join('');
  }
}

// ─── CLOCK ────────────────────────────────────────────────────────────────────
(function tick() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  setTimeout(tick, 1000);
})();

// ─── PARTICLES ────────────────────────────────────────────────────────────────
(function() {
  const c = document.getElementById('particles');
  if (!c) return;
  for (let i = 0; i < 30; i++) {
    const e = document.createElement('div');
    e.className = 'pt';
    e.style.cssText = `left:${Math.random()*100}%;width:${1+Math.random()*2.5}px;height:${1+Math.random()*2.5}px;background:${Math.random()>0.5?'#E30613':'rgba(255,255,255,0.3)'};--d:${7+Math.random()*12}s;--dl:${-(Math.random()*15)}s;--sx:${Math.random()*100-50}px`;
    c.appendChild(e);
  }
})();

// ─── SCREENSAVER ──────────────────────────────────────────────────────────────
let idleTimer = null;
let slideIndex = 0;
let slideInterval = null;
const ssEl = document.getElementById('screensaver');
const slides = [1,2,3].map(n => document.getElementById(`ss-slide-${n}`)).filter(Boolean);

function showSlide(n) { slides.forEach((s, i) => s.classList.toggle('active', i === n)); }
function startSlides() { if (slideInterval) clearInterval(slideInterval); slideInterval = setInterval(() => { slideIndex = (slideIndex + 1) % slides.length; showSlide(slideIndex); }, 10000); }
function stopSlides() { if (slideInterval) clearInterval(slideInterval); slideInterval = null; }
function activateSS() { if (!ssEl || ssEl.classList.contains('active')) return; ssEl.classList.add('active'); slideIndex = 0; showSlide(0); startSlides(); }

window.dismissScreensaver = function() {
  if (!ssEl?.classList.contains('active')) return;
  ssEl.classList.remove('active');
  stopSlides();
  resetInactivityTimer();
};

function resetInactivityTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(activateSS, 5 * 60 * 1000);
}

['touchstart','touchend','mousemove','mousedown','keydown','scroll','click'].forEach(ev => {
  document.addEventListener(ev, () => { if (!ssEl?.classList.contains('active')) resetInactivityTimer(); }, { passive: true });
});
resetInactivityTimer();

// ─── ADMIN ────────────────────────────────────────────────────────────────────
let adminTapCount = 0;
let adminTapTimer = null;
const logoTap = document.getElementById('logoTap');
if (logoTap) {
  logoTap.addEventListener('click', () => {
    adminTapCount++;
    clearTimeout(adminTapTimer);
    adminTapTimer = setTimeout(() => adminTapCount = 0, 3000);
    if (adminTapCount >= 5) { adminTapCount = 0; document.getElementById('adminModal')?.classList.add('open'); }
  });
}

window.checkAdminPin = function() {
  const p = document.getElementById('adminPin')?.value;
  if (p === '1234' || p === 'admin') {
    document.getElementById('adminLoginForm').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('adminLastSync').textContent = new Date().toLocaleTimeString();
    toast('Admin mode active');
  } else { toast('Invalid admin PIN'); }
};

window.closeAdmin = function() {
  document.getElementById('adminModal')?.classList.remove('open');
  setTimeout(() => {
    const lf = document.getElementById('adminLoginForm');
    const ap = document.getElementById('adminPanel');
    const pin = document.getElementById('adminPin');
    if (lf) lf.style.display = 'block';
    if (ap) ap.style.display = 'none';
    if (pin) pin.value = '';
  }, 300);
};

window.refreshAllData = async function() {
  toast('🔄 Syncing with Supabase...');
  await Promise.all([updateStats(), loadFeaturedEvent()]);
  const el = document.getElementById('adminLastSync');
  if (el) el.textContent = new Date().toLocaleTimeString();
  toast('✓ Data synced successfully');
};

// ─── MODULE LOADERS (delegates to each module) ────────────────────────────────
// Each module handles its own DOM injection into the respective screen-body div.
// These are called by nav card onclick handlers.
import { load as loadMenu } from './modules/menu.js';
import { load as loadEvents } from './modules/events.js';
import { load as loadButcher } from './modules/butcher.js';
import { load as loadShisha } from './modules/shisha.js';
import { load as loadLockers } from './modules/lockers.js';
import { load as loadWallet } from './modules/wallet.js';
import { load as loadVvip } from './modules/vvip.js';

window.loadMenuModule    = () => loadMenu({ supabase, state, addToCart, openCartDrawer, toast, formatPrice, updateAllCartBadges });
window.loadEventsModule  = () => loadEvents({ supabase, state, addToCart, toast, formatPrice });
window.loadButcherModule = () => loadButcher({ supabase, state, addToCart, toast, formatPrice });
window.loadShishaModule  = () => loadShisha({ supabase, state, addToCart, toast, formatPrice });
window.loadLockersModule = () => loadLockers({ supabase, state, addToCart, toast, formatPrice });
window.loadWalletModule  = () => loadWallet({ supabase, state, toast, formatPrice });
window.loadVvipModule    = () => loadVvip({ supabase, state, addToCart, toast, formatPrice });

// Modal close helpers
window.closeProductModal = (e) => { if (e.target === e.currentTarget) document.getElementById('product-modal').classList.remove('open'); };
window.closeEventModal   = (e) => { if (e.target === e.currentTarget) document.getElementById('event-modal').classList.remove('open'); };

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  buildFeed();
  renderCart();
  updateAllCartBadges();
  await Promise.all([updateStats(), loadFeaturedEvent()]);
});

console.log('%c🔴 RANDS KIOSK SPA v4.1 | Unified Architecture | All modules active', 'color:#E30613;font-size:14px;font-weight:bold;background:#0f0f0f;padding:6px 12px;border-radius:4px');
