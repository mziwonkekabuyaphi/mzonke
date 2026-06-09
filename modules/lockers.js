/**
 * modules/lockers.js
 * Locker rental module.
 * Preserves all locker loading, status display, and rental logic from rands-kiosk.html.
 */

let ctx = {};
let lockers = [];
let selectedLocker = null;
let selectedDuration = null;

const durationOptions = [
  { id: 'd1', label: '2 Hours',   price: 50,  hours: 2 },
  { id: 'd2', label: '4 Hours',   price: 80,  hours: 4 },
  { id: 'd3', label: 'Full Day',  price: 120, hours: 24 },
  { id: 'd4', label: 'Overnight', price: 200, hours: 48 },
];

export async function load(context) {
  ctx = context;
  const body = document.getElementById('lockers-screen-body');
  if (!body) return;

  body.innerHTML = `<div class="loading-skeleton"><div class="sk-line sk-title"></div></div>`;

  await loadLockers();
  renderLockers(body);
}

async function loadLockers() {
  try {
    const { data, error } = await ctx.supabase
      .from('lockers')
      .select('*')
      .order('locker_number', { ascending: true });
    if (error) throw error;
    lockers = data || [];
    ctx.state.lockers = lockers;
  } catch (e) {
    console.error('Lockers load error:', e);
    lockers = getDemoLockers();
    ctx.state.lockers = lockers;
  }
}

function renderLockers(body) {
  const available = lockers.filter(l => l.status === 'available').length;
  const occupied  = lockers.filter(l => l.status === 'rented' || l.status === 'occupied').length;

  const subtitleEl = document.getElementById('lockers-subtitle');
  if (subtitleEl) subtitleEl.textContent = `${available} Available · ${occupied} Occupied`;

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:2rem;">
      <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:var(--r-lg);padding:1.2rem;text-align:center;">
        <div style="font-family:'Playfair Display',serif;font-size:2rem;font-weight:800;color:var(--green)">${available}</div>
        <div style="font-size:0.65rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted)">Available</div>
      </div>
      <div style="background:rgba(227,6,19,0.06);border:1px solid rgba(227,6,19,0.18);border-radius:var(--r-lg);padding:1.2rem;text-align:center;">
        <div style="font-family:'Playfair Display',serif;font-size:2rem;font-weight:800;color:var(--red)">${occupied}</div>
        <div style="font-size:0.65rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted)">Occupied</div>
      </div>
      <div style="background:var(--glass);border:1px solid var(--border);border-radius:var(--r-lg);padding:1.2rem;text-align:center;">
        <div style="font-family:'Playfair Display',serif;font-size:2rem;font-weight:800;color:var(--white)">${lockers.length}</div>
        <div style="font-size:0.65rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted)">Total</div>
      </div>
    </div>

    <div class="section-divider"><span>Select a Locker</span></div>
    <div class="locker-grid">
      ${lockers.map(l => lockerSlotHTML(l)).join('')}
    </div>

    <div id="locker-rental-panel" style="display:none;margin-top:1.5rem;background:var(--glass);border:1px solid var(--border-mid);border-radius:var(--r-xl);padding:2rem;">
      <div id="locker-rental-body"></div>
    </div>

    <div style="margin-top:2rem;background:var(--glass);border:1px solid var(--border);border-radius:var(--r-xl);padding:1.5rem;">
      <div style="font-size:0.65rem;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:var(--red);margin-bottom:8px;">🔒 Locker Info</div>
      <p style="font-size:0.82rem;color:var(--silver);line-height:1.5;">All lockers are electronic with secure PIN access. A unique PIN will be generated at checkout. Items left beyond rental period may be removed. Management not responsible for lost items.</p>
    </div>
  `;
}

function lockerSlotHTML(l) {
  const isAvailable = l.status === 'available';
  const isOccupied  = l.status === 'rented' || l.status === 'occupied';
  const isSelected  = selectedLocker?.id === l.id;
  return `
    <div class="locker-slot ${isAvailable ? 'available' : isOccupied ? 'occupied' : ''} ${isSelected ? 'locker-selected' : ''}"
      onclick="lockerSelect('${l.id}')"
      style="${isSelected ? 'border-color:var(--red);box-shadow:0 0 0 2px var(--red-glow);' : ''}"
      title="Locker ${l.locker_number || l.id} — ${l.status}">
      <div class="ls-num">${l.locker_number || l.number || l.id}</div>
      <div class="ls-status">${isAvailable ? 'Free' : isOccupied ? 'Taken' : l.status}</div>
    </div>
  `;
}

window.lockerSelect = function(id) {
  const locker = lockers.find(l => l.id === id);
  if (!locker) return;
  if (locker.status === 'rented' || locker.status === 'occupied') {
    ctx.toast('This locker is currently occupied');
    return;
  }
  selectedLocker = locker;
  selectedDuration = null;
  // Re-render grid with selection
  const body = document.getElementById('lockers-screen-body');
  if (body) renderLockers(body);
  showRentalPanel(locker);
};

function showRentalPanel(locker) {
  const panel = document.getElementById('locker-rental-panel');
  const rentalBody = document.getElementById('locker-rental-body');
  if (!panel || !rentalBody) return;
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  rentalBody.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.5rem">
      <div style="width:52px;height:52px;border-radius:var(--r-md);background:var(--green);display:flex;align-items:center;justify-content:center;">
        <i class="fas fa-unlock-alt" style="color:white;font-size:1.4rem"></i>
      </div>
      <div>
        <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:800;color:var(--white)">Locker ${locker.locker_number || locker.number || locker.id}</div>
        <div style="font-size:0.72rem;color:var(--green)">Available · Ready to Rent</div>
      </div>
    </div>

    <div class="section-divider" style="margin-bottom:1rem"><span>Select Rental Duration</span></div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:1.5rem">
      ${durationOptions.map(d => `
        <div onclick="lockerSelectDuration('${d.id}')" id="dur-${d.id}"
          style="border:1px solid ${selectedDuration === d.id ? 'var(--red)' : 'var(--border)'};
                 background:${selectedDuration === d.id ? 'var(--red-faint)' : 'var(--glass)'};
                 border-radius:var(--r-lg);padding:1rem;cursor:pointer;transition:all 0.2s;text-align:center;">
          <div style="font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:800;color:var(--white)">${d.label}</div>
          <div style="font-size:0.72rem;color:var(--muted);margin:3px 0">${d.hours} hour${d.hours > 1 ? 's' : ''}</div>
          <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:800;color:var(--red)">R ${ctx.formatPrice(d.price)}</div>
        </div>
      `).join('')}
    </div>

    <button class="btn-primary btn-full" onclick="lockerAddToCart()" id="locker-add-btn" ${!selectedDuration ? 'disabled style="opacity:0.5"' : ''}>
      <i class="fas fa-lock"></i> Reserve Locker ${locker.locker_number || locker.id}
    </button>
  `;
}

