/**
 * modules/vvip.js
 * VVIP Experience module.
 * Loads VVIP packages from Supabase, displays benefits and pricing.
 */

let ctx = {};

const fallbackPackages = [
  {
    id: 'vvip-1', name: 'Platinum Table', price: 2500, tier: 'platinum',
    description: 'Premium table for up to 6 guests with dedicated bottle service.',
    benefits: ['Dedicated waitstaff', '2 Premium bottles included', 'Reserved seating', 'Priority entry', 'Complimentary starter platter'],
    guests: 6, duration: 'Full night',
  },
  {
    id: 'vvip-2', name: 'Gold Experience', price: 1500, tier: 'gold',
    description: 'Elevated experience for up to 4 guests with express access.',
    benefits: ['1 Premium bottle included', 'Reserved lounge area', 'Priority entry', 'Dedicated host'],
    guests: 4, duration: 'Full night',
  },
  {
    id: 'vvip-3', name: 'Silver Package', price: 800, tier: 'silver',
    description: 'Enhanced experience for couples or small groups.',
    benefits: ['Premium seating area', 'Skip the queue', 'Welcome drinks', 'Complimentary dessert'],
    guests: 2, duration: 'Full night',
  },
  {
    id: 'vvip-4', name: 'VVIP Cabana', price: 5000, tier: 'diamond',
    description: 'The ultimate Rands experience. Private cabana with full service.',
    benefits: ['Private cabana', '3 Premium bottles', 'Personal concierge', 'Custom menu', 'Dedicated valet', 'VIP parking'],
    guests: 10, duration: 'Full night',
  },
];

const tierColors = {
  silver:   { color: '#AAAAAA', bg: 'rgba(170,170,170,0.08)', border: 'rgba(170,170,170,0.2)' },
  gold:     { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)' },
  platinum: { color: '#E2E8F0', bg: 'rgba(226,232,240,0.08)', border: 'rgba(226,232,240,0.25)' },
  diamond:  { color: '#60A5FA', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.25)' },
};

export async function load(context) {
  ctx = context;
  const body = document.getElementById('vvip-screen-body');
  if (!body) return;

  body.innerHTML = `<div class="loading-skeleton"><div class="sk-grid"><div class="sk-card"></div><div class="sk-card"></div></div></div>`;

  let packages = await loadVvipPackages();
  renderVvip(body, packages);
}

async function loadVvipPackages() {
  try {
    const { data, error } = await ctx.supabase
      .from('vvip_packages')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });
    if (error) throw error;
    return (data && data.length > 0) ? data : fallbackPackages;
  } catch (e) {
    // Try generic products table
    try {
      const { data } = await ctx.supabase.from('products').select('*').ilike('category', 'vvip');
      if (data && data.length > 0) {
        return data.map(p => ({
          id: p.id, name: p.name, price: p.price || p.unit_price || 0,
          tier: 'gold', description: p.description || 'Premium VVIP package',
          benefits: ['VIP access', 'Premium service', 'Reserved seating'],
          guests: 2, duration: 'Full night',
        }));
      }
    } catch { /* ignore */ }
    return fallbackPackages;
  }
}

function renderVvip(body, packages) {
  body.innerHTML = `
    <div style="text-align:center;margin-bottom:2.5rem;">
      <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:var(--r-full);padding:6px 18px;margin-bottom:1.2rem;">
        <i class="fas fa-crown" style="color:#F59E0B;font-size:0.9rem"></i>
        <span style="font-size:0.65rem;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#F59E0B;">VVIP Experience</span>
      </div>
      <div style="font-family:'Playfair Display',serif;font-size:2rem;font-weight:900;color:var(--white);margin-bottom:8px;line-height:1.1">Unlock the<br><em style="color:var(--red)">Ultimate</em> Rands Experience</div>
      <p style="font-size:0.88rem;color:var(--muted);max-width:500px;margin:0 auto;line-height:1.6">Select a VVIP package for an unforgettable night. All packages include priority access, dedicated service, and premium amenities.</p>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-bottom:2rem;">
      ${packages.map(p => vvipCardHTML(p)).join('')}
    </div>

    <div style="background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(0,0,0,0));border:1px solid rgba(245,158,11,0.2);border-radius:var(--r-xl);padding:1.8rem;text-align:center;">
      <div style="font-size:0.65rem;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#F59E0B;margin-bottom:10px">Need a custom package?</div>
      <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:800;color:var(--white);margin-bottom:8px">Talk to Our Concierge</div>
      <p style="font-size:0.82rem;color:var(--muted);line-height:1.5">For group events, corporate bookings, or fully bespoke experiences, speak to a Rands host.</p>
      <button class="btn-primary" style="margin-top:1.2rem;background:#F59E0B;box-shadow:0 8px 24px rgba(245,158,11,0.3);" onclick="ctx.toast('Please speak to a Rands host at the entrance')">
        <i class="fas fa-concierge-bell"></i> Request Concierge
      </button>
    </div>
  `;
}

