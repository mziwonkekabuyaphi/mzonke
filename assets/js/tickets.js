// =============================================
//  RANDS EVENT PASS — TICKETS PAGE LOGIC
// =============================================

import { supabase } from ‘../../config/supabase.js’;
import {
showToast, escapeHtml,
loadTickets,
} from ‘./utils.js’;

// ── Page state ────────────────────────────────
let events          = [];
let selectedEventId = null;

// ── Supabase: load events ─────────────────────
async function loadEventsFromSupabase() {
try {
const { data, error } = await supabase
.from(‘events’)
.select(’*’)
.order(‘created_at’, { ascending: false });

```
if (error) {
  console.error('Supabase load error:', error);
  showToast('Failed to load events from database', 'error');
  return [];
}

if (data && data.length > 0) {
  const eventsList = data.map(supEvent => {
    let ticketTypes = {
      earlyBird: { price: 250, capacity: 200, sold: 0 },
      general:   { price: 350, capacity: 400, sold: 0 },
      vip:       { price: 550, capacity: 80,  sold: 0 },
    };

    if (supEvent.description?.includes('EarlyBird')) {
      const ebMatch = supEvent.description.match(/EarlyBird R(\d+)\//);
      if (ebMatch) ticketTypes.earlyBird.price = parseInt(ebMatch[1]);
      const ebCapMatch = supEvent.description.match(/EarlyBird R\d+\/(\d+)/);
      if (ebCapMatch) ticketTypes.earlyBird.capacity = parseInt(ebCapMatch[1]);

      const genMatch = supEvent.description.match(/General R(\d+)\/(\d+)/);
      if (genMatch) {
        ticketTypes.general.price    = parseInt(genMatch[1]);
        ticketTypes.general.capacity = parseInt(genMatch[2]);
      }

      const vipMatch = supEvent.description.match(/VIP R(\d+)\/(\d+)/);
      if (vipMatch) {
        ticketTypes.vip.price    = parseInt(vipMatch[1]);
        ticketTypes.vip.capacity = parseInt(vipMatch[2]);
      }
    }

    return {
      id:          supEvent.id,
      name:        supEvent.name,
      date:        supEvent.start_time ? supEvent.start_time.split('T')[0] : new Date().toISOString().split('T')[0],
      location:    supEvent.location || 'Rands Cape Town',
      status:      'active',
      ticketTypes,
    };
  });

  console.log('✅ Loaded', eventsList.length, 'events from Supabase');
  return eventsList;
}

return [];
```

} catch (err) {
console.error(‘Failed to load from Supabase:’, err);
return [];
}
}

// ── Bootstrap ─────────────────────────────────
async function init() {
events = await loadEventsFromSupabase();
updateTicketStats();
renderFullEventCard();

if (events.length > 0) {
selectedEventId = events[0].id;
selectEvent(selectedEventId);
}

console.log(‘✅ Tickets page ready’);
}

// ── Ticket stats ──────────────────────────────
function updateTicketStats() {
const tickets        = loadTickets();
const uniqueHolders  = new Set(tickets.map(t => t.ticketId?.split(’_’)[0])).size;
let revenue          = 0;
for (const ev of events) {
for (const type in ev.ticketTypes) {
revenue += (ev.ticketTypes[type].sold || 0) * (ev.ticketTypes[type].price || 0);
}
}

document.getElementById(‘totalTickets’).innerText       = tickets.length;
document.getElementById(‘totalEvents’).innerText        = events.filter(e => e.status === ‘active’).length;
document.getElementById(‘totalTicketHolders’).innerText = uniqueHolders;
document.getElementById(‘totalRevenue’).innerText       = ‘R’ + revenue.toLocaleString();
}

