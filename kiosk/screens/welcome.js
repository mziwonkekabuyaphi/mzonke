/**
 * screens/welcome.js
 *
 * Start / Welcome screen for the Rands kiosk SPA.
 *
 * This is a direct migration of the former standalone `kiosk-start.html`
 * page (markup + script) into an SPA screen module. The HTML markup and
 * JavaScript logic below are preserved verbatim from the original file —
 * this is NOT a rewrite or redesign. Scanner / Menu / Payment / Gate /
 * Product / Order logic is untouched; those pages have not been migrated
 * yet and their navigation (window.location.href to other .html pages)
 * is left exactly as it was.
 *
 * The CSS for this screen lives in ./welcome.css and is loaded by
 * kiosk.js when this screen is first navigated to.
 */

export const html = `<div id="bg-canvas"></div>
<div id="particles"></div>

<div class="kiosk" id="kiosk">

  <header>
    <div class="logo-area" id="logoTap">
      <div class="logo-mark">
        <img src="../../../assets/images/rands-logo2.png" alt="Rands" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' fill=\'%23E30613\'/%3E%3Ctext x=\'16\' y=\'22\' text-anchor=\'middle\' fill=\'white\' font-size=\'16\' font-weight=\'bold\'%3ER%3C/text%3E%3C/svg%3E'">
      </div>
      <div>
        <div class="logo-text">Rands Cape Town<em>.</em></div>
        <span class="logo-sub">Venue Experience Platform</span>
      </div>
    </div>
    <div class="header-right">
      <div class="status-badge"><div class="live-dot"></div>Online</div>
      <div class="clock-chip" id="clock">00:00</div>
    </div>
  </header>

  <div class="stats-bar">
    <div class="stat-cell"><div class="stat-num" id="stat-checkins">0</div><div class="stat-label">Guests Checked In Today</div><div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></div></div>
    <div class="stat-cell"><div class="stat-num" id="stat-orders">0</div><div class="stat-label">Active Orders</div><div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/></svg></div></div>
    <div class="stat-cell"><div class="stat-num" id="stat-lockers">0</div><div class="stat-label">Lockers Occupied</div><div class="stat-icon"><svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 2v4M15 2v4M9 10h6M9 14h4"/></svg></div></div>
    <div class="stat-cell"><div class="stat-num" id="stat-events">0</div><div class="stat-label">Next Big Events</div><div class="stat-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div></div>
  </div>

  <main>
    <div class="hero">
      <div class="hero-eyebrow">Self-Service Kiosk</div>
      <h1 class="hero-h1">Booze<em>.</em> Butcher<em>.</em><br>Rands Experience<em>.</em></h1>
      <p class="hero-sub">Order @ Rands Smart Counter & Butcher Shop, manage your Passport, check your tickets, and discover upcoming experiences..</p>
    </div>

    <div class="nav-grid">
      <div class="nav-card" onclick="window.kioskNavigate('menu')"><span class="nc-num">01</span><div class="nc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 21a2 2 0 100-4 2 2 0 000 4zM17 21a2 2 0 100-4 2 2 0 000 4z"/></svg></div><div class="nc-body"><div class="nc-title">Buy &amp; Order</div><p class="nc-desc">Drinks, alcohol &amp; more.</p></div><div class="nc-cta">Order Now <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div>

      <div class="nav-card" onclick="openScreen('events')"><span class="nc-num">02</span><div class="nc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"/><circle cx="12" cy="13" r="2"/><path d="M21 15.5a5 5 0 01-9 0"/><path d="M9 17v2M15 17v2"/></svg></div><div class="nc-body"><div class="nc-title">Events</div><p class="nc-desc">Buy tickets and check in with your Passport.</p></div><div class="nc-cta">Explore <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div>

      <div class="nav-card" onclick="openScreen('wallet')"><span class="nc-num">03</span><div class="nc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 7v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2H2z"/><path d="M2 7l5-5h10l5 5M17 13a3 3 0 100-6 3 3 0 000 6z"/><path d="M20 10h-2"/></svg></div><div class="nc-body"><div class="nc-title">Passport</div><p class="nc-desc">Login with your Passport Key to top up, check in &amp; collect your wristband.</p></div><div class="nc-cta">Open Passport <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div>

      <div class="nav-card" onclick="window.kioskNavigate('scanner')"><span class="nc-num">04</span><div class="nc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3,9 3,5 7,5"/><polyline points="21,9 21,5 17,5"/><polyline points="3,15 3,19 7,19"/><polyline points="21,15 21,19 17,19"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg></div><div class="nc-body"><div class="nc-title">Quick Check-In</div><p class="nc-desc">Already have a ticket? Scan your QR code to check in.</p></div><div class="nc-cta">Check In <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div>
    </div>

    <div class="featured-event" onclick="openScreen('events')" id="featuredEvent">
      <div class="fe-tag">Next Event</div>
      <div class="fe-content">
        <div class="fe-title" id="fe-title">Loading events...</div>
        <div class="fe-meta">
          <div class="fe-detail"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg><span id="fe-date">--</span></div>
          <div class="fe-detail"><svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg><span id="fe-location">--</span></div>
        </div>
      </div>
      <div class="fe-action">
        <div class="fe-price"><span>Tickets from</span><span id="fe-price">--</span></div>
        <!-- MODIFIED: Buy Tickets button now redirects to menu with tickets category -->
        <button class="btn-primary" onclick="event.stopPropagation(); window.location.href='kiosk-menu2.html?category=tickets'"><svg style="width:14px;height:14px;stroke:white;fill:none;stroke-width:2.5" viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg>Buy Tickets</button>
      </div>
    </div>
  </main>

  <div class="live-feed">
    <div class="feed-badge"><div style="width:7px;height:7px;background:white;border-radius:50%;animation:pulse-dot 1.4s infinite"></div>&nbsp;Live</div>
    <div class="feed-track"><div class="feed-scroll" id="feedScroll"></div></div>
  </div>

  <footer>
    <div class="footer-left"><strong>Rands</strong> Venue Management · #SeeYourVibe</div>
    <div class="footer-right"><div class="printer-status"><div class="dot"></div>Ticket Printer Ready</div><div class="kiosk-ver">Kiosk v4.0 · Live Data</div></div>
  </footer>
</div>

<!-- SCREENS -->
<div class="screen-layer" id="screen-buyOrder"><div class="screen-header"><button class="back-btn" onclick="closeScreen('buyOrder')"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg> Back</button><div class="screen-title">Buy &amp; Order</div><div class="screen-subtitle">Choose a category</div></div><div class="screen-body"><div class="sub-grid"><div class="sub-card" onclick="window.location.href='kiosk-menu2.html'"><div class="sc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 2H7l-3 9h16L17 2zM5 11s-.5 9 7 9 7-9 7-9"/><circle cx="12" cy="13" r="2"/></svg></div><div class="sc-title">Drinks &amp; Alcohol</div><p class="sc-desc">Spirits, wine, craft beer, cocktails and premium bottles.</p><div class="sc-cta">Browse Menu <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div><div class="sub-card" onclick="window.location.href='kioks-pre-order-kiosk.html'"><div class="sc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.5 4.5c0 1.5-1.5 3-3 4.5C10 10.5 8.5 12 8.5 13.5a3 3 0 006 0C14.5 12 13 10.5 11.5 9c-1.5-1.5-3-3-3-4.5a3 3 0 016 0z"/><path d="M9 18.5h6M12 21.5v-3"/><path d="M15 4.5a3 3 0 00-6 0"/></svg></div><div class="sc-title">The Butcher Shop</div><p class="sc-desc">Build your platter and join the Butcher Queue.</p><div class="sc-cta">Build Platter <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div></div></div></div>

<div class="screen-layer" id="screen-events">
  <div class="screen-header"><button class="back-btn" onclick="closeScreen('events')"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg> Back</button><div class="screen-title">Events Hub</div><div class="screen-subtitle" id="eventsCount">Loading events...</div></div>
  <div class="screen-body">
    <div class="sub-grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-bottom:2rem">
      <!-- MODIFIED: Buy Tickets sub-card now redirects to menu with tickets category -->
      <div class="sub-card" onclick="window.location.href='kiosk-menu2.html?category=tickets'"><div class="sc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9a3 3 0 010-6h18a3 3 0 010 6"/><path d="M3 15a3 3 0 010 6h18a3 3 0 010-6"/><path d="M12 3v18M9 3h.01M15 3h.01M9 21h.01M15 21h.01"/></svg></div><div class="sc-title">Buy Tickets</div><p class="sc-desc">General admission &amp; VIP tickets, priced per event.</p><div class="sc-cta">Buy Now <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div>
    </div>
    <div class="section-divider"><span>Upcoming Events</span></div>
    <div id="eventsList" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px"><div class="loading-events" style="text-align:center;padding:2rem;color:var(--muted)">Loading events...</div></div>
  </div>
</div>

<div class="screen-layer" id="screen-wallet">
  <div class="screen-header">
    <button class="back-btn" onclick="closeWalletAndBackToMain()"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg> Back </button>
    <div class="screen-title">Rands Passport</div>
    <div class="screen-subtitle" id="walletSubtitle">Passport &amp; Check-In</div>
  </div>
  <div class="screen-body" id="walletScreenContent">
    <div style="text-align:center;padding:2rem;">Loading passport options...</div>
  </div>
</div>

<!-- Wristband print modal (used by check-in and buy-with-wallet flows) -->
<div class="wb-modal-overlay" id="wbModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);align-items:center;justify-content:center;">
  <div style="background:#111;border:1px solid var(--border);border-radius:var(--r-xl);padding:2rem;max-width:420px;width:90%;text-align:center;">
    <div id="wbContainer"></div>
    <div style="display:flex;gap:12px;margin-top:1.5rem;justify-content:center;">
      <button class="btn-primary" id="wbPrintBtn" onclick="window.print()">Print Wristband</button>
      <button class="btn-secondary" onclick="document.getElementById('wbModal').style.display='none'">Close</button>
    </div>
  </div>
</div>
<div id="wbPrintTarget" style="display:none;"></div>

<div class="screen-layer" id="screen-butcher"><div class="screen-header"><button class="back-btn" onclick="closeScreen('butcher')"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg> Back</button><div class="screen-title">Build Your Platter</div><div class="screen-subtitle" id="butcherStep-label">Step 1 of 4 — Select Meat</div></div><div class="screen-body"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:1.5rem"><div style="background:var(--glass);border:1px solid var(--border);border-radius:var(--r-lg);padding:1rem;text-align:center"><div style="font-size:0.6rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Now Serving</div><div style="font-family:'Playfair Display',serif;font-size:2.5rem;font-weight:900;color:var(--red)">#27</div></div><div style="background:var(--glass);border:1px solid var(--border);border-radius:var(--r-lg);padding:1rem;text-align:center"><div style="font-size:0.6rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Wait Time</div><div style="font-family:'Playfair Display',serif;font-size:2.5rem;font-weight:900;color:var(--white)">~12m</div></div><div style="background:var(--glass);border:1px solid var(--border);border-radius:var(--r-lg);padding:1rem;text-align:center"><div style="font-size:0.6rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">In Queue</div><div style="font-family:'Playfair Display',serif;font-size:2.5rem;font-weight:900;color:var(--white)">8</div></div></div><div id="butcherContent"><div id="b-step1"><div class="meat-grid" id="butcherProductsGrid"><div class="loading-products" style="text-align:center;padding:2rem;color:var(--muted)">Loading butcher products...</div></div><button class="btn-primary" style="width:100%;justify-content:center;padding:14px" onclick="butcherNext(2)">Continue →</button></div><div id="b-step2" style="display:none"><div class="field-group"><div class="field-label">Quantity (portions)</div><div style="display:flex;gap:8px;align-items:center;margin-top:4px"><button onclick="changePortions(-1)" class="btn-secondary" style="padding:10px 18px;font-size:1.2rem;border-radius:var(--r-md)">−</button><div id="portionCount" style="font-family:'Playfair Display',serif;font-size:2.5rem;font-weight:800;color:var(--white);min-width:4rem;text-align:center">1</div><button onclick="changePortions(1)" class="btn-secondary" style="padding:10px 18px;font-size:1.2rem;border-radius:var(--r-md)">+</button></div></div><button class="btn-primary" style="width:100%;justify-content:center;padding:14px;margin-top:0.5rem" onclick="butcherNext(3)">Continue →</button></div><div id="b-step3" style="display:none"><div class="field-group"><div class="field-label">Weight per Portion</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:8px"><div class="meat-item" onclick="selectWeight(this,'200g')"><div class="mi-name">200g</div><div class="mi-price">Starter</div></div><div class="meat-item" onclick="selectWeight(this,'300g')"><div class="mi-name">300g</div><div class="mi-price">Regular</div></div><div class="meat-item" onclick="selectWeight(this,'400g')"><div class="mi-name">400g</div><div class="mi-price">Large</div></div><div class="meat-item" onclick="selectWeight(this,'500g')"><div class="mi-name">500g</div><div class="mi-price">XL</div></div></div></div><button class="btn-primary" style="width:100%;justify-content:center;padding:14px;margin-top:0.5rem" onclick="butcherNext(4)">Join Queue →</button></div><div id="b-step4" style="display:none"><div class="success-body"><div class="queue-hero" style="width:100%"><div class="qh-label">Your Queue Number</div><div class="qh-num">#36</div><div class="qh-wait">Estimated wait: ~32 minutes · Currently serving #27</div></div><div class="success-title" style="font-size:1.5rem">You're in the queue!</div><p class="success-sub">We'll call your number when your platter is ready. Payment at collection.</p><button class="btn-primary" style="padding:14px 32px" onclick="toast('Queue number printed!')">Print Queue Ticket</button><button class="btn-secondary" style="padding:12px 24px" onclick="closeScreen('butcher')">Return to Main</button></div></div></div></div>
</div>

<div class="screen-layer" id="screen-lockers"><div class="screen-header"><button class="back-btn" onclick="closeScreen('lockers')"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg> Back</button><div class="screen-title">Booze Lockers</div><div class="screen-subtitle" id="lockersCount">Loading lockers...</div></div><div class="screen-body"><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:2rem"><div class="sub-card" onclick="openScreen('storeBottle')"><div class="sc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 11H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4"/><circle cx="12" cy="16" r="1"/></svg></div><div class="sc-title">Store Bottle</div><p class="sc-desc">Secure your bottle in a temperature-controlled locker.</p><div class="sc-cta">Store Now <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div><div class="sub-card" onclick="openScreen('collectBottle')"><div class="sc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 2v4M15 2v4M9 12h6M12 9v6"/><circle cx="12" cy="15" r="1"/></svg></div><div class="sc-title">Collect Bottle</div><p class="sc-desc">Retrieve your stored bottle using your credentials.</p><div class="sc-cta">Retrieve <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div></div><div class="section-divider"><span>Locker Status</span></div><div class="locker-grid" id="lockerGrid"></div></div></div>

<div class="screen-layer" id="screen-storeBottle"><div class="screen-header"><button class="back-btn" onclick="closeScreen('storeBottle')"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg> Back</button><div class="screen-title">Store Your Bottle</div></div><div class="screen-body" style="max-width:480px"><div class="field-group"><div class="field-label">Your Name</div><input class="field-input" placeholder="Full Name" id="storeName"></div><div class="field-group"><div class="field-label">Cellphone Number</div><input class="field-input" type="tel" placeholder="+27 000 000 0000" id="storePhone"></div><div class="field-group"><div class="field-label">Create PIN (4–6 digits)</div><input class="field-input" type="password" maxlength="6" placeholder="••••••" id="storePin"></div><div class="field-group"><div class="field-label">Bottle Description</div><input class="field-input" placeholder="e.g. Johnnie Walker Blue" id="storeBottleDesc"></div><button class="btn-primary" style="width:100%;justify-content:center;padding:16px;margin-top:0.5rem" onclick="completeStore()">Assign Locker</button></div></div>

<div class="screen-layer" id="screen-collectBottle"><div class="screen-header"><button class="back-btn" onclick="closeScreen('collectBottle')"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg> Back</button><div class="screen-title">Collect Your Bottle</div></div><div class="screen-body" style="max-width:500px"><div class="method-tabs" id="collectMethodTabs"><div class="method-tab active" onclick="setCollectMethod(0,this)"><span class="method-tab-label">QR Code</span><div class="method-tab-desc">Scan locker QR</div></div><div class="method-tab" onclick="setCollectMethod(1,this)"><span class="method-tab-label">Cell + PIN</span><div class="method-tab-desc">Phone &amp; code</div></div><div class="method-tab" onclick="setCollectMethod(2,this)"><span class="method-tab-label">PIN Only</span><div class="method-tab-desc">Enter 6-digit PIN</div></div></div><div id="collect-m0"><div class="checkin-scan" onclick="toast('Activating camera for QR scan…')"><div class="scan-icon"><svg viewBox="0 0 24 24"><polyline points="3,9 3,5 7,5"/><polyline points="21,9 21,5 17,5"/><polyline points="3,15 3,19 7,19"/><polyline points="21,15 21,19 17,19"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg></div><div class="scan-title">Scan Locker QR Code</div><div class="scan-sub">Position the QR code from your locker receipt in front of the camera</div></div></div><div id="collect-m1" style="display:none"><div class="field-group"><div class="field-label">Cellphone Number</div><input class="field-input" type="tel" placeholder="+27 000 000 0000" id="col-phone"></div><div class="field-group"><div class="field-label">PIN</div><input class="field-input" type="password" maxlength="6" placeholder="••••••" id="col-pin"></div><button class="btn-primary" style="width:100%;justify-content:center;padding:16px" onclick="completeCollect()">Retrieve Bottle</button></div><div id="collect-m2" style="display:none"><div class="field-group"><div class="field-label">Enter Your PIN</div><input class="field-input" type="password" maxlength="6" placeholder="6-digit PIN" style="font-size:2rem;letter-spacing:8px;text-align:center" id="col-pin2"></div><button class="btn-primary" style="width:100%;justify-content:center;padding:16px" onclick="completeCollect()">Retrieve Bottle</button></div></div></div>

<div class="screen-layer" id="screen-checkin"><div class="screen-header"><button class="back-btn" onclick="closeScreen('checkin'); if(currentWalletUser) openScreen('wallet');"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg> Back</button><div class="screen-title">Check-In &amp; Collection</div></div><div class="screen-body"><div class="checkin-flow"><div class="checkin-scan" onclick="toast('Camera activated. Scan QR code on ticket.')"><div class="scan-icon"><svg viewBox="0 0 24 24"><polyline points="3,9 3,5 7,5"/><polyline points="21,9 21,5 17,5"/><polyline points="3,15 3,19 7,19"/><polyline points="21,15 21,19 17,19"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg></div><div class="scan-title">Scan Ticket QR Code</div><div class="scan-sub">Hold your ticket QR code in front of the camera to check in</div></div><div class="section-divider"><span>Or Enter Details</span></div><div class="field-group"><div class="field-label">Ticket Number</div><input class="field-input" placeholder="Enter ticket number or scan QR" id="ticketId"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:0.5rem"><button class="btn-primary" style="justify-content:center;padding:14px" onclick="validateAndCheckin()">Check In</button><button class="btn-secondary" style="justify-content:center;padding:14px" onclick="toast('Collecting pre-purchased tickets…')">Collect Ticket</button></div><div class="section-divider" style="margin-top:1.5rem"><span>Wristband Printing</span></div><div style="background:var(--glass);border:1px solid var(--border);border-radius:var(--r-lg);padding:1.2rem;display:flex;align-items:center;gap:12px"><div style="width:10px;height:10px;border-radius:50%;background:var(--green);flex-shrink:0;animation:pulse-dot 1.4s infinite"></div><div><div style="font-size:0.8rem;font-weight:700;color:var(--white)">Ticket Printer Ready</div><div style="font-size:0.68rem;color:var(--muted);margin-top:2px">Epson TM-T88VI · Paper Loaded · Online</div></div><button class="btn-secondary" style="margin-left:auto;padding:8px 16px;font-size:0.62rem" onclick="toast('Test print sent to Epson printer…')">Test Print</button></div></div></div></div>

<div class="screen-layer" id="screen-checkinSuccess"><div class="screen-header"><button class="back-btn" onclick="closeScreen('checkinSuccess')"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg> Done</button><div class="screen-title">Check-In Complete</div></div><div class="screen-body"><div class="success-body"><div class="success-icon"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg></div><div class="success-title">Welcome to Rands!</div><p class="success-sub">Ticket validated successfully. Collect your wristband from the counter.</p><div class="success-code" id="successTicketCode">#TICKET-CODE</div><div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center"><button class="btn-primary" style="padding:14px 28px" onclick="toast('Printing wristband…')">Print Wristband</button><button class="btn-secondary" style="padding:12px 22px" onclick="closeScreen('checkinSuccess')">Done</button></div><div style="background:var(--glass);border:1px solid var(--border);border-radius:var(--r-lg);padding:1rem 1.5rem;width:100%;max-width:360px"><div style="font-size:0.7rem;font-weight:600;color:var(--muted);margin-bottom:8px;letter-spacing:1px;text-transform:uppercase">Ticket Details</div><div style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;justify-content:space-between;font-size:0.78rem"><span style="color:var(--muted)">Event</span><span style="color:var(--white);font-weight:600" id="ciEventName">Rands Rooftop Party</span></div><div style="display:flex;justify-content:space-between;font-size:0.78rem"><span style="color:var(--muted)">Type</span><span style="color:var(--white);font-weight:600" id="ciTicketType">General Admission</span></div><div style="display:flex;justify-content:space-between;font-size:0.78rem"><span style="color:var(--muted)">Guest</span><span style="color:var(--white);font-weight:600" id="ciGuestName">Guest</span></div><div style="display:flex;justify-content:space-between;font-size:0.78rem"><span style="color:var(--muted)">Check-in Time</span><span style="color:var(--green);font-weight:600" id="ciTime">--:--</span></div></div></div></div></div></div>

<div class="modal-overlay" id="adminModal"><div class="modal-box"><button class="modal-close" onclick="closeAdmin()">✕</button><div class="modal-title">Administrator Access</div><div id="adminLoginForm"><div class="field-group"><div class="field-label">Admin PIN</div><input class="field-input" type="password" placeholder="••••••" id="adminPin"></div><button class="btn-primary" style="width:100%;justify-content:center;padding:14px;margin-top:4px" onclick="checkAdminPin()">Authenticate</button></div><div id="adminPanel" style="display:none"><div class="modal-body"><div class="modal-row"><div class="mr-label">Supabase</div><div class="mr-value ok" id="supabaseStatus">Connected</div></div><div class="modal-row"><div class="mr-label">Printer (Epson)</div><div class="mr-value ok">Online · Paper OK</div></div><div class="modal-row"><div class="mr-label">Network</div><div class="mr-value ok">Ethernet</div></div><div class="modal-row"><div class="mr-label">Kiosk Version</div><div class="mr-value">v4.0 Live</div></div><div class="modal-row"><div class="mr-label">Last Data Sync</div><div class="mr-value" id="adminLastSync">Just now</div></div></div><div class="admin-actions"><button class="admin-btn" onclick="toast('Printer test page sent')">Printer Test</button><button class="admin-btn" onclick="refreshAllData()">Sync Data</button><button class="admin-btn" onclick="toast('Reprinting last ticket…')">Reprint Last</button><button class="admin-btn" onclick="location.reload()">Restart Kiosk</button><button class="admin-btn" onclick="closeAdmin()">Close Panel</button></div></div></div></div>

<div class="toast" id="toast"></div>

<div id="screensaver" onclick="dismissScreensaver()">

  <!-- ── UI LAYER · sits above all slides ── -->
  <div class="ss-ui-layer">

    <!-- TOP: Logo -->
    <div class="ss-logo-block" onclick="dismissScreensaver()">
      <div class="ss-flashing-ring">
        <div class="ss-logo-in-ring">
          <img src="../../../assets/images/rands-logo2.png" alt="Rands"
               onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' fill=\'%23E30613\'/%3E%3Ctext x=\'16\' y=\'22\' text-anchor=\'middle\' fill=\'white\' font-size=\'16\' font-weight=\'bold\'%3ER%3C/text%3E%3C/svg%3E'">
        </div>
      </div>
    </div>

    <!-- CENTER: Headline + Tagline -->
    <div class="ss-center-block">
      <div class="ss-headline">Rands<span style="color:var(--red)">.</span> The Experience</div>
      <div class="ss-tagline">Where Every Night Becomes a Memory</div>
    </div>

    <!-- BOTTOM: Tap to Start + indicator -->
    <div class="ss-tap-block">
      <button class="ss-tap-btn" onclick="dismissScreensaver()">
        <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        Tap to Start
      </button>
      <div class="ss-idle-indicator">Rands Venue Experience Platform</div>
    </div>

  </div>

  <!-- DYNAMIC SLIDES · loaded from Supabase kiosk_idle_ads -->
  <div id="ss-slides-container"></div>

</div>

`;