function vvipCardHTML(p) {
  const tier = tierColors[p.tier] || tierColors.gold;
  const isTop = p.tier === 'diamond' || p.tier === 'platinum';
  return `
    <div style="position:relative;border:1px solid ${tier.border};background:${tier.bg};border-radius:var(--r-xl);padding:2rem;overflow:hidden;transition:transform 0.3s var(--ease-back),box-shadow 0.3s ease;"
      onmouseenter="this.style.transform='translateY(-6px)';this.style.boxShadow='0 24px 60px rgba(0,0,0,0.4)'"
      onmouseleave="this.style.transform='';this.style.boxShadow=''">
      ${isTop ? `<div style="position:absolute;top:0;right:0;background:${tier.color};color:#000;font-size:0.55rem;font-weight:900;letter-spacing:2px;text-transform:uppercase;padding:4px 14px;border-radius:0 var(--r-xl) 0 var(--r-md);">RECOMMENDED</div>` : ''}
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.2rem;">
        <div style="width:48px;height:48px;border-radius:var(--r-md);background:${tier.bg};border:1px solid ${tier.border};display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-crown" style="color:${tier.color};font-size:1.3rem"></i>
        </div>
        <div>
          <div style="font-size:0.6rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${tier.color}">${p.tier?.toUpperCase() || 'PREMIUM'}</div>
          <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:800;color:var(--white);line-height:1.2">${p.name}</div>
        </div>
      </div>

      <p style="font-size:0.8rem;color:var(--muted);line-height:1.5;margin-bottom:1.2rem;">${p.description || ''}</p>

      ${p.benefits ? `
        <div style="margin-bottom:1.4rem;">
          ${(Array.isArray(p.benefits) ? p.benefits : JSON.parse(p.benefits || '[]')).map(b => `
            <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:0.78rem;color:var(--silver);">
              <i class="fas fa-check-circle" style="color:${tier.color};flex-shrink:0;font-size:0.75rem"></i>
              ${b}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid ${tier.border};padding-top:1.2rem;">
        <div>
          ${p.guests ? `<div style="font-size:0.68rem;color:var(--muted)"><i class="fas fa-users" style="color:${tier.color}"></i> Up to ${p.guests} guests</div>` : ''}
          ${p.duration ? `<div style="font-size:0.68rem;color:var(--muted);margin-top:3px"><i class="fas fa-clock" style="color:${tier.color}"></i> ${p.duration}</div>` : ''}
          <div style="font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:900;color:${tier.color};margin-top:6px">R ${ctx.formatPrice(p.price)}</div>
        </div>
        <button class="btn-primary" style="background:${tier.color === '#F59E0B' ? '#F59E0B' : 'var(--red)'};box-shadow:0 8px 24px rgba(0,0,0,0.3);flex-shrink:0;"
          onclick="vvipAddToCart('${p.id}','${p.name.replace(/'/g,"\\'")}',${p.price},'${p.tier || ''}')">
          <i class="fas fa-plus"></i> Book
        </button>
      </div>
    </div>
  `;
}

window.vvipAddToCart = function(id, name, price, tier) {
  ctx.addToCart({
    id: `vvip-${id}`,
    name: `VVIP: ${name}`,
    price: parseFloat(price),
    quantity: 1,
    image: '',
    itemType: 'vvip',
    alcohol: false,
    description: `${tier?.toUpperCase() || 'PREMIUM'} VVIP package`,
  });
};
