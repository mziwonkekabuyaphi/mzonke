    const cardStage = document.getElementById('cardStage'); let flipped = false;
    if (cardStage) { cardStage.addEventListener('click', (e) => { e.stopPropagation(); flipped = !flipped; cardStage.classList.toggle('flipped', flipped); if (flipped) { cardStage.style.animation = 'none'; } else { setTimeout(() => { cardStage.style.animation = 'floatCard 4s ease-in-out infinite'; }, 300); } }); }
    const flipperElem = document.getElementById('cardFlipper');
    if (cardStage && flipperElem) { cardStage.addEventListener('pointermove', (e) => { const rect = cardStage.getBoundingClientRect(); const px = ((e.clientX - rect.left) / rect.width) * 100; const py = ((e.clientY - rect.top) / rect.height) * 100; cardStage.style.setProperty('--mx', px + '%'); cardStage.style.setProperty('--my', py + '%'); if (flipped) return; const cx = rect.left + rect.width / 2; const cy = rect.top + rect.height / 2; const dx = (e.clientX - cx) / (rect.width / 2); const dy = (e.clientY - cy) / (rect.height / 2); flipperElem.style.transform = `rotateY(${dx * 8}deg) rotateX(${-dy * 6}deg)`; }); cardStage.addEventListener('pointerleave', () => { cardStage.style.setProperty('--mx', '50%'); cardStage.style.setProperty('--my', '35%'); if (flipped) return; flipperElem.style.transform = ''; }); }
    const cardFrontElem = document.getElementById('cardFront'); const cardBackElem = document.getElementById('cardBack'); let pressTimer = null;
    function randomFrontGradient() { const hue1 = Math.floor(Math.random() * 360); const hue2 = (hue1 + 40 + Math.random() * 100) % 360; const hue3 = (hue2 + 30 + Math.random() * 80) % 360; const hue4 = (hue1 + 180) % 360; const hue5 = (hue2 + 210) % 360; const sat1 = 60 + Math.random() * 32; const sat2 = 55 + Math.random() * 32; const sat3 = 60 + Math.random() * 28; const lit1 = 25 + Math.random() * 28; const lit2 = 20 + Math.random() * 22; const lit3 = 15 + Math.random() * 24; return `linear-gradient(135deg, hsl(${hue1}, ${sat1}%, ${lit1}%) 0%, hsl(${hue2}, ${sat2}%, ${lit2}%) 25%, hsl(${hue3}, ${sat3}%, ${lit3}%) 50%, hsl(${hue4}, ${sat1 - 10}%, ${lit1 - 5}%) 75%, hsl(${hue5}, ${sat2 - 5}%, ${lit2 - 4}%) 100%)`; }
    function randomBackGradient() { const hueA = Math.floor(Math.random() * 360); const hueB = (hueA + 50) % 360; const hueC = (hueB + 70) % 360; return `linear-gradient(135deg, hsl(${hueA}, 68%, 10%) 0%, hsl(${hueB}, 62%, 16%) 30%, hsl(${hueC}, 72%, 8%) 55%, hsl(${(hueA + 120) % 360}, 68%, 12%) 80%, hsl(${(hueB + 90) % 360}, 65%, 6%) 100%)`; }
    function randomizeCardColors() { if (!cardFrontElem || !cardBackElem) return; const newFront = randomFrontGradient(); const newBack = randomBackGradient(); cardFrontElem.style.background = newFront; cardBackElem.style.background = newBack; if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(30); if (cardStage) { cardStage.style.filter = 'drop-shadow(0 0 12px rgba(220, 60, 80, 0.8))'; setTimeout(() => { if (cardStage) cardStage.style.filter = ''; }, 200); } const burstElem = document.getElementById('cardBurst'); if (burstElem) { burstElem.classList.remove('play'); void burstElem.offsetWidth; burstElem.classList.add('play'); } }
    function startLongPress(e) { if (flipped) return; pressTimer = setTimeout(() => { randomizeCardColors(); if (cardStage) cardStage.classList.add('long-press-active'); setTimeout(() => { if (cardStage) cardStage.classList.remove('long-press-active'); }, 280); }, 380); }
    function cancelLongPress() { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } if (cardStage) cardStage.classList.remove('long-press-active'); }
    if (cardStage) { cardStage.addEventListener('mousedown', startLongPress); cardStage.addEventListener('mouseup', cancelLongPress); cardStage.addEventListener('mouseleave', cancelLongPress); cardStage.addEventListener('touchstart', startLongPress, { passive: false }); cardStage.addEventListener('touchend', cancelLongPress); cardStage.addEventListener('touchcancel', cancelLongPress); }