// ── Full event card ───────────────────────────
function renderFullEventCard() {
const container = document.getElementById(‘fullEventCardContainer’);
if (!events.length) {
container.innerHTML = ` <div class="empty-state" style="background:white; border-radius:28px; padding:30px;"> <i class="fas fa-calendar-times" style="font-size:48px; color:#E30613;"></i> <p style="margin-top:12px;">No events yet. Click "Add Event"</p> </div>`;
return;
}

const event = selectedEventId ? events.find(e => e.id === selectedEventId) : events[0];
if (!event) return;

const totalSold = (event.ticketTypes.earlyBird?.sold || 0)
+ (event.ticketTypes.general?.sold   || 0)
+ (event.ticketTypes.vip?.sold        || 0);
const totalCap  = (event.ticketTypes.earlyBird?.capacity || 0)
+ (event.ticketTypes.general?.capacity   || 0)
+ (event.ticketTypes.vip?.capacity        || 0);
const percent   = totalCap ? Math.round((totalSold / totalCap) * 100) : 0;
const statusClass = event.status === ‘active’ ? ‘active’ : (event.status === ‘upcoming’ ? ‘upcoming’ : ‘ended’);

container.innerHTML = `
<div class="event-card-full">
<div class="event-banner-full">
<span class="event-status-badge-full ${statusClass}">
${event.status === ‘active’ ? ‘🔥 LIVE’ : event.status.toUpperCase()}
</span>
</div>
<div class="event-content-full">
<div class="event-title-full">${escapeHtml(event.name)}</div>
<div class="detail-item-full"><i class="fas fa-calendar-alt"></i><span>${event.date || ‘TBD’}</span></div>
<div class="detail-item-full"><i class="fas fa-map-marker-alt"></i><span>${escapeHtml(event.location || ‘Rands Cape Town’)}</span></div>

```
    <div class="ticket-types-full">
      ${event.ticketTypes.earlyBird ? `
        <div class="ticket-row-full">
          <span class="ticket-label-full">🎟️ Early Bird</span>
          <span class="ticket-price-full">R${event.ticketTypes.earlyBird.price}</span>
          <span class="ticket-sold-full">${event.ticketTypes.earlyBird.sold} sold</span>
        </div>` : ''}
      ${event.ticketTypes.general ? `
        <div class="ticket-row-full">
          <span class="ticket-label-full">👥 General Admission</span>
          <span class="ticket-price-full">R${event.ticketTypes.general.price}</span>
          <span class="ticket-sold-full">${event.ticketTypes.general.sold} sold</span>
        </div>` : ''}
      ${event.ticketTypes.vip ? `
        <div class="ticket-row-full">
          <span class="ticket-label-full">👑 VIP Experience</span>
          <span class="ticket-price-full">R${event.ticketTypes.vip.price}</span>
          <span class="ticket-sold-full">${event.ticketTypes.vip.sold} sold</span>
        </div>` : ''}
    </div>

    <div class="stats-row-full">
      <div class="stat-block-full">
        <div class="stat-number-full">${totalSold}</div>
        <div class="stat-label-full">Sold</div>
      </div>
      <div class="stat-block-full">
        <div class="stat-number-full">${totalCap - totalSold}</div>
        <div class="stat-label-full">Remaining</div>
      </div>
      <div class="stat-block-full">
        <div class="stat-number-full">${percent}%</div>
        <div class="stat-label-full">Capacity</div>
      </div>
    </div>

    <div class="event-actions-full">
      <button class="action-btn-full view"      onclick="viewEventDetails('${event.id}')"><i class="fas fa-eye"></i> View</button>
      <button class="action-btn-full edit"      onclick="openEditTicketModalById('${event.id}')"><i class="fas fa-edit"></i> Edit</button>
      <button class="action-btn-full delete"    onclick="deleteSelectedEventById('${event.id}')"><i class="fas fa-trash"></i> Delete</button>
      <button class="action-btn-full duplicate" onclick="duplicateEvent('${event.id}')"><i class="fas fa-copy"></i> Duplicate</button>
    </div>
  </div>
</div>`;
```

}

// ── Select event ──────────────────────────────
function selectEvent(eventId) {
selectedEventId = eventId;
const ev = events.find(e => e.id === eventId);
if (!ev) return;

document.getElementById(‘selectedEventInfo’).style.display     = ‘block’;
document.getElementById(‘selectedEventDisplay’).innerHTML      = `Selected: ${ev.name}`;
document.getElementById(‘selEventName’).innerText     = ev.name;
document.getElementById(‘selEventDate’).innerText     = ev.date;
document.getElementById(‘selEventLocation’).innerText = ev.location || ‘TBA’;

renderTicketInventory();
renderEventPurchases();
renderFullEventCard();
}

