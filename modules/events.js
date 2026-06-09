/**
 * modules/events.js
 * Events & Ticketing module.
 * Preserves all Supabase queries, ticket type loading, and cart logic
 * from rands-kiosk.html.
 */

let ctx = {};

export async function load(context) {
  ctx = context;
  const body = document.getElementById('events-screen-body');
  if (!body) return;

  body.innerHTML = `<div class="loading-skeleton"><div class="sk-grid"><div class="sk-card"></div><div class="sk-card"></div><div class="sk-card"></div></div></div>`;

  await loadEvents();
  renderEventsScreen(body);
}

async function loadEvents() {
  try {
    const { data: events, error } = await ctx.supabase
      .from('events').select('*')
      .eq('is_active', true)
      .eq('status', 'active')
      .order('start_time', { ascending: true });
    if (error) throw error;
    ctx.state.eventsList = events || [];
    for (const ev of ctx.state.eventsList) {
      const { data: tickets } = await ctx.supabase
        .from('ticket_types').select('price')
        .eq('event_id', ev.id).order('price', { ascending: true }).limit(1);
      ev.min_price = tickets?.[0]?.price || ev.base_price || 0;
    }
  } catch (e) {
    console.error('Events load error:', e);
    ctx.state.eventsList = [];
  }
}

function renderEventsScreen(body) {
  const subtitle = document.getElementById('events-subtitle');
  if (subtitle) subtitle.textContent = `${ctx.state.eventsList.length} Event${ctx.state.eventsList.length !== 1 ? 's' : ''} Available`;

  if (ctx.state.eventsList.length === 0) {
    body.innerHTML = `
      <div style="text-align:center;padding:5rem 2rem;opacity:0.5">
        <i class="fas fa-calendar-times" style="font-size:4rem;color:var(--muted);margin-bottom:1.5rem;display:block"></i>
        <div style="font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:800;color:var(--white);margin-bottom:8px;">No Events Right Now</div>
        <div style="font-size:0.9rem;color:var(--muted);">Check back soon for upcoming events at Rands!</div>
      </div>`;
    return;
  }

  body.innerHTML = `
    <div class="section-divider"><span>Upcoming Events</span></div>
    <div class="events-grid">
      ${ctx.state.eventsList.map(ev => eventCardHTML(ev)).join('')}
    </div>
  `;
}

function eventCardHTML(ev) {
  const img = ev.banner_url || ev.image_url || ev.banner || ev.image || '';
  const date = ev.start_time ? new Date(ev.start_time).toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
  const time = ev.start_time ? new Date(ev.start_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '';

  return `
    <div class="event-card" onclick="eventsOpenTicketModal('${ev.id}')">
      <div class="event-poster">
        ${img ? `<img src="${img}" alt="${ev.name}" onerror="this.style.display='none'">` : ''}
        <div class="ep-bg"></div>
        <div class="event-date-badge"><i class="far fa-calendar-alt"></i> ${date}</div>
        <div class="ep-content">
          <div class="ep-tag">${ev.event_type || 'Live Event'}</div>
          <div class="ep-name">${ev.name}</div>
        </div>
      </div>
      <div class="event-card-body">
        <div class="ec-meta">
          <span class="ec-chip">
            <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${ev.location || 'Rands Venue'}
          </span>
          ${time ? `<span class="ec-chip">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${time}
          </span>` : ''}
        </div>
        ${ev.description ? `<p style="font-size:0.78rem;color:var(--muted);line-height:1.5;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${ev.description}</p>` : ''}
        <div class="ec-footer">
          <div class="ec-price">
            <span style="font-size:0.7rem;color:var(--muted);display:block;font-family:'Inter',sans-serif;">from</span>
            R ${ctx.formatPrice(ev.min_price || 0)}
          </div>
          <div class="ec-avail">
            <i class="fas fa-circle" style="font-size:0.5rem;margin-right:4px"></i>
            Available
          </div>
        </div>
        <button class="btn-primary btn-full" style="margin-top:12px;" onclick="event.stopPropagation(); eventsOpenTicketModal('${ev.id}')">
          <i class="fas fa-ticket-alt"></i> Buy Ticket
        </button>
      </div>
    </div>
  `;
}

// ─── TICKET MODAL ─────────────────────────────────────────────────────────────
window.eventsOpenTicketModal = async function(eventId) {
  const ev = (ctx.state.eventsList || []).find(e => e.id === eventId);
  if (!ev) return;

  const modal = document.getElementById('event-modal');
  const body = document.getElementById('event-modal-body');
  if (!modal || !body) return;

  body.innerHTML = `
    <div class="modal-header">
      <div style="display:flex;align-items:center;gap:12px;flex:1;overflow:hidden;">
        ${ev.banner_url || ev.image_url ? `<img src="${ev.banner_url || ev.image_url}" style="width:52px;height:52px;border-radius:var(--r-md);object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'">` : ''}
        <div style="overflow:hidden">
          <div class="modal-title" style="font-size:1.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ev.name}</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:2px"><i class="fas fa-map-marker-alt" style="color:var(--red)"></i> ${ev.location || 'Rands Venue'}</div>
        </div>
      </div>
      <button class="modal-close" onclick="document.getElementById('event-modal').classList.remove('open')">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div id="event-ticket-types">
        <div style="text-align:center;padding:2rem;opacity:0.6">
          <i class="fas fa-spinner fa-pulse" style="font-size:1.5rem;color:var(--red)"></i>
        </div>
      </div>
    </div>
  `;
  modal.classList.add('open');

  try {
    const { data, error } = await ctx.supabase.from('ticket_types').select('*').eq('event_id', eventId);
    if (error) throw error;
    const types = data || [];
    const ttEl = document.getElementById('event-ticket-types');
    if (!ttEl) return;

    if (types.length === 0) {
      ttEl.innerHTML = `<div style="text-align:center;padding:2rem;opacity:0.6">No ticket types available for this event.</div>`;
      return;
    }

    ttEl.innerHTML = `
      <div class="section-divider" style="margin-bottom:1rem"><span>Select Ticket Type</span></div>
      ${types.map(t => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--border);gap:12px;">
          <div style="flex:1">
            <div style="font-weight:700;color:var(--white);font-size:1rem;margin-bottom:4px;">${t.name}</div>
            ${t.description ? `<div style="font-size:0.75rem;color:var(--muted);">${t.description}</div>` : ''}
            <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:800;color:var(--red);margin-top:6px;">R ${ctx.formatPrice(t.price)}</div>
          </div>
          <button class="btn-primary" style="padding:10px 20px;font-size:0.65rem;flex-shrink:0;"
            onclick="eventsAddTicket('${eventId}','${t.id}','${t.name.replace(/'/g,"\\'")}',${t.price})">
            <i class="fas fa-plus"></i> Add
          </button>
        </div>
      `).join('')}
      <button class="btn-ghost" onclick="document.getElementById('event-modal').classList.remove('open')">Close</button>
    `;
  } catch (e) {
    const ttEl = document.getElementById('event-ticket-types');
    if (ttEl) ttEl.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--red)">Failed to load ticket types. Please try again.</div>`;
  }
};

window.eventsAddTicket = function(eventId, ticketTypeId, ticketTypeName, price) {
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