// ===== EVENT HANDLERS (Buttons, Modals) =====
    (function() {
        const vibeHistoryBtn = document.getElementById('vibeHistoryBtn');
        if (vibeHistoryBtn) vibeHistoryBtn.addEventListener('click', () => window.location.href = './statement.html');
        
        const buyHereBtn = document.getElementById('buyHereBtn');
        const buyHereModal = document.getElementById('buyHereModalOverlay');
        const closeBuyHereModal = document.getElementById('closeBuyHereModal');
        if (buyHereBtn && buyHereModal) buyHereBtn.addEventListener('click', () => buyHereModal.classList.add('active'));
        if (closeBuyHereModal && buyHereModal) closeBuyHereModal.addEventListener('click', () => buyHereModal.classList.remove('active'));
        if (buyHereModal) buyHereModal.addEventListener('click', (e) => { if (e.target === buyHereModal) buyHereModal.classList.remove('active'); });
        document.querySelectorAll('.buyhere-card').forEach(card => {
            card.addEventListener('click', () => { const url = card.getAttribute('data-url'); if (url) { document.getElementById('buyHereModalOverlay')?.classList.remove('active'); window.location.href = url; } });
        });

        const refundModal = document.getElementById('refundModalOverlay');
        const closeRefundModal = document.getElementById('closeRefundModal');
        if (closeRefundModal && refundModal) closeRefundModal.addEventListener('click', () => refundModal.classList.remove('active'));
        if (refundModal) refundModal.addEventListener('click', (e) => { if (e.target === refundModal) refundModal.classList.remove('active'); });
        
        const topUpBtn = document.getElementById('instantTopUpBtn');
        const payNowBtn = document.getElementById('payNowBtn');
        if (topUpBtn) topUpBtn.addEventListener('click', () => window.location.href = 'deposit.html');
        if (payNowBtn) payNowBtn.addEventListener('click', () => window.location.href = 'pay-now.html');
        
        const openFestivalBtn = document.getElementById('openFestivalBannerBtn');
        if (openFestivalBtn) openFestivalBtn.addEventListener('click', () => window.location.href = './festival-banner.html');
    })();

// ===== REFUND FEATURE =====
    (function initRefundFeature() {
        let submittingRefund = false;
        const init = () => {
            const refundModalOverlay = document.getElementById('refundModalOverlay');
            const submitBtn = document.getElementById('refundSubmitBtn');
            const cancelBtn = document.getElementById('refundCancelBtn');
            if (cancelBtn && !cancelBtn.hasAttribute('data-refund-cancel')) {
                cancelBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (refundModalOverlay) refundModalOverlay.classList.remove('active'); });
                cancelBtn.setAttribute('data-refund-cancel', 'true');
            }
            if (!submitBtn || submitBtn.hasAttribute('data-refund-listener')) return;
            submitBtn.setAttribute('data-refund-listener', 'true');
            submitBtn.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                if (submittingRefund) return;
                const amountInput = document.getElementById('refundAmount');
                const orderIdInput = document.getElementById('refundOrderId');
                const reasonSelect = document.getElementById('refundReason');
                const amount = parseFloat(amountInput?.value);
                const orderId = orderIdInput?.value?.trim();
                const reason = reasonSelect?.value;
                if (!amount || amount <= 0) { showAlert('Please enter a valid refund amount.'); return; }
                if (!orderId) { showAlert('Please enter Order ID.'); return; }
                if (!reason) { showAlert('Please select a reason.'); return; }
                submittingRefund = true;
                const originalText = submitBtn.textContent;
                submitBtn.textContent = 'Submitting...';
                submitBtn.disabled = true;
                try {
                    const { error: insertError } = await window.supabase.rpc('request_refund', { p_order_id: orderId, p_amount: amount, p_reason: reason });
                    if (insertError) throw insertError;
                    showAlert('✅ Refund request submitted!');
                    if (amountInput) amountInput.value = '';
                    if (orderIdInput) orderIdInput.value = '';
                    if (reasonSelect) reasonSelect.value = '';
                    if (refundModalOverlay) refundModalOverlay.classList.remove('active');
                } catch (err) {
                    console.error(err);
                    showAlert('❌ Failed to submit refund request.');
                } finally {
                    submittingRefund = false;
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                }
            });
        };
        function showAlert(message) {
            const alertModal = document.getElementById('alertModalOverlay');
            const alertBody = document.querySelector('#alertModalOverlay .alert-modal-body');
            if (alertModal && alertBody) { alertBody.innerHTML = message; alertModal.classList.add('active'); }
            else alert(message);
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    })();