// ── Ticket inventory ──────────────────────────
function renderTicketInventory() {
const container = document.getElementById(‘ticketInventory’);
if (!selectedEventId) {
container.innerHTML = ‘<div class="empty-state"><span>🎟️</span><p>Select an event</p></div>’;
return;
}
const ev = events.find(e => e.id === selectedEventId);
if (!ev) return;

const types = [
{ key: ‘earlyBird’, label: ‘🐦 Early Bird’ },
{ key: ‘general’,   label: ‘🎟️ General’   },
{ key: ‘vip’,       label: ‘👑 VIP’        },
];

container.innerHTML = types.map(t => {
const data = ev.ticketTypes[t.key];
if (!data) return ‘’;
const remaining = data.capacity - data.sold;
return ` <div class="transaction-item"> <div class="transaction-left"> <div class="transaction-icon"><i class="fas fa-ticket-alt"></i></div> <div class="transaction-details"> <div class="transaction-type">${t.label}</div> <div class="transaction-time">Price: R${data.price} | Cap: ${data.capacity}</div> </div> </div> <div class="transaction-amount amount-positive"> Sold: ${data.sold}<br> <span style="font-size:0.6rem;">Left: ${remaining}</span> </div> </div>`;
}).join(’’);
}

// ── Event purchases ───────────────────────────
function renderEventPurchases() {
const container = document.getElementById(‘eventPurchases’);
if (!selectedEventId) {
container.innerHTML = ‘<div class="empty-state"><span>📭</span><p>Select an event</p></div>’;
return;
}
const ev           = events.find(e => e.id === selectedEventId);
const tickets      = loadTickets();
const eventTickets = tickets.filter(t => t.eventName === ev.name);

if (!eventTickets.length) {
container.innerHTML = ‘<div class="empty-state"><span>🎫</span><p>No tickets purchased</p></div>’;
return;
}

container.innerHTML = eventTickets.map(t => `<div class="transaction-item"> <div class="transaction-left"> <div class="transaction-icon"><i class="fas fa-user"></i></div> <div class="transaction-details"> <div class="transaction-type">${escapeHtml(t.ticketType)}</div> <div class="transaction-time">ID: ${t.ticketId?.slice(-12)}</div> </div> </div> <div class="transaction-amount amount-positive">R${t.price?.toFixed(2) || 0}</div> </div>`).join(’’);
}

// ── Add Event modal ───────────────────────────
function openAddEventModal()  { document.getElementById(‘addEventModal’).classList.add(‘active’); }
function closeAddEventModal() { document.getElementById(‘addEventModal’).classList.remove(‘active’); }

function toggleTicketFields(type) {
const fields = document.getElementById(`${type}Fields`);
if (!fields) return;
fields.classList.toggle(‘active’);
const icon = fields.parentElement.querySelector(’.toggle-icon i’);
if (icon) icon.className = fields.classList.contains(‘active’) ? ‘fas fa-chevron-up’ : ‘fas fa-chevron-down’;
}