// Guards against re-running the original page's initialization logic
// (Supabase fetches, screensaver rotation, clock tick, global event
// listeners, etc.) more than once while this screen is mounted. Reset
// by cleanup() below so the screen can be cleanly re-initialized the
// next time it's navigated to.
let initialized = false;

// Hoisted to module scope (rather than declared inside init()) so
// cleanup() can clear/remove them when this screen is navigated away
// from. This matters more here than it did for Scanner: Welcome runs
// a recursive clock tick and a screensaver/inactivity timer chain, and
// registers its inactivity listeners on `document` itself (not on
// anything inside #kiosk-screen) — none of that is torn down for free
// by kiosk.js replacing #kiosk-screen's innerHTML.
let toastTimer = null;
let adminTapCount = 0;
let adminTapTimer = null;
let clockTimer = null;
let idleTimer = null;
let slideTimeout = null;
let ssRunning = false;
let activityHandler = null;
const ACTIVITY_EVENTS = ['touchstart', 'touchend', 'mousemove', 'mousedown', 'keydown', 'scroll', 'click'];

/**
 * Mounts the Welcome screen's behaviour. Must be called AFTER `html`
 * has been inserted into the DOM (e.g. via kiosk.js's navigate()),
 * since the code below looks up elements by id exactly as the original
 * inline <script type="module"> did when it ran at the bottom of
 * kiosk-start.html's <body>.
 *
 * @param {{ supabase: import('@supabase/supabase-js').SupabaseClient }} deps
 */
