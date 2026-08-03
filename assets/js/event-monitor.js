    import { supabase } from '../../config/supabase.js';

    // ============================================================
    // EVENT MONITOR - COMPLETE IMPLEMENTATION
    // Works with existing schema using name/surname and customer_phone
    // ============================================================

    // ─── STATE ───
    let eventId = null;
    let eventData = null;
    let ticketTypes = [];
    let tickets = [];
    let checkins = [];
    let profiles = [];
    let staffProfiles = [];
    let scannerDevices = [];

    // Live floor ops state (venue-wide, not scoped to a single event)
    let hookahDevices = [];
    let shishaSessions = [];
    let shishaRequests = [];
    let vvipPackages = [];
    let vvipTables = [];
    let vvipBookings = [];
    let wallets = [];
    let walletTransactions = [];

    let subscriptions = [];
    let refreshInterval = null;
    let isInitialLoad = true;
    
    // Search state
    let searchTimeout = null;
    let searchResults = [];
    let selectedIndex = -1;
    let isSearching = false;

    // Drawer state
    let currentDrawerTicketId = null;

    // ─── HELPERS ───
    function getUrlParam(param) {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get(param);
    }

    function fmtR(val) {
      return `R${(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function fmtNum(val) {
      return (val || 0).toLocaleString();
    }

    function escapeHtml(text) {
      if (!text) return '';
      const d = document.createElement('div');
      d.textContent = text;
      return d.innerHTML;
    }

    function formatTime(dateStr) {
      if (!dateStr) return '—';
      const d = new Date(dateStr);
      return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function formatDate(dateStr) {
      if (!dateStr) return '—';
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function formatDateTime(dateStr) {
      if (!dateStr) return '—';
      const d = new Date(dateStr);
      return d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    function getResultBadgeClass(result) {
      const normalized = (result || '').toLowerCase();
      const map = {
        'valid': 'valid',
        'reentry': 'reentry',
        're-entry': 'reentry',
        'duplicate': 'duplicate',
        'invalid': 'invalid',
        'cancelled': 'invalid',
        'refunded': 'invalid',
        'already checked in': 'invalid'
      };
      return map[normalized] || 'default';
    }

    function getStatusBadgeClass(status) {
      const normalized = (status || '').toLowerCase();
      const map = {
        'issued': 'issued',
        'cancelled': 'cancelled',
        'refunded': 'refunded',
        'used': 'used'
      };
      return map[normalized] || 'issued';
    }

    function getCustomerDisplayName(ticket) {
      // Try to get name from profile via customer_id
      if (ticket?.profiles) {
        const p = ticket.profiles;
        return `${p.name || ''} ${p.surname || ''}`.trim() || 'Guest';
      }
      // Fallback to customer_phone
      if (ticket?.customer_phone) {
        return ticket.customer_phone;
      }
      return 'Guest';
    }

    function showToast(message, type = 'success') {
      const toast = document.getElementById('toast');
      if (!toast) return;
      const msgEl = document.getElementById('toastMessage');
      if (!msgEl) return;
      toast.className = `toast ${type === 'success' ? 'success' : 'error'} show`;
      msgEl.innerText = message;
      clearTimeout(toast._timeout);
      toast._timeout = setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function animateValue(elementId, newValue) {
      const el = document.getElementById(elementId);
      if (!el) return;
      const current = el.innerText;
      if (current !== String(newValue)) {
        el.classList.remove('animate');
        void el.offsetWidth;
        el.classList.add('animate');
      }
      el.innerText = newValue;
    }

    // ─── DATA LOADING ───
    async function loadEventData() {
      if (!eventId) return;

      try {
        // 1. Load event
        const { data: event, error: eventError } = await supabase
          .from('events')
          .select('*')
          .eq('id', eventId)
          .single();

        if (eventError) throw eventError;
        eventData = event;

        // 2. Load ticket types
        const { data: types, error: typesError } = await supabase
          .from('ticket_types')
          .select('*')
          .eq('event_id', eventId);

        if (typesError) throw typesError;
        ticketTypes = types || [];

        // 3. Load tickets with customer profiles (using name/surname)
        const { data: ticketData, error: ticketError } = await supabase
          .from('tickets')
          .select(`
            *,
            profiles:customer_id (
              id,
              name,
              surname,
              phone,
              email
            )
          `)
          .eq('event_id', eventId);

        if (ticketError) throw ticketError;
        tickets = ticketData || [];

        // 4. Load checkins with ticket and staff info
        const ticketIds = tickets.map(t => t.id);
        let checkinData = [];
        if (ticketIds.length > 0) {
          const { data: checks, error: checkError } = await supabase
            .from('checkins')
            .select(`
              *,
              ticket:ticket_id (
                id,
                ticket_number,
                ticket_type_id,
                customer_phone,
                profiles:customer_id (
                  name,
                  surname,
                  phone
                )
              ),
              profiles:scanned_by (
                id,
                name,
                surname
              )
            `)
            .in('ticket_id', ticketIds)
            .order('scanned_at', { ascending: false });

          if (checkError) throw checkError;
          checkinData = checks || [];
        }
        checkins = checkinData;

        // 5. Extract unique profile IDs for staff
        const staffIds = checkins
          .map(c => c.scanned_by)
          .filter(id => id !== null && id !== undefined);

        if (staffIds.length > 0) {
          const { data: staffData, error: staffError } = await supabase
            .from('profiles')
            .select('id, name, surname')
            .in('id', staffIds);

          if (!staffError) staffProfiles = staffData || [];
        }

        // 5b. Load scanner devices assigned to this event
        const { data: devicesData, error: devicesFetchError } = await supabase
          .from('scanner_devices')
          .select('*')
          .eq('event_id', eventId);

        if (devicesFetchError) {
          console.error('Error loading scanner devices:', devicesFetchError);
          scannerDevices = [];
        } else {
          scannerDevices = devicesData || [];
        }

        // 6. Load live floor ops (shisha, VVIP, wallet) - venue-wide, isolated
        // from the core ticket load so a hiccup here never breaks the gate monitor
        await loadLiveOpsData();

        // 7. Render everything
        renderAll();

        // 8. Setup realtime after first load
        if (isInitialLoad) {
          setupRealtime();
          isInitialLoad = false;
        }

      } catch (err) {
        console.error('Error loading event data:', err);
        showToast('Failed to load event data: ' + err.message, 'error');
        showEmptyState();
      }
    }

    // Loads the venue-wide "live floor" data: shisha, VVIP, wallet.
    // Wrapped so any single failure just leaves that panel showing its
    // own error state instead of taking down the whole monitor.
    async function loadLiveOpsData() {
      // Shisha: devices + active/paused sessions + pending requests
      try {
        const { data: devices, error: devicesError } = await supabase
          .from('hookah_devices')
          .select(`*, shisha_locations:location_id ( name )`);
        if (devicesError) throw devicesError;
        hookahDevices = devices || [];

        const { data: sessions, error: sessionsError } = await supabase
          .from('shisha_sessions')
          .select(`
            *,
            shisha_products:product_id ( name ),
            shisha_locations:location_id ( name ),
            hookah_devices:device_id ( device_code )
          `)
          .in('status', ['active', 'refill', 'paused'])
          .order('remaining_time_seconds', { ascending: true });
        if (sessionsError) throw sessionsError;
        shishaSessions = sessions || [];

        const { data: requests, error: requestsError } = await supabase
          .from('shisha_requests')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: false });
        if (requestsError) throw requestsError;
        shishaRequests = requests || [];
      } catch (err) {
        console.error('Error loading shisha ops:', err);
        hookahDevices = [];
        shishaSessions = [];
        shishaRequests = [];
      }

      // VVIP: packages tied to this event -> their tables + bookings
      try {
        const { data: packages, error: packagesError } = await supabase
          .from('vvip_packages')
          .select('*')
          .eq('event_id', eventId);
        if (packagesError) throw packagesError;
        vvipPackages = packages || [];

        const packageIds = vvipPackages.map(p => p.id);

        if (packageIds.length > 0) {
          const { data: tables, error: tablesError } = await supabase
            .from('vvip_tables')
            .select('*')
            .in('package_id', packageIds);
          if (tablesError) throw tablesError;
          vvipTables = tables || [];

          const { data: bookings, error: bookingsError } = await supabase
            .from('vvip_bookings')
            .select(`*, vvip_tables:table_id ( table_number )`)
            .in('package_id', packageIds)
            .order('created_at', { ascending: false });
          if (bookingsError) throw bookingsError;
          vvipBookings = bookings || [];
        } else {
          vvipTables = [];
          vvipBookings = [];
        }
      } catch (err) {
        console.error('Error loading VVIP ops:', err);
        vvipPackages = [];
        vvipTables = [];
        vvipBookings = [];
      }

      // Wallet: venue-wide balances + recent transactions
      try {
        const { data: walletData, error: walletsError } = await supabase
          .from('wallets')
          .select('*');
        if (walletsError) throw walletsError;
        wallets = walletData || [];

        const { data: txns, error: txnsError } = await supabase
          .from('wallet_transactions')
          .select(`*, profiles:user_id ( name, surname )`)
          .order('created_at', { ascending: false })
          .limit(15);
        if (txnsError) throw txnsError;
        walletTransactions = txns || [];
      } catch (err) {
        console.error('Error loading wallet ops:', err);
        wallets = [];
        walletTransactions = [];
      }
    }

    // ─── RENDER FUNCTIONS ───
    function renderAll() {
      if (!eventData) {
        showEmptyState();
        return;
      }

      renderEventInfo();
      renderKPIs();
      renderAttendance();
      renderTicketBreakdown();
      renderLiveStatus();
      renderQuickStats();
      renderScanFeed();
      renderShisha();
      renderVvip();
      renderWallet();
    }

    function showEmptyState() {
      const grid = document.getElementById('monitorGrid');
      if (grid) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;padding:60px 20px;">
            <i class="fas fa-calendar-times"></i>
            <h3>No event selected</h3>
            <p>Select an event to monitor from the Event Manager.</p>
          </div>
        `;
      }
      const kpiGrid = document.getElementById('kpiGrid');
      if (kpiGrid) kpiGrid.style.display = 'none';
      const scansCard = document.getElementById('scansCard');
      if (scansCard) scansCard.style.display = 'none';
      const searchSection = document.getElementById('searchSection');
      if (searchSection) searchSection.style.display = 'none';
      const opsGrid = document.getElementById('opsGrid');
      if (opsGrid) opsGrid.style.display = 'none';
      const opsTitle = document.querySelector('.ops-section-title');
      if (opsTitle) opsTitle.style.display = 'none';
    }

    function renderEventInfo() {
      const nameEl = document.getElementById('eventName');
      if (nameEl) nameEl.innerText = eventData.name || 'Unnamed Event';

      const venueEl = document.getElementById('eventVenue');
      if (venueEl) venueEl.innerText = eventData.location || 'Rands Cape Town';

      const dateEl = document.getElementById('eventDate');
      if (dateEl) dateEl.innerText = formatDate(eventData.start_time);

      const timeEl = document.getElementById('eventTime');
      if (timeEl) timeEl.innerText = eventData.start_time ? formatTime(eventData.start_time) : '—';

      const badge = document.getElementById('eventStatusBadge');
      if (badge) {
        const now = new Date();
        const start = new Date(eventData.start_time);
        const end = eventData.end_time ? new Date(eventData.end_time) : null;

        let status = 'upcoming';
        let statusText = 'Upcoming';

        if (end && now > end) {
          status = 'ended';
          statusText = 'Ended';
        } else if (now >= start) {
          status = 'live';
          statusText = 'Live';
        }

        badge.className = `event-status-badge ${status}`;
        badge.innerText = statusText;
      }
    }

    function renderKPIs() {
      const totalSold = tickets.filter(t => t.status === 'issued').length;
      const validCheckins = checkins.filter(c => c.status === 'valid' || c.status === 'reentry');
      const uniqueCheckedIn = new Set(validCheckins.map(c => c.ticket_id)).size;

      let totalCapacity = 0;
      let totalRevenue = 0;
      const typeSales = {};

      ticketTypes.forEach(tt => {
        totalCapacity += tt.capacity || 0;
        const sold = tickets.filter(t => t.ticket_type_id === tt.id && t.status === 'issued').length;
        typeSales[tt.name] = sold;
        totalRevenue += sold * (tt.price || 0);
      });

      const remaining = Math.max(0, totalCapacity - totalSold);
      const attendancePercent = totalSold > 0 ? Math.round((uniqueCheckedIn / totalSold) * 100) : 0;

      let lastScanTime = '—';
      if (checkins.length > 0) {
        const lastCheckin = checkins.reduce((latest, c) => {
          return new Date(c.scanned_at) > new Date(latest.scanned_at) ? c : latest;
        }, checkins[0]);
        lastScanTime = formatTime(lastCheckin.scanned_at);
      }

      const generalSold = typeSales['General Admission'] || typeSales['General'] || 0;
      const vipSold = typeSales['VIP Experience'] || typeSales['VIP'] || 0;

      animateValue('kpiSold', fmtNum(totalSold));
      animateValue('kpiCheckedIn', fmtNum(uniqueCheckedIn));
      animateValue('kpiRemaining', fmtNum(remaining));
      animateValue('kpiAttendance', `${attendancePercent}%`);
      animateValue('kpiGeneral', fmtNum(generalSold));
      animateValue('kpiVip', fmtNum(vipSold));
      animateValue('kpiRevenue', fmtR(totalRevenue));
      animateValue('kpiLastScan', lastScanTime);
    }

    function renderAttendance() {
      const totalSold = tickets.filter(t => t.status === 'issued').length;
      const validCheckins = checkins.filter(c => c.status === 'valid' || c.status === 'reentry');
      const uniqueCheckedIn = new Set(validCheckins.map(c => c.ticket_id)).size;

      let totalCapacity = 0;
      ticketTypes.forEach(tt => {
        totalCapacity += tt.capacity || 0;
      });

      const attendancePercent = totalSold > 0 ? Math.round((uniqueCheckedIn / totalSold) * 100) : 0;
      const displayTotal = Math.max(totalCapacity, totalSold);

      const percentEl = document.getElementById('attendancePercent');
      if (percentEl) percentEl.innerText = `${attendancePercent}%`;

      const fillEl = document.getElementById('attendanceFill');
      if (fillEl) fillEl.style.width = `${Math.min(attendancePercent, 100)}%`;

      const checkedEl = document.getElementById('attendanceChecked');
      if (checkedEl) checkedEl.innerText = fmtNum(uniqueCheckedIn);

      const totalEl = document.getElementById('attendanceTotal');
      if (totalEl) totalEl.innerText = fmtNum(displayTotal);
    }

    function renderTicketBreakdown() {
      const container = document.getElementById('ticketTypesContainer');
      if (!container) return;

      if (!ticketTypes.length) {
        container.innerHTML = `
          <div class="empty-state" style="padding:20px;text-align:center;">
            <p style="color:var(--muted);">No tickets have been sold.</p>
          </div>
        `;
        return;
      }

      const colors = ['#E30613', '#f97316', '#8b5cf6', '#3b82f6', '#22c55e'];
      const icons = ['fa-ticket', 'fa-users', 'fa-crown', 'fa-star', 'fa-gem'];

      let html = '';
      ticketTypes.forEach((tt, index) => {
        const sold = tickets.filter(t => t.ticket_type_id === tt.id && t.status === 'issued').length;
        const validCheckins = checkins.filter(c => {
          const ticket = tickets.find(t => t.id === c.ticket_id);
          return ticket && ticket.ticket_type_id === tt.id && (c.status === 'valid' || c.status === 'reentry');
        });
        const uniqueCheckedIn = new Set(validCheckins.map(c => c.ticket_id)).size;
        const remaining = Math.max(0, (tt.capacity || 0) - sold);
        const percent = tt.capacity > 0 ? Math.round((sold / tt.capacity) * 100) : 0;

        html += `
          <div class="ticket-type-card" data-ticket-type="${tt.id}">
            <div class="ticket-type-header">
              <div class="ticket-type-name">
                <i class="fas ${icons[index % icons.length]}"></i>
                ${escapeHtml(tt.name)}
              </div>
              <span style="font-weight:700;color:var(--red);font-size:0.7rem;">${fmtR(tt.price || 0)}</span>
            </div>
            <div class="ticket-type-stats">
              <span><strong>${fmtNum(sold)}</strong> Sold</span>
              <span><strong>${fmtNum(uniqueCheckedIn)}</strong> Checked In</span>
              <span><strong>${fmtNum(remaining)}</strong> Remaining</span>
            </div>
            <div class="ticket-type-progress">
              <div class="ticket-type-fill" style="width:${Math.min(percent, 100)}%;background:${colors[index % colors.length]};"></div>
            </div>
          </div>
        `;
      });

      container.innerHTML = html;
    }

    function renderLiveStatus() {
      const now = new Date();
      const start = new Date(eventData.start_time);
      const end = eventData.end_time ? new Date(eventData.end_time) : null;

      let statusText = 'Upcoming';
      let statusColor = 'var(--blue)';
      if (end && now > end) {
        statusText = 'Ended';
        statusColor = 'var(--muted)';
      } else if (now >= start) {
        statusText = 'Live';
        statusColor = 'var(--green)';
      }

      const statusEl = document.getElementById('statusEventStatus');
      if (statusEl) statusEl.innerHTML = `<span style="color:${statusColor};font-weight:700;">${statusText}</span>`;

      let timeRemaining = '—';
      if (end && now < end) {
        const diff = end - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        timeRemaining = `${hours}h ${mins}m`;
      } else if (end && now >= end) {
        timeRemaining = 'Ended';
      }
      const timeEl = document.getElementById('statusTimeRemaining');
      if (timeEl) timeEl.innerText = timeRemaining;

      const validCheckins = checkins.filter(c => c.status === 'valid' || c.status === 'reentry');
      const uniqueCheckedIn = new Set(validCheckins.map(c => c.ticket_id)).size;
      const currentEl = document.getElementById('statusCurrentAttendance');
      if (currentEl) currentEl.innerText = fmtNum(uniqueCheckedIn);

      // Scanner devices - using scanner_devices table
      const scannersEl = document.getElementById('statusScannersOnline');
      if (scannersEl) scannersEl.innerText = scannerDevices.filter(d => d.is_online).length + ' / ' + scannerDevices.length;

      let lastCheckin = '—';
      if (checkins.length > 0) {
        const latest = checkins.reduce((a, b) => new Date(a.scanned_at) > new Date(b.scanned_at) ? a : b);
        lastCheckin = formatDateTime(latest.scanned_at);
      }
      const lastEl = document.getElementById('statusLastCheckin');
      if (lastEl) lastEl.innerText = lastCheckin;
    }

    function renderQuickStats() {
      let totalCapacity = 0;
      let totalRevenue = 0;

      ticketTypes.forEach(tt => {
        totalCapacity += tt.capacity || 0;
        const sold = tickets.filter(t => t.ticket_type_id === tt.id && t.status === 'issued').length;
        totalRevenue += sold * (tt.price || 0);
      });

      const totalSold = tickets.filter(t => t.status === 'issued').length;
      const validCheckins = checkins.filter(c => c.status === 'valid' || c.status === 'reentry');
      const uniqueCheckedIn = new Set(validCheckins.map(c => c.ticket_id)).size;
      const checkinPercent = totalSold > 0 ? Math.round((uniqueCheckedIn / totalSold) * 100) : 0;

      const capEl = document.getElementById('quickCapacity');
      if (capEl) capEl.innerText = fmtNum(totalCapacity);

      const percentEl = document.getElementById('quickCheckinPercent');
      if (percentEl) percentEl.innerText = `${checkinPercent}%`;

      const typesEl = document.getElementById('quickTicketTypes');
      if (typesEl) typesEl.innerText = ticketTypes.length;

      const revEl = document.getElementById('quickRevenue');
      if (revEl) revEl.innerText = fmtR(totalRevenue);
    }

    // ─── SCAN FEED FUNCTIONS ───
    function renderScanFeed() {
      const container = document.getElementById('scanFeedContainer');
      if (!container) return;

      if (!checkins.length) {
        container.innerHTML = `
          <div class="empty-state" style="padding:20px;text-align:center;">
            <i class="fas fa-qrcode" style="font-size:2rem;color:var(--dim);margin-bottom:8px;"></i>
            <p style="color:var(--muted);">No guests have checked in yet.</p>
          </div>
        `;
        const countEl = document.getElementById('scanCount');
        if (countEl) countEl.innerText = '0 scans';
        return;
      }

      const recent = checkins.slice(0, 20);

      const countEl = document.getElementById('scanCount');
      if (countEl) countEl.innerText = `${checkins.length} scans`;

      let html = '';
      recent.forEach(scan => {
        html += renderScanItem(scan);
      });

      container.innerHTML = html;

      container.querySelectorAll('.scan-item').forEach(item => {
        item.addEventListener('click', function() {
          const scanId = this.dataset.scanId;
          const scan = checkins.find(c => c.id === scanId);
          if (scan && scan.ticket_id) {
            openCustomerDrawer(scan.ticket_id);
          }
        });
      });
    }

    function renderScanItem(scan) {
      const ticket = tickets.find(t => t.id === scan.ticket_id);
      const ticketType = ticketTypes.find(tt => tt.id === ticket?.ticket_type_id);
      const customer = ticket?.profiles || null;
      const staff = staffProfiles.find(p => p.id === scan.scanned_by);

      // Use name/surname from profiles, or fallback to customer_phone
      let guestName = 'Guest';
      if (customer) {
        guestName = `${customer.name || ''} ${customer.surname || ''}`.trim() || 'Guest';
      } else if (ticket?.customer_phone) {
        guestName = ticket.customer_phone;
      }

      const staffName = staff ? `${staff.name || ''} ${staff.surname || ''}`.trim() : '—';
      const resultClass = getResultBadgeClass(scan.status);
      const resultDisplay = scan.status || 'Unknown';
      const time = formatTime(scan.scanned_at);
      const ticketNum = ticket?.ticket_number || 'N/A';
      const typeName = ticketType?.name || '—';
      const gate = scan.gate || '—';

      return `
        <div class="scan-item" data-scan-id="${scan.id}" data-ticket-id="${scan.ticket_id}">
          <div class="scan-time">${time}</div>
          <div class="scan-details">
            <div class="guest-name">${escapeHtml(guestName)}</div>
            <div class="scan-meta">
              <span><i class="fas fa-ticket"></i> ${escapeHtml(ticketNum)}</span>
              <span><i class="fas fa-tag"></i> ${escapeHtml(typeName)}</span>
              <span><i class="fas fa-user"></i> ${escapeHtml(staffName)}</span>
              <span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(gate)}</span>
            </div>
          </div>
          <div class="scan-result-badge ${resultClass}">${escapeHtml(resultDisplay)}</div>
        </div>
      `;
    }

    function appendScan(scan) {
      const container = document.getElementById('scanFeedContainer');
      if (!container) return;

      const emptyState = container.querySelector('.empty-state');
      if (emptyState) container.innerHTML = '';

      if (container.querySelector(`[data-scan-id="${scan.id}"]`)) return;

      const scanHtml = renderScanItem(scan);
      container.insertAdjacentHTML('afterbegin', scanHtml);

      const countEl = document.getElementById('scanCount');
      if (countEl) {
        const currentCount = checkins.length;
        countEl.innerText = `${currentCount} scans`;
      }

      const items = container.querySelectorAll('.scan-item');
      while (items.length > 20) {
        items[items.length - 1].remove();
      }

      const newItem = container.querySelector('.scan-item:first-child');
      if (newItem) {
        newItem.style.animation = 'none';
        void newItem.offsetWidth;
        newItem.style.animation = 'slideIn 0.3s ease';
        
        newItem.addEventListener('click', function() {
          const scanId = this.dataset.scanId;
          const scan = checkins.find(c => c.id === scanId);
          if (scan && scan.ticket_id) {
            openCustomerDrawer(scan.ticket_id);
          }
        });
      }
    }

    // ─── SEARCH FUNCTIONS ───
    async function searchTickets(query) {
      if (!eventId || !query || query.length < 2) {
        clearSearch();
        return;
      }

      const container = document.getElementById('searchResultsContainer');
      container.classList.add('active');
      container.innerHTML = `
        <div class="search-state">
          <div class="search-loading"></div>
          <p>Searching...</p>
        </div>
      `;

      isSearching = true;

      try {
        const searchTerm = `%${query}%`;

        // PostgREST/Supabase's .or() can't mix a base-table column
        // (ticket_number) with a joined/embedded column (profiles.name) in
        // a single call — that combination throws a query error. So this
        // runs two queries in parallel instead: one filtered on the
        // tickets table itself, one on profiles, then merges the results.
        const [ticketMatch, profileMatch] = await Promise.all([
          supabase
            .from('tickets')
            .select(`
              *,
              profiles:customer_id ( id, name, surname, phone, email ),
              ticket_types ( id, name, price )
            `)
            .eq('event_id', eventId)
            .or(
              `ticket_number.ilike.${searchTerm},` +
              `qr_token.ilike.${searchTerm},` +
              `id.ilike.${searchTerm},` +
              `customer_phone.ilike.${searchTerm}`
            )
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('profiles')
            .select('id')
            .or(
              `name.ilike.${searchTerm},` +
              `surname.ilike.${searchTerm},` +
              `phone.ilike.${searchTerm},` +
              `email.ilike.${searchTerm}`
            )
        ]);

        if (ticketMatch.error) throw ticketMatch.error;
        if (profileMatch.error) throw profileMatch.error;

        let combined = ticketMatch.data || [];

        const matchedProfileIds = (profileMatch.data || []).map(p => p.id);
        if (matchedProfileIds.length > 0) {
          const { data: byCustomer, error: byCustomerError } = await supabase
            .from('tickets')
            .select(`
              *,
              profiles:customer_id ( id, name, surname, phone, email ),
              ticket_types ( id, name, price )
            `)
            .eq('event_id', eventId)
            .in('customer_id', matchedProfileIds)
            .order('created_at', { ascending: false })
            .limit(50);

          if (byCustomerError) throw byCustomerError;

          const seen = new Set(combined.map(t => t.id));
          for (const t of (byCustomer || [])) {
            if (!seen.has(t.id)) {
              combined.push(t);
              seen.add(t.id);
            }
          }
        }

        isSearching = false;
        renderSearchResults(combined);

      } catch (err) {
        isSearching = false;
        console.error('Search error:', err);
        container.innerHTML = `
          <div class="search-state">
            <i class="fas fa-exclamation-triangle" style="color:var(--red);"></i>
            <p style="color:var(--red);">Search error: ${escapeHtml(err.message)}</p>
          </div>
        `;
      }
    }

    function renderSearchResults(results) {
      const container = document.getElementById('searchResultsContainer');
      
      if (!results || results.length === 0) {
        container.innerHTML = `
          <div class="search-state">
            <i class="fas fa-search"></i>
            <p>No results found</p>
          </div>
        `;
        return;
      }

      searchResults = results;
      selectedIndex = -1;

      let html = '';
      results.forEach((ticket, index) => {
        html += renderSearchResultItem(ticket, index);
      });

      container.innerHTML = html;
    }

    function renderSearchResultItem(ticket, index) {
      const profile = ticket.profiles || {};
      const ticketType = ticket.ticket_types || {};
      const fullName = `${profile.name || ''} ${profile.surname || ''}`.trim() || ticket.customer_phone || 'Guest';
      
      const ticketCheckins = checkins.filter(c => c.ticket_id === ticket.id && (c.status === 'valid' || c.status === 'reentry'));
      const isCheckedIn = ticketCheckins.length > 0;
      const lastCheckin = ticketCheckins.length > 0 ? ticketCheckins[0] : null;
      
      const statusClass = getStatusBadgeClass(ticket.status);
      const entriesUsed = ticket.entries_used || 0;
      const entriesAllowed = ticket.entries_allowed || 1;

      return `
        <div class="search-result-item" data-index="${index}" data-ticket-id="${ticket.id}">
          <div class="search-result-info">
            <div class="result-name">
              ${escapeHtml(fullName)}
              <span class="ticket-status ${statusClass}">${escapeHtml(ticket.status || 'issued')}</span>
              ${isCheckedIn ? '<span class="ticket-status used">Checked In</span>' : ''}
            </div>
            <div class="result-details">
              <span><i class="fas fa-ticket"></i> ${escapeHtml(ticket.ticket_number || '—')}</span>
              <span><i class="fas fa-tag"></i> ${escapeHtml(ticketType.name || '—')}</span>
              <span><i class="fas fa-phone"></i> ${escapeHtml(ticket.customer_phone || '—')}</span>
              <span><i class="fas fa-envelope"></i> ${escapeHtml(profile.email || '—')}</span>
              <span><i class="fas fa-check-circle"></i> ${entriesUsed}/${entriesAllowed} used</span>
              ${ticket.allow_reentry ? '<span><i class="fas fa-undo"></i> Re-entry allowed</span>' : ''}
              ${lastCheckin ? `<span><i class="fas fa-clock"></i> ${formatTime(lastCheckin.scanned_at)}</span>` : ''}
            </div>
          </div>
          <div class="search-result-actions">
            <button class="action-btn info" onclick="window.viewTicketDetails('${ticket.id}')" title="View Details">
              <i class="fas fa-eye"></i> Details
            </button>
            <button class="action-btn primary" onclick="window.manualCheckin('${ticket.id}')" title="Manual Check-in">
              <i class="fas fa-user-check"></i> Check-in
            </button>
            <button class="action-btn" onclick="window.copyTicketNumber('${ticket.ticket_number}')" title="Copy Ticket Number">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        </div>
      `;
    }

    function clearSearch() {
      const container = document.getElementById('searchResultsContainer');
      container.classList.remove('active');
      container.innerHTML = '';
      searchResults = [];
      selectedIndex = -1;
    }

    // ─── CUSTOMER DETAILS DRAWER ───
    async function openCustomerDrawer(ticketId) {
      if (!ticketId) {
        showToast('Invalid ticket ID', 'error');
        return;
      }

      currentDrawerTicketId = ticketId;
      const drawer = document.getElementById('customerDrawer');
      const overlay = document.getElementById('drawerOverlay');
      const body = document.getElementById('drawerBody');
      const title = document.getElementById('drawerTitle');

      body.innerHTML = `
        <div class="drawer-loading">
          <div class="spinner"></div>
          <p>Loading customer details...</p>
        </div>
      `;

      drawer.classList.add('open');
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';

      try {
        const data = await loadCustomerDetails(ticketId);
        if (data) {
          const customerName = data.customer ? `${data.customer.name || ''} ${data.customer.surname || ''}`.trim() : 'Customer';
          title.innerText = `${customerName || 'Customer'} Details`;
          renderCustomerDrawer(data);
        } else {
          throw new Error('Ticket not found');
        }
      } catch (err) {
        console.error('Error loading customer details:', err);
        body.innerHTML = `
          <div class="drawer-error">
            <i class="fas fa-exclamation-circle"></i>
            <h3>Error loading ticket</h3>
            <p>${escapeHtml(err.message || 'Ticket not found')}</p>
          </div>
        `;
      }
    }

    async function loadCustomerDetails(ticketId) {
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select(`
          *,
          profiles:customer_id (
            id,
            name,
            surname,
            phone,
            email
          ),
          ticket_types (
            id,
            name,
            price,
            capacity
          ),
          events!inner (
            id,
            name,
            start_time,
            end_time,
            location
          )
        `)
        .eq('id', ticketId)
        .single();

      if (ticketError) throw ticketError;
      if (!ticket) throw new Error('Ticket not found');

      const { data: scanHistory, error: scanError } = await supabase
        .from('checkins')
        .select(`
          *,
          profiles:scanned_by (
            id,
            name,
            surname
          )
        `)
        .eq('ticket_id', ticketId)
        .order('scanned_at', { ascending: false });

      if (scanError) throw scanError;

      return {
        ticket: ticket,
        customer: ticket.profiles || {},
        ticketType: ticket.ticket_types || {},
        event: ticket.events || {},
        scanHistory: scanHistory || []
      };
    }

    function renderCustomerDrawer(data) {
      const body = document.getElementById('drawerBody');
      const { ticket, customer, ticketType, event, scanHistory } = data;

      const fullName = `${customer.name || ''} ${customer.surname || ''}`.trim() || ticket.customer_phone || 'Guest';
      const checkedInScans = scanHistory.filter(s => s.status === 'valid' || s.status === 'reentry');
      const isCheckedIn = checkedInScans.length > 0;
      const lastCheckin = checkedInScans.length > 0 ? checkedInScans[0] : null;

      let scanHistoryHtml = '';
      if (scanHistory.length === 0) {
        scanHistoryHtml = `
          <div class="empty-state" style="padding:12px;text-align:center;">
            <p style="color:var(--muted);font-size:0.7rem;">No scans recorded for this ticket</p>
          </div>
        `;
      } else {
        scanHistoryHtml = scanHistory.map(scan => {
          const staff = scan.profiles || {};
          const staffName = `${staff.name || ''} ${staff.surname || ''}`.trim() || '—';
          const resultClass = getResultBadgeClass(scan.status);
          const gate = scan.gate || '—';
          
          return `
            <div class="drawer-scan-item">
              <div class="scan-info">
                <div class="scan-time">${formatDateTime(scan.scanned_at)}</div>
                <div class="scan-meta">
                  <span><i class="fas fa-user"></i> ${escapeHtml(staffName)}</span>
                  <span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(gate)}</span>
                  <span><i class="fas fa-qrcode"></i> ${escapeHtml(scan.scan_type || 'qr')}</span>
                </div>
              </div>
              <span class="scan-result-badge ${resultClass}">${escapeHtml(scan.status || '—')}</span>
            </div>
          `;
        }).join('');
      }

      body.innerHTML = `
        <!-- Customer Information -->
        <div class="drawer-section">
          <h4><i class="fas fa-user"></i> Customer Information</h4>
          <div class="drawer-row"><span class="label">Full Name</span><span class="value">${escapeHtml(fullName)}</span></div>
          <div class="drawer-row"><span class="label">Phone</span><span class="value">${escapeHtml(customer.phone || ticket.customer_phone || '—')}</span></div>
          <div class="drawer-row"><span class="label">Email</span><span class="value">${escapeHtml(customer.email || '—')}</span></div>
          <div class="drawer-row"><span class="label">Customer ID</span><span class="value"><code style="font-size:0.65rem;color:var(--muted);">${escapeHtml(customer.id || '—')}</code></span></div>
        </div>

        <!-- Ticket Information -->
        <div class="drawer-section">
          <h4><i class="fas fa-ticket-alt"></i> Ticket Information</h4>
          <div class="drawer-row"><span class="label">Ticket Number</span><span class="value"><strong>${escapeHtml(ticket.ticket_number || '—')}</strong></span></div>
          <div class="drawer-row"><span class="label">Ticket Type</span><span class="value">${escapeHtml(ticketType.name || '—')}</span></div>
          <div class="drawer-row"><span class="label">Ticket Status</span><span class="value"><span class="badge ${getStatusBadgeClass(ticket.status)}">${escapeHtml(ticket.status || '—')}</span></span></div>
          <div class="drawer-row"><span class="label">Event</span><span class="value">${escapeHtml(event.name || '—')}</span></div>
          <div class="drawer-row"><span class="label">QR Token</span><span class="value"><code style="font-size:0.6rem;color:var(--muted);">${escapeHtml(ticket.qr_token || '—')}</code></span></div>
          <div class="drawer-row"><span class="label">Purchase Date</span><span class="value">${formatDateTime(ticket.issued_at)}</span></div>
          <div class="drawer-row"><span class="label">Entries</span><span class="value">${ticket.entries_used || 0} / ${ticket.entries_allowed || 1} used</span></div>
          <div class="drawer-row"><span class="label">Re-entry</span><span class="value">${ticket.allow_reentry ? '✅ Allowed' : '❌ Not allowed'}</span></div>
        </div>

        <!-- Check-in Information -->
        <div class="drawer-section">
          <h4><i class="fas fa-check-circle"></i> Check-in Information</h4>
          <div class="drawer-row">
            <span class="label">Checked In</span>
            <span class="value">
              <span class="badge ${isCheckedIn ? 'checked-in' : 'not-checked-in'}">
                ${isCheckedIn ? '✅ Yes' : '❌ No'}
              </span>
            </span>
          </div>
          ${isCheckedIn && lastCheckin ? `
            <div class="drawer-row"><span class="label">Check-in Time</span><span class="value">${formatDateTime(lastCheckin.scanned_at)}</span></div>
            <div class="drawer-row"><span class="label">Last Scan</span><span class="value">${formatDateTime(ticket.last_scanned_at)}</span></div>
            <div class="drawer-row"><span class="label">Scan Result</span><span class="value"><span class="badge ${getResultBadgeClass(lastCheckin.status)}">${escapeHtml(lastCheckin.status || '—')}</span></span></div>
            <div class="drawer-row"><span class="label">Staff Member</span><span class="value">${escapeHtml(lastCheckin.profiles ? `${lastCheckin.profiles.name || ''} ${lastCheckin.profiles.surname || ''}`.trim() : '—')}</span></div>
            <div class="drawer-row"><span class="label">Gate</span><span class="value">${escapeHtml(lastCheckin.gate || '—')}</span></div>
          ` : ''}
        </div>

        <!-- Scan History -->
        <div class="drawer-section">
          <h4><i class="fas fa-history"></i> Scan History (${scanHistory.length})</h4>
          <div class="drawer-scan-history">
            ${scanHistoryHtml}
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="drawer-section">
          <h4><i class="fas fa-bolt"></i> Quick Actions</h4>
          <div class="drawer-actions">
            <button class="action-btn success" onclick="window.manualCheckin('${ticket.id}')">
              <i class="fas fa-user-check"></i> Check-in
            </button>
            <button class="action-btn warning" onclick="window.undoCheckin('${ticket.id}')">
              <i class="fas fa-undo"></i> Undo Check-in
            </button>
            <button class="action-btn" onclick="window.copyTicketNumber('${ticket.ticket_number}')">
              <i class="fas fa-copy"></i> Copy Ticket #
            </button>
            <button class="action-btn" onclick="window.copyQrToken('${ticket.qr_token}')">
              <i class="fas fa-qrcode"></i> Copy QR
            </button>
            <button class="action-btn" onclick="window.printTicket('${ticket.id}')">
              <i class="fas fa-print"></i> Print Ticket
            </button>
            <button class="action-btn" onclick="window.resendTicket('${ticket.id}')">
              <i class="fas fa-envelope"></i> Resend Ticket
            </button>
          </div>
        </div>
      `;
    }

    window.closeCustomerDrawer = function closeCustomerDrawer() {
      const drawer = document.getElementById('customerDrawer');
      const overlay = document.getElementById('drawerOverlay');
      
      drawer.classList.remove('open');
      overlay.classList.remove('active');
      document.body.style.overflow = '';
      
      setTimeout(() => {
        if (!drawer.classList.contains('open')) {
          document.getElementById('drawerBody').innerHTML = '';
          document.getElementById('drawerTitle').innerText = 'Customer Details';
        }
      }, 400);
    }

    // ─── SEARCH ACTION FUNCTIONS ───
    window.viewTicketDetails = function(ticketId) {
      openCustomerDrawer(ticketId);
    };

    window.manualCheckin = function(ticketId) {
      showToast('Manual Check-in feature coming soon', 'success');
      console.log('Manual check-in for ticket:', ticketId);
    };

    window.undoCheckin = function(ticketId) {
      showToast('Undo Check-in feature coming soon', 'success');
      console.log('Undo check-in for ticket:', ticketId);
    };

    window.copyTicketNumber = function(ticketNumber) {
      if (!ticketNumber) {
        showToast('No ticket number to copy', 'error');
        return;
      }
      navigator.clipboard.writeText(ticketNumber).then(() => {
        showToast(`Copied: ${ticketNumber}`, 'success');
      }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = ticketNumber;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast(`Copied: ${ticketNumber}`, 'success');
      });
    };

    window.copyQrToken = function(qrToken) {
      if (!qrToken) {
        showToast('No QR token to copy', 'error');
        return;
      }
      navigator.clipboard.writeText(qrToken).then(() => {
        showToast('QR token copied to clipboard', 'success');
      }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = qrToken;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('QR token copied to clipboard', 'success');
      });
    };

    window.printTicket = function(ticketId) {
      showToast('Print Ticket feature coming soon', 'success');
      console.log('Print ticket:', ticketId);
    };

    window.resendTicket = function(ticketId) {
      showToast('Resend Ticket feature coming soon', 'success');
      console.log('Resend ticket:', ticketId);
    };

    // ─── SEARCH KEYBOARD NAVIGATION ───
    function navigateSearchResults(direction) {
      if (searchResults.length === 0) return;

      const items = document.querySelectorAll('.search-result-item');
      if (items.length === 0) return;

      items.forEach(item => item.classList.remove('keyboard-nav'));

      if (direction === 'down') {
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      } else if (direction === 'up') {
        selectedIndex = Math.max(selectedIndex - 1, 0);
      }

      if (selectedIndex >= 0 && selectedIndex < items.length) {
        const selectedItem = items[selectedIndex];
        selectedItem.classList.add('keyboard-nav');
        selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }

    function selectCurrentResult() {
      if (selectedIndex < 0 || selectedIndex >= searchResults.length) return;
      const ticket = searchResults[selectedIndex];
      if (ticket) {
        window.viewTicketDetails(ticket.id);
      }
    }

    // ─── SEARCH EVENT HANDLERS ───
    function setupSearch() {
      const searchInput = document.getElementById('searchInput');
      const searchClear = document.getElementById('searchClear');

      searchInput.addEventListener('input', function(e) {
        const query = this.value.trim();
        
        if (query.length === 0) {
          clearSearch();
          searchClear.classList.remove('visible');
          return;
        }

        searchClear.classList.add('visible');

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          searchTickets(query);
        }, 300);
      });

      searchClear.addEventListener('click', function() {
        document.getElementById('searchInput').value = '';
        this.classList.remove('visible');
        clearSearch();
        document.getElementById('searchInput').focus();
      });

      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          this.value = '';
          searchClear.classList.remove('visible');
          clearSearch();
          this.blur();
          e.preventDefault();
          return;
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          navigateSearchResults('down');
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          navigateSearchResults('up');
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          selectCurrentResult();
        }
      });

      document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          const searchInput = document.getElementById('searchInput');
          searchInput.focus();
          searchInput.select();
        }

        if (e.key === 'Escape') {
          const drawer = document.getElementById('customerDrawer');
          if (drawer.classList.contains('open')) {
            closeCustomerDrawer();
          }
        }
      });

      document.addEventListener('click', function(e) {
        const searchSection = document.getElementById('searchSection');
        if (searchSection && !searchSection.contains(e.target)) {
          clearSearch();
        }
      });
    }

    // ─── LIVE FLOOR OPS RENDER FUNCTIONS ───
    function fmtDuration(seconds) {
      if (seconds === null || seconds === undefined) return '—';
      const s = Math.max(0, seconds);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    }

    function timeAgo(dateStr) {
      if (!dateStr) return '—';
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const mins = Math.round(diffMs / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.round(mins / 60);
      return `${hrs}h ago`;
    }

    function renderShisha() {
      const listEl = document.getElementById('shishaList');
      const countEl = document.getElementById('shishaCount');
      if (!listEl) return;

      const inUse = hookahDevices.filter(d => d.status === 'in_use').length;
      const available = hookahDevices.filter(d => d.status === 'available').length;
      const pending = shishaRequests.length;

      animateValue('shishaInUse', fmtNum(inUse));
      animateValue('shishaAvailable', fmtNum(available));
      animateValue('shishaPending', fmtNum(pending));
      if (countEl) countEl.innerText = `${hookahDevices.length} devices`;

      if (!shishaSessions.length && !shishaRequests.length) {
        listEl.innerHTML = `<div class="ops-empty"><i class="fas fa-smoking"></i>No active shisha sessions right now.</div>`;
        return;
      }

      let html = '';

      shishaRequests.slice(0, 5).forEach(req => {
        html += `
          <div class="ops-item">
            <div class="ops-item-main">
              <div class="ops-item-title">${escapeHtml(req.request_type || 'Request').replace(/_/g, ' ')}</div>
              <div class="ops-item-sub">
                <span>${escapeHtml(req.location_name || 'Unknown location')}</span>
                ${req.device_code ? `<span>${escapeHtml(req.device_code)}</span>` : ''}
                <span>${timeAgo(req.created_at)}</span>
              </div>
            </div>
            <div class="ops-item-right"><span class="ops-badge gold">Pending</span></div>
          </div>
        `;
      });

      shishaSessions.slice(0, 10).forEach(session => {
        const remaining = session.remaining_time_seconds;
        const isLow = remaining !== null && remaining !== undefined && remaining < 300;
        const badgeClass = session.status === 'paused' ? 'muted' : (isLow ? 'red' : 'green');
        const badgeText = session.status === 'paused' ? 'Paused' : (isLow ? 'Low time' : 'Active');
        const locationName = session.shisha_locations?.name || 'Unknown location';
        const deviceCode = session.hookah_devices?.device_code || '—';
        const productName = session.shisha_products?.name || 'Shisha';

        html += `
          <div class="ops-item">
            <div class="ops-item-main">
              <div class="ops-item-title">${escapeHtml(productName)} · ${escapeHtml(deviceCode)}</div>
              <div class="ops-item-sub">
                <span>${escapeHtml(locationName)}</span>
                ${session.customer_phone ? `<span>${escapeHtml(session.customer_phone)}</span>` : ''}
              </div>
            </div>
            <div class="ops-item-right">
              <div class="ops-item-value">${fmtDuration(remaining)}</div>
              <span class="ops-badge ${badgeClass}">${badgeText}</span>
            </div>
          </div>
        `;
      });

      listEl.innerHTML = html;
    }

    function renderVvip() {
      const listEl = document.getElementById('vvipList');
      const countEl = document.getElementById('vvipCount');
      if (!listEl) return;

      const seated = vvipBookings.filter(b => b.status === 'seated').length;
      const confirmed = vvipBookings.filter(b => b.status === 'confirmed' || b.status === 'checked_in').length;
      const tabsLeft = vvipBookings.reduce((sum, b) => sum + (Number(b.remaining_balance) || 0), 0);

      animateValue('vvipSeated', fmtNum(seated));
      animateValue('vvipConfirmed', fmtNum(confirmed));
      animateValue('vvipTabTotal', fmtR(tabsLeft));
      if (countEl) countEl.innerText = `${vvipTables.length} tables`;

      if (!vvipBookings.length) {
        listEl.innerHTML = `<div class="ops-empty"><i class="fas fa-crown"></i>No VVIP packages linked to this event yet.</div>`;
        return;
      }

      const statusBadge = {
        confirmed: 'blue',
        checked_in: 'gold',
        seated: 'green',
        completed: 'muted',
        cancelled: 'red',
        no_show: 'red'
      };

      let html = '';
      vvipBookings.slice(0, 12).forEach(booking => {
        const tableLabel = booking.vvip_tables?.table_number
          ? `Table ${booking.vvip_tables.table_number}`
          : 'Unassigned table';
        const badge = statusBadge[booking.status] || 'muted';

        html += `
          <div class="ops-item">
            <div class="ops-item-main">
              <div class="ops-item-title">${escapeHtml(booking.customer_name || booking.customer_phone || 'Guest')}</div>
              <div class="ops-item-sub">
                <span>${escapeHtml(tableLabel)}</span>
                <span>${fmtNum(booking.quantity || 1)} guests</span>
              </div>
            </div>
            <div class="ops-item-right">
              <div class="ops-item-value">${fmtR(booking.remaining_balance || 0)} left</div>
              <span class="ops-badge ${badge}">${escapeHtml((booking.status || '').replace(/_/g, ' '))}</span>
            </div>
          </div>
        `;
      });

      listEl.innerHTML = html;
    }

    function renderWallet() {
      const listEl = document.getElementById('walletList');
      const countEl = document.getElementById('walletCount');
      if (!listEl) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todaysTxns = walletTransactions.filter(t => new Date(t.created_at) >= today);
      const loadedToday = todaysTxns
        .filter(t => t.direction === 'credit' && t.status === 'succeeded')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const spentToday = todaysTxns
        .filter(t => t.direction === 'debit' && t.status === 'succeeded')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const inCirculation = wallets.reduce((sum, w) => sum + (Number(w.balance) || 0), 0);

      animateValue('walletLoadedToday', fmtR(loadedToday));
      animateValue('walletSpentToday', fmtR(spentToday));
      animateValue('walletInCirculation', fmtR(inCirculation));
      if (countEl) countEl.innerText = `${wallets.length} wallets`;

      if (!walletTransactions.length) {
        listEl.innerHTML = `<div class="ops-empty"><i class="fas fa-wallet"></i>No wallet activity yet.</div>`;
        return;
      }

      const statusBadge = {
        succeeded: 'green',
        pending: 'gold',
        failed: 'red',
        cancelled: 'muted',
        expired: 'muted'
      };

      let html = '';
      walletTransactions.forEach(txn => {
        const name = txn.profiles ? `${txn.profiles.name || ''} ${txn.profiles.surname || ''}`.trim() : null;
        const sign = txn.direction === 'debit' ? '-' : '+';
        const badge = statusBadge[txn.status] || 'muted';

        html += `
          <div class="ops-item">
            <div class="ops-item-main">
              <div class="ops-item-title">${escapeHtml(name || 'Guest wallet')}</div>
              <div class="ops-item-sub">
                <span>${escapeHtml(txn.description || txn.payment_method || txn.type || 'Transaction')}</span>
                <span>${timeAgo(txn.created_at)}</span>
              </div>
            </div>
            <div class="ops-item-right">
              <div class="ops-item-value">${sign}${fmtR(txn.amount || 0)}</div>
              <span class="ops-badge ${badge}">${escapeHtml(txn.status || 'pending')}</span>
            </div>
          </div>
        `;
      });

      listEl.innerHTML = html;
    }

    // ─── REAL-TIME SUBSCRIPTIONS ───
    function setupRealtime() {
      subscriptions.forEach(sub => sub.unsubscribe());
      subscriptions = [];

      if (!eventId) return;

      const ticketIds = tickets.map(t => t.id);

      const checkinSub = supabase
        .channel(`scan-feed-${eventId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'checkins',
            filter: ticketIds.length > 0 ? `ticket_id=in.(${ticketIds.join(',')})` : undefined
          },
          async (payload) => {
            console.log('New scan detected:', payload);
            const newScan = payload.new;
            
            try {
              const { data: fullScan, error } = await supabase
                .from('checkins')
                .select(`
                  *,
                  ticket:ticket_id (
                    id,
                    ticket_number,
                    ticket_type_id,
                    customer_phone,
                    profiles:customer_id (
                      name,
                      surname,
                      phone
                    )
                  ),
                  profiles:scanned_by (
                    id,
                    name,
                    surname
                  )
                `)
                .eq('id', newScan.id)
                .single();

              if (error) throw error;

              checkins = [fullScan, ...checkins];
              appendScan(fullScan);
              renderKPIs();
              renderAttendance();
              renderLiveStatus();
              renderQuickStats();
              renderTicketBreakdown();

              if (currentDrawerTicketId && currentDrawerTicketId === fullScan.ticket_id) {
                openCustomerDrawer(currentDrawerTicketId);
              }

            } catch (err) {
              console.error('Error processing new scan:', err);
            }
          }
        )
        .subscribe();

      subscriptions.push(checkinSub);

      const ticketSub = supabase
        .channel(`tickets-monitor-${eventId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'tickets',
            filter: `event_id=eq.${eventId}`
          },
          async (payload) => {
            console.log('Ticket updated:', payload);
            const updatedTicket = payload.new;
            
            const index = tickets.findIndex(t => t.id === updatedTicket.id);
            if (index !== -1) {
              tickets[index] = { ...tickets[index], ...updatedTicket };
            }

            const container = document.getElementById('searchResultsContainer');
            if (container.classList.contains('active')) {
              const searchInput = document.getElementById('searchInput');
              if (searchInput.value.trim().length >= 2) {
                searchTickets(searchInput.value.trim());
              }
            }

            if (currentDrawerTicketId && currentDrawerTicketId === updatedTicket.id) {
              openCustomerDrawer(currentDrawerTicketId);
            }

            renderKPIs();
            renderAttendance();
            renderTicketBreakdown();
            renderLiveStatus();
            renderQuickStats();
          }
        )
        .subscribe();

      subscriptions.push(ticketSub);

      const scannerDevicesSub = supabase
        .channel(`scanner-devices-${eventId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'scanner_devices', filter: `event_id=eq.${eventId}` },
          async () => {
            try {
              const { data, error } = await supabase
                .from('scanner_devices')
                .select('*')
                .eq('event_id', eventId);
              if (error) throw error;
              scannerDevices = data || [];
              renderLiveStatus();
            } catch (err) {
              console.error('Error refreshing scanner devices:', err);
            }
          }
        )
        .subscribe();

      subscriptions.push(scannerDevicesSub);

      // Live floor ops: these tables are venue-wide (not filtered by event_id),
      // so on any change we just refetch and re-render those three panels.
      let opsRefreshTimeout = null;
      const refreshLiveOps = () => {
        clearTimeout(opsRefreshTimeout);
        opsRefreshTimeout = setTimeout(async () => {
          try {
            await loadLiveOpsData();
            renderShisha();
            renderVvip();
            renderWallet();
          } catch (err) {
            console.error('Error refreshing live ops:', err);
          }
        }, 400);
      };

      ['shisha_sessions', 'hookah_devices', 'shisha_requests'].forEach(table => {
        const sub = supabase
          .channel(`ops-${table}-${eventId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table }, refreshLiveOps)
          .subscribe();
        subscriptions.push(sub);
      });

      const vvipSub = supabase
        .channel(`ops-vvip-${eventId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vvip_bookings' }, refreshLiveOps)
        .subscribe();
      subscriptions.push(vvipSub);

      const walletSub = supabase
        .channel(`ops-wallet-${eventId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions' }, refreshLiveOps)
        .subscribe();
      subscriptions.push(walletSub);
    }

    // ─── ACTIONS ───
    window.refreshData = async function() {
      if (window.isRefreshing) return;
      window.isRefreshing = true;
      await loadEventData();
      window.isRefreshing = false;
      showToast('Data refreshed', 'success');
    };

    window.exportData = function() {
      if (!eventData) {
        showToast('No event data to export', 'error');
        return;
      }

      const data = {
        event: eventData,
        ticketTypes: ticketTypes,
        tickets: tickets,
        checkins: checkins,
        exportedAt: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `event-${eventData.name || 'export'}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Data exported successfully', 'success');
    };

    window.closeEvent = function() {
      // "Close Event" navigates back to the Event Manager dashboard — it does
      // not change the event's status in the database. Use the ⋮ actions in
      // Event Manager if you actually want to mark the event as completed.
      window.location.href = 'event-admin.html';
    };

    // ─── INIT ───
    async function init() {
      eventId = getUrlParam('event_id');

      if (!eventId) {
        showEmptyState();
        const header = document.querySelector('.monitor-header');
        if (header) header.style.display = 'none';
        return;
      }

      await loadEventData();
      setupSearch();

      if (refreshInterval) clearInterval(refreshInterval);
      refreshInterval = setInterval(() => {
        if (!document.hidden) {
          loadEventData();
        }
      }, 30000);
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && eventId) {
        loadEventData();
      }
    });

    init();