window.lockerSelectDuration = function(id) {
  selectedDuration = id;
  if (selectedLocker) showRentalPanel(selectedLocker);
};

window.lockerAddToCart = function() {
  if (!selectedLocker || !selectedDuration) { ctx.toast('Select a locker and duration'); return; }
  const dur = durationOptions.find(d => d.id === selectedDuration);
  if (!dur) return;
  ctx.addToCart({
    id: `locker-${selectedLocker.id}-${dur.id}`,
    name: `Locker ${selectedLocker.locker_number || selectedLocker.id} · ${dur.label}`,
    price: dur.price,
    quantity: 1,
    image: '',
    itemType: 'locker',
    locker_id: selectedLocker.id,
    alcohol: false,
    description: `${dur.hours}-hour locker rental`,
  });

  // Mark locker as reserved in Supabase
  ctx.supabase.from('lockers').update({ status: 'reserved' }).eq('id', selectedLocker.id).then(({ error }) => {
    if (error) console.warn('Locker update error:', error);
  });

  selectedLocker = null;
  selectedDuration = null;
  const body = document.getElementById('lockers-screen-body');
  if (body) renderLockers(body);
};

function getDemoLockers() {
  return Array.from({ length: 24 }, (_, i) => ({
    id: `demo-${i + 1}`,
    locker_number: i + 1,
    status: Math.random() > 0.6 ? 'rented' : 'available',
  }));
}
