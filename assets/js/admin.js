    // NOTE: this file moved from an inline <script> in whatsapp-admin.html to
    // assets/js/admin.js. The original import '../config/supabase.js' was
    // relative to the HTML page's folder — from assets/js/, reaching the same
    // config/supabase.js (assumed to be a sibling of "assets") needs one more
    // '../'. Verify this matches your actual folder layout; adjust if not.
    import { supabase } from '../../config/supabase.js';

    // ─── ADMIN API CONFIG ───
    // conversation_states writes and real WhatsApp sends now go through
    // server routes (see app/api/admin/handover and app/api/admin/send-message
    // in the Next.js repo) because conversation_states' RLS policy is
    // service-role-only and there's no Cloud API call happening client-side.
    // WARNING: this page has no login, so ADMIN_API_SECRET below is visible
    // to anyone who loads it — it only blocks requests from people who don't
    // have the page, not people who do. Put real auth (e.g. Supabase Auth
    // staff login) in front of this page before relying on this in production.
    const ADMIN_API_BASE = 'https://rands-whatsapp-concierge-olive.vercel.app';
    const ADMIN_API_SECRET = 'randscapetown'; // must exactly match ADMIN_API_SECRET in the Vercel project's env vars

    async function callAdminApi(path, payload) {
        const res = await fetch(`${ADMIN_API_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-secret': ADMIN_API_SECRET },
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        return data;
    }

    let charts = {}, currentEditingTemplate = null, currentEditingIntent = null;
    let selectedConversationId = null;
    let allConversations = [], allAIRequests = [], allSessions = [], allTemplates = [], allIntents = [], aiSettings = {};
    let allMessagesFlat = []; // flattened messages from the conversations join, used for dashboard stats
    const messagesCache = new Map(); // conversation_id -> messages[] (full row set once a conversation has been opened)
    const profilesCache = new Map(); // customer_id -> profiles row
    let stateByPhone = new Map(); // phone -> conversation_states row (state, data, updated_at)
    let realtimeChannel = null;

    window.showToast = function(msg, isError = false) {
        const t = document.getElementById('toastMsg');
        t.textContent = msg;
        t.style.background = isError ? 'rgba(220,38,38,0.9)' : 'var(--s2)';
        t.style.borderColor = isError ? 'rgba(220,38,38,0.3)' : 'var(--border)';
        t.style.display = 'block';
        clearTimeout(t._h);
        t._h = setTimeout(() => t.style.display = 'none', 2800);
    };

    function esc(s) { if (!s) return ''; return String(s).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]); }
    function fmtTime(iso) { if (!iso) return ''; return new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
    function fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso), n = new Date();
        if (d.toDateString() === n.toDateString()) return fmtTime(iso);
        if ((n-d)/86400000 < 7) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
        return d.toLocaleDateString([], {month:'short', day:'numeric'});
    }
    function initials(p) { return p ? (p.replace(/[^a-zA-Z0-9]/g,'').slice(-4) || '?') : '?'; }

    // ─── PROTOTYPE-ONLY LOCAL STORAGE (admin productivity, notes, pins) ───
    // These are UI-only conveniences with no backend table yet — clearly scoped per-browser.
    const LS = {
        get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
        set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
    };
    const NOTES_KEY = 'wa_admin_notes', PIN_KEY = 'wa_admin_pins', FAV_KEY = 'wa_admin_favs',
          PRIORITY_KEY = 'wa_admin_priority', TAGS_KEY = 'wa_admin_tags',
          TMPL_FAV_KEY = 'wa_admin_tmpl_favs', TMPL_RECENT_KEY = 'wa_admin_tmpl_recent';

    function getNote(convId) { return LS.get(NOTES_KEY, {})[convId] || ''; }
    function setNote(convId, text) { const all = LS.get(NOTES_KEY, {}); all[convId] = text; LS.set(NOTES_KEY, all); }
    function isPinned(convId) { return !!LS.get(PIN_KEY, {})[convId]; }
    function togglePinned(convId) { const all = LS.get(PIN_KEY, {}); all[convId] = !all[convId]; LS.set(PIN_KEY, all); return all[convId]; }
    function isFaved(convId) { return !!LS.get(FAV_KEY, {})[convId]; }
    function toggleFaved(convId) { const all = LS.get(FAV_KEY, {}); all[convId] = !all[convId]; LS.set(FAV_KEY, all); return all[convId]; }
    function getPriority(convId) { return LS.get(PRIORITY_KEY, {})[convId] || 'normal'; }
    function setPriority(convId, p) { const all = LS.get(PRIORITY_KEY, {}); all[convId] = p; LS.set(PRIORITY_KEY, all); }
    function getTags(convId) { return LS.get(TAGS_KEY, {})[convId] || []; }
    function setTags(convId, tags) { const all = LS.get(TAGS_KEY, {}); all[convId] = tags; LS.set(TAGS_KEY, all); }
    function isTemplateFaved(key) { return !!LS.get(TMPL_FAV_KEY, {})[key]; }
    function toggleTemplateFaved(key) { const all = LS.get(TMPL_FAV_KEY, {}); all[key] = !all[key]; LS.set(TMPL_FAV_KEY, all); return all[key]; }
    function pushRecentTemplate(key) { let recent = LS.get(TMPL_RECENT_KEY, []); recent = [key, ...recent.filter(k => k !== key)].slice(0, 10); LS.set(TMPL_RECENT_KEY, recent); }
    function getRecentTemplates() { return LS.get(TMPL_RECENT_KEY, []); }

    // Deterministic pseudo-value generator so "placeholder" insight cards look stable per customer
    // rather than re-randomizing on every render (still clearly not real data).
    function seedFrom(str) { let h = 0; for (let i=0;i<(str||'').length;i++) { h = (h*31 + str.charCodeAt(i)) | 0; } return Math.abs(h); }
    function seededVal(seed, min, max) { const x = Math.sin(seed*99991) * 10000; const frac = x - Math.floor(x); return Math.floor(frac*(max-min+1))+min; }

    // ─── SCHEMA-DERIVED STATE HELPERS ───
    // conversations no longer carry status / ai_enabled / current_intent / customer_name directly.
    // Those are now derived from conversation_states (keyed by phone) and profiles (keyed by customer_id).
    const AI_OFF_STATES = ['paused', 'human', 'handoff', 'manual'];
    const CLOSED_STATES = ['closed', 'resolved'];
    const BLOCKED_STATES = ['blocked', 'banned'];
    const CONTROL_STATES = [...AI_OFF_STATES, ...CLOSED_STATES, ...BLOCKED_STATES, 'active'];

    function getState(phone) { return phone ? stateByPhone.get(phone) : null; }
    function getConvState(c) { return c ? getState(c.phone) : null; }

    // AI is considered enabled unless conversation_states.state explicitly says a human has taken over.
    function isAIEnabled(c) {
        const st = getConvState(c);
        if (!st || !st.state) return true;
        return !AI_OFF_STATES.includes(String(st.state).toLowerCase());
    }

    // Conversation "status" derived from state — falls back to 'active' when no state row exists yet.
    function getConvStatus(c) {
        const st = getConvState(c);
        if (!st || !st.state) return 'active';
        const s = String(st.state).toLowerCase();
        if (CLOSED_STATES.includes(s)) return 'closed';
        if (BLOCKED_STATES.includes(s)) return 'blocked';
        return 'active';
    }

    // Current intent is read from conversation_states.data.intent first, falling back to the state
    // label itself when it isn't one of the generic control states (paused/active/closed/blocked...).
    function getCurrentIntent(c) {
        const st = getConvState(c);
        if (!st) return null;
        if (st.data && typeof st.data === 'object' && st.data.intent) return st.data.intent;
        if (st.state && !CONTROL_STATES.includes(String(st.state).toLowerCase())) return st.state;
        return null;
    }

    // ─── DATA HELPERS ───
    function getConv(id) { return allConversations.find(c => c.id === id); }
    function getMsgs(id) { return messagesCache.get(id) || []; }
    function lastMsg(id) { const m = getMsgs(id); return m.length ? m[m.length - 1] : null; }
    function displayName(c) {
        if (!c) return 'Unknown';
        if (c.customer_name) return c.customer_name;
        const profile = c.profile_id ? profilesCache.get(c.profile_id) : null;
        return (profile && (profile.name || profile.full_name)) || c.phone || c.phone_number || 'Unknown';
    }

    // ─── LOADERS ───
    // Loads conversations along with their messages (used for previews + dashboard stats).
    async function loadConversations() {
    try {
        console.log('[loadConversations] Starting...');
        
        // Fetch all conversations
        const { data: conversations, error: convError } = await supabase
            .from('conversations')
            .select('*')
            .order('last_message_at', { ascending: false })
            .limit(100);
            
        if (convError) {
            console.error('[loadConversations] Error:', convError);
            throw convError;
        }
        
        console.log(`[loadConversations] Found ${conversations?.length || 0} conversations`);
        allConversations = conversations || [];
        allMessagesFlat = [];
        
        // For each conversation, fetch messages separately
        for (const conv of allConversations) {
            try {
                const { data: msgs, error: msgError } = await supabase
                    .from('messages')
                    .select('*')
                    .eq('conversation_id', conv.id)
                    .order('created_at', { ascending: true });
                    
                if (msgError) {
                    console.error(`[loadConversations] Error fetching messages for ${conv.id}:`, msgError);
                    conv.messages = [];
                    messagesCache.set(conv.id, []);
                } else {
                    const messageList = msgs || [];
                    conv.messages = messageList;
                    allMessagesFlat.push(...messageList);
                    messagesCache.set(conv.id, messageList);
                    console.log(`[loadConversations] Loaded ${messageList.length} messages for ${conv.id}`);
                }
            } catch (e) {
                console.error(`[loadConversations] Error processing ${conv.id}:`, e);
                conv.messages = [];
                messagesCache.set(conv.id, []);
            }
        }
        
        // Remove messages property from stored conversations
        allConversations.forEach(c => {
            delete c.messages;
        });
        
        // Fetch profiles for display names
        const customerIds = [...new Set(allConversations.map(c => c.profile_id).filter(Boolean))];
        if (customerIds.length) {
            try {
                const { data: profiles, error: profErr } = await supabase
                    .from('profiles')
                    .select('*')
                    .in('id', customerIds);
                    
                if (!profErr && profiles) {
                    profiles.forEach(p => profilesCache.set(p.id, p));
                    console.log(`[loadConversations] Loaded ${profiles.length} profiles`);
                }
            } catch (e) {
                console.warn('[loadConversations] Profile fetch error:', e);
            }
        }
        
        console.log('[loadConversations] Complete!');
        
    } catch (e) { 
        console.error('[loadConversations] Fatal error:', e);
        allConversations = []; 
        allMessagesFlat = []; 
    }
}

    // Loads the full message row set (all columns) for a single conversation.
    async function loadMessages(conversationId) {
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true });
            if (error) throw error;
            messagesCache.set(conversationId, data || []);
            return data || [];
        } catch (e) { messagesCache.set(conversationId, []); return []; }
    }

    async function getProfile(customerId) {
        if (!customerId) return null;
        if (profilesCache.has(customerId)) return profilesCache.get(customerId);
        try {
            const { data, error } = await supabase.from('profiles').select('*').eq('id', customerId).maybeSingle();
            if (error) throw error;
            profilesCache.set(customerId, data);
            return data;
        } catch (e) { return null; }
    }

    // Loads conversation_states (one row per phone) which carries the live AI state + free-form data blob.
    async function loadConversationStates() {
        try {
            const { data, error } = await supabase.from('conversation_states').select('*');
            if (error) throw error;
            stateByPhone = new Map((data || []).map(s => [s.phone, s]));
        } catch (e) { stateByPhone = new Map(); }
    }

    async function loadAIRequests() { try { const {data,error} = await supabase.from('ai_requests').select('*').order('created_at',{ascending:false}).limit(300); if(error) throw error; allAIRequests = data||[]; } catch(e) { allAIRequests=[]; } }
    async function loadActiveSessions() { try { const {data,error} = await supabase.from('conversation_sessions').select('*').order('last_message_at',{ascending:false}).limit(50); if(error) throw error; allSessions = data||[]; } catch(e) { allSessions=[]; } }
    async function loadTemplates() { try { const {data,error} = await supabase.from('whatsapp_templates').select('*').order('template_name'); if(error) throw error; allTemplates = data||[]; } catch(e) { allTemplates=[]; } }
    async function loadIntents() { try { const {data,error} = await supabase.from('ai_intents').select('*').order('intent_name'); if(error) throw error; allIntents = data||[]; } catch(e) { allIntents=[]; } }
    async function loadAISettings() { try { const {data,error} = await supabase.from('ai_settings').select('*').eq('id','default').maybeSingle(); if(error) throw error; aiSettings = data||{model:'claude',temperature:0.3,max_tokens:500,enable_ai:true}; } catch(e) { aiSettings={model:'claude',temperature:0.3,max_tokens:500,enable_ai:true}; } }

    async function updateConversationLastMessage(conversationId, iso) {
        try {
            await supabase.from('conversations').update({ last_message_at: iso, updated_at: iso }).eq('id', conversationId);
        } catch (e) { /* non-fatal — UI already has the optimistic value */ }
        const c = getConv(conversationId);
        if (c) { c.last_message_at = iso; c.updated_at = iso; }
    }

    let currentChatFilter = 'all';

    window.setChatFilter = function(f) {
        currentChatFilter = f;
        document.querySelectorAll('#filterBar .filter-pill[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === f));
        renderChatList(document.getElementById('chatSearch').value);
    };

    function matchesFilter(conv, last) {
        if (currentChatFilter === 'all') return true;
        if (currentChatFilter === 'unread') return !!last && last.direction === 'incoming' && last.status !== 'read';
        if (currentChatFilter === 'ai_active') return isAIEnabled(conv) && getConvStatus(conv) === 'active';
        if (currentChatFilter === 'needs_human') { const lastReq = allAIRequests.find(r => r.phone === conv.phone); return !!(lastReq && lastReq.success === false); }
        if (currentChatFilter === 'waiting_customer') return !!last && last.direction === 'outgoing';
        return true;
    }

    function highlight(text, term) {
        if (!term) return text;
        try {
            const re = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'ig');
            return text.replace(re, '<mark>$1</mark>');
        } catch (e) { return text; }
    }

    function renderChatList(searchTerm='') {
        const container = document.getElementById('chatList');
        const sorted = [...allConversations].sort((a,b) => {
            const pa = isPinned(a.id), pb = isPinned(b.id);
            if (pa !== pb) return pa ? -1 : 1;
            return new Date(b.last_message_at||b.updated_at||0) - new Date(a.last_message_at||a.updated_at||0);
        });
        const s = searchTerm.toLowerCase().trim();
        let filtered = s ? sorted.filter(c => {
            const last = lastMsg(c.id);
            return (displayName(c)||'').toLowerCase().includes(s)
                || (c.phone||'').toLowerCase().includes(s)
                || (last?.message_text||'').toLowerCase().includes(s);
        }) : sorted;
        filtered = filtered.filter(c => matchesFilter(c, lastMsg(c.id)));
        if (!filtered.length) {
            const emptyMsg = currentChatFilter !== 'all' ? `No conversations match "${currentChatFilter.replace(/_/g,' ')}"` : (s ? `No conversations match "${esc(searchTerm)}"` : 'No conversations yet');
            container.innerHTML = `<div class="empty-state" style="padding:50px 20px;"><i class="fas fa-inbox" style="font-size:1.8rem;"></i><span class="es-title">${esc(emptyMsg)}</span><span class="es-sub">New WhatsApp conversations will appear here automatically.</span></div>`;
            return;
        }
        container.innerHTML = filtered.map(c => {
            const last = lastMsg(c.id);
            const msgs = getMsgs(c.id);
            const unread = msgs.filter(m => m.direction === 'incoming' && m.status !== 'read').length;
            const online = !!allSessions.find(s => s.phone === c.phone);
            const previewRaw = last?.message_text ? last.message_text.slice(0,55) : (last?.message_type ? `📎 ${last.message_type}` : 'No messages');
            const preview = highlight(esc(previewRaw), s);
            const intent = getCurrentIntent(c) || 'general';
            const lastReq = allAIRequests.find(r => r.phone === c.phone);
            const needsHuman = !!(lastReq && lastReq.success === false);
            const aiActive = isAIEnabled(c) && getConvStatus(c) === 'active';
            const statusBadge = needsHuman ? '<span class="mini-badge human">HUMAN</span>' : (aiActive ? '<span class="mini-badge ai">AI</span>' : '');
            const name = displayName(c);
            const pinned = isPinned(c.id), faved = isFaved(c.id);
            const vip = msgs.length >= 20;
            const priority = getPriority(c.id);
            return `<div class="chat-item ${c.id===selectedConversationId?'active':''}" onclick="selectConversation('${c.id}')">
                <div class="chat-avatar">${initials(name)}<span class="status-dot ${online?'':'offline'}"></span>${(needsHuman||priority==='urgent')?'<span class="priority-dot" title="Needs attention"></span>':''}</div>
                <div class="chat-info">
                    <div class="name"><span class="name-txt">${pinned?'<i class="fas fa-thumbtack pinned-flag"></i>':''}${vip?'<span class="vip-badge" style="margin-right:4px;">VIP</span>':''}${highlight(esc(name), s)}</span><span class="time">${fmtDate(c.last_message_at||last?.created_at)}</span></div>
                    <div class="last-msg"><span class="preview-wrap">${statusBadge}<span>${preview}</span></span><span style="display:flex;gap:5px;align-items:center;flex-shrink:0;"><span class="intent-tag">${esc(intent)}</span>${unread>0?`<span class="badge">${unread}</span>`:''}</span></div>
                </div>
                <div class="pin-star-col ${(pinned||faved)?'active-any':''}">
                    <button class="${pinned?'pinned':''}" title="Pin conversation" onclick="event.stopPropagation();togglePin('${c.id}')"><i class="fas fa-thumbtack"></i></button>
                    <button class="${faved?'faved':''}" title="Favourite conversation" onclick="event.stopPropagation();toggleFav('${c.id}')"><i class="fas fa-star"></i></button>
                </div></div>`;
        }).join('');
    }

    window.togglePin = function(id) { const now = togglePinned(id); showToast(now ? 'Pinned to top' : 'Unpinned'); renderChatList(document.getElementById('chatSearch').value); };
    window.toggleFav = function(id) { const now = toggleFaved(id); showToast(now ? 'Added to favourites' : 'Removed from favourites'); renderChatList(document.getElementById('chatSearch').value); };

    window.selectConversation = async function(id) {
        selectedConversationId = id;
        renderChatList(document.getElementById('chatSearch').value);
        updateChatHeader(id);
        renderCustomerPanel(id);
        const area = document.getElementById('messagesArea');
        area.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><span>Loading messages…</span></div>`;
        await loadMessages(id);
        renderChatMessages(id);
    };

    function updateChatHeader(id) {
        const c = getConv(id);
        const name = c ? displayName(c) : null;
        document.getElementById('chatContactName').textContent = name || 'Select a conversation';
        document.getElementById('chatAvatar').textContent = initials(name);
        const online = !!(c && allSessions.find(s => s.phone === c.phone));
        let statusTxt = '';
        if (c) {
            const status = getConvStatus(c);
            if (status === 'closed') statusTxt = 'closed';
            else if (status === 'blocked') statusTxt = 'blocked';
            else statusTxt = online ? 'online' : 'last seen recently';
        }
        document.getElementById('chatStatus').innerHTML = c ? `<span class="online-dot" style="background:${online?'var(--green)':'var(--dim)'};box-shadow:${online?'0 0 5px var(--green)':'none'}"></span> ${statusTxt}` : '<span class="online-dot"></span> —';
    }

    window.toggleCustomerPanel = function() {
        const panel = document.getElementById('customerPanel');
        const isMobile = window.innerWidth <= 1100;
        if (isMobile) { panel.classList.remove('collapsed'); panel.classList.toggle('open'); }
        else panel.classList.toggle('collapsed');
        document.getElementById('toggleCustomerPanelBtn').classList.toggle('active-toggle', !panel.classList.contains('collapsed') || panel.classList.contains('open'));
    };

    // Toggles the AI concierge for the SELECTED conversation via the server-side
    // /api/admin/handover route. conversation_states writes are service-role-only
    // (RLS), so this can no longer go straight from the browser to Supabase.
    window.toggleAIGlobal = async function() {
        if (!selectedConversationId) { showToast('Select a conversation first', true); return; }
        const c = getConv(selectedConversationId);
        if (!c) return;
        const currentlyEnabled = isAIEnabled(c);
        const action = currentlyEnabled ? 'pause' : 'resume';
        const nowIso = new Date().toISOString();
        try {
            const result = await callAdminApi('/api/admin/handover', { phone: c.phone, action });
            const existing = getState(c.phone);
            stateByPhone.set(c.phone, { ...(existing || {}), phone: c.phone, state: result.state, updated_at: nowIso });
            renderCustomerPanel(selectedConversationId);
            renderChatList(document.getElementById('chatSearch').value);
            showToast(result.state === 'active' ? 'AI resumed for this conversation' : 'AI paused — you have taken over');
        } catch (e) { showToast(e.message, true); }
    };

    window.markResolved = async function() {
        if (!selectedConversationId) { showToast('Select a conversation first', true); return; }
        const c = getConv(selectedConversationId);
        if (!c) return;
        const nowIso = new Date().toISOString();
        try {
            const result = await callAdminApi('/api/admin/handover', { phone: c.phone, action: 'resolve' });
            const existing = getState(c.phone);
            stateByPhone.set(c.phone, { ...(existing || {}), phone: c.phone, state: result.state, updated_at: nowIso });
            updateChatHeader(selectedConversationId);
            renderCustomerPanel(selectedConversationId);
            renderChatList(document.getElementById('chatSearch').value);
            showToast('Conversation marked resolved');
        } catch (e) { showToast(e.message, true); }
    };

    const STATUS_COLORS = { active: 'var(--green)', closed: 'var(--muted)', blocked: 'var(--red)' };

    async function renderCustomerPanel(id) {
        const avatar = document.getElementById('cpAvatar'), nameEl = document.getElementById('cpName'), phoneEl = document.getElementById('cpPhone');
        const c = id ? getConv(id) : null;

        if (!c) {
            avatar.textContent = '?'; nameEl.textContent = '—'; phoneEl.textContent = 'No conversation selected';
            document.getElementById('cpOnlineStatus').innerHTML = '<span class="online-dot" style="background:var(--dim);box-shadow:none;"></span> —';
            document.getElementById('cpStatusRow').innerHTML = '';
            document.getElementById('cpFieldPhone').textContent='—'; document.getElementById('cpFirstContact').textContent='—'; document.getElementById('cpTotalMsgs').textContent='—';
            document.getElementById('cpTagsRow').innerHTML = '<span class="cp-empty-note">No conversation selected</span>';
            document.getElementById('aiSuggestedList').innerHTML = '<span class="cp-empty-note">No conversation selected</span>';
            document.getElementById('aiLastAction').querySelector('.intent-row').innerHTML = '<span class="intent-name">—</span>';
            const emailRow = document.getElementById('cpEmailRow'); emailRow.classList.add('cp-disabled'); document.getElementById('cpFieldEmail').textContent = 'Not connected';
            document.getElementById('cpInsightsGrid').innerHTML = '';
            document.getElementById('cpTimeline').innerHTML = '<span class="cp-empty-note">No conversation selected</span>';
            document.getElementById('cpNotesBox').value = ''; document.getElementById('cpNotesBox').disabled = true;
            document.getElementById('cpInternalTagsRow').innerHTML = '';
            document.getElementById('cpPriorityRow').querySelectorAll('.priority-opt').forEach(el => el.classList.remove('active'));
            ['aiConfidenceBadge','aiRoutingDecision','aiCurrentHandler','aiResponseTime','aiModelUsed','aiTokenCount','aiHumanNeeded'].forEach(id => document.getElementById(id).textContent = '—');
            return;
        }

        const profile = c.profile_id ? await getProfile(c.profile_id) : null;
        // Bail out if the user has since clicked into a different conversation.
        if (selectedConversationId !== id) return;

        const msgs = getMsgs(c.id);
        const online = !!allSessions.find(s => s.phone === c.phone);
        const first = msgs[0], totalMsgs = msgs.length;
        const name = c.customer_name || profile?.name || profile?.full_name || c.phone || 'Unknown';

        avatar.textContent = initials(name);
        nameEl.innerHTML = `<span>${esc(name)}</span>` + (totalMsgs >= 20 ? '<span class="vip-badge">VIP</span>' : '');
        if (totalMsgs >= 20) nameEl.title = 'Heuristic: 20+ messages — not a real VIP flag yet';
        phoneEl.textContent = esc(c.phone || c.phone_number || '—');
        document.getElementById('cpOnlineStatus').innerHTML = `<span class="online-dot" style="background:${online?'var(--green)':'var(--dim)'};box-shadow:${online?'0 0 5px var(--green)':'none'}"></span> ${online?'Online now':'Offline'}`;

        const status = getConvStatus(c);
        const currentIntent = getCurrentIntent(c);
        const statusColor = STATUS_COLORS[status] || 'var(--muted)';
        document.getElementById('cpStatusRow').innerHTML = `<span class="cp-chip" style="border-color:${statusColor};color:${statusColor};">${esc(status||'unknown')}</span>` + (currentIntent ? `<span class="cp-chip">${esc(currentIntent.replace(/_/g,' '))}</span>` : '');

        document.getElementById('cpFieldPhone').textContent = esc(c.phone || c.phone_number || '—');
        document.getElementById('cpFirstContact').textContent = first ? fmtDate(first.created_at) : '—';
        document.getElementById('cpTotalMsgs').textContent = totalMsgs;

        const emailRow = document.getElementById('cpEmailRow');
        if (profile?.email) { emailRow.classList.remove('cp-disabled'); emailRow.removeAttribute('data-tip'); document.getElementById('cpFieldEmail').textContent = profile.email; }
        else { emailRow.classList.add('cp-disabled'); emailRow.setAttribute('data-tip','No matching profile email found'); document.getElementById('cpFieldEmail').textContent = 'Not connected'; }

        // Common topics — derived from this customer's AI request history
        const intentCounts = {};
        allAIRequests.filter(r => r.phone === c.phone).forEach(r => { if (r.intent) intentCounts[r.intent] = (intentCounts[r.intent]||0)+1; });
        const topIntents = Object.entries(intentCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
        document.getElementById('cpTagsRow').innerHTML = topIntents.length
            ? topIntents.map(([name,count]) => `<span class="cp-chip${count>2?' tone-red':''}">${esc(name.replace(/_/g,' '))} · ${count}</span>`).join('')
            : '<span class="cp-empty-note">No intent history yet</span>';

        // AI status for this conversation
        const aiOn = aiSettings.enable_ai && isAIEnabled(c);
        document.getElementById('aiGlobalSwitch').classList.toggle('on', aiOn);
        document.getElementById('aiStatusDot').className = 'ai-status-dot' + (aiOn ? '' : ' off');
        document.getElementById('aiStatusText').textContent = !aiSettings.enable_ai ? 'AI disabled globally' : (!isAIEnabled(c) ? 'Paused — human handling' : 'AI enabled');
        document.getElementById('aiTakeOverLabel').textContent = !isAIEnabled(c) ? 'Resume AI' : 'Take Over';
        document.getElementById('aiTakeOverBtn').querySelector('i').className = !isAIEnabled(c) ? 'fas fa-robot' : 'fas fa-hand-paper';

        // Last AI action for this phone, from ai_requests
        const lastReq = allAIRequests.find(r => r.phone === c.phone);
        const actionBox = document.getElementById('aiLastAction');
        if (lastReq) {
            actionBox.querySelector('.intent-row').innerHTML = `<span class="intent-name">${esc((lastReq.intent||'unknown').replace(/_/g,' '))}</span><span class="ai-result-pill ${lastReq.success?'success':'fail'}">${lastReq.success?'Success':'Failed'}</span>`;
            let tsLine = actionBox.querySelector('.ts');
            if (!tsLine) { tsLine = document.createElement('div'); tsLine.className = 'ts'; actionBox.appendChild(tsLine); }
            tsLine.textContent = fmtDate(lastReq.created_at);
        } else {
            actionBox.querySelector('.intent-row').innerHTML = '<span class="intent-name" style="color:var(--muted);font-weight:400;">No AI activity yet</span>';
            const tsLine = actionBox.querySelector('.ts'); if (tsLine) tsLine.remove();
        }

        // Suggested replies — active templates matching this conversation's current intent
        const topIntent = currentIntent || topIntents[0]?.[0];
        const matches = allTemplates.filter(t => t.active && (!topIntent || t.template_key === topIntent || (t.template_name||'').toLowerCase().includes(topIntent||''))).slice(0,4);
        const fallback = allTemplates.filter(t => t.active).slice(0,3);
        const list = matches.length ? matches : fallback;
        document.getElementById('aiSuggestedList').innerHTML = list.length
            ? list.map(t => `<div class="ai-suggested-item" onclick="useSuggestedReply('${esc(t.template_key||'').replace(/'/g,"\\'")}')"><span class="txt">${esc(t.content||t.template_name||'')}</span><i class="fas fa-arrow-up-right-from-square"></i></div>`).join('')
            : '<span class="cp-empty-note">No active templates yet</span>';

        renderCpExtras(c, lastReq, needsHuman, aiOn);
    }

    // ─── CUSTOMER INTELLIGENCE: INSIGHTS / NOTES / TIMELINE / PRIORITY+TAGS / AI DEBUG+FIELDS ───
    function renderCpExtras(c, lastReq, needsHuman, aiOn) {
        const seed = seedFrom(c.phone || c.id);

        // Insights — clearly-labelled placeholders until wallet/orders/tickets/events tables exist
        const insights = [
            { label: 'Wallet Balance', val: `R${seededVal(seed+1,50,900)}.00`, icon: 'fa-wallet' },
            { label: 'Tickets Purchased', val: seededVal(seed+2,0,6), icon: 'fa-ticket' },
            { label: 'Orders', val: seededVal(seed+3,0,14), icon: 'fa-bag-shopping' },
            { label: 'Bookings', val: seededVal(seed+4,0,5), icon: 'fa-calendar-check' },
            { label: 'Lockers', val: seededVal(seed+5,0,2), icon: 'fa-lock' },
            { label: 'Events Attended', val: seededVal(seed+6,0,9), icon: 'fa-champagne-glasses' },
            { label: 'Lifetime Spend', val: `R${seededVal(seed+7,200,8000)}`, icon: 'fa-sack-dollar' },
            { label: 'Favourite Category', val: ['Sport','Music','Comedy','Theatre','Family'][seededVal(seed+8,0,4)], icon: 'fa-heart' },
            { label: 'Loyalty Tier', val: ['Bronze','Silver','Gold','Platinum'][seededVal(seed+9,0,3)], icon: 'fa-medal' },
            { label: 'Avg Response Time', val: `${seededVal(seed+10,1,9)}m`, icon: 'fa-stopwatch' },
            { label: 'Last Purchase', val: `${seededVal(seed+11,1,29)}d ago`, icon: 'fa-clock' },
        ];
        document.getElementById('cpInsightsGrid').innerHTML = insights.map(i => `<div class="insight-card placeholder" title="Placeholder — connect the matching table to make this live"><div class="ic-val"><i class="fas ${i.icon}"></i>${esc(String(i.val))}</div><div class="ic-label">${esc(i.label)}</div></div>`).join('');

        // Internal notes (per-conversation, localStorage — prototype only)
        const notesBox = document.getElementById('cpNotesBox');
        notesBox.disabled = false;
        notesBox.value = getNote(c.id);
        notesBox.dataset.convId = c.id;

        // Priority + internal tags (localStorage — prototype only)
        const priority = getPriority(c.id);
        document.getElementById('cpPriorityRow').querySelectorAll('.priority-opt').forEach(el => el.classList.toggle('active', el.dataset.p === priority));
        renderInternalTags(c.id);

        // Conversation timeline — built from real message/state data plus intelligently-labelled placeholders
        const msgs = getMsgs(c.id);
        const first = msgs[0];
        const state = getState(c.phone);
        const items = [];
        if (first) items.push({ title: 'Conversation Started', time: fullTimestamp(first.created_at), real: true });
        items.push({ title: 'AI Took Over', time: first ? fullTimestamp(first.created_at) : '—', real: true });
        if (state && AI_OFF_STATES.includes(String(state.state||'').toLowerCase())) {
            items.push({ title: 'Human Took Over', time: fullTimestamp(state.updated_at), real: true });
        }
        // Intelligent placeholders — no ticketing/wallet/order tables wired up yet
        items.push({ title: 'Customer Purchased Ticket', time: 'Placeholder — ticketing not connected', real: false });
        items.push({ title: 'Wallet Top-up', time: 'Placeholder — wallet not connected', real: false });
        if (getConvStatus(c) === 'closed') items.push({ title: 'Conversation Closed', time: fullTimestamp(state?.updated_at), real: true });
        document.getElementById('cpTimeline').innerHTML = items.map(it => `<div class="timeline-item ${it.real?'':'tl-muted'}"><div class="tl-dot-col"><div class="tl-dot"></div><div class="tl-line"></div></div><div class="tl-content"><div class="tl-title">${esc(it.title)}</div><div class="tl-time">${esc(it.time||'—')}</div></div></div>`).join('');

        // AI panel extended fields — grounded where data exists, clearly-labelled mock elsewhere
        const confidence = lastReq ? (lastReq.success ? seededVal(seed+20,78,97) : seededVal(seed+21,22,54)) : null;
        const confBand = confidence===null ? null : (confidence>=75?'green':confidence>=50?'yellow':'red');
        document.getElementById('aiConfidenceBadge').innerHTML = confidence===null ? '—' : `<span class="conf-badge ${confBand}">${confidence}%</span>`;
        document.getElementById('aiRoutingDecision').textContent = needsHuman ? 'Escalate to human' : (aiOn ? 'Handle with AI' : 'Human handling');
        document.getElementById('aiCurrentHandler').textContent = aiOn ? 'AI Concierge' : 'Human Agent';
        document.getElementById('aiResponseTime').textContent = lastReq ? `${(seededVal(seed+22,4,28)/10).toFixed(1)}s` : '—';
        document.getElementById('aiModelUsed').textContent = aiSettings.model || 'claude';
        document.getElementById('aiTokenCount').textContent = lastReq ? seededVal(seed+23,120,980) : '—';
        document.getElementById('aiHumanNeeded').innerHTML = needsHuman ? '<span style="color:var(--red);font-weight:600;">Yes</span>' : '<span style="color:#4ade80;font-weight:600;">No</span>';

        // AI debug panel — realistic mock data, never wired to a live backend yet
        document.getElementById('dbgIntent').textContent = getCurrentIntent(c) || (lastReq?.intent) || 'general_inquiry';
        document.getElementById('dbgConfidence').textContent = confidence===null ? 'n/a' : `${confidence}%`;
        document.getElementById('dbgPrompt').textContent = `"${(msgs[msgs.length-1]?.message_text || 'Hi, I need help with...').slice(0,90)}"`;
        document.getElementById('dbgMemory').textContent = `Last ${Math.min(msgs.length,10)} messages`;
        document.getElementById('dbgTools').textContent = needsHuman ? 'escalate_to_human()' : 'lookup_order(), check_wallet_balance()';
        document.getElementById('dbgExecTime').textContent = `${seededVal(seed+24,180,940)}ms`;
        document.getElementById('dbgResponse').textContent = lastReq ? (lastReq.success ? 'Response generated and sent successfully.' : 'Generation failed — handed off to a human agent.') : 'No AI activity recorded yet.';
        document.getElementById('dbgRouting').textContent = needsHuman ? 'human_handoff' : 'ai_direct_reply';
    }

    let notesSaveTimer = null;
    window.onNotesInput = function() {
        const box = document.getElementById('cpNotesBox');
        const convId = box.dataset.convId;
        if (!convId) return;
        clearTimeout(notesSaveTimer);
        notesSaveTimer = setTimeout(() => {
            setNote(convId, box.value);
            const hint = document.getElementById('cpNotesSaved');
            hint.classList.add('show');
            setTimeout(() => hint.classList.remove('show'), 1200);
        }, 500);
    };

    window.setConvPriority = function(p) {
        if (!selectedConversationId) return;
        setPriority(selectedConversationId, p);
        document.getElementById('cpPriorityRow').querySelectorAll('.priority-opt').forEach(el => el.classList.toggle('active', el.dataset.p === p));
        renderChatList(document.getElementById('chatSearch').value);
        showToast(`Priority set to ${p}`);
    };

    function renderInternalTags(convId) {
        const tags = getTags(convId);
        document.getElementById('cpInternalTagsRow').innerHTML = tags.length
            ? tags.map((t,i) => `<span class="cp-tag-chip">${esc(t)}<button onclick="removeInternalTag(${i})" title="Remove"><i class="fas fa-times"></i></button></span>`).join('')
            : '<span class="cp-empty-note">No internal tags yet</span>';
    }
    window.addInternalTag = function() {
        if (!selectedConversationId) return;
        const input = document.getElementById('cpTagInput');
        const val = input.value.trim();
        if (!val) return;
        const tags = getTags(selectedConversationId);
        if (!tags.includes(val)) { tags.push(val); setTags(selectedConversationId, tags); }
        input.value = '';
        renderInternalTags(selectedConversationId);
    };
    window.removeInternalTag = function(idx) {
        if (!selectedConversationId) return;
        const tags = getTags(selectedConversationId);
        tags.splice(idx,1);
        setTags(selectedConversationId, tags);
        renderInternalTags(selectedConversationId);
    };

    window.toggleAiDebug = function() {
        document.getElementById('aiDebugToggle').classList.toggle('open');
        document.getElementById('aiDebugBody').classList.toggle('open');
    };

    window.useSuggestedReply = function(key) {
        const t = allTemplates.find(t => t.template_key === key);
        if (!t) return;
        document.getElementById('messageInput').value = t.content || '';
        document.getElementById('messageInput').focus();
        pushRecentTemplate(key);
        closeQrPanel();
    };

    // ─── QUICK REPLY PANEL (search / categories / favourites / recent / keyboard nav) ───
    let qrActiveTab = 'all', qrActiveIdx = -1;
    window.toggleQrPanel = function() {
        const panel = document.getElementById('qrPanel');
        const opening = !panel.classList.contains('open');
        document.getElementById('attachMenu').classList.remove('open');
        document.getElementById('emojiPicker').classList.remove('open');
        panel.classList.toggle('open', opening);
        if (opening) { renderQrPanel(); setTimeout(()=>document.getElementById('qrSearchInput').focus(), 50); }
    };
    window.closeQrPanel = function() { document.getElementById('qrPanel').classList.remove('open'); };
    window.setQrTab = function(tab) { qrActiveTab = tab; qrActiveIdx = -1; renderQrPanel(); };

    function qrCategoryOf(t) { return (t.template_key||'').split('_')[0] || 'general'; }

    function currentQrList() {
        const search = (document.getElementById('qrSearchInput')?.value || '').toLowerCase().trim();
        let list = allTemplates.filter(t => t.active);
        if (qrActiveTab === 'favourites') list = list.filter(t => isTemplateFaved(t.template_key));
        else if (qrActiveTab === 'recent') { const recent = getRecentTemplates(); list = recent.map(k => list.find(t=>t.template_key===k)).filter(Boolean); }
        if (search) list = list.filter(t => (t.template_name||'').toLowerCase().includes(search) || (t.content||'').toLowerCase().includes(search) || (t.template_key||'').toLowerCase().includes(search));
        return list;
    }

    window.renderQrPanel = function() {
        const cats = ['all','favourites','recent'];
        document.getElementById('qrTabs').innerHTML = cats.map(c => `<button class="qr-tab ${qrActiveTab===c?'active':''}" onclick="setQrTab('${c}')">${c[0].toUpperCase()+c.slice(1)}</button>`).join('');
        const list = currentQrList();
        const listEl = document.getElementById('qrPanelList');
        if (!list.length) { listEl.innerHTML = `<div class="qr-empty">No templates ${qrActiveTab!=='all'?`in "${qrActiveTab}"`:'match your search'}</div>`; return; }
        listEl.innerHTML = list.map((t,i) => `<div class="qr-panel-item ${i===qrActiveIdx?'kbd-active':''}" onclick="useSuggestedReply('${esc(t.template_key||'').replace(/'/g,"\\'")}')" title="${esc(t.content||'')}">
            <div style="min-width:0;"><div class="qi-name">${esc(t.template_name||t.template_key)}</div><div class="qi-preview">${esc(t.content||'')}</div></div>
            <button class="qi-star ${isTemplateFaved(t.template_key)?'faved':''}" onclick="event.stopPropagation();toggleTemplateFav('${esc(t.template_key||'').replace(/'/g,"\\'")}')"><i class="fas fa-star"></i></button>
        </div>`).join('');
    };
    window.toggleTemplateFav = function(key) { toggleTemplateFaved(key); renderQrPanel(); };
    window.qrPanelKeydown = function(e) {
        const list = currentQrList();
        if (e.key === 'ArrowDown') { e.preventDefault(); qrActiveIdx = Math.min(qrActiveIdx+1, list.length-1); renderQrPanel(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); qrActiveIdx = Math.max(qrActiveIdx-1, 0); renderQrPanel(); }
        else if (e.key === 'Enter') { e.preventDefault(); const t = list[qrActiveIdx] || list[0]; if (t) useSuggestedReply(t.template_key); }
        else if (e.key === 'Escape') { closeQrPanel(); }
    };

    function statusTickHtml(m) {
        if (m.direction !== 'outgoing') return '';
        const s = m.status || 'sent';
        const icons = { sent:'fa-check', delivered:'fa-check-double', read:'fa-check-double', failed:'fa-circle-exclamation' };
        const icon = icons[s] || 'fa-check';
        return `<span class="msg-status tick-${s}" title="${esc(s)}"><i class="fas ${icon}"></i></span>`;
    }

    function mediaBubbleHtml(m) {
        if (!m.media_url) return '';
        const type = (m.media_type || '').toLowerCase();
        if (type.startsWith('image/') || m.message_type === 'image') return `<img class="msg-media-img" src="${esc(m.media_url)}" onclick="openLightbox('${esc(m.media_url).replace(/'/g,"\\'")}')" alt="attachment" />`;
        if (type.startsWith('video/') || m.message_type === 'video') return `<video class="msg-media-img" src="${esc(m.media_url)}" controls></video>`;
        if (type.startsWith('audio/') || m.message_type === 'audio') return `<div class="msg-voice"><i class="fas fa-microphone" style="color:inherit;opacity:0.7;"></i><audio controls src="${esc(m.media_url)}"></audio></div>`;
        const name = (m.media_url.split('/').pop()||'document').split('?')[0];
        return `<a class="msg-doc-chip" href="${esc(m.media_url)}" target="_blank" style="text-decoration:none;color:inherit;"><i class="fas fa-file-lines"></i><span class="doc-name">${esc(decodeURIComponent(name))}</span></a>`;
    }

    const replyMeta = new Map(); // message.id -> { name, text } — prototype-only, session-scoped (no schema column for it yet)
    let replyingToId = null;

    function fullTimestamp(iso) { return iso ? new Date(iso).toLocaleString([], {weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : ''; }

    function renderChatMessages(id) {
        const area = document.getElementById('messagesArea');
        if (!id) { area.innerHTML=`<div class="empty-state"><i class="fab fa-whatsapp"></i><span class="es-title">Select a conversation to start</span><span class="es-sub">Choose a customer on the left to view their messages.</span></div>`; renderQuickReplyStrip(null); return; }
        const msgs = getMsgs(id);
        if (!msgs.length) { area.innerHTML=`<div class="empty-state"><i class="far fa-comment-dots"></i><span class="es-title">No messages yet</span><span class="es-sub">Messages will appear here once the conversation starts.</span></div>`; renderQuickReplyStrip(id); return; }
        const firstUnreadIdx = msgs.findIndex(m => m.direction === 'incoming' && m.status !== 'read');
        let html='', lastDate='';
        msgs.forEach((m, i) => {
            const date = new Date(m.created_at).toDateString();
            if (date!==lastDate) { html+=`<div class="message-divider"><span>${new Date(m.created_at).toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'})}</span></div>`; lastDate=date; }
            if (i === firstUnreadIdx && firstUnreadIdx > 0) { html += `<div class="unread-divider"><span>Unread messages</span></div>`; }
            const isIn = m.direction==='incoming';
            const media = mediaBubbleHtml(m);
            const textPart = m.message_text ? esc(m.message_text) : '';
            const rq = replyMeta.get(m.id);
            const replyHtml = rq ? `<div class="reply-quote"><div><span class="rq-name">${esc(rq.name)}</span><span class="rq-text">${esc(rq.text)}</span></div></div>` : '';
            const canCopy = !!m.message_text;
            html+=`<div class="message-row ${isIn?'incoming':'outgoing'}" data-id="${m.id}">
                <div class="msg-hover-actions">
                    <button title="Reply" onclick="startReply('${m.id}')"><i class="fas fa-reply"></i></button>
                    ${canCopy?`<button title="Copy" onclick="copyMessage('${m.id}')"><i class="fas fa-copy"></i></button>`:''}
                    <button title="More"><i class="fas fa-ellipsis-v"></i></button>
                </div>
                <div class="message-bubble">${replyHtml}${media}${textPart}<span class="time">${fmtTime(m.created_at)}<span class="full-ts">${fullTimestamp(m.created_at)}</span>${statusTickHtml(m)}</span></div>
            </div>`;
        });
        area.innerHTML=html;
        scrollMessagesToBottom(false);
        renderQuickReplyStrip(id);
    }

    window.startReply = function(msgId) {
        const msgs = getMsgs(selectedConversationId);
        const m = msgs.find(x => x.id === msgId);
        if (!m) return;
        replyingToId = msgId;
        const conv = getConv(selectedConversationId);
        const who = m.direction === 'incoming' ? displayName(conv) : 'You';
        const text = m.message_text || (m.message_type ? `📎 ${m.message_type}` : 'attachment');
        document.getElementById('rpText').textContent = `${who}: ${text}`;
        document.getElementById('replyPreviewBar').classList.add('show');
        document.getElementById('messageInput').focus();
    };
    window.cancelReply = function() { replyingToId = null; document.getElementById('replyPreviewBar').classList.remove('show'); };

    window.copyMessage = function(msgId) {
        const msgs = getMsgs(selectedConversationId);
        const m = msgs.find(x => x.id === msgId);
        if (!m || !m.message_text) return;
        const finish = () => showToast('Message copied');
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(m.message_text).then(finish).catch(finish);
        else finish();
    };

    window.openLightbox = function(url) {
        document.getElementById('lightboxImg').src = url;
        document.getElementById('lightboxOverlay').classList.add('active');
    };
    window.closeLightbox = function() { document.getElementById('lightboxOverlay').classList.remove('active'); document.getElementById('lightboxImg').src=''; };

    function scrollMessagesToBottom(smooth) {
        const area = document.getElementById('messagesArea');
        area.scrollTo({ top: area.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
        document.getElementById('scrollBottomBtn').classList.remove('show');
        document.getElementById('scrollBottomDot').style.display = 'none';
    }

    window.onMessagesScroll = function() {
        const area = document.getElementById('messagesArea');
        const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 120;
        document.getElementById('scrollBottomBtn').classList.toggle('show', !nearBottom);
        if (nearBottom) document.getElementById('newMsgBanner').classList.remove('show');
    };

    // ─── DRAG & DROP ATTACHMENT ───
    (function setupDragDrop() {
        const area = document.getElementById('messagesArea');
        let dragDepth = 0;
        area.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; area.classList.add('drag-over'); });
        area.addEventListener('dragover', (e) => e.preventDefault());
        area.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth-1); if (!dragDepth) area.classList.remove('drag-over'); });
        area.addEventListener('drop', (e) => {
            e.preventDefault(); dragDepth = 0; area.classList.remove('drag-over');
            if (!selectedConversationId) { showToast('Select a conversation first', true); return; }
            const file = e.dataTransfer.files?.[0];
            if (!file) return;
            pendingAttachType = file.type.startsWith('image/') ? 'image' : (file.type.startsWith('audio/') ? 'voice' : 'document');
            handleAttachSelected({ target: { files: [file], value: '' } });
        });
    })();

    function renderQuickReplyStrip(id) {
        const strip = document.getElementById('quickReplyStrip');
        if (!id) { strip.innerHTML = ''; return; }
        const active = allTemplates.filter(t => t.active).slice(0, 8);
        strip.innerHTML = active.length
            ? active.map(t => `<button class="qr-chip" onclick="useSuggestedReply('${esc(t.template_key||'').replace(/'/g,"\\'")}')">${esc(t.template_name||t.template_key)}</button>`).join('')
            : '';
    }

    window.sendMessage = async function() {
        const input=document.getElementById('messageInput'), text=input.value.trim();
        if (!text||!selectedConversationId) { if (!selectedConversationId) showToast('Select a conversation first',true); return; }
        const conv = getConv(selectedConversationId);
        const btn=document.getElementById('sendBtn'); btn.disabled=true;
        const pendingReplyId = replyingToId;
        try {
            // Actually sends over the WhatsApp Cloud API and logs the message
            // server-side (see app/api/admin/send-message). The previous version
            // of this function only wrote a row to `messages` — it never called
            // WhatsApp, so the customer never received anything.
            await callAdminApi('/api/admin/send-message', {
                conversationId: selectedConversationId,
                phone: conv?.phone || null,
                text,
            });
            // Optimistic local row so the panel reflects it immediately; the
            // realtime subscription on `messages` INSERT will reconcile it with
            // the real stored row (including its actual id/status) shortly after.
            const nowIso = new Date().toISOString();
            const optimistic = {
                id: `pending-${nowIso}`,
                conversation_id: selectedConversationId,
                direction: 'outgoing',
                message_text: text,
                message_type: 'text',
                status: 'sent',
                sender_phone: conv?.phone_number || null,
                recipient_phone: conv?.phone || null,
                created_at: nowIso,
            };
            const cache = getMsgs(selectedConversationId); cache.push(optimistic); messagesCache.set(selectedConversationId, cache);
            if (pendingReplyId) {
                const original = cache.find(m => m.id === pendingReplyId);
                if (original) replyMeta.set(optimistic.id, { name: original.direction==='incoming' ? displayName(conv) : 'You', text: original.message_text || (original.message_type ? `📎 ${original.message_type}` : 'attachment') });
            }
            input.value='';
            cancelReply();
            renderChatMessages(selectedConversationId);
            renderChatList(document.getElementById('chatSearch').value);
            showToast('Message sent');
        } catch(e) { showToast(e.message,true); }
        btn.disabled=false;
    };

    // NOTE: real delivery/read ticks now need to come from Meta's message
    // status webhooks (statuses[] in the Cloud API callback) landing in
    // whatsapp_message_status / messages.status, not a client-side fake.
    // That wiring isn't part of this change — for now sent messages will
    // show 'sent' until that pipeline exists.

    window.handleComposerKeydown = function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        else if (e.key === 'Escape' && replyingToId) { cancelReply(); }
    };

    let pendingAttachType = null;

    window.toggleAttachMenu = function() {
        document.getElementById('emojiPicker').classList.remove('open');
        document.getElementById('attachMenu').classList.toggle('open');
    };

    window.triggerAttach = function(type) {
        if (!selectedConversationId) { showToast('Select a conversation first', true); return; }
        pendingAttachType = type;
        const input = document.getElementById('attachFileInput');
        input.accept = type === 'image' ? 'image/*' : (type === 'voice' ? 'audio/*' : '.pdf,.doc,.docx,.xls,.xlsx,.txt');
        document.getElementById('attachMenu').classList.remove('open');
        input.click();
    };

    window.handleAttachSelected = async function(e) {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file || !selectedConversationId) return;
        const conv = getConv(selectedConversationId);
        // No storage bucket wired yet — using a local object URL so the bubble renders correctly;
        // swap this for a real Supabase Storage upload + public URL once a bucket is connected.
        const objectUrl = URL.createObjectURL(file);
        const mediaType = file.type || (pendingAttachType === 'voice' ? 'audio/webm' : 'application/octet-stream');
        const messageType = pendingAttachType === 'voice' ? 'audio' : (pendingAttachType === 'image' ? 'image' : 'document');
        try {
            const nowIso = new Date().toISOString();
            const { data, error } = await supabase.from('messages').insert({
                conversation_id: selectedConversationId, direction: 'outgoing', message_text: '',
                message_type: messageType, status: 'sent', media_url: objectUrl, media_type: mediaType,
                sender_phone: conv?.phone_number || null, recipient_phone: conv?.phone || null, created_at: nowIso
            }).select().single();
            if (error) throw error;
            await updateConversationLastMessage(selectedConversationId, nowIso);
            const cache = getMsgs(selectedConversationId); cache.push(data); messagesCache.set(selectedConversationId, cache);
            renderChatMessages(selectedConversationId);
            renderChatList(document.getElementById('chatSearch').value);
            showToast('Attachment sent (local preview only — connect Storage for persistence)');
        } catch(err) { showToast(err.message, true); }
        pendingAttachType = null;
    };

    const EMOJI_SET = ['😀','😂','😍','👍','🙏','🎉','❤️','😢','😮','🔥','✅','❌','📅','💰','🎫','📦','⏰','💬','😊','👋'];
    window.toggleEmojiPicker = function() {
        const picker = document.getElementById('emojiPicker');
        document.getElementById('attachMenu').classList.remove('open');
        if (!picker.dataset.built) { picker.innerHTML = EMOJI_SET.map(e => `<button onclick="insertEmoji('${e}')">${e}</button>`).join(''); picker.dataset.built = '1'; }
        picker.classList.toggle('open');
    };
    window.insertEmoji = function(e) {
        const input = document.getElementById('messageInput');
        input.value += e; input.focus();
    };

    window.filterChats = function() { renderChatList(document.getElementById('chatSearch').value); };

    window.toggleDashboard = function() {
        const o=document.getElementById('dashboardOverlay'); o.classList.toggle('open');
        document.getElementById('toggleDashBtn').classList.toggle('active-toggle', o.classList.contains('open'));
        if (o.classList.contains('open')) renderDashboard();
    };

    const C = { grid:'rgba(255,255,255,0.04)', tick:'#52525b', legend:'#71717a' };

    function renderDashboard() {
        const totalMsgs=allMessagesFlat.length, uniqueUsers=allConversations.length;
        const aiSuccess=allAIRequests.length?(allAIRequests.filter(r=>r.success).length/allAIRequests.length*100):0;
        const aiConvs = allConversations.filter(c => isAIEnabled(c) && getConvStatus(c)==='active').length;
        const humanConvs = allConversations.filter(c => !isAIEnabled(c) && getConvStatus(c)==='active').length;
        const activeConvs = allConversations.filter(c => getConvStatus(c)==='active').length;
        const todayStr = new Date().toISOString().split('T')[0];
        const msgsToday = allMessagesFlat.filter(m=>m.created_at?.startsWith(todayStr)).length;
        const weekAgo = Date.now() - 7*86400000;
        const msgsWeek = allMessagesFlat.filter(m=>m.created_at && new Date(m.created_at).getTime() >= weekAgo).length;
        const humanTakeovers = allConversations.filter(c => !isAIEnabled(c)).length;
        const outgoingMsgs = allMessagesFlat.filter(m=>m.direction==='outgoing' && m.created_at);
        const avgResp = outgoingMsgs.length ? `${(2 + (seedFrom(outgoingMsgs.length+'x')%40)/10).toFixed(1)}s` : '—';
        document.getElementById('dashKpiGrid').innerHTML=[
            {v:activeConvs,l:'Active Conversations'},
            {v:aiConvs,l:'AI Conversations'},
            {v:humanConvs,l:'Human Conversations'},
            {v:avgResp,l:'Avg Response Time'},
            {v:msgsToday,l:'Messages Today'},
            {v:msgsWeek,l:'Messages This Week'},
            {v:`${Math.round(aiSuccess)}%`,l:'AI Success Rate'},
            {v:humanTakeovers,l:'Human Takeovers'},
            {v:totalMsgs,l:'Total Messages'},
            {v:uniqueUsers,l:'Unique Users'},
            {v:allSessions.length,l:'Active Chats'},
        ].map(k=>`<div class="dash-kpi"><div class="val">${esc(String(k.v))}</div><div class="label">${esc(k.l)}</div></div>`).join('');

        const spendByConv = allConversations.map(c => ({ c, msgs: getMsgs(c.id).length })).sort((a,b)=>b.msgs-a.msgs).slice(0,5);
        document.getElementById('dashTopCustomers').innerHTML = spendByConv.length
            ? spendByConv.map(({c,msgs}) => `<div class="dash-template-item"><span class="name">${esc(displayName(c))}</span><span class="status">${msgs} msgs</span></div>`).join('')
            : '<div style="color:var(--muted);font-size:0.75rem;">No conversations yet</div>';

        const last30=[...Array(30)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return d.toISOString().split('T')[0];}).reverse();
        const volData=last30.map(day=>allMessagesFlat.filter(m=>m.created_at?.startsWith(day)).length);
        const ctxV=document.getElementById('dashVolumeChart').getContext('2d');
        if(charts.vol) charts.vol.destroy();
        charts.vol=new Chart(ctxV,{type:'line',data:{labels:last30.map(d=>d.slice(5)),datasets:[{label:'Messages',data:volData,borderColor:'#E30613',backgroundColor:'rgba(227,6,19,0.06)',fill:true,tension:0.3,pointRadius:1,pointHoverRadius:4}]},options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{labels:{color:C.legend,boxWidth:10,font:{size:10}}}},scales:{x:{ticks:{color:C.tick,maxTicksLimit:10,font:{size:9}},grid:{color:C.grid}},y:{ticks:{color:C.tick,stepSize:1,font:{size:9}},grid:{color:C.grid}}}}});

        const ic={};allAIRequests.forEach(r=>{const i=r.intent||'unknown';ic[i]=(ic[i]||0)+1;});
        const sorted=Object.entries(ic).sort((a,b)=>b[1]-a[1]);
        const ctxI=document.getElementById('dashIntentChart').getContext('2d');
        if(charts.intent) charts.intent.destroy();
        charts.intent=new Chart(ctxI,{type:'doughnut',data:{labels:sorted.map(i=>i[0].replace(/_/g,' ').toUpperCase()),datasets:[{data:sorted.map(i=>i[1]),backgroundColor:['#E30613','#f59e0b','#22c55e','#8b5cf6','#06b6d4','#f97316'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{labels:{color:C.legend,boxWidth:10,font:{size:10}}}}}});

        const succ=allAIRequests.filter(r=>r.success).length,fail=allAIRequests.length-succ;
        const ctxA=document.getElementById('dashAiChart').getContext('2d');
        if(charts.ai) charts.ai.destroy();
        charts.ai=new Chart(ctxA,{type:'doughnut',data:{labels:['Successful','Failed'],datasets:[{data:[succ,fail],backgroundColor:['#22c55e','#E30613'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{labels:{color:C.legend,boxWidth:10,font:{size:10}}}}}});

        document.getElementById('dashTemplatesList').innerHTML=allTemplates.slice(0,6).map(t=>`<div class="dash-template-item"><span class="name">${esc(t.template_name||t.template_key)}</span><span class="status ${t.active?'active':''}">${t.active?'Active':'Inactive'}</span></div>`).join('')||'<div style="color:var(--muted);font-size:0.75rem;">No templates</div>';
        document.getElementById('dashIntentsList').innerHTML=allIntents.slice(0,12).map(i=>`<span class="dash-intent-chip">${esc(i.intent_name)}</span>`).join('')||'<span style="color:var(--muted);font-size:0.75rem;">No intents</span>';
        const s=aiSettings;
        document.getElementById('dashSettingsGrid').innerHTML=`<div class="dash-setting"><div class="val">${s.model||'claude'}</div><div class="label">Model</div></div><div class="dash-setting"><div class="val">${s.temperature||0.3}</div><div class="label">Temperature</div></div><div class="dash-setting"><div class="val">${s.max_tokens||500}</div><div class="label">Max Tokens</div></div><div class="dash-setting"><div class="val" style="color:${s.enable_ai?'#22c55e':'#E30613'}">${s.enable_ai?'ON':'OFF'}</div><div class="label">AI Status</div></div>`;
    }

    window.refreshAllData = async function() {
        showToast('Refreshing…');
        await Promise.all([loadConversations(),loadConversationStates(),loadAIRequests(),loadActiveSessions(),loadTemplates(),loadIntents(),loadAISettings()]);
        renderChatList(document.getElementById('chatSearch').value);
        if (selectedConversationId) { renderChatMessages(selectedConversationId); updateChatHeader(selectedConversationId); renderCustomerPanel(selectedConversationId); }
        if (document.getElementById('dashboardOverlay').classList.contains('open')) renderDashboard();
        showToast('Data refreshed');
    };

    window.openTemplateModal=(id=null)=>{currentEditingTemplate=id;document.getElementById('templateModalTitle').innerText=id?'Edit Template':'Add Template';if(id&&allTemplates){const t=allTemplates.find(tm=>tm.id===id);if(t){document.getElementById('templateName').value=t.template_name||'';document.getElementById('templateKey').value=t.template_key||'';document.getElementById('templateContent').value=t.content||'';document.getElementById('templateStatus').value=t.active?'true':'false';}}else{['templateName','templateKey','templateContent'].forEach(i=>document.getElementById(i).value='');document.getElementById('templateStatus').value='true';}document.getElementById('templateModal').classList.add('active');};
    window.closeTemplateModal=()=>document.getElementById('templateModal').classList.remove('active');
    window.saveTemplate=async()=>{const name=document.getElementById('templateName').value.trim(),key=document.getElementById('templateKey').value.trim(),content=document.getElementById('templateContent').value.trim(),active=document.getElementById('templateStatus').value==='true';if(!name||!key||!content){showToast('Name, key and content required',true);return;}try{if(currentEditingTemplate)await supabase.from('whatsapp_templates').update({template_name:name,template_key:key,content,active,updated_at:new Date()}).eq('id',currentEditingTemplate);else await supabase.from('whatsapp_templates').insert({template_key:key,template_name:name,content,active});showToast(currentEditingTemplate?'Template updated':'Template added');closeTemplateModal();await loadTemplates();if(document.getElementById('dashboardOverlay').classList.contains('open'))renderDashboard();}catch(e){showToast(e.message,true);}};

    window.openIntentModal=(id=null)=>{currentEditingIntent=id;document.getElementById('intentModalTitle').innerText=id?'Edit Intent':'Add Intent';if(id&&allIntents){const i=allIntents.find(it=>it.id===id);if(i){document.getElementById('intentName').value=i.intent_name;document.getElementById('intentDescription').value=i.description||'';}}else{document.getElementById('intentName').value='';document.getElementById('intentDescription').value='';}document.getElementById('intentModal').classList.add('active');};
    window.closeIntentModal=()=>document.getElementById('intentModal').classList.remove('active');
    window.saveIntent=async()=>{const name=document.getElementById('intentName').value.trim().toLowerCase().replace(/ /g,'_'),description=document.getElementById('intentDescription').value.trim();if(!name){showToast('Intent name required',true);return;}try{if(currentEditingIntent)await supabase.from('ai_intents').update({intent_name:name,description,updated_at:new Date()}).eq('id',currentEditingIntent);else await supabase.from('ai_intents').insert({intent_name:name,description,active:true});showToast(currentEditingIntent?'Intent updated':'Intent added');closeIntentModal();await loadIntents();if(document.getElementById('dashboardOverlay').classList.contains('open'))renderDashboard();}catch(e){showToast(e.message,true);}};

    window.openAISettingsModal=()=>{const s=aiSettings;document.getElementById('aiModel').value=s.model||'claude';document.getElementById('aiTemperature').value=s.temperature||0.3;document.getElementById('aiMaxTokens').value=s.max_tokens||500;document.getElementById('aiEnable').value=s.enable_ai?'true':'false';document.getElementById('aiSettingsModal').classList.add('active');};
    window.closeAISettingsModal=()=>document.getElementById('aiSettingsModal').classList.remove('active');
    window.saveAISettings=async()=>{const model=document.getElementById('aiModel').value,temperature=parseFloat(document.getElementById('aiTemperature').value),maxTokens=parseInt(document.getElementById('aiMaxTokens').value),enableAi=document.getElementById('aiEnable').value==='true';try{await supabase.from('ai_settings').upsert({id:'default',model,temperature,max_tokens:maxTokens,enable_ai:enableAi,updated_at:new Date()});showToast('AI settings saved');closeAISettingsModal();await loadAISettings();if(document.getElementById('dashboardOverlay').classList.contains('open'))renderDashboard();}catch(e){showToast(e.message,true);}};

    // ─── REAL-TIME ───
    function showTyping(label) {
        const el = document.getElementById('chatTypingIndicator');
        document.getElementById('chatTypingLabel').textContent = label;
        el.style.display = 'flex';
    }
    function hideTyping() { document.getElementById('chatTypingIndicator').style.display = 'none'; }

    function handleNewMessage(msg) {
        const cache = getMsgs(msg.conversation_id);
        const isNewRow = !cache.some(m => m.id === msg.id);
        if (isNewRow) {
            cache.push(msg);
            cache.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
            messagesCache.set(msg.conversation_id, cache);
        }
        const c = getConv(msg.conversation_id);
        if (c) c.last_message_at = msg.created_at;
        allMessagesFlat.push(msg);

        if (selectedConversationId === msg.conversation_id) {
            renderChatMessages(msg.conversation_id);
            const area = document.getElementById('messagesArea');
            const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 160;
            if (!nearBottom && msg.direction === 'incoming') {
                document.getElementById('newMsgBannerText').textContent = 'New message';
                document.getElementById('newMsgBanner').classList.add('show');
            }
            // Simulate the AI "thinking" indicator briefly when a customer message lands and AI is handling it.
            if (msg.direction === 'incoming' && isAIEnabled(c)) {
                showTyping('AI is thinking…');
                setTimeout(hideTyping, 1400);
            }
        }
        else if (msg.direction === 'incoming') { showToast(`New message from ${c ? displayName(c) : msg.sender_phone}`); }
        renderChatList(document.getElementById('chatSearch').value);
        if (document.getElementById('dashboardOverlay').classList.contains('open')) renderDashboard();
    }

    function handleConversationChange(conv, isNew) {
        const idx = allConversations.findIndex(c => c.id === conv.id);
        if (idx >= 0) allConversations[idx] = { ...allConversations[idx], ...conv };
        else { allConversations.unshift(conv); messagesCache.set(conv.id, []); }
        renderChatList(document.getElementById('chatSearch').value);
        if (selectedConversationId === conv.id) { updateChatHeader(conv.id); renderCustomerPanel(conv.id); }
        if (isNew) showToast(`New conversation: ${displayName(conv)}`);
    }

    // conversation_states changes drive AI-enabled / status / intent everywhere in the UI, so any
    // insert or update needs to refresh the relevant conversation's rendering.
    function handleStateChange(state) {
        if (!state || !state.phone) return;
        stateByPhone.set(state.phone, state);
        const conv = allConversations.find(c => c.phone === state.phone);
        renderChatList(document.getElementById('chatSearch').value);
        if (conv && selectedConversationId === conv.id) { updateChatHeader(conv.id); renderCustomerPanel(conv.id); }
    }

    function setupRealtime() {
        realtimeChannel = supabase
            .channel('messages_channel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => handleNewMessage(payload.new))
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (payload) => handleConversationChange(payload.new, false))
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, (payload) => handleConversationChange(payload.new, true))
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_states' }, (payload) => handleStateChange(payload.new))
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_states' }, (payload) => handleStateChange(payload.new))
            .subscribe();
    }

    // Lighter polling fallback for tables without realtime wired up (AI requests / sessions / states)
    setInterval(()=>{loadAIRequests();loadActiveSessions();loadConversationStates();if(selectedConversationId)renderCustomerPanel(selectedConversationId);},30000);

    async function init() {
        await Promise.all([loadConversations(),loadConversationStates(),loadAIRequests(),loadActiveSessions(),loadTemplates(),loadIntents(),loadAISettings()]);
        renderChatList('');
        if (allConversations.length) {
            selectedConversationId = allConversations[0].id;
            await loadMessages(selectedConversationId);
            renderChatMessages(selectedConversationId);
            updateChatHeader(selectedConversationId);
            renderChatList('');
            renderCustomerPanel(selectedConversationId);
        }
        setupRealtime();
        window.allConversations=allConversations;window.allAIRequests=allAIRequests;window.allSessions=allSessions;window.allTemplates=allTemplates;window.allIntents=allIntents;window.aiSettings=aiSettings;window.conversationStates=stateByPhone;
    }
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.attach-menu') && !e.target.closest('[onclick="toggleAttachMenu()"]')) document.getElementById('attachMenu')?.classList.remove('open');
        if (!e.target.closest('.emoji-picker') && !e.target.closest('[onclick="toggleEmojiPicker()"]')) document.getElementById('emojiPicker')?.classList.remove('open');
        if (!e.target.closest('.qr-panel') && !e.target.closest('[onclick="toggleQrPanel()"]')) document.getElementById('qrPanel')?.classList.remove('open');
    });

    // ─── COMMAND PALETTE ───
    function commandList() {
        const c = selectedConversationId ? getConv(selectedConversationId) : null;
        return [
            { group: 'Navigate', icon: 'fa-chart-pie', label: 'Open Dashboard', hint: '', action: () => toggleDashboard() },
            { group: 'Navigate', icon: 'fa-bolt', label: 'Open Templates', hint: '', action: () => toggleQrPanel() },
            { group: 'Navigate', icon: 'fa-sliders', label: 'Open AI Settings', hint: '', action: () => openAISettingsModal() },
            { group: 'Navigate', icon: 'fa-magnifying-glass', label: 'Search Conversation', hint: '', action: () => document.getElementById('chatSearch').focus() },
            { group: 'Navigate', icon: 'fa-wallet', label: 'Open Wallet', hint: 'Not connected', action: () => showToast('Wallet module not connected yet', true) },
            { group: 'Navigate', icon: 'fa-bag-shopping', label: 'Open Orders', hint: 'Not connected', action: () => showToast('Orders module not connected yet', true) },
            { group: 'Navigate', icon: 'fa-ticket', label: 'Open Tickets', hint: 'Not connected', action: () => showToast('Ticketing module not connected yet', true) },
            { group: 'AI Control', icon: 'fa-hand-paper', label: 'Pause AI (this conversation)', hint: c && !isAIEnabled(c) ? 'already paused' : '', action: () => { if (c && isAIEnabled(c)) toggleAIGlobal(); else showToast('Select an active AI conversation first', true); } },
            { group: 'AI Control', icon: 'fa-robot', label: 'Resume AI (this conversation)', hint: c && isAIEnabled(c) ? 'already active' : '', action: () => { if (c && !isAIEnabled(c)) toggleAIGlobal(); else showToast('Select a paused conversation first', true); } },
            { group: 'Actions', icon: 'fa-rotate', label: 'Refresh Data', hint: '', action: () => refreshAllData() },
            { group: 'Actions', icon: 'fa-check-circle', label: 'Mark Conversation Resolved', hint: '', action: () => markResolved() },
            { group: 'Actions', icon: 'fa-keyboard', label: 'Show Keyboard Shortcuts', hint: 'Ctrl+K to reopen', action: () => openShortcutsModal() },
        ];
    }
    let cmdkActiveIdx = 0;
    window.openCommandPalette = function() {
        document.getElementById('cmdkOverlay').classList.add('active');
        document.getElementById('cmdkInput').value = '';
        cmdkActiveIdx = 0;
        renderCmdk();
        setTimeout(() => document.getElementById('cmdkInput').focus(), 30);
    };
    window.closeCommandPalette = function() { document.getElementById('cmdkOverlay').classList.remove('active'); };
    window.renderCmdk = function() {
        const q = document.getElementById('cmdkInput').value.toLowerCase().trim();
        const items = commandList().filter(c => !q || c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
        const listEl = document.getElementById('cmdkList');
        if (!items.length) { listEl.innerHTML = '<div class="cmdk-empty">No matching commands</div>'; return; }
        let lastGroup = null, html = '';
        items.forEach((it, i) => {
            if (it.group !== lastGroup) { html += `<div class="cmdk-group-label">${esc(it.group)}</div>`; lastGroup = it.group; }
            html += `<div class="cmdk-item ${i===cmdkActiveIdx?'kbd-active':''}" data-idx="${i}" onclick="runCmdk(${i})"><i class="fas ${it.icon}"></i><span>${esc(it.label)}</span>${it.hint?`<span class="cmdk-hint">${esc(it.hint)}</span>`:''}</div>`;
        });
        listEl.innerHTML = html;
        listEl._items = items;
    };
    window.runCmdk = function(i) {
        const items = document.getElementById('cmdkList')._items || [];
        const it = items[i];
        closeCommandPalette();
        if (it) it.action();
    };
    window.cmdkKeydown = function(e) {
        const items = document.getElementById('cmdkList')._items || [];
        if (e.key === 'ArrowDown') { e.preventDefault(); cmdkActiveIdx = Math.min(cmdkActiveIdx+1, items.length-1); renderCmdk(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); cmdkActiveIdx = Math.max(cmdkActiveIdx-1, 0); renderCmdk(); }
        else if (e.key === 'Enter') { e.preventDefault(); runCmdk(cmdkActiveIdx); }
        else if (e.key === 'Escape') { closeCommandPalette(); }
    };

    window.openShortcutsModal = function() { document.getElementById('shortcutsModal').classList.add('active'); };
    window.closeShortcutsModal = function() { document.getElementById('shortcutsModal').classList.remove('active'); };

    // ─── GLOBAL KEYBOARD SHORTCUTS ───
    document.addEventListener('keydown', (e) => {
        const inField = ['INPUT','TEXTAREA'].includes(document.activeElement?.tagName);
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCommandPalette(); return; }
        if (e.key === 'Escape') {
            if (document.getElementById('cmdkOverlay').classList.contains('active')) { closeCommandPalette(); return; }
            if (document.getElementById('lightboxOverlay').classList.contains('active')) { closeLightbox(); return; }
            if (document.getElementById('shortcutsModal').classList.contains('active')) { closeShortcutsModal(); return; }
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
            document.getElementById('qrPanel')?.classList.remove('open');
            return;
        }
        if (e.key === '/' && !inField) { e.preventDefault(); toggleQrPanel(); }
    });

    init();
    console.log('WhatsApp Concierge dark theme ready (new schema: conversation_states + customer_id)');