async function confirmAddEvent() {
const name     = document.getElementById(‘newEventName’).value;
const date     = document.getElementById(‘newEventDate’).value;
const location = document.getElementById(‘newEventLocation’).value.trim() || ‘Rands Cape Town’;

if (!name || !date) { showToast(‘Event name and date required’, ‘error’); return; }

const earlyBirdPrice = parseFloat(document.getElementById(‘newEarlyBirdPrice’).value) || 0;
const earlyBirdCap   = parseInt(document.getElementById(‘newEarlyBirdCapacity’).value)  || 0;
const generalPrice   = parseFloat(document.getElementById(‘newGeneralPrice’).value)     || 0;
const generalCap     = parseInt(document.getElementById(‘newGeneralCapacity’).value)    || 0;
const vipPrice       = parseFloat(document.getElementById(‘newVipPrice’).value)         || 0;
const vipCap         = parseInt(document.getElementById(‘newVipCapacity’).value)        || 0;

const ticketTypes = {};
if (earlyBirdPrice > 0 && earlyBirdCap > 0) ticketTypes.earlyBird = { price: earlyBirdPrice, capacity: earlyBirdCap, sold: 0 };
if (generalPrice > 0 && generalCap > 0)     ticketTypes.general   = { price: generalPrice,   capacity: generalCap,   sold: 0 };
if (vipPrice > 0 && vipCap > 0)             ticketTypes.vip       = { price: vipPrice,        capacity: vipCap,       sold: 0 };

if (!Object.keys(ticketTypes).length) {
showToast(‘Add at least one ticket type with price and capacity’, ‘error’);
return;
}

showToast(‘Saving event to database…’, ‘success’);

try {
const result = await supabase.from(‘events’).insert([{
name,
location,
start_time:  date,
description: `Tickets: EarlyBird R${earlyBirdPrice}/${earlyBirdCap} | General R${generalPrice}/${generalCap} | VIP R${vipPrice}/${vipCap}`,
}]);

```
if (result.error) {
  console.error('❌ Supabase error:', result.error);
  showToast('Database error: ' + result.error.message, 'error');
} else {
  console.log('✅ Saved to Supabase:', result.data);
  showToast(`Event "${name}" saved to database!`, 'success');
  const freshEvents = await loadEventsFromSupabase();
  events = freshEvents;
  renderFullEventCard();
  updateTicketStats();
  if (events.length > 0 && !selectedEventId) {
    selectedEventId = events[0].id;
    selectEvent(selectedEventId);
  }
}
```

} catch (err) {
console.error(‘❌ Network error:’, err);
showToast(‘Network error - check console’, ‘error’);
}

closeAddEventModal();
// Reset form
document.getElementById(‘newEventName’).value     = ‘’;
document.getElementById(‘newEventDate’).value     = ‘’;
document.getElementById(‘newEventLocation’).value = ‘Rands Cape Town’;
[‘newEarlyBirdPrice’,‘newEarlyBirdCapacity’,‘newGeneralPrice’,‘newGeneralCapacity’,‘newVipPrice’,‘newVipCapacity’]
.forEach(id => { const el = document.getElementById(id); if (el) el.value = ‘’; });
[‘earlyBirdFields’,‘generalFields’,‘vipFields’]
.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove(‘active’); });
}

// ── Edit Ticket modal ─────────────────────────
function openEditTicketModal() {
if (!selectedEventId) { showToast(‘Select an event first’, ‘error’); return; }
const ev = events.find(e => e.id === selectedEventId);
document.getElementById(‘editEventNameDisplay’).innerHTML      = ev.name;
document.getElementById(‘editEarlyBirdPrice’).value    = ev.ticketTypes.earlyBird?.price    || ‘’;
document.getElementById(‘editEarlyBirdCapacity’).value = ev.ticketTypes.earlyBird?.capacity || ‘’;
document.getElementById(‘editGeneralPrice’).value      = ev.ticketTypes.general?.price      || ‘’;
document.getElementById(‘editGeneralCapacity’).value   = ev.ticketTypes.general?.capacity   || ‘’;
document.getElementById(‘editVipPrice’).value          = ev.ticketTypes.vip?.price          || ‘’;
document.getElementById(‘editVipCapacity’).value       = ev.ticketTypes.vip?.capacity       || ‘’;
document.getElementById(‘editTicketModal’).classList.add(‘active’);
}

function openEditTicketModalById(id) {
const ev = events.find(e => e.id === id);
if (ev) { selectedEventId = id; openEditTicketModal(); }
}

function closeEditTicketModal() { document.getElementById(‘editTicketModal’).classList.remove(‘active’); }