// ===== CARD ARTWORK GENERATOR =====
    (function addLuxuryCardArtwork() {
        function getArtworkContainer(parent) {
            let container = parent.querySelector('.card-artwork');
            if (!container) { container = document.createElement('div'); container.className = 'card-artwork'; parent.insertBefore(container, parent.firstChild); }
            return container;
        }
        function generateRandomArtworkSVG() {
            const viewBox = "0 0 100 100";
            const elements = [];
            const count = Math.floor(Math.random() * 8) + 5;
            const palettes = ['rgba(255,255,255,0.2)', 'rgba(255,215,0,0.25)', 'rgba(227,6,19,0.2)', 'rgba(255,255,255,0.35)', 'rgba(255,180,40,0.2)', 'rgba(200,220,255,0.15)'];
            for (let i = 0; i < count; i++) {
                const cx = Math.random() * 100, cy = Math.random() * 100, rx = Math.random() * 18 + 6, ry = Math.random() * 14 + 4;
                const strokeColor = palettes[Math.floor(Math.random() * palettes.length)], strokeWidth = Math.random() * 1.5 + 0.6, rotate = Math.random() * 360;
                const fill = Math.random() > 0.7 ? `rgba(255,255,255,0.05)` : 'none';
                elements.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rotate} ${cx} ${cy})" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="${fill}" stroke-linecap="round" />`);
            }
            for (let i = 0; i < 4; i++) { const cx = Math.random() * 100, cy = Math.random() * 100, r = Math.random() * 20 + 10; const start = Math.random() * 360, end = start + 60 + Math.random() * 120; elements.push(`<path d="M ${cx + r * Math.cos(start * Math.PI/180)} ${cy + r * Math.sin(start * Math.PI/180)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(end * Math.PI/180)} ${cy + r * Math.sin(end * Math.PI/180)}" stroke="rgba(255,255,255,0.25)" stroke-width="1.2" fill="none" />`); }
            for (let i = 0; i < 12; i++) { const cx = Math.random() * 100, cy = Math.random() * 100; elements.push(`<circle cx="${cx}" cy="${cy}" r="${Math.random() * 1.5 + 0.5}" fill="rgba(255,215,0,0.4)" />`); }
            return `<svg viewBox="${viewBox}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${elements.join('')}</svg>`;
        }
        function refreshArtwork() { const front = document.getElementById('cardFront'), back = document.getElementById('cardBack'); if (front) getArtworkContainer(front).innerHTML = generateRandomArtworkSVG(); if (back) getArtworkContainer(back).innerHTML = generateRandomArtworkSVG(); }
        refreshArtwork();
        const originalRandomize = window.randomizeCardColors;
        if (typeof originalRandomize === 'function') { window.randomizeCardColors = function() { originalRandomize(); refreshArtwork(); }; }
        else { const observer = new MutationObserver(() => refreshArtwork()); const frontElem = document.getElementById('cardFront'); if (frontElem) observer.observe(frontElem, { attributes: true, attributeFilter: ['style'] }); }
    })();

