  import { supabase } from '../../config/supabase.js';

  // ─── DATA STATE ───
  let events = [];
  let selectedEventId = null;
  let isSavingEvent = false;
  let pendingDeleteEventId = null;
  let selectedBannerFile = null;
  let editingEventId = null;
  let charts = {};

  // ─── HELPERS ───
  function escapeHtml(text) { if (!text) return ''; const d=document.createElement('div'); d.textContent=text; return d.innerHTML; }
  function fmtR(val) { return `R${(val||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
  function fmtNum(val) { return (val||0).toLocaleString(); }

  function showToast(message, type='success') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const msgEl = document.getElementById('toastMessage');
    const icons = { success:'fas fa-check-circle', error:'fas fa-exclamation-circle', warning:'fas fa-exclamation-triangle' };
    icon.className = icons[type] || icons.success;
    msgEl.innerText = message;
    toast.className = `toast ${type} show`;
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // ─── SUPABASE OPERATIONS ───
  async function uploadEventBanner(eventId, file) {
    if (!file) return null;
    try {
      const ext = file.name.split('.').pop();
      const path = `event-banners/${eventId}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('event-banners').upload(path, file, {
        cacheControl: '3600',
        upsert: true
      });
      if (uploadError) {
        console.error('Upload error:', uploadError);
        showToast('Banner upload failed: ' + uploadError.message, 'error');
        return null;
      }
      const { data } = supabase.storage.from('event-banners').getPublicUrl(path);
      return data.publicUrl;
    } catch (err) {
      console.error('Upload exception:', err);
      showToast('Banner upload failed: ' + err.message, 'error');
      return null;
    }
  }

  async function getRelatedCounts(eventId) {
    try {
      const { data: tickets } = await supabase.from('tickets').select('id').eq('event_id', eventId);
      const ticketIds = tickets.map(t=>t.id);
      let checkins=0;
      if (ticketIds.length) {
        const { count } = await supabase.from('checkins').select('*', { count:'exact', head:true }).in('ticket_id', ticketIds);
        checkins = count || 0;
      }
      const { count: paymentRequests } = await supabase.from('payment_requests').select('*', { count:'exact', head:true }).eq('event_id', eventId);
      return { ticketsCount: tickets.length, checkinsCount: checkins, paymentRequestsCount: paymentRequests || 0 };
    } catch(e) { return { ticketsCount:0, checkinsCount:0, paymentRequestsCount:0 }; }
  }

  async function deleteEventWithFullCascade(eventId) {
    try {
      const { data: tickets, error: ticketsFetchError } = await supabase.from('tickets').select('id').eq('event_id', eventId);
      if (ticketsFetchError) throw ticketsFetchError;
      const ticketIds = tickets.map(t=>t.id);

      if (ticketIds.length) {
        const { error: checkinsError } = await supabase.from('checkins').delete().in('ticket_id', ticketIds);
        if (checkinsError) throw new Error(`Failed to delete check-ins: ${checkinsError.message}`);
      }

      const { error: ticketsError } = await supabase.from('tickets').delete().eq('event_id', eventId);
      if (ticketsError) throw new Error(`Failed to delete tickets: ${ticketsError.message}`);

      const { error: ticketTypesError } = await supabase.from('ticket_types').delete().eq('event_id', eventId);
      if (ticketTypesError) throw new Error(`Failed to delete ticket types: ${ticketTypesError.message}`);

      // payment_requests.event_id has a NO ACTION foreign key to events, so any
      // pending/approved/rejected payment requests tied to this event will block
      // the events delete below unless we clear them first.
      const { error: paymentRequestsError } = await supabase.from('payment_requests').delete().eq('event_id', eventId);
      if (paymentRequestsError) throw new Error(`Failed to delete payment requests: ${paymentRequestsError.message}`);

      // If this fails (most likely cause: an RLS DELETE policy blocks it, or
      // another table's foreign key we haven't accounted for still references
      // this event), the error must surface here rather than be silently
      // ignored, or the UI ends up claiming success on an event that's still
      // fully intact in the database.
      const { error: eventError } = await supabase.from('events').delete().eq('id', eventId);
      if (eventError) throw new Error(`Failed to delete event: ${eventError.message}`);

      return { success: true };
    } catch(err) { return { success: false, error: err.message }; }
  }

  async function loadEventsFromSupabase() {
    try {
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });
      if (eventsError) throw eventsError;
      const { data: ticketTypesData, error: ticketTypesError } = await supabase
        .from('ticket_types')
        .select('*');
      if (ticketTypesError) throw ticketTypesError;

      const formatted = eventsData.map(ev => {
        const eventTicketTypes = ticketTypesData.filter(tt => tt.event_id === ev.id);
        const ticketTypes = {
          earlyBird: { price: 0, capacity: 0, sold: 0, id: null },
          general: { price: ev.base_price || 0, capacity: 0, sold: 0, id: null },
          vip: { price: ev.vip_price || 0, capacity: 0, sold: 0, id: null }
        };
        eventTicketTypes.forEach(tt => {
          const name = (tt.name||'').toLowerCase();
          if (name.includes('early') || name === 'earlybird') {
            ticketTypes.earlyBird = { price: tt.price, capacity: tt.capacity, sold: tt.sold||0, id: tt.id };
          } else if (name.includes('general') || name === 'general') {
            ticketTypes.general = { price: tt.price, capacity: tt.capacity, sold: tt.sold||0, id: tt.id };
          } else if (name.includes('vip') || name === 'vip') {
            ticketTypes.vip = { price: tt.price, capacity: tt.capacity, sold: tt.sold||0, id: tt.id };
          }
        });
        return {
          id: ev.id,
          name: ev.name,
          start_time: ev.start_time || null,
          end_time: ev.end_time || null,
          date: ev.start_time ? ev.start_time.slice(0,16).replace('T',' ') : 'TBD',
          location: ev.location || 'Rands Cape Town',
          status: ev.status || 'active',
          image_url: ev.image_url || null,
          ticketTypes: ticketTypes
        };
      });
      return formatted;
    } catch(err) {
      showToast(err.message, 'error');
      return [];
    }
  }

  // ─── RENDER FUNCTIONS ───
  function renderEventsGrid() {
    const grid = document.getElementById('eventsGrid');
    if (!events.length) { grid.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px 0;">No events. Click "Add Event" to create one.</div>'; return; }
    grid.innerHTML = events.map(ev => {
      const totalSold = (ev.ticketTypes.earlyBird?.sold||0)+(ev.ticketTypes.general?.sold||0)+(ev.ticketTypes.vip?.sold||0);
      const totalCap = (ev.ticketTypes.earlyBird?.capacity||0)+(ev.ticketTypes.general?.capacity||0)+(ev.ticketTypes.vip?.capacity||0);
      const percent = totalCap ? Math.round((totalSold/totalCap)*100) : 0;
      const bannerStyle = ev.image_url
        ? `background-image: url('${encodeURI(ev.image_url)}'); background-size: cover; background-position: center;`
        : 'background: linear-gradient(135deg, var(--red), #7b0009);';
      const isSelected = selectedEventId === ev.id;
      return `
        <div class="event-card ${isSelected ? 'selected' : ''}" data-event-id="${ev.id}">
          <div class="event-banner" style="${bannerStyle}">
            <span class="event-status-badge">${ev.status === 'active' ? 'LIVE' : 'DRAFT'}</span>
          </div>
          <div class="event-card-content">
            <div class="event-card-title">${escapeHtml(ev.name)}</div>
            <div class="event-card-detail"><i class="fas fa-calendar-alt"></i> ${ev.date}</div>
            <div class="event-card-detail"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(ev.location)}</div>
            <div class="ticket-progress">
              <div class="ticket-sold-bar"><div class="ticket-sold-fill" style="width: ${percent}%;"></div></div>
              <div class="event-card-stats">
                <span><i class="fas fa-ticket-alt"></i> ${totalSold} sold</span>
                <span>${totalCap - totalSold} left</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    document.querySelectorAll('.event-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-event-id');
        if (id) selectEvent(id);
      });
    });
  }

  function selectEvent(eventId) {
    selectedEventId = eventId;
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    document.getElementById('selectedEventInfo').style.display = 'block';
    document.getElementById('selEventName').innerText = ev.name;
    document.getElementById('selEventDate').innerText = ev.date;
    document.getElementById('selEventLocation').innerText = ev.location;
    renderTicketInventory(ev);
    renderEventPurchases(ev);
    renderEventsGrid();
  }

  function renderTicketInventory(ev) {
    const container = document.getElementById('ticketInventory');
    if (!ev) { container.innerHTML = '<div class="empty-state" style="color:var(--muted);padding:12px;">Select event</div>'; return; }
    const types = [
      { key: 'earlyBird', label: 'Early Bird', icon: 'fa-clock' },
      { key: 'general', label: 'General Admission', icon: 'fa-users' },
      { key: 'vip', label: 'VIP Experience', icon: 'fa-crown' }
    ];
    const html = types.map(t => {
      const data = ev.ticketTypes[t.key];
      if (!data || data.capacity === 0) return '';
      const sold = data.sold || 0;
      const cap = data.capacity;
      const percent = cap ? Math.round((sold/cap)*100) : 0;
      return `
        <div class="ticket-inventory-card">
          <div class="ticket-type-header">
            <div class="ticket-type-name"><i class="fas ${t.icon}"></i> ${t.label}</div>
            <div class="ticket-price">R${data.price}</div>
          </div>
          <div class="ticket-stats-row">
            <span>Capacity: <strong>${cap}</strong></span>
            <span>Sold: <strong>${sold}</strong></span>
            <span>Left: <strong>${cap - sold}</strong></span>
          </div>
          <div class="ticket-progress-mini"><div class="ticket-progress-fill" style="width: ${percent}%;"></div></div>
        </div>
      `;
    }).join('');
    container.innerHTML = html || '<div class="empty-state" style="color:var(--muted);padding:12px;">No ticket types configured</div>';
  }

  async function renderEventPurchases(ev) {
    const container = document.getElementById('eventPurchases');
    container.innerHTML = '<div style="color:var(--muted);padding:12px;text-align:center;">Loading purchases...</div>';
    try {
      const { data: ticketRows, error } = await supabase
        .from('tickets')
        .select(`id, issued_at, customer_phone, status, ticket_types ( name, price )`)
        .eq('event_id', ev.id)
        .eq('status', 'issued')
        .order('issued_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      if (!ticketRows || ticketRows.length === 0) {
        container.innerHTML = '<div style="color:var(--muted);padding:12px;text-align:center;">No purchases yet</div>';
        return;
      }
      container.innerHTML = ticketRows.map(t => {
        const typeName = t.ticket_types?.name || 'Ticket';
        const price = t.ticket_types?.price ?? 0;
        const timeStr = t.issued_at ? new Date(t.issued_at).toLocaleString('en-ZA', { dateStyle:'short', timeStyle:'short' }) : 'Unknown';
        return `
          <div class="purchase-item">
            <div class="purchase-icon"><i class="fas fa-ticket-alt"></i></div>
            <div class="purchase-info">
              <div class="purchase-ticket-type">${escapeHtml(typeName)}</div>
              <div class="purchase-id">${escapeHtml(t.customer_phone||'')} &bull; ${timeStr}</div>
              <div class="purchase-id">ID: ${escapeHtml(t.id)}</div>
            </div>
            <div class="purchase-amount">R${Number(price).toFixed(2)}</div>
          </div>
        `;
      }).join('');
    } catch(err) {
      container.innerHTML = '<div style="color:var(--muted);padding:12px;text-align:center;">Error loading purchases</div>';
    }
  }

  async function refreshAllEvents() {
    events = await loadEventsFromSupabase();
    renderEventsGrid();
    if (selectedEventId && events.find(e => e.id === selectedEventId)) selectEvent(selectedEventId);
    else if (events.length) selectEvent(events[0].id);
    else {
      document.getElementById('selectedEventInfo').style.display = 'none';
      document.getElementById('ticketInventory').innerHTML = '<div style="color:var(--muted);padding:12px;text-align:center;">No event selected</div>';
      document.getElementById('eventPurchases').innerHTML = '<div style="color:var(--muted);padding:12px;text-align:center;">No event selected</div>';
    }
    // If overlay is open, refresh charts
    if (document.getElementById('dashboardOverlay').classList.contains('open')) renderCharts();
    showToast('Events refreshed', 'success');
  }
  window.refreshAllEvents = refreshAllEvents;

  // ─── TIMEZONE-SAFE DATETIME HELPERS ───
  // <input type="datetime-local"> gives/expects a naive "YYYY-MM-DDTHH:mm"
  // string with NO timezone info, which browsers parse/format as LOCAL time.
  // Supabase's start_time/end_time columns are timestamptz (UTC). Without
  // these helpers, a naive local string gets stored as if it were already
  // UTC, silently shifting the saved time by the local UTC offset (e.g. +2h
  // for SAST) — which is exactly the "15:37 admin / 17:37 monitor" bug.
  function localDateTimeToISO(value) {
    if (!value) return null;
    const d = new Date(value); // datetime-local string -> parsed as local time
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function isoToLocalDateTimeInput(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString); // UTC ISO string -> parsed correctly as an instant
    if (isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    // Build the local wall-clock equivalent in the format datetime-local expects
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ─── MODAL HANDLERS ───
  function openEventModal(editMode = false, eventData = null) {
    const modal = document.getElementById('eventModal');
    const title = document.getElementById('eventModalTitle');
    const preview = document.getElementById('eventBannerPreview');
    const bannerContainer = document.getElementById('currentBannerContainer');
    const hint = document.getElementById('newBannerHint');
    const statusEl = document.getElementById('bannerUploadStatus');
    
    if (editMode && eventData) {
      title.innerText = 'Edit Event';
      editingEventId = eventData.id;
      document.getElementById('eventName').value = eventData.name;
      document.getElementById('eventStartTime').value = isoToLocalDateTimeInput(eventData.start_time);
      document.getElementById('eventEndTime').value = isoToLocalDateTimeInput(eventData.end_time);
      document.getElementById('eventLocation').value = eventData.location;
      document.getElementById('earlyBirdPrice').value = eventData.ticketTypes.earlyBird?.price || '';
      document.getElementById('earlyBirdCapacity').value = eventData.ticketTypes.earlyBird?.capacity || '';
      document.getElementById('generalPrice').value = eventData.ticketTypes.general?.price || '';
      document.getElementById('generalCapacity').value = eventData.ticketTypes.general?.capacity || '';
      document.getElementById('vipPrice').value = eventData.ticketTypes.vip?.price || '';
      document.getElementById('vipCapacity').value = eventData.ticketTypes.vip?.capacity || '';
      if (eventData.image_url) {
        preview.src = eventData.image_url;
        preview.style.display = 'block';
        bannerContainer.style.display = 'block';
        hint.style.display = 'none';
        statusEl.textContent = 'Current banner: ✓';
        statusEl.className = 'file-status success';
      } else {
        bannerContainer.style.display = 'none';
        preview.style.display = 'none';
        hint.style.display = 'none';
        statusEl.textContent = 'No file selected';
        statusEl.className = 'file-status';
      }
      selectedBannerFile = null;
      document.getElementById('eventBannerInput').value = '';
    } else {
      title.innerText = 'Create New Event';
      editingEventId = null;
      document.getElementById('eventName').value = '';
      document.getElementById('eventStartTime').value = '';
      document.getElementById('eventEndTime').value = '';
      document.getElementById('eventLocation').value = 'Rands Cape Town';
      document.getElementById('earlyBirdPrice').value = '';
      document.getElementById('earlyBirdCapacity').value = '';
      document.getElementById('generalPrice').value = '';
      document.getElementById('generalCapacity').value = '';
      document.getElementById('vipPrice').value = '';
      document.getElementById('vipCapacity').value = '';
      bannerContainer.style.display = 'none';
      preview.style.display = 'none';
      hint.style.display = 'none';
      selectedBannerFile = null;
      document.getElementById('eventBannerInput').value = '';
      statusEl.textContent = 'No file selected';
      statusEl.className = 'file-status';
    }
    modal.classList.add('active');
  }

  async function saveEvent() {
    if (isSavingEvent) { showToast('Please wait...', 'error'); return; }
    const name = document.getElementById('eventName').value.trim();
    const rawStartTime = document.getElementById('eventStartTime').value;
    const rawEndTime = document.getElementById('eventEndTime').value;
    const location = document.getElementById('eventLocation').value.trim() || 'Rands Cape Town';
    if (!name || !rawStartTime) { showToast('Event name and start date/time required', 'error'); return; }
    // Convert the naive local datetime-local values into real UTC ISO
    // timestamps before they ever reach Supabase (see localDateTimeToISO
    // above) — this is what fixes the admin/monitor time mismatch.
    const startTime = localDateTimeToISO(rawStartTime);
    let endTime = localDateTimeToISO(rawEndTime);
    if (endTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) { showToast('Invalid date/time', 'error'); return; }
      if (end <= start) { showToast('End time must be after start time', 'error'); return; }
    } else { endTime = null; }

    const ebPrice = parseFloat(document.getElementById('earlyBirdPrice').value);
    const ebCap = parseInt(document.getElementById('earlyBirdCapacity').value);
    const genPrice = parseFloat(document.getElementById('generalPrice').value);
    const genCap = parseInt(document.getElementById('generalCapacity').value);
    const vipPrice = parseFloat(document.getElementById('vipPrice').value);
    const vipCap = parseInt(document.getElementById('vipCapacity').value);

    isSavingEvent = true;
    const saveBtn = document.getElementById('saveEventBtn');
    const origText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<span class="loading-spinner"></span> Saving...';
    saveBtn.disabled = true;
    try {
      let eventId;
      if (editingEventId) {
        const { error: updateError } = await supabase.from('events').update({
          name, location, start_time: startTime, end_time: endTime,
          base_price: genPrice || 0, vip_price: vipPrice || 0
        }).eq('id', editingEventId);
        if (updateError) throw new Error(`Failed to update event: ${updateError.message}`);
        eventId = editingEventId;
        // Previously: fetched existing rows, then deleted them one-by-one
        // in a loop whose errors were never checked. If a per-row delete
        // silently failed (e.g. RLS), the old rows survived and the insert
        // below added new ones on top — 3 types in became 6 out, each
        // duplicated. Doing it as a single checked bulk delete means a
        // failure throws immediately instead of silently letting stale
        // rows survive.
        const { error: deleteTypesError } = await supabase.from('ticket_types').delete().eq('event_id', eventId);
        if (deleteTypesError) throw new Error(`Failed to clear old ticket types: ${deleteTypesError.message}`);
        const types = [];
        if (ebPrice && ebCap && ebPrice>0 && ebCap>0) types.push({ event_id:eventId, name:'Early Bird', price:ebPrice, capacity:ebCap, sold:0 });
        if (genPrice && genCap && genPrice>0 && genCap>0) types.push({ event_id:eventId, name:'General Admission', price:genPrice, capacity:genCap, sold:0 });
        if (vipPrice && vipCap && vipPrice>0 && vipCap>0) types.push({ event_id:eventId, name:'VIP Experience', price:vipPrice, capacity:vipCap, sold:0 });
        if (!types.length) types.push({ event_id:eventId, name:'General Admission', price:genPrice||100, capacity:genCap||100, sold:0 });
        const { error: insertTypesError } = await supabase.from('ticket_types').insert(types);
        if (insertTypesError) throw new Error(`Failed to save ticket types: ${insertTypesError.message}`);
        if (selectedBannerFile) {
          const url = await uploadEventBanner(eventId, selectedBannerFile);
          if (url) {
            await supabase.from('events').update({ image_url: url }).eq('id', eventId);
            showToast(`Banner uploaded successfully`, 'success');
          }
        }
        showToast(`Event "${name}" updated`, 'success');
      } else {
        const { data: eventData, error: eventError } = await supabase.from('events').insert([{
          name, location, start_time: startTime, end_time: endTime,
          base_price: genPrice || 0, vip_price: vipPrice || 0, status: 'active'
        }]).select().single();
        if (eventError) throw eventError;
        eventId = eventData.id;
        if (selectedBannerFile) {
          const url = await uploadEventBanner(eventId, selectedBannerFile);
          if (url) {
            await supabase.from('events').update({ image_url: url }).eq('id', eventId);
            showToast(`Banner uploaded successfully`, 'success');
          }
        }
        const types = [];
        if (ebPrice && ebCap && ebPrice>0 && ebCap>0) types.push({ event_id:eventId, name:'Early Bird', price:ebPrice, capacity:ebCap, sold:0 });
        if (genPrice && genCap && genPrice>0 && genCap>0) types.push({ event_id:eventId, name:'General Admission', price:genPrice, capacity:genCap, sold:0 });
        if (vipPrice && vipCap && vipPrice>0 && vipCap>0) types.push({ event_id:eventId, name:'VIP Experience', price:vipPrice, capacity:vipCap, sold:0 });
        if (!types.length) types.push({ event_id:eventId, name:'General Admission', price:genPrice||100, capacity:genCap||100, sold:0 });
        const { error: insertTypesError } = await supabase.from('ticket_types').insert(types);
        if (insertTypesError) throw new Error(`Failed to save ticket types: ${insertTypesError.message}`);
        showToast(`Event "${name}" created`, 'success');
      }
      document.getElementById('eventModal').classList.remove('active');
      await refreshAllEvents();
    } catch(err) {
      showToast(err.message, 'error');
    } finally {
      isSavingEvent = false;
      saveBtn.innerHTML = origText;
      saveBtn.disabled = false;
    }
  }

  async function deleteSelectedEvent() {
    if (!selectedEventId) { showToast('Select an event first', 'error'); return; }
    const ev = events.find(e => e.id === selectedEventId);
    if (!ev) return;
    const counts = await getRelatedCounts(selectedEventId);
    document.getElementById('deleteEventName').innerText = ev.name;
    if (counts.ticketsCount > 0 || counts.paymentRequestsCount > 0) {
      document.getElementById('deleteWarningMsg').innerHTML = `Warning: This event has ${counts.ticketsCount} ticket(s) and ${counts.paymentRequestsCount} payment request(s) associated.`;
      document.getElementById('relatedDataMsg').innerHTML = `Related data:\n• ${counts.ticketsCount} ticket(s)\n• ${counts.checkinsCount} check-in record(s)\n• ${counts.paymentRequestsCount} payment request(s)\n\nAll related data will be permanently deleted.`;
    } else {
      document.getElementById('deleteWarningMsg').innerHTML = `No tickets sold for this event yet.`;
      document.getElementById('relatedDataMsg').innerHTML = `The event will be permanently removed.`;
    }
    pendingDeleteEventId = selectedEventId;
    document.getElementById('deleteConfirmModal').classList.add('active');
  }

  async function executeDelete() {
    if (!pendingDeleteEventId) return;
    const btn = document.getElementById('confirmDeleteBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="loading-spinner"></span> Deleting...';
    btn.disabled = true;
    try {
      const result = await deleteEventWithFullCascade(pendingDeleteEventId);
      if (result.success) {
        showToast('Event deleted', 'success');
        selectedEventId = null;
        document.getElementById('selectedEventInfo').style.display = 'none';
        await refreshAllEvents();
      } else throw new Error(result.error);
    } catch(err) { showToast('Delete failed: '+err.message, 'error'); }
    finally { btn.innerHTML=orig; btn.disabled=false; document.getElementById('deleteConfirmModal').classList.remove('active'); pendingDeleteEventId=null; }
  }

  // ─── OPEN EVENT MONITOR ───
  function openEventMonitor() {
    if (!selectedEventId) {
      showToast('Select an event first', 'error');
      return;
    }
    const url = `event-monitor.html?event_id=${selectedEventId}`;
    window.open(url, '_blank');
  }

  // ─── EVENT BINDINGS ───
  document.getElementById('eventBannerInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const statusEl = document.getElementById('bannerUploadStatus');
    if (file) {
      selectedBannerFile = file;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = document.getElementById('eventBannerPreview');
        preview.src = ev.target.result;
        preview.style.display = 'block';
        document.getElementById('currentBannerContainer').style.display = 'block';
        document.getElementById('newBannerHint').style.display = 'block';
        statusEl.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        statusEl.className = 'file-status success';
      };
      reader.readAsDataURL(file);
    } else {
      selectedBannerFile = null;
      document.getElementById('newBannerHint').style.display = 'none';
      statusEl.textContent = 'No file selected';
      statusEl.className = 'file-status';
    }
  });
  document.querySelector('.file-input-label').addEventListener('click', () => document.getElementById('eventBannerInput').click());

  document.getElementById('openAddEventBtn').addEventListener('click', () => openEventModal(false));
  document.getElementById('editEventBtn').addEventListener('click', () => {
    if (!selectedEventId) { showToast('Select an event first', 'error'); return; }
    const ev = events.find(e => e.id === selectedEventId);
    if (ev) openEventModal(true, ev);
  });
  document.getElementById('openEventMonitorBtn').addEventListener('click', openEventMonitor);
  document.getElementById('closeEventModalBtn').addEventListener('click', () => document.getElementById('eventModal').classList.remove('active'));
  document.getElementById('saveEventBtn').addEventListener('click', saveEvent);
  document.getElementById('deleteSelectedEventBtn').addEventListener('click', deleteSelectedEvent);
  document.getElementById('cancelDeleteBtn').addEventListener('click', () => document.getElementById('deleteConfirmModal').classList.remove('active'));
  document.getElementById('confirmDeleteBtn').addEventListener('click', executeDelete);

  window.toggleTicketFields = (type) => {
    const el = document.getElementById(`${type}Fields`);
    if (el) el.classList.toggle('active');
  };

  // ─── DASHBOARD TOGGLE ───
  function toggleDashboard() {
    const overlay = document.getElementById('dashboardOverlay');
    overlay.classList.toggle('open');
    document.getElementById('toggleDashBtn').classList.toggle('active-toggle', overlay.classList.contains('open'));
    if (overlay.classList.contains('open')) {
      renderCharts();
    }
  }
  window.toggleDashboard = toggleDashboard;

  // ─── CHART RENDERING ───
  function renderCharts() {
    if (!events.length) {
      document.getElementById('dashKpiGrid').innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center;">No event data</div>';
      return;
    }

    const totalEvents = events.length;
    const totalSold = events.reduce((s,e) => s + (e.ticketTypes.earlyBird.sold||0) + (e.ticketTypes.general.sold||0) + (e.ticketTypes.vip.sold||0), 0);
    const totalRevenue = events.reduce((s,e) => {
      const eb = e.ticketTypes.earlyBird, gen = e.ticketTypes.general, vip = e.ticketTypes.vip;
      return s + (eb.sold||0)*eb.price + (gen.sold||0)*gen.price + (vip.sold||0)*vip.price;
    }, 0);
    const avgOcc = totalEvents ? Math.round(events.reduce((s,e) => {
      const cap = e.ticketTypes.earlyBird.capacity + e.ticketTypes.general.capacity + e.ticketTypes.vip.capacity;
      const sold = e.ticketTypes.earlyBird.sold + e.ticketTypes.general.sold + e.ticketTypes.vip.sold;
      return s + (cap ? Math.round((sold/cap)*100) : 0);
    }, 0) / totalEvents) : 0;
    const active = events.filter(e => e.status === 'active').length;
    const upcoming = events.filter(e => e.status === 'upcoming').length;
    const totalCap = events.reduce((s,e) => s + e.ticketTypes.earlyBird.capacity + e.ticketTypes.general.capacity + e.ticketTypes.vip.capacity, 0);
    const avgTicket = totalSold ? totalRevenue / totalSold : 0;

    document.getElementById('dashKpiGrid').innerHTML = `
      <div class="dash-kpi"><div class="val">${totalEvents}</div><div class="label">Total Events</div><div class="sub">${active} active | ${upcoming} upcoming</div></div>
      <div class="dash-kpi"><div class="val">${fmtNum(totalSold)}</div><div class="label">Tickets Sold</div><div class="sub">of ${fmtNum(totalCap)} capacity</div></div>
      <div class="dash-kpi"><div class="val">${fmtR(totalRevenue)}</div><div class="label">Total Revenue</div></div>
      <div class="dash-kpi"><div class="val">${avgOcc}%</div><div class="label">Avg Occupancy</div></div>
    `;

    const completed = events.filter(e => e.status === 'completed' || (e.date && new Date(e.date) < new Date())).length;
    const bestEvent = events.reduce((max,e) => e.revenue > max.revenue ? e : max, events[0]);
    document.getElementById('dashEventPerformance').innerHTML = `
      <div class="dash-stat-mini"><div class="num">${active}</div><div class="lbl">Active</div></div>
      <div class="dash-stat-mini"><div class="num">${upcoming}</div><div class="lbl">Upcoming</div></div>
      <div class="dash-stat-mini"><div class="num">${completed}</div><div class="lbl">Completed</div></div>
      <div class="dash-stat-mini"><div class="num">${fmtR(totalRevenue/totalEvents||0)}</div><div class="lbl">Avg Revenue</div></div>
      <div class="dash-stat-mini"><div class="num">${Math.round((totalSold/totalCap)*100)}%</div><div class="lbl">Fill Rate</div></div>
      <div class="dash-stat-mini"><div class="num">${bestEvent?.name?.slice(0,12)||'—'}</div><div class="lbl">Top Event</div></div>
    `;

    const tiers = { 'Early Bird':0, 'General':0, 'VIP':0 };
    events.forEach(e => {
      tiers['Early Bird'] += e.ticketTypes.earlyBird.sold || 0;
      tiers['General'] += e.ticketTypes.general.sold || 0;
      tiers['VIP'] += e.ticketTypes.vip.sold || 0;
    });
    const ctx1 = document.getElementById('dashTicketChart').getContext('2d');
    if (charts.ticket) charts.ticket.destroy();
    charts.ticket = new Chart(ctx1, {
      type: 'doughnut',
      data: { labels: Object.keys(tiers), datasets: [{ data: Object.values(tiers), backgroundColor: ['#E30613','#f97316','#8b5cf6'] }] },
      options: { responsive: true, plugins: { legend: { labels: { color: '#71717a', boxWidth: 8 } } } }
    });

    const sorted = [...events].sort((a,b) => new Date(a.start_time) - new Date(b.start_time)).slice(-7);
    const ctx2 = document.getElementById('dashRevenueChart').getContext('2d');
    if (charts.revenue) charts.revenue.destroy();
    charts.revenue = new Chart(ctx2, {
      type: 'line',
      data: { labels: sorted.map(e => e.name?.slice(0,10)||'Event'), datasets: [{ label: 'Revenue', data: sorted.map(e => {
        const eb=e.ticketTypes.earlyBird, gen=e.ticketTypes.general, vip=e.ticketTypes.vip;
        return (eb.sold||0)*eb.price + (gen.sold||0)*gen.price + (vip.sold||0)*vip.price;
      }), borderColor: '#E30613', backgroundColor: 'rgba(227,6,19,0.1)', fill: true, tension: 0.3 }] },
      options: { responsive: true, plugins: { tooltip: { callbacks: { label: (ctx) => fmtR(ctx.raw) } } } }
    });

    const ctx3 = document.getElementById('dashAttendanceChart').getContext('2d');
    if (charts.attendance) charts.attendance.destroy();
    charts.attendance = new Chart(ctx3, {
      type: 'bar',
      data: { labels: events.map(e => e.name?.slice(0,12)||'Event'), datasets: [
        { label: 'Sold', data: events.map(e => (e.ticketTypes.earlyBird.sold||0)+(e.ticketTypes.general.sold||0)+(e.ticketTypes.vip.sold||0)), backgroundColor: '#E30613', borderRadius: 4 },
        { label: 'Capacity', data: events.map(e => e.ticketTypes.earlyBird.capacity + e.ticketTypes.general.capacity + e.ticketTypes.vip.capacity), backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4 }
      ] },
      options: { responsive: true, plugins: { legend: { labels: { color: '#71717a', boxWidth: 8 } } }, scales: { x: { ticks: { color: '#71717a' } }, y: { ticks: { color: '#71717a' } } } }
    });

    const available = totalCap - totalSold;
    const lowInv = events.filter(e => {
      const cap = e.ticketTypes.earlyBird.capacity + e.ticketTypes.general.capacity + e.ticketTypes.vip.capacity;
      const sold = e.ticketTypes.earlyBird.sold + e.ticketTypes.general.sold + e.ticketTypes.vip.sold;
      return (cap - sold) < 50;
    }).length;
    const soldOut = events.filter(e => {
      const cap = e.ticketTypes.earlyBird.capacity + e.ticketTypes.general.capacity + e.ticketTypes.vip.capacity;
      const sold = e.ticketTypes.earlyBird.sold + e.ticketTypes.general.sold + e.ticketTypes.vip.sold;
      return cap && (sold/cap) >= 0.98;
    }).length;
    document.getElementById('dashInventoryStats').innerHTML = `
      <div class="dash-stat-mini"><div class="num">${fmtNum(available)}</div><div class="lbl">Remaining</div></div>
      <div class="dash-stat-mini"><div class="num">${lowInv}</div><div class="lbl">Low Inventory</div></div>
      <div class="dash-stat-mini"><div class="num">${soldOut}</div><div class="lbl">Sold Out</div></div>
    `;
    const ctx4 = document.getElementById('dashInventoryChart').getContext('2d');
    if (charts.inventory) charts.inventory.destroy();
    charts.inventory = new Chart(ctx4, {
      type: 'doughnut',
      data: { labels: ['Sold', 'Available'], datasets: [{ data: [totalSold, available], backgroundColor: ['#E30613','#e2e8f0'] }] },
      options: { responsive: true, plugins: { legend: { labels: { color: '#71717a', boxWidth: 8 } } } }
    });

    const top = [...events].sort((a,b) => {
      const revA = (a.ticketTypes.earlyBird.sold||0)*a.ticketTypes.earlyBird.price + (a.ticketTypes.general.sold||0)*a.ticketTypes.general.price + (a.ticketTypes.vip.sold||0)*a.ticketTypes.vip.price;
      const revB = (b.ticketTypes.earlyBird.sold||0)*b.ticketTypes.earlyBird.price + (b.ticketTypes.general.sold||0)*b.ticketTypes.general.price + (b.ticketTypes.vip.sold||0)*b.ticketTypes.vip.price;
      return revB - revA;
    }).slice(0,5);
    document.getElementById('dashTopEvents').innerHTML = top.map((e, i) => {
      const rev = (e.ticketTypes.earlyBird.sold||0)*e.ticketTypes.earlyBird.price + (e.ticketTypes.general.sold||0)*e.ticketTypes.general.price + (e.ticketTypes.vip.sold||0)*e.ticketTypes.vip.price;
      return `<div class="dash-activity-item">
        <div style="font-weight:700;width:20px;color:var(--muted);">${i+1}</div>
        <div class="details"><strong>${e.name?.slice(0,20)}</strong><br><span style="font-size:0.6rem;color:var(--muted);">${e.date}</span></div>
        <div style="font-weight:700;color:var(--red);">${fmtR(rev)}</div>
      </div>`;
    }).join('');

    const nearCap = events.filter(e => {
      const cap = e.ticketTypes.earlyBird.capacity + e.ticketTypes.general.capacity + e.ticketTypes.vip.capacity;
      const sold = e.ticketTypes.earlyBird.sold + e.ticketTypes.general.sold + e.ticketTypes.vip.sold;
      return cap && (sold/cap) >= 0.85 && (sold/cap) < 0.98;
    }).length;
    const alerts = [];
    if (nearCap) alerts.push({ level:'warning', title:'Events Nearing Capacity', desc:`${nearCap} events at 85%+ occupancy` });
    if (lowInv) alerts.push({ level:'warning', title:'Low Ticket Inventory', desc:`${lowInv} events with <50 tickets left` });
    if (upcoming) alerts.push({ level:'info', title:'Upcoming Events', desc:`${upcoming} events scheduled in next 30 days` });
    document.getElementById('dashAlerts').innerHTML = alerts.map(a =>
      `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.7rem;">
        <i class="fas fa-exclamation-circle" style="color:${a.level==='warning'?'var(--gold)':'#3b82f6'}"></i>
        <div><strong>${a.title}</strong> · ${a.desc}</div>
      </div>`
    ).join('') || '<div style="color:var(--muted);font-size:0.7rem;">No alerts</div>';
  }

  // ─── INIT ───
  async function init() {
    await refreshAllEvents();
    setInterval(refreshAllEvents, 30000);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const overlay = document.getElementById('dashboardOverlay');
        if (overlay.classList.contains('open')) toggleDashboard();
      }
    });
  }
  init();