function confirmEditTickets() {
if (!selectedEventId) return;
const ev      = events.find(e => e.id === selectedEventId);
const ebPrice = parseFloat(document.getElementById(‘editEarlyBirdPrice’).value);
const ebCap   = parseInt(document.getElementById(‘editEarlyBirdCapacity’).value);
const genPrice = parseFloat(document.getElementById(‘editGeneralPrice’).value);
const genCap   = parseInt(document.getElementById(‘editGeneralCapacity’).value);
const vipPrice = parseFloat(document.getElementById(‘editVipPrice’).value);
const vipCap   = parseInt(document.getElementById(‘editVipCapacity’).value);

if (ebPrice && ebCap)   ev.ticketTypes.earlyBird = { price: ebPrice, capacity: ebCap, sold: ev.ticketTypes.earlyBird?.sold || 0 };
if (genPrice && genCap) ev.ticketTypes.general   = { price: genPrice, capacity: genCap, sold: ev.ticketTypes.general?.sold || 0 };
if (vipPrice && vipCap) ev.ticketTypes.vip       = { price: vipPrice, capacity: vipCap, sold: ev.ticketTypes.vip?.sold || 0 };

renderTicketInventory();
updateTicketStats();
renderFullEventCard();
showToast(‘Ticket inventory updated’, ‘success’);
closeEditTicketModal();
}

// ── Event management ──────────────────────────
function deleteSelectedEvent() {
if (!selectedEventId) { showToast(‘Select an event first’, ‘error’); return; }
if (!confirm(‘Delete selected event?’)) return;
events = events.filter(e => e.id !== selectedEventId);
selectedEventId = null;
document.getElementById(‘selectedEventInfo’).style.display   = ‘none’;
document.getElementById(‘selectedEventDisplay’).innerHTML    = ‘No event selected’;
renderFullEventCard();
updateTicketStats();
showToast(‘Event deleted’, ‘success’);
}

function deleteSelectedEventById(id) {
if (!confirm(‘Delete this event permanently?’)) return;
events = events.filter(e => e.id !== id);
if (selectedEventId === id) selectedEventId = null;
renderFullEventCard();
updateTicketStats();
showToast(‘Event deleted’, ‘success’);
}

function viewEventDetails(id) {
const ev = events.find(e => e.id === id);
if (ev) alert(`🎉 ${ev.name}\nDate: ${ev.date}\nStatus: ${ev.status}\nSold: ${ (ev.ticketTypes.earlyBird?.sold || 0) + (ev.ticketTypes.general?.sold   || 0) + (ev.ticketTypes.vip?.sold        || 0) }`);
}

function duplicateEvent(id) {
const original = events.find(e => e.id === id);
if (!original) return;
const newEvent      = JSON.parse(JSON.stringify(original));
newEvent.id         = ‘evt_’ + Date.now();
newEvent.name       = original.name + ’ (Copy)’;
if (newEvent.ticketTypes.earlyBird) newEvent.ticketTypes.earlyBird.sold = 0;
if (newEvent.ticketTypes.general)   newEvent.ticketTypes.general.sold   = 0;
if (newEvent.ticketTypes.vip)       newEvent.ticketTypes.vip.sold       = 0;
events.push(newEvent);
showToast(`Event duplicated: ${newEvent.name}`, ‘success’);
renderFullEventCard();
updateTicketStats();
}

async function refreshTickets() {
events = await loadEventsFromSupabase();
updateTicketStats();
renderFullEventCard();

if (events.length > 0 && !selectedEventId) {
selectedEventId = events[0].id;
selectEvent(selectedEventId);
} else if (selectedEventId && events.find(e => e.id === selectedEventId)) {
selectEvent(selectedEventId);
} else if (events.length > 0) {
selectedEventId = events[0].id;
selectEvent(selectedEventId);
}

showToast(‘Events refreshed from database’, ‘success’);
}

// ── Expose to inline onclick handlers ─────────
Object.assign(window, {
selectEvent,
openAddEventModal, closeAddEventModal, confirmAddEvent, toggleTicketFields,
openEditTicketModal, openEditTicketModalById, closeEditTicketModal, confirmEditTickets,
deleteSelectedEvent, deleteSelectedEventById, viewEventDetails, duplicateEvent,
refreshTickets,
});

// ── Run ───────────────────────────────────────
init();