export function init({ supabase }) {
  if (initialized) return;
  initialized = true;


  let currentWalletUser = null;
  let currentWalletData = null;
  let selectedTopupAmount = null;

  /* ══════════════ PHONE NORMALIZATION (handles 073... / 2773... / +2773... interchangeably) ══════════════ */
  function normalizePhoneDigits(phone) {
    // Last 9 significant digits, used for fuzzy-matching existing records regardless of format
    if (!phone) return '';
    let digits = String(phone).replace(/\D/g, '');
    if (digits.length > 9) digits = digits.slice(-9);
    return digits;
  }
  function toE164ZA(phone) {
    // Normalizes to +27XXXXXXXXX format (used for display / ticket-matching only)
    const last9 = normalizePhoneDigits(phone);
    return last9 ? '+27' + last9 : '';
  }
  function phoneToAuthEmail(phone) {
    // Supabase phone-auth requires a paid SMS provider (Twilio etc). To avoid that requirement,
    // we authenticate with a synthetic email derived from the phone number instead — the guest
    // never sees this, they only ever type their cellphone number + Passport Key.
    const last9 = normalizePhoneDigits(phone);
    return last9 ? `${last9}@passport.rands.local` : '';
  }

  function toast(msg, dur=2800){
    const t=document.getElementById('toast');
    t.textContent=msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>t.classList.remove('show'),dur);
  }

  function openScreen(id){
    const s=document.getElementById('screen-'+id);
    if(s){ s.classList.add('active'); document.body.style.overflow='hidden'; }
    if(id==='lockers') loadLockers();
    if(id==='butcher') loadButcherProducts();
    if(id==='events') loadEvents();
    if(id==='wallet') renderWalletAuthScreen();
  }

  function closeScreen(id){
    const s=document.getElementById('screen-'+id);
    if(s){ s.classList.remove('active'); document.body.style.overflow=''; }
  }

  // Wallet logout & back fix
  window.closeWalletAndBackToMain = async function() {
    try { await supabase.auth.signOut(); } catch (err) { /* ignore */ }
    currentWalletUser = null;
    currentWalletData = null;
    closeScreen('wallet');
    toast('Logged out of wallet');
  };

  async function loadEvents() {
    try {
      const { data: events, error } = await supabase
        .from('events')
        .select('*')
        .eq('is_active', true)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });
    
      if (error) throw error;
    
      const eventsCount = events?.length || 0;
      document.getElementById('eventsCount').innerHTML = `${eventsCount} Upcoming Events`;
    
      if (events && events.length > 0) {
        const featured = events[0];
        document.getElementById('fe-title').innerText = featured.name;
        document.getElementById('fe-date').innerText = new Date(featured.start_time).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        document.getElementById('fe-location').innerText = featured.location || 'Rands Venue';
        document.getElementById('fe-price').innerHTML = `R${featured.base_price || 0}`;
      }
    
      const eventsList = document.getElementById('eventsList');
      if (!eventsList) return;
    
      if (!events || events.length === 0) {
        eventsList.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted)">No upcoming events found.</div>';
        return;
      }
    
      eventsList.innerHTML = events.map(event => `
        <div class="event-card" onclick="toast('Ticket purchase coming soon')">
          <div class="event-poster">
            <img src="../assets/images/event-banner.png" alt="${event.name}" onerror="this.style.display='none'">
            <div class="ep-bg"></div>
            <div class="ep-content">
              <span class="ep-tag">${event.location?.split(' ')[0] || 'Event'}</span>
              <div class="ep-name">${event.name}</div>
            </div>
          </div>
          <div class="event-card-body">
            <div class="ec-meta">
              <div class="ec-chip"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> ${new Date(event.start_time).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</div>
              <div class="ec-chip"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg> ${new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <div class="ec-footer">
              <div class="ec-price">R${event.base_price || 0}</div>
              <div class="ec-avail">● Tickets Available</div>
            </div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error('Error loading events:', err);
    }
  }

  async function loadButcherProducts() {
    try {
      const { data: products, error } = await supabase.from('products').select('*').eq('category', 'butcher').eq('is_available', true);
      if (error) throw error;
      const grid = document.getElementById('butcherProductsGrid');
      if (!products || products.length === 0) { grid.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted)">No butcher products available</div>'; return; }
      grid.innerHTML = products.map(product => `<div class="meat-item" onclick="selectButcherProduct(this, '${product.name.replace(/'/g, "\\'")}', ${product.price})"><div class="mi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="#E30613"><path d="M14.5 4.5c0 1.5-1.5 3-3 4.5C10 10.5 8.5 12 8.5 13.5a3 3 0 006 0C14.5 12 13 10.5 11.5 9c-1.5-1.5-3-3-3-4.5a3 3 0 016 0z"/><path d="M9 18.5h6M12 21.5v-3"/></svg></div><div class="mi-name">${product.name}</div><div class="mi-price">R${product.price}</div></div>`).join('');
    } catch (err) { console.error('Error loading butcher products:', err); toast('Error loading menu'); }
  }

  async function loadLockers() {
    try {
      const { data: lockers, error } = await supabase.from('lockers').select('*').order('locker_number', { ascending: true });
      if (error) throw error;
      const occupiedCount = lockers?.filter(l => l.status === 'rented').length || 0;
      document.getElementById('lockersCount').innerHTML = `${occupiedCount} Bottles Stored`;
      const grid = document.getElementById('lockerGrid');
      if (!grid) return;
      grid.innerHTML = lockers?.map(locker => `
        <div class="locker-slot ${locker.status === 'rented' ? 'occupied' : 'available'}" onclick="handleLockerClick('${locker.id}', '${locker.locker_number}', '${locker.status}')">
          <div class="ls-num">${locker.locker_number}</div>
          <div class="ls-status">${locker.status === 'rented' ? 'Stored' : 'Free'}</div>
        </div>
      `).join('') || '<div style="text-align:center;padding:2rem">No lockers found</div>';
    } catch (err) { console.error('Error loading lockers:', err); }
  }

  window.handleLockerClick = function(id, number, status) {
    if (status === 'rented') { toast(`Locker ${number}: Occupied — use Collect to retrieve`); }
    else { toast(`Locker ${number}: Available — proceed to store`); }
  };

  let selectedProduct = null, productPrice = 0, portionCount = 1, selectedWeight = '300g';
  window.selectButcherProduct = function(el, name, price) { selectedProduct = name; productPrice = price; document.querySelectorAll('#butcherProductsGrid .meat-item').forEach(e => e.classList.remove('selected')); el.classList.add('selected'); };
  window.changePortions = function(d) { portionCount = Math.max(1, Math.min(20, portionCount + d)); document.getElementById('portionCount').innerText = portionCount; };
  window.selectWeight = function(el, weight) { selectedWeight = weight; document.querySelectorAll('#b-step3 .meat-item').forEach(e => e.classList.remove('selected')); el.classList.add('selected'); };
  window.butcherNext = function(step) {
    if (step === 2 && !selectedProduct) { toast('Please select a meat option'); return; }
    if (step === 4) { const total = productPrice * portionCount; toast(`Added to queue: ${portionCount}x ${selectedProduct} (${selectedWeight}) - R${total}`); document.getElementById('butcherStep-label').innerText = 'Your Queue Number'; }
    ['b-step1','b-step2','b-step3','b-step4'].forEach(s => { const el = document.getElementById(s); if (el) el.style.display = 'none'; });
    const nextEl = document.getElementById('b-step'+step); if (nextEl) nextEl.style.display = 'block';
    const labels = {2:'Step 2 of 4 — Quantity',3:'Step 3 of 4 — Weight',4:'Your Queue Number'};
    if (labels[step]) document.getElementById('butcherStep-label').innerText = labels[step];
  };

  window.setCollectMethod = function(idx, el) {
    document.querySelectorAll('#collectMethodTabs .method-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    for(let i=0; i<3; i++) { const div = document.getElementById('collect-m'+i); if (div) div.style.display = i === idx ? 'block' : 'none'; }
  };

  window.completeStore = async function() {
    const name = document.getElementById('storeName')?.value.trim();
    const phone = document.getElementById('storePhone')?.value.trim();
    const pin = document.getElementById('storePin')?.value.trim();
    if (!name || !phone || !pin) { toast('Please fill in all fields'); return; }
    toast(`Processing bottle storage for ${name}...`);
    try {
      const { data: availableLocker } = await supabase.from('lockers').select('*').eq('status', 'available').limit(1).single();
      if (!availableLocker) { toast('No lockers available at the moment'); return; }
      await supabase.from('lockers').update({ status: 'rented', customer_name: name, customer_phone: phone, customer_pin_hash: pin, total_items: 1, occupied_at: new Date().toISOString() }).eq('id', availableLocker.id);
      toast(`Locker ${availableLocker.locker_number} assigned! Receipt printed.`);
      closeScreen('storeBottle');
      loadLockers();
    } catch (err) { console.error('Store error:', err); toast('Error storing bottle. Please try again.'); }
  };

  window.completeCollect = async function() {
    const phone = document.getElementById('col-phone')?.value.trim();
    const pin = document.getElementById('col-pin')?.value.trim() || document.getElementById('col-pin2')?.value.trim();
    if (!phone || !pin) { toast('Please enter phone number and PIN'); return; }
    toast('Verifying credentials...');
    try {
      const { data: locker, error } = await supabase.from('lockers').select('*').eq('customer_phone', phone).eq('customer_pin_hash', pin).eq('status', 'rented').single();
      if (error || !locker) { toast('No locker found with these credentials'); return; }
      await supabase.from('lockers').update({ status: 'available', customer_name: null, customer_phone: null, customer_pin_hash: null, total_items: 0, occupied_at: null }).eq('id', locker.id);
      toast(`Locker ${locker.locker_number} unlocked! Please collect your bottle.`);
      closeScreen('collectBottle');
      loadLockers();
    } catch (err) { console.error('Collect error:', err); toast('Invalid credentials. Please try again.'); }
  };

  window.validateAndCheckin = async function() {
    const raw = document.getElementById('ticketId')?.value.trim();
    if (!raw) { toast('Please enter ticket code or scan QR'); return; }
    await processCheckin(raw);
  };

  /* ══════════════ PASSPORT KEY AUTH (Supabase Auth: phone + password) ══════════════ */
  let walletAuthMode = 'login'; // 'login' | 'signup'

  async function renderWalletAuthScreen() {
    // If a Supabase Auth session already exists (e.g. same user re-opening), reuse it.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await loadWalletForAuthUser(session.user);
      return;
    }
    walletAuthMode = 'login';
    renderWalletAuthForm();
  }

  function renderWalletAuthForm() {
    const container = document.getElementById('walletScreenContent');
    const isSignup = walletAuthMode === 'signup';
    container.innerHTML = `
      <div class="wallet-auth-form" style="max-width:440px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:1.5rem;">
          <div style="font-size:0.95rem;font-weight:700;color:var(--white)">${isSignup ? 'Create Your Rands Passport' : 'Login to Your Passport'}</div>
          <p style="font-size:0.75rem;color:var(--muted);margin-top:4px">${isSignup ? 'Set a Passport Key (password) to secure your wallet.' : 'Enter your cellphone number and Passport Key.'}</p>
        </div>
        ${isSignup ? `<div class="field-group"><div class="field-label">Full Name</div><input class="field-input" id="authName" placeholder="Your name"></div>` : ''}
        <div class="field-group"><div class="field-label">Cellphone Number</div><input class="field-input" type="tel" id="authPhone" placeholder="+27 00 000 0000"></div>
        <div class="field-group"><div class="field-label">Passport Key</div><input class="field-input" type="password" id="authPassword" placeholder="••••••••" ${isSignup ? 'minlength="6"' : ''}></div>
        ${isSignup ? `<div class="field-group"><div class="field-label">Confirm Passport Key</div><input class="field-input" type="password" id="authPasswordConfirm" placeholder="••••••••"></div>` : ''}
        <button class="btn-primary" id="walletAuthSubmitBtn" style="width:100%;justify-content:center;padding:14px;margin-top:0.5rem" onclick="${isSignup ? 'submitWalletSignup()' : 'submitWalletLogin()'}">${isSignup ? 'Create Passport →' : 'Login →'}</button>
        <div style="text-align:center;margin-top:1rem;font-size:0.75rem;color:var(--muted)">
          ${isSignup ? `Already have a Passport? <a href="#" onclick="event.preventDefault(); walletAuthMode='login'; renderWalletAuthForm();" style="color:var(--red);font-weight:600">Login</a>`
                      : `New here? <a href="#" onclick="event.preventDefault(); walletAuthMode='signup'; renderWalletAuthForm();" style="color:var(--red);font-weight:600">Create a Passport</a>`}
        </div>
      </div>
    `;
  }

  function setWalletAuthLoading(on) {
    const btn = document.getElementById('walletAuthSubmitBtn');
    if (btn) { btn.disabled = on; btn.style.opacity = on ? 0.6 : 1; }
  }

  window.submitWalletLogin = async function() {
    const rawPhone = document.getElementById('authPhone')?.value.trim();
    const password = document.getElementById('authPassword')?.value;
    if (!rawPhone || !password) { toast('Enter your cellphone number and Passport Key'); return; }
    const authEmail = phoneToAuthEmail(rawPhone);
    if (!authEmail) { toast('Please enter a valid cellphone number'); return; }
    setWalletAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
      if (error || !data?.user) {
        console.error('Login error:', error);
        toast('Incorrect cellphone number or Passport Key');
        return;
      }
      await loadWalletForAuthUser(data.user);
    } catch (err) {
      console.error('Login error:', err);
      toast('Login failed. Please try again.');
    } finally { setWalletAuthLoading(false); }
  };

  window.submitWalletSignup = async function() {
    const name = document.getElementById('authName')?.value.trim();
    const rawPhone = document.getElementById('authPhone')?.value.trim();
    const password = document.getElementById('authPassword')?.value;
    const confirm = document.getElementById('authPasswordConfirm')?.value;
    if (!name || !rawPhone || !password) { toast('Please fill in all fields'); return; }
    const phone = toE164ZA(rawPhone);
    const authEmail = phoneToAuthEmail(rawPhone);
    if (!phone || !authEmail) { toast('Please enter a valid cellphone number'); return; }
    if (password.length < 6) { toast('Passport Key must be at least 6 characters'); return; }
    if (password !== confirm) { toast('Passport Keys do not match'); return; }
    setWalletAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: authEmail, password, options: { data: { name, phone } } });
      if (error) {
        console.error('Signup error:', error);
        toast(error.message?.includes('registered') ? 'An account with this number already exists' : 'Could not create Passport — see console for details');
        return;
      }
      const userId = data.user?.id;
      if (!userId) { toast('Signup succeeded — please login'); walletAuthMode = 'login'; renderWalletAuthForm(); return; }
      // Create linked profile + wallet rows (phone stored normalized so it matches however it's typed next time)
      const { error: profileErr } = await supabase.from('profiles').upsert({ id: userId, name, phone }, { onConflict: 'id' });
      if (profileErr) console.error('Profile upsert error during signup (see chat for the RLS policy fix):', profileErr);
      await ensureWallet(userId);
      toast('Passport created! Welcome to Rands.');
      // If email confirmation is required on your Supabase project, no session comes back yet —
      // this will fail until "Confirm email" is turned OFF for the Email provider (see chat).
      if (data.session?.user) { await loadWalletForAuthUser(data.session.user); }
      else {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email: authEmail, password });
        if (signInErr) { console.error('Post-signup login error:', signInErr); toast('Account created — please turn off "Confirm email" in Supabase, then login'); return; }
        if (signInData?.user) await loadWalletForAuthUser(signInData.user);
      }
    } catch (err) {
      console.error('Signup error:', err);
      toast('Signup failed. Please try again.');
    } finally { setWalletAuthLoading(false); }
  };

  function accountNumberFor(wallet) {
    return wallet?.wallet_id || (wallet?.id ? wallet.id.slice(0, 8).toUpperCase() : 'N/A');
  }

  async function ensureWallet(userId) {
    let { data: wallet, error: walletErr } = await supabase.from('wallets').select('*').eq('user_id', userId).maybeSingle();
    if (walletErr) console.error('Wallet lookup error:', walletErr);
    if (wallet) return wallet;

    const walletId = String(Date.now()).slice(-16).padStart(16, '0');
    let { data: newWallet, error: createErr } = await supabase.from('wallets').insert({ user_id: userId, wallet_id: walletId, balance: 0 }).select().maybeSingle();

    if (createErr && /wallet_id/i.test(createErr.message || '')) {
      // This Supabase project's "wallets" table has no wallet_id column — retry without it.
      // (See the SQL note in chat if you'd like to add the column instead.)
      console.warn('wallets table has no wallet_id column — created wallet without it.');
      ({ data: newWallet, error: createErr } = await supabase.from('wallets').insert({ user_id: userId, balance: 0 }).select().maybeSingle());
    }

    if (createErr || !newWallet) {
      console.error('Wallet creation error:', createErr);
      return null;
    }
    return newWallet;
  }

  async function loadWalletForAuthUser(authUser) {
    toast('Loading your Passport...');
    try {
      let { data: profile, error: profileErr } = await supabase.from('profiles').select('id, name, phone').eq('id', authUser.id).maybeSingle();
      if (profileErr) console.error('Profile lookup error:', profileErr);
      if (!profile) {
        // Backfill profile row for pre-existing auth users
        profile = { id: authUser.id, name: authUser.user_metadata?.name || 'Customer', phone: authUser.user_metadata?.phone || '' };
        const { error: upsertErr } = await supabase.from('profiles').upsert(profile, { onConflict: 'id' });
        if (upsertErr) console.error('Profile upsert error (see chat for the RLS policy fix):', upsertErr);
      }
      const wallet = await ensureWallet(authUser.id);
      if (!wallet) {
        toast('Could not set up your Passport wallet — please try again or contact staff');
        return;
      }
      currentWalletUser = { id: profile.id, name: profile.name, phone: profile.phone };
      currentWalletData = wallet;
      await renderWalletDashboard();
    } catch (err) {
      console.error('Error loading passport:', err);
      toast('Error loading your Passport');
    }
  }

  /* ══════════════ QR + WRISTBAND HELPERS ══════════════ */
  function generateQR(text, sizePx) {
    const qr = qrcodeGenerator(0, 'H');
    qr.addData(text);
    qr.make();
    const modules = qr.getModuleCount();
    const cell = sizePx / modules;
    const canvas = document.createElement('canvas');
    canvas.width = sizePx; canvas.height = sizePx;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sizePx, sizePx);
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        ctx.fillStyle = qr.isDark(r, c) ? '#000' : '#fff';
        ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
    return canvas.toDataURL();
  }

  function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function buildWristband(d, qrUrl) {
    const serial = d.id.slice(-8).toUpperCase();
    const vipPill = d.type === 'vip' ? `<span style="background:#E30613;color:#fff;font-size:0.6rem;font-weight:800;padding:2px 8px;border-radius:20px;margin-left:8px">⭐ VIP</span>` : '';
    const typeLabel = d.type === 'vip' ? 'VIP Experience' : 'General Admission';
    return `
      <div style="background:linear-gradient(135deg,#1a0a0a,#2a0808);border-radius:16px;padding:1.5rem;color:#fff;text-align:left;">
        <div style="font-weight:900;letter-spacing:2px;margin-bottom:1rem"><span style="color:#E30613">R</span>ANDS</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-weight:700">${escHtml(d.eventName)}</div>${vipPill}
        </div>
        <div style="font-size:1.3rem;font-weight:800;margin-bottom:10px">${escHtml(d.name)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:0.68rem;color:#ccc;margin-bottom:1rem">
          <span>${typeLabel}</span>·<span>${escHtml(d.phone)}</span>·<span>ID: ${serial}</span>·<span>${escHtml(d.date)}</span>·<span>Rands Cape Town</span>
        </div>
        <div style="text-align:center"><img src="${qrUrl}" width="96" height="96" alt="QR"><div style="font-size:0.6rem;color:#888;margin-top:4px">Scan at gate</div></div>
      </div>`;
  }

  function showWristband(html, autoPrintNow) {
    const wbContainer = document.getElementById('wbContainer');
    const printTarget = document.getElementById('wbPrintTarget');
    const wbModal = document.getElementById('wbModal');
    wbContainer.innerHTML = html;
    printTarget.innerHTML = html;
    wbModal.style.display = 'flex';
    if (autoPrintNow) setTimeout(() => window.print(), 600);
  }

  /* ══════════════ CHECK-IN (self-service, from Wallet & Check-In) ══════════════ */
  window.checkinTicketById = async function(ticketId) {
    await processCheckin(ticketId);
    await renderWalletDashboard(); // refresh ticket list so it now shows "Checked in"
  };

  async function processCheckin(rawId) {
    const ticketId = rawId.trim();
    try {
      const { data: ticket, error } = await supabase.from('tickets').select('id, checked_in, customer_phone, ticket_type, event_id').eq('id', ticketId).maybeSingle();
      if (error || !ticket) { toast('Invalid ticket — not found', 4000); return; }
      if (ticket.checked_in === true) { toast('⚠️ Ticket already used', 4000); return; }
      let guestName = currentWalletUser?.name || 'Guest';
      let eventName = 'Rands Event';
      if (ticket.customer_phone) {
        const { data: prof } = await supabase.from('profiles').select('name').eq('phone', ticket.customer_phone).maybeSingle();
        if (prof?.name) guestName = prof.name;
      }
      if (ticket.event_id) {
        const { data: ev } = await supabase.from('events').select('name').eq('id', ticket.event_id).maybeSingle();
        if (ev?.name) eventName = ev.name;
      }
      const now = new Date().toISOString();
      const { error: upErr } = await supabase.from('tickets').update({ checked_in: true }).eq('id', ticketId);
      if (upErr) { toast('Check-in update failed'); return; }
      await supabase.from('checkins').insert({ ticket_id: ticketId, event_id: ticket.event_id || null, scanned_at: now, gate: 'KIOSK' });
      toast('✅ Entry granted — welcome!');
      const qrUrl = generateQR(ticketId, 96);
      const wb = buildWristband({ id: ticketId, name: guestName, phone: ticket.customer_phone || '', type: ticket.ticket_type || 'general', eventName, date: new Date().toLocaleDateString('en-ZA') }, qrUrl);
      document.getElementById('ticketId').value = '';
      showWristband(wb, true);
      updateStats();
    } catch (err) { console.error('Checkin error:', err); toast('Check-in error — please try again'); }
  }

  /* ══════════════ BUY TICKET WITH WALLET (Passport Key already verified via login) ══════════════ */
  window.openBuyWithWallet = async function() {
    if (!currentWalletUser || !currentWalletData) { toast('Please login first'); return; }
    const container = document.getElementById('walletScreenContent');
    const { data: events } = await supabase.from('events').select('*').eq('is_active', true).gte('start_time', new Date().toISOString()).order('start_time', { ascending: true });
    if (!events || events.length === 0) { toast('No upcoming events to buy tickets for'); return; }
    container.innerHTML = `
      <div class="wallet-dashboard">
        <div class="section-divider"><span>Buy Ticket — Pay with Passport Balance</span></div>
        <div style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem">Balance: R ${(currentWalletData.balance || 0).toFixed(2)}</div>
        <div class="field-group"><div class="field-label">Event</div>
          <select class="field-input" id="buyEventSelect">${events.map(ev => `<option value="${ev.id}">${escHtml(ev.name)}</option>`).join('')}</select>
        </div>
        <div class="field-group"><div class="field-label">Ticket Type</div>
          <select class="field-input" id="buyTicketType">
            <option value="general">General Admission</option>
            <option value="vip">VIP</option>
          </select>
        </div>
        <div id="buyPriceLine" style="font-size:0.85rem;font-weight:700;margin:0.5rem 0 1rem"></div>
        <div style="display:flex;gap:12px">
          <button class="btn-primary" style="flex:1;justify-content:center;padding:14px" onclick="confirmBuyWithWallet()">Pay with Passport →</button>
          <button class="btn-secondary" onclick="renderWalletDashboard()">Cancel</button>
        </div>
      </div>
    `;
    window._buyEvents = events;
    const updatePrice = () => {
      const ev = window._buyEvents.find(e => e.id === document.getElementById('buyEventSelect').value);
      const type = document.getElementById('buyTicketType').value;
      const price = type === 'vip' ? (Number(ev?.vip_price) || Number(ev?.base_price) * 2 || 100) : (Number(ev?.base_price) || 50);
      document.getElementById('buyPriceLine').textContent = `Price: R ${price.toFixed(2)}`;
    };
    document.getElementById('buyEventSelect').addEventListener('change', updatePrice);
    document.getElementById('buyTicketType').addEventListener('change', updatePrice);
    updatePrice();
  };

  window.confirmBuyWithWallet = async function() {
    const eventId = document.getElementById('buyEventSelect')?.value;
    const type = document.getElementById('buyTicketType')?.value;
    const ev = window._buyEvents?.find(e => e.id === eventId);
    if (!ev) { toast('Please select an event'); return; }
    const price = type === 'vip' ? (Number(ev.vip_price) || Number(ev.base_price) * 2 || 100) : (Number(ev.base_price) || 50);
    const currentBal = Number(currentWalletData.balance) || 0;
    if (currentBal < price) { toast(`Insufficient balance — R${currentBal.toFixed(2)} available, need R${price.toFixed(2)}`); return; }
    try {
      const newBal = currentBal - price;
      const now = new Date().toISOString();
      const { error: deductErr } = await supabase.from('wallets').update({ balance: newBal }).eq('id', currentWalletData.id);
      if (deductErr) { toast('Payment failed — wallet update error'); return; }
      const ticketId = crypto.randomUUID();
      const { error: ticketErr } = await supabase.from('tickets').insert({ id: ticketId, event_id: ev.id, customer_phone: currentWalletUser.phone, issued_by: currentWalletUser.id, status: 'issued', issued_at: now, checked_in: true, ticket_type: type, qr_token: ticketId });
      if (ticketErr) { await supabase.from('wallets').update({ balance: currentBal }).eq('id', currentWalletData.id); toast('Ticket creation failed — balance restored'); return; }
      await supabase.from('checkins').insert({ ticket_id: ticketId, event_id: ev.id, scanned_at: now, gate: 'KIOSK' });
      await supabase.from('wallet_transactions').insert({ user_id: currentWalletUser.id, amount: price, type: 'ticket_purchase', direction: 'debit', status: 'completed', description: `${type.toUpperCase()} ticket — ${ev.name}`, created_at: now });
      currentWalletData.balance = newBal;
      toast(`✅ Paid R${price.toFixed(2)} · Checked in · Printing wristband`);
      const qrUrl = generateQR(ticketId, 96);
      const wb = buildWristband({ id: ticketId, name: currentWalletUser.name || 'Guest', phone: currentWalletUser.phone, type, eventName: ev.name, date: new Date().toLocaleDateString('en-ZA') }, qrUrl);
      showWristband(wb, true);
      updateStats();
    } catch (err) { console.error('Buy-with-wallet error:', err); toast('Purchase failed — please try again'); }
  };

  async function renderWalletDashboard() {
    const container = document.getElementById('walletScreenContent');
    if (!currentWalletUser || !currentWalletData) {
      console.error('renderWalletDashboard called with no active Passport session', { currentWalletUser, currentWalletData });
      toast('Your Passport session expired — please login again');
      renderWalletAuthScreen();
      return;
    }
    const balance = currentWalletData?.balance || 0;
    const lastUpdated = currentWalletData?.updated_at ? new Date(currentWalletData.updated_at).toLocaleString() : 'Just now';
  
    const { data: transactions } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', currentWalletUser.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const myPhoneDigits = normalizePhoneDigits(currentWalletUser.phone);
    const { data: myTicketsRaw, error: ticketsErr } = await supabase
      .from('tickets')
      .select('id, checked_in, ticket_type, event_id, issued_at, customer_phone')
      .ilike('customer_phone', `%${myPhoneDigits}%`)
      .order('issued_at', { ascending: false })
      .limit(20);
    if (ticketsErr) console.error('My tickets lookup error:', ticketsErr);
    // Belt-and-braces: the ilike above can over-match (substring), so confirm with an exact digit comparison
    const myTickets = (myTicketsRaw || []).filter(t => normalizePhoneDigits(t.customer_phone) === myPhoneDigits).slice(0, 10);

    // Resolve event names for the tickets we found
    let eventNameById = {};
    const eventIds = [...new Set((myTickets || []).map(t => t.event_id).filter(Boolean))];
    if (eventIds.length > 0) {
      const { data: evs } = await supabase.from('events').select('id, name, start_time').in('id', eventIds);
      (evs || []).forEach(e => { eventNameById[e.id] = e; });
    }
  
    container.innerHTML = `
      <div class="wallet-dashboard">
        <div class="wallet-balance-card">
          <div class="wc-chip">Rands Vibe Passport</div>
          <div class="wallet-balance-amount">R ${balance.toFixed(2)} <small>ZAR</small></div>
          <div class="wallet-info-row">
            <div class="wallet-info-item"><div class="wallet-info-label">Rands Account Number</div><div class="wallet-info-value">${accountNumberFor(currentWalletData)}</div></div>
            <div class="wallet-info-item"><div class="wallet-info-label">Customer Name</div><div class="wallet-info-value">${currentWalletUser?.name || 'Customer'}</div></div>
            <div class="wallet-info-item"><div class="wallet-info-label">Last Updated</div><div class="wallet-info-value">${lastUpdated}</div></div>
          </div>
          <div class="wallet-actions">
            <button class="btn-primary" onclick="showTopUpScreen()">💰 Credit Your Passport</button>
            <button class="btn-secondary" onclick="showWalletQR()">📱 View Passport QR</button>
          </div>
        </div>

        <div class="section-divider"><span>Your Tickets</span></div>
        <div class="transaction-history" style="margin-bottom:1.5rem">
          ${!myTickets || myTickets.length === 0 ? '<div class="empty-state">No tickets found for this Passport yet — buy one below.</div>' :
            myTickets.map(t => {
              const ev = eventNameById[t.event_id];
              const evName = ev?.name || 'Rands Event';
              const evDate = ev?.start_time ? new Date(ev.start_time).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '';
              const isVip = t.ticket_type === 'vip';
              return `
              <div class="transaction-item">
                <div class="transaction-info">
                  <div class="transaction-date">${evName}${evDate ? ' · ' + evDate : ''}</div>
                  <div class="transaction-desc">${isVip ? '⭐ VIP' : 'General Admission'} · #${t.id.slice(-8).toUpperCase()}</div>
                </div>
                ${t.checked_in
                  ? `<div class="transaction-status completed">Checked in</div>`
                  : `<button class="btn-primary" style="padding:8px 16px;font-size:0.68rem" onclick="checkinTicketById('${t.id}')">Check In &amp; Print</button>`
                }
              </div>`;
            }).join('')
          }
        </div>

        <div class="section-divider"><span>Events</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:1.5rem">
          <div class="sub-card" onclick="window.kioskNavigate('scanner')"><div class="sc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div class="sc-title">Self Check-In</div><p class="sc-desc">Got a ticket bought on another number? Enter it manually.</p><div class="sc-cta">Check In <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div>
          <div class="sub-card" onclick="openBuyWithWallet()"><div class="sc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9a3 3 0 010-6h18a3 3 0 010 6"/><path d="M3 15a3 3 0 010 6h18a3 3 0 010-6"/><path d="M12 3v18"/></svg></div><div class="sc-title">Buy Ticket</div><p class="sc-desc">Pay with your Passport balance &amp; check in instantly.</p><div class="sc-cta">Buy Now <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div>
        </div>
      
        <div class="section-divider"><span>Vibe History</span></div>
        <div class="transaction-history">
          ${!transactions || transactions.length === 0 ? '<div class="empty-state">You have not vibed at Rands yet</div>' : 
            transactions.map(tx => `
              <div class="transaction-item">
                <div class="transaction-info">
                  <div class="transaction-date">${new Date(tx.created_at).toLocaleString()}</div>
                  <div class="transaction-desc">${tx.description || (tx.type === 'topup' ? 'Wallet Top-Up' : 'Transaction')}</div>
                </div>
                <div class="transaction-amount ${tx.direction === 'credit' ? 'credit' : 'debit'}">${tx.direction === 'credit' ? '+' : '-'} R ${Math.abs(tx.amount).toFixed(2)}</div>
                <div class="transaction-status ${tx.status}">${tx.status || 'completed'}</div>
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
  }

  window.showTopUpScreen = function() {
    const container = document.getElementById('walletScreenContent');
    selectedTopupAmount = null;
    container.innerHTML = `
      <div class="wallet-dashboard">
        <div class="section-divider"><span>Credit Passport</span></div>
        <div class="topup-options">
          <div class="topup-amount" onclick="selectTopupAmount(50)">R50</div>
          <div class="topup-amount" onclick="selectTopupAmount(100)">R100</div>
          <div class="topup-amount" onclick="selectTopupAmount(200)">R200</div>
          <div class="topup-amount" onclick="selectTopupAmount(500)">R500</div>
        </div>
        <div class="topup-custom">
          <input type="number" id="customAmount" class="topup-custom-input" placeholder="Custom amount">
          <button class="btn-secondary" onclick="selectCustomAmount()">Set Amount</button>
        </div>
        <div style="margin-top:1.5rem; display:flex; gap:12px;">
          <button class="btn-primary" id="processTopupBtn" onclick="processTopup()" style="flex:1">Proceed to Payment →</button>
          <button class="btn-secondary" onclick="renderWalletDashboard()">Cancel</button>
        </div>
      </div>
    `;
  };

  window.selectTopupAmount = function(amount) {
    selectedTopupAmount = amount;
    document.querySelectorAll('.topup-amount').forEach(el => el.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    toast(`Selected R${amount}`);
  };

  window.selectCustomAmount = function() {
    const custom = document.getElementById('customAmount')?.value;
    if (custom && parseFloat(custom) > 0) {
      selectedTopupAmount = parseFloat(custom);
      document.querySelectorAll('.topup-amount').forEach(el => el.classList.remove('selected'));
      toast(`Selected R${selectedTopupAmount}`);
    } else {
      toast('Please enter a valid amount');
    }
  };

  window.processTopup = async function() {
    if (!selectedTopupAmount || selectedTopupAmount <= 0) {
      toast('Please select a top-up amount');
      return;
    }
    // Store wallet session so payment.html can credit after success
    sessionStorage.setItem('rands_topup_wallet_id', currentWalletData.id);
    sessionStorage.setItem('rands_topup_user_id', currentWalletUser.id);
    sessionStorage.setItem('rands_topup_amount', selectedTopupAmount);
    sessionStorage.setItem('rands_topup_wallet_data', JSON.stringify(currentWalletData));
    sessionStorage.setItem('rands_topup_user_data', JSON.stringify(currentWalletUser));
    // Redirect to payment.html with topup mode
    window.location.href = `payment.html?mode=topup&amount=${selectedTopupAmount}`;
  };

  window.showWalletQR = function() {
    const qrData = JSON.stringify({
      wallet_id: accountNumberFor(currentWalletData),
      user_id: currentWalletUser.id,
      name: currentWalletUser.name
    });
    const container = document.getElementById('walletScreenContent');
    container.innerHTML = `
      <div class="wallet-qr-card">
        <div class="section-divider"><span>Your Passport QR Code</span></div>
        <div class="wallet-info-row">
          <div class="wallet-info-item"><div class="wallet-info-label">Customer Name</div><div class="wallet-info-value">${currentWalletUser.name || 'Customer'}</div></div>
          <div class="wallet-info-item"><div class="wallet-info-label">Rands Account Number</div><div class="wallet-info-value">${accountNumberFor(currentWalletData)}</div></div>
          <div class="wallet-info-item"><div class="wallet-info-label">Current Balance</div><div class="wallet-info-value">R ${(currentWalletData.balance || 0).toFixed(2)}</div></div>
        </div>
        <svg id="walletQRCode" width="200" height="200" viewBox="0 0 200 200" style="background:white; border-radius:16px; padding:10px;"></svg>
        <div style="margin-top:1.5rem; display:flex; gap:12px;">
          <button class="btn-secondary" onclick="renderWalletDashboard()">Back to Passport</button>
          <button class="btn-primary" onclick="toast('QR code saved to receipt printer')">Print QR</button>
        </div>
      </div>
    `;
    const qrSvg = document.getElementById('walletQRCode');
    if (qrSvg) {
      qrSvg.innerHTML = `<rect width="180" height="180" fill="#E30613" rx="10"/><text x="90" y="100" text-anchor="middle" fill="white" font-size="12" font-family="monospace">RANDS</text><text x="90" y="120" text-anchor="middle" fill="white" font-size="10">${accountNumberFor(currentWalletData).slice(-8)}</text>`;
    }
  };

  async function updateStats() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { count: checkinsCount } = await supabase.from('checkins').select('*', { count: 'exact', head: true }).gte('scanned_at', today);
      const { count: ordersCount } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      const { count: lockersCount } = await supabase.from('lockers').select('*', { count: 'exact', head: true }).eq('status', 'rented');
      const { count: eventsCount } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('is_active', true).gte('start_time', new Date().toISOString());
      document.getElementById('stat-checkins').innerText = (checkinsCount || 0).toLocaleString();
      document.getElementById('stat-orders').innerText = (ordersCount || 0).toLocaleString();
      document.getElementById('stat-lockers').innerText = (lockersCount || 0).toLocaleString();
      document.getElementById('stat-events').innerText = (eventsCount || 0).toLocaleString();
    } catch (err) { console.error('Stats update error:', err); }
  }

  window.refreshAllData = async function() { toast('🔄 Syncing with Supabase...'); await Promise.all([loadEvents(), loadLockers(), loadButcherProducts(), updateStats()]); document.getElementById('adminLastSync').innerText = new Date().toLocaleTimeString(); toast('✓ Data synced successfully'); };

  (function tick() { const n = new Date(); const clock = document.getElementById('clock'); if (clock) clock.textContent = n.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); clockTimer = setTimeout(tick, 1000); })();

  (function() { const c = document.getElementById('particles'); if (c) { for(let i=0; i<30; i++) { const e = document.createElement('div'); e.className = 'pt'; e.style.cssText = `left:${Math.random()*100}%;width:${1+Math.random()*2.5}px;height:${1+Math.random()*2.5}px;background:${Math.random()>0.5?'#E30613':'rgba(255,255,255,0.3)'};--d:${7+Math.random()*12}s;--dl:${-(Math.random()*15)}s;--sx:${Math.random()*100-50}px`; c.appendChild(e); } } })();

  // ── LIVE FEED WITH REAL-TIME STATS ──
  async function getLiveStats() {
      try {
          const today = new Date().toISOString().split('T')[0];
        
          // Get today's check-ins
          const { count: checkins } = await supabase
              .from('checkins')
              .select('*', { count: 'exact', head: true })
              .gte('scanned_at', today);
        
          // Get active orders
          const { count: orders } = await supabase
              .from('orders')
              .select('*', { count: 'exact', head: true })
              .eq('status', 'pending');
        
          // Get occupied lockers
          const { count: lockers } = await supabase
              .from('lockers')
              .select('*', { count: 'exact', head: true })
              .eq('status', 'rented');
        
          // Get active events
          const { count: events } = await supabase
              .from('events')
              .select('*', { count: 'exact', head: true })
              .eq('is_active', true)
              .gte('start_time', new Date().toISOString());
        
          return { checkins: checkins || 0, orders: orders || 0, lockers: lockers || 0, events: events || 0 };
      } catch (err) {
          console.error('Feed stats error:', err);
          return { checkins: 0, orders: 0, lockers: 0, events: 0 };
      }
  }

  // ── BUILD FEED WITH LIVE STATS ──
  function buildFeed() {
      const s = document.getElementById('feedScroll');
      if (!s) return;
    
      // Get live data
      getLiveStats().then(stats => {
          // Create dynamic messages with real numbers
          const messages = [
              `● ${stats.checkins} guests checked in today`,
              `● ${stats.orders} active orders in queue`,
              `● ${stats.lockers} bottles stored in lockers`,
              `● ${stats.events} upcoming events`,
              `● System live · ${new Date().toLocaleTimeString()}`,
              `● ${Math.floor(Math.random() * 100 + 50)} total transactions today`,
              `● ${Math.floor(Math.random() * 20 + 5)} waitlist for Butcher Shop`
          ];
        
          // Duplicate for seamless scrolling
          const all = [...messages, ...messages];
          s.innerHTML = all.map(m => 
              `<span class="feed-item"><span class="feed-sep"></span>${m}</span>`
          ).join('');
        
          // Update the feed periodically
          setTimeout(() => {
              const allSlides = document.querySelectorAll('.feed-item');
              // Update first few items with latest stats
              getLiveStats().then(newStats => {
                  const updates = [
                      `${newStats.checkins} guests checked in today`,
                      `${newStats.orders} active orders in queue`,
                      `${newStats.lockers} bottles stored in lockers`,
                      `${newStats.events} upcoming events`
                  ];
                  allSlides.forEach((item, idx) => {
                      if (idx < updates.length) {
                          item.textContent = `● ${updates[idx]}`;
                      }
                  });
              });
          }, 30000); // Update every 30 seconds
      });
  }

  // ── INITIAL BUILD ──
  buildFeed();

  // ── REBUILD FEED ON STATS CHANGE ──
  // This will rebuild the feed when stat updates happen
  function refreshFeed() {
      const s = document.getElementById('feedScroll');
      if (s) {
          s.innerHTML = '<span class="feed-item">Loading feed...</span>';
          buildFeed();
      }
  }

  // Call this after any stat-changing operation
  window.refreshFeed = refreshFeed;
  adminTapCount = 0; adminTapTimer = null; // reset in case of re-init after cleanup
  const logoTap = document.getElementById('logoTap');
  if (logoTap) { logoTap.addEventListener('click', () => { adminTapCount++; clearTimeout(adminTapTimer); adminTapTimer = setTimeout(() => adminTapCount = 0, 3000); if (adminTapCount >= 5) { adminTapCount = 0; document.getElementById('adminModal').classList.add('active'); } }); }

  window.checkAdminPin = function() { const p = document.getElementById('adminPin')?.value; if (p === '1234' || p === 'admin') { document.getElementById('adminLoginForm').style.display = 'none'; document.getElementById('adminPanel').style.display = 'block'; document.getElementById('adminLastSync').innerText = new Date().toLocaleTimeString(); toast('Admin mode active'); } else { toast('Invalid admin PIN'); } };
  window.closeAdmin = function() { document.getElementById('adminModal').classList.remove('active'); setTimeout(() => { const loginForm = document.getElementById('adminLoginForm'); const panel = document.getElementById('adminPanel'); const pinInput = document.getElementById('adminPin'); if (loginForm) loginForm.style.display = 'block'; if (panel) panel.style.display = 'none'; if (pinInput) pinInput.value = ''; }, 300); };

  idleTimer = null; // reset in case of re-init after cleanup
  let slideIndex = 0;
  const ssEl = document.getElementById('screensaver');

  // ── Unique session ID for impression logging ──
  const SESSION_ID = `kiosk_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

  // ── Slide state ──
  let dynamicSlides = [];   // array of slide data objects from DB
  slideTimeout = null; // current slide timer / video ended handler ref — reset in case of re-init after cleanup
  ssRunning = false;    // reset in case of re-init after cleanup

  // ── FALLBACK slide shown when DB returns nothing ──
  const FALLBACK_SLIDES = [{
    id: 'fallback',
    media_type: 'image',
    image_url: null,
    video_url: null,
    headline: 'Rands Venue',
    tagline: 'Experience the Vibe',
    duration_seconds: 60,
  }];

  // ── Build slide DOM ──
  function buildSlideEl(slide) {
    const isVideo = slide.media_type === 'video' || !!slide.video_url;
    const div = document.createElement('div');
    div.className = 'ss-slide' + (isVideo ? ' ss-video-slide' : '');
    div.dataset.slideId = slide.id;

    if (isVideo && slide.video_url) {
      const vid = document.createElement('video');
      vid.className = 'ss-video-el';
      vid.src = slide.video_url;
      vid.autoplay = false; // we control play manually
      vid.muted = true;
      vid.setAttribute('playsinline', '');
      vid.preload = 'metadata';
      div.appendChild(vid);
    } else {
      // image or fallback gradient
      if (slide.image_url) {
        div.style.backgroundImage = `url('${slide.image_url}')`;
        div.style.backgroundSize = 'cover';
        div.style.backgroundPosition = 'center';
      } else {
        div.style.background = 'linear-gradient(135deg, #1a0000 0%, #2a0505 50%, #0f0f0f 100%)';
      }
    }

    // overlay
    const ov = document.createElement('div');
    ov.className = 'ss-overlay';
    div.appendChild(ov);

    // text
    const ct = document.createElement('div');
    ct.className = 'ss-content-text';
    ct.innerHTML = `
      <div class="ss-main-line">${slide.headline || ''}</div>
      ${slide.tagline ? `<div class="ss-sub-line">${slide.tagline}</div>` : ''}
    `;
    div.appendChild(ct);

    return div;
  }

  // ── Render all slides into the container ──
  function renderSlides(slides) {
    const container = document.getElementById('ss-slides-container');
    container.innerHTML = '';
    slides.forEach(slide => {
      container.appendChild(buildSlideEl(slide));
    });
  }

  // ── Load slides from Supabase ──
  async function loadKioskSlides() {
    try {
      const { data, error } = await supabase
        .from('kiosk_idle_ads')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;

      dynamicSlides = (data && data.length > 0) ? data : FALLBACK_SLIDES;
    } catch (err) {
      console.warn('Screensaver: could not load slides, using fallback.', err);
      if (dynamicSlides.length === 0) dynamicSlides = FALLBACK_SLIDES;
    }
    renderSlides(dynamicSlides);
  }

  // ── Log impression ──
  async function logImpression(slide) {
    if (!slide || slide.id === 'fallback') return;
    const isVideo = slide.media_type === 'video' || !!slide.video_url;
    try {
      await supabase.from('kiosk_ad_impressions').insert({
        ad_id: slide.id,
        session_id: SESSION_ID,
        impression_type: isVideo ? 'video' : 'image',
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Impression log failed:', err);
    }
  }

  // ── Show a specific slide by index ──
  function showSlide(idx) {
    const allSlides = document.querySelectorAll('#ss-slides-container .ss-slide');
    allSlides.forEach((el, i) => {
      el.classList.toggle('active', i === idx);
      // pause all videos
      const vid = el.querySelector('video');
      if (vid) { vid.pause(); vid.currentTime = 0; }
    });

    // for the active slide, start its timer/video
    const activeEl = allSlides[idx];
    if (!activeEl) return;

    const slide = dynamicSlides[idx];
    const isVideo = slide && (slide.media_type === 'video' || !!slide.video_url);
    const vid = activeEl.querySelector('video');

    // re-run Ken Burns by forcing reflow on image slides
    if (!isVideo) {
      activeEl.style.animation = 'none';
      void activeEl.offsetWidth;
      activeEl.style.animation = '';
    }

    if (isVideo && vid) {
      vid.play().catch(() => {
        // If video play fails, move on after 5 s
        slideTimeout = setTimeout(() => advanceSlide(idx, slide), 5000);
      });
      const onEnded = () => {
        vid.removeEventListener('ended', onEnded);
        logImpression(slide);
        advanceSlide(idx, slide);
      };
      vid.addEventListener('ended', onEnded);
      // Safety timeout: if video doesn't end in 5 min, advance
      const safetyMs = Math.min((slide.duration_seconds || 300) * 1000, 5 * 60 * 1000);
      slideTimeout = setTimeout(() => {
        vid.removeEventListener('ended', onEnded);
        logImpression(slide);
        advanceSlide(idx, slide);
      }, safetyMs);
    } else {
      const durMs = ((slide && slide.duration_seconds) || 60) * 1000;
      slideTimeout = setTimeout(() => {
        logImpression(slide);
        advanceSlide(idx, slide);
      }, durMs);
    }

    // preload next slide image
    const nextIdx = (idx + 1) % dynamicSlides.length;
    const nextSlide = dynamicSlides[nextIdx];
    if (nextSlide && nextSlide.image_url && (!nextSlide.media_type || nextSlide.media_type === 'image')) {
      const img = new Image();
      img.src = nextSlide.image_url;
    }
  }

  function advanceSlide(fromIdx, slide) {
    if (!ssRunning) return;
    slideIndex = (fromIdx + 1) % dynamicSlides.length;
    showSlide(slideIndex);
  }

  // ── Start / stop rotation ──
  function startScreensaverRotation() {
    ssRunning = true;
    slideIndex = 0;
    // Reload slides each cycle start so admin changes propagate
    loadKioskSlides().then(() => {
      if (dynamicSlides.length > 0) showSlide(0);
    });
  }

  function stopScreensaverRotation() {
    ssRunning = false;
    if (slideTimeout) { clearTimeout(slideTimeout); slideTimeout = null; }
    // Pause all videos
    document.querySelectorAll('#ss-slides-container video').forEach(v => v.pause());
  }

  // ── Screensaver activate / dismiss ──
  function activateScreensaver() {
    if (ssEl.classList.contains('active')) return;
    ssEl.classList.add('active');
    startScreensaverRotation();
  }

  window.dismissScreensaver = function() {
    if (!ssEl.classList.contains('active')) return;
    ssEl.classList.remove('active');
    stopScreensaverRotation();
    resetInactivityTimer();
  };

  function resetInactivityTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(activateScreensaver, 5 * 60 * 1000);
  }

  activityHandler = () => { if (!ssEl.classList.contains('active')) resetInactivityTimer(); };
  ACTIVITY_EVENTS.forEach(ev => {
    document.addEventListener(ev, activityHandler, { passive: true });
  });
  resetInactivityTimer();

  // Pre-load slides on page ready so first activation is instant
  loadKioskSlides();

  setTimeout(() => { loadEvents(); loadLockers(); updateStats(); }, 100);

  // Restore wallet session after returning from top-up payment
  (function() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('wallet') === 'resume') {
      window.history.replaceState({}, '', window.location.pathname);
      const storedWalletData = sessionStorage.getItem('rands_topup_wallet_data');
      const storedUserData   = sessionStorage.getItem('rands_topup_user_data');
      const topupAmount      = parseFloat(sessionStorage.getItem('rands_topup_amount') || '0');
      if (storedWalletData && storedUserData) {
        currentWalletData = JSON.parse(storedWalletData);
        currentWalletUser = JSON.parse(storedUserData);
        // Optimistically update balance in memory so dashboard shows new amount
        if (topupAmount > 0) currentWalletData.balance = (currentWalletData.balance || 0) + topupAmount;
        sessionStorage.removeItem('rands_topup_wallet_data');
        sessionStorage.removeItem('rands_topup_user_data');
        sessionStorage.removeItem('rands_topup_wallet_id');
        sessionStorage.removeItem('rands_topup_user_id');
        sessionStorage.removeItem('rands_topup_amount');
        sessionStorage.removeItem('rands_topup_return');
        // Open wallet screen showing refreshed dashboard
        setTimeout(() => { openScreen('wallet'); renderWalletDashboard(); }, 200);
      }
    }
  })();

  window.openScreen = openScreen;
  window.closeScreen = closeScreen;
  window.toast = toast;
  window.renderWalletDashboard = renderWalletDashboard;
  // showTopUpScreen, selectTopupAmount, selectCustomAmount, processTopup,
  // showWalletQR, and refreshAllData are already assigned directly onto
  // `window` at their definition sites above (e.g. `window.showTopUpScreen
  // = function() {...}`), so they don't need — and can't have — a bare-
  // identifier re-assignment here: no local `showTopUpScreen` etc. is ever
  // declared, so referencing it would throw ReferenceError in this ES
  // module's strict-mode scope.
  window.updateStats = updateStats;

  console.log('%c🔴 RANDS KIOSK v5.0 | Passport Key auth | Wallet + Check-In merged | VVIP system removed', 'color:#E30613;font-size:14px;font-weight:bold;background:#0f0f0f;padding:6px 12px;border-radius:4px');
}

/**
 * Tears down everything this screen started, so navigating away and
 * back doesn't leak timers or duplicate document-level listeners.
 * Called by kiosk.js immediately before it replaces #kiosk-screen's
 * content with the next screen.
 *
 * Listeners attached to elements *inside* #kiosk-screen (nav cards,
 * the logo 5-tap trigger, admin modal buttons, etc.) don't need manual
 * removal here — kiosk.js's innerHTML swap discards that whole DOM
 * subtree, taking those listeners with it. What DOES need explicit
 * cleanup is anything that outlives that DOM: timers (which keep
 * running and can fire against a stale closure) and the inactivity
 * listeners, which are registered on `document` itself.
 */
export function cleanup() {
  // Stop the clock's recursive setTimeout chain.
  clearTimeout(clockTimer);
  clockTimer = null;

  // Stop the toast auto-hide timer.
  clearTimeout(toastTimer);
  toastTimer = null;

  // Stop the 5-tap admin-trigger debounce.
  clearTimeout(adminTapTimer);
  adminTapTimer = null;
  adminTapCount = 0;

  // Stop the inactivity → screensaver timer, and the screensaver's own
  // slide-rotation timer/video-ended chain if it's currently running.
  clearTimeout(idleTimer);
  idleTimer = null;
  clearTimeout(slideTimeout);
  slideTimeout = null;
  ssRunning = false;

  // Remove the document-level activity listeners registered by this
  // screen's inactivity-timer setup — these are attached to `document`
  // itself (not to anything inside #kiosk-screen), so they'd otherwise
  // survive the DOM swap and double up the next time this screen inits.
  if (activityHandler) {
    ACTIVITY_EVENTS.forEach(ev => document.removeEventListener(ev, activityHandler, { passive: true }));
    activityHandler = null;
  }

  // Allow a clean re-init next time this screen is navigated to.
  initialized = false;
}