// ===== VIBE METER =====
    let currentEventId = null;
    let vibeUpdateInterval = null;
    let vibeEventChannel = null;

    async function loadCurrentEvent() {
        if (!window.supabase) { console.warn('[VibeMeter] Supabase client not ready yet'); return; }
        try {
            console.log('[VibeMeter] Fetching active event...');
            const { data: event, error } = await window.supabase
                .from('events')
                .select('id, name, start_time, end_time, status, is_active')
                .eq('is_active', true)
                .order('start_time', { ascending: true })
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            if (!event) {
                console.log('[VibeMeter] No active event found');
                document.getElementById('vibeEventName').textContent = 'No active events';
                document.getElementById('vibeEventStatus').innerHTML = '<i class="fas fa-calendar-alt"></i> No Event';
                document.getElementById('vibeEventStatus').style.background = '#e5e7eb';
                document.getElementById('vibeEventStatus').style.color = '#6b7280';
                return null;
            }
            console.log('[VibeMeter] Active event loaded:', event.id, event.name);
            currentEventId = event.id;
            document.getElementById('vibeEventName').textContent = event.name;
            const eventDate = new Date(event.start_time);
            document.getElementById('vibeEventDate').textContent = eventDate.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const now = new Date();
            const startTime = new Date(event.start_time);
            const endTime = event.end_time ? new Date(event.end_time) : null;
            const isLive = now >= startTime && (!endTime || now <= endTime);
            const isPast = endTime ? now > endTime : now > startTime;
            if (isLive) {
                document.getElementById('vibeEventStatus').innerHTML = '<i class="fas fa-calendar-day"></i> LIVE NOW';
                document.getElementById('vibeEventStatus').style.background = '#10b981';
                document.getElementById('vibeEventStatus').style.color = 'white';
            } else if (isPast) {
                document.getElementById('vibeEventStatus').innerHTML = '<i class="fas fa-calendar-check"></i> Past Event';
                document.getElementById('vibeEventStatus').style.background = '#9ca3af';
                document.getElementById('vibeEventStatus').style.color = 'white';
            } else {
                document.getElementById('vibeEventStatus').innerHTML = '<i class="fas fa-calendar-alt"></i> Upcoming';
                document.getElementById('vibeEventStatus').style.background = '#f3f4f6';
                document.getElementById('vibeEventStatus').style.color = '#E30613';
            }
            return event;
        } catch (err) {
            console.error('[VibeMeter] Error loading event:', err);
            document.getElementById('vibeEventName').textContent = 'Error loading event';
            return null;
        }
    }

    async function getTotalTicketsSold(eventId) {
        const { data, error } = await window.supabase
            .from('ticket_types')
            .select('sold')
            .eq('event_id', eventId);
        if (error) { console.error('[VibeMeter] Error getting ticket sales:', error); return 0; }
        const total = data.reduce((total, tt) => total + (tt.sold || 0), 0);
        console.log('[VibeMeter] Total tickets sold for event', eventId, '=', total);
        return total;
    }

    async function updateVibeMeter() {
        if (!currentEventId || !window.supabase) { console.warn('[VibeMeter] Skipping update — no event or supabase client'); return; }
        try {
            const totalSold = await getTotalTicketsSold(currentEventId);
            const { count: checkedIn, error: checkError } = await window.supabase
                .from('checkins')
                .select('*', { count: 'exact', head: true })
                .eq('event_id', currentEventId)
                .eq('status', 'valid');
            let checkedInCount = 0;
            if (checkError) {
                console.warn('[VibeMeter] checkins query failed, falling back to tickets.checked_in:', checkError);
                const { count: ticketCheckins, error: ticketError } = await window.supabase
                    .from('tickets')
                    .select('*', { count: 'exact', head: true })
                    .eq('event_id', currentEventId)
                    .eq('checked_in', true);
                if (!ticketError) {
                    checkedInCount = ticketCheckins || 0;
                    console.log('[VibeMeter] Fallback checked-in count:', checkedInCount);
                } else {
                    console.error('[VibeMeter] Both checkins and tickets queries failed:', ticketError);
                }
            } else {
                checkedInCount = checkedIn || 0;
                console.log('[VibeMeter] Checked-in count:', checkedInCount, '/ Sold:', totalSold);
            }
            updateVibeDisplay(totalSold, checkedInCount);
        } catch (err) { console.error('[VibeMeter] Error updating vibe meter:', err); }
    }

    function updateVibeDisplay(totalSold, checkedIn) {
        let vibePercent = 0;
        if (totalSold > 0) { vibePercent = Math.min(100, Math.round((checkedIn / totalSold) * 100)); }
        const percentSpan   = document.getElementById('vibePercentage');
        const vibeBarFill   = document.getElementById('vibeBarFill');
        const statsSpan     = document.getElementById('vibeStatsText');
        if (percentSpan)   percentSpan.textContent = `${vibePercent}%`;
        if (vibeBarFill) {
            vibeBarFill.style.width = `${vibePercent}%`;
            if (vibePercent < 30)      { vibeBarFill.style.background = 'linear-gradient(90deg, #E30613, #ff6b6b)'; }
            else if (vibePercent < 70) { vibeBarFill.style.background = 'linear-gradient(90deg, #ff8c00, #ffd700)'; }
            else                        { vibeBarFill.style.background = 'linear-gradient(90deg, #10b981, #34d399)'; }
        }
        if (statsSpan) {
            if (vibePercent < 30)      { statsSpan.innerHTML = '😴 Low Energy • Need more people inside!'; }
            else if (vibePercent < 70) { statsSpan.innerHTML = '🎵 Building Up • Getting lively!'; }
            else if (vibePercent < 90) { statsSpan.innerHTML = '🔥 High Energy • The party is on!'; }
            else                        { statsSpan.innerHTML = '⚡ MAXIMUM VIBE • ABSOLUTE MADNESS!'; }
        }
    }

    function setupVibeRealtime() {
        if (vibeEventChannel && window.supabase) { window.supabase.removeChannel(vibeEventChannel); vibeEventChannel = null; }
        if (!currentEventId || !window.supabase) return;
        vibeEventChannel = window.supabase.channel(`vibe-${currentEventId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins', filter: `event_id=eq.${currentEventId}` }, async () => { await updateVibeMeter(); })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ticket_types', filter: `event_id=eq.${currentEventId}` }, async () => { await updateVibeMeter(); })
            .subscribe((status) => { console.log('Vibe channel subscription status:', status); });
    }

    async function initVibeMeter() {
        if (!window.supabase) { console.warn('[VibeMeter] Supabase not ready, retrying in 2s...'); setTimeout(initVibeMeter, 2000); return; }
        console.log('[VibeMeter] Initializing...');
        const event = await loadCurrentEvent();
        if (event) {
            await updateVibeMeter();
            setupVibeRealtime();
            if (vibeUpdateInterval) clearInterval(vibeUpdateInterval);
            vibeUpdateInterval = setInterval(updateVibeMeter, 30000);
            console.log('[VibeMeter] Init complete, polling every 30s');
        } else {
            console.log('[VibeMeter] No event to initialize meter for');
        }
    }

    window.debugVibeMeter = async function() {
        console.log('=== VIBE METER DEBUG ===');
        console.log('Supabase available:', !!window.supabase);
        if (window.supabase) {
            const { data: events, error: eventsError } = await window.supabase.from('events').select('id, name, start_time, is_active').eq('is_active', true);
            console.log('Active events:', events); console.log('Events error:', eventsError);
            if (currentEventId) { const { count } = await window.supabase.from('checkins').select('*', { count: 'exact' }).eq('event_id', currentEventId); console.log(`Checkins for event ${currentEventId}:`, count); }
            const { data: ticketTypes } = await window.supabase.from('ticket_types').select('event_id, name, sold');
            console.log('Ticket types sales:', ticketTypes);
        }
        console.log('Current event ID:', currentEventId); console.log('=== END DEBUG ===');
    };

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => setTimeout(initVibeMeter, 1500)); }
    else { setTimeout(initVibeMeter, 1500); }

// ===== SEE ALL TRANSACTIONS =====
    document.getElementById('txSeeAllBtn')?.addEventListener('click', () => {
        window.location.href = './statement.html';
    });

