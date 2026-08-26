  import { supabase } from '../../config/supabase.js';

  // ═══════════════════════════════════════════
  //  TOAST
  // ═══════════════════════════════════════════
  const toastEl = document.getElementById('toast');
  function toast(msg, type = 'ok') {
    toastEl.innerHTML = `<i class="fas fa-${type === 'ok' ? 'check-circle' : 'exclamation-circle'}"></i> ${msg}`;
    toastEl.className = `toast ${type} show`;
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 3500);
  }

  function esc(str) { if (!str) return ''; return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
  function fmt(n) { if (n == null) return '—'; return Number(n).toLocaleString('en-ZA'); }
  function fmtR(v) { if (v == null) return '—'; return 'R' + Number(v).toFixed(2); }

  // ═══════════════════════════════════════════
  //  TABLE CHECK
  // ═══════════════════════════════════════════
  const tableExists = {};
  async function checkTable(name) {
    if (tableExists[name] !== undefined) return tableExists[name];
    try {
      const { error } = await supabase.from(name).select('id').limit(1);
      tableExists[name] = !error || error.code !== '42P01';
    } catch { tableExists[name] = false; }
    return tableExists[name];
  }

  // ═══════════════════════════════════════════
  //  NAVIGATION
  // ═══════════════════════════════════════════
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  const pageTitles = { slides:'Slides', preview:'Preview', campaigns:'Campaigns', tiers:'Tiers' };
  const pageSubs = { slides:'Manage kiosk slides', preview:'Live kiosk simulation', campaigns:'Advertiser campaigns', tiers:'Pricing tiers' };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      const pg = document.getElementById('page-' + item.dataset.page);
      if (pg) pg.classList.add('active');
      document.getElementById('pageTitle').textContent = pageTitles[item.dataset.page] || item.dataset.page;
      document.getElementById('pageSub').textContent = pageSubs[item.dataset.page] || '';
      if (item.dataset.page === 'campaigns') loadCampaigns();
      if (item.dataset.page === 'tiers') loadTiers();
      closeSidebar();
    });
  });

  // Sidebar: hover-to-expand on desktop, slide-out drawer on mobile
  const sidebarEl = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  function openSidebar() { sidebarEl.classList.add('open'); sidebarBackdrop.classList.add('show'); }
  function closeSidebar() { sidebarEl.classList.remove('open'); sidebarBackdrop.classList.remove('show'); }
  document.getElementById('menuToggleBtn')?.addEventListener('click', () => {
    sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  sidebarBackdrop?.addEventListener('click', closeSidebar);

  // ═══════════════════════════════════════════
  //  STORAGE BUCKET
  // ═══════════════════════════════════════════
  const BUCKET = 'kiosk-images';
  async function ensureBucket() {
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      const exists = buckets?.some(b => b.name === BUCKET);
      if (!exists) {
        await supabase.storage.createBucket(BUCKET, {
          public: true,
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
          fileSizeLimit: 5242880
        });
      }
    } catch {}
  }
  async function uploadFile(file, headline) {
    const ext = file.name.split('.').pop();
    const safe = (headline || 'slide').replace(/[^a-z0-9]/gi, '-').toLowerCase().substring(0, 40);
    const path = `kiosk/${Date.now()}-${safe}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return publicUrl;
  }

  // ═══════════════════════════════════════════
  //  MEDIA TYPE
  // ═══════════════════════════════════════════
  let currentMediaType = 'image';
  window.setMediaType = function(type) {
    currentMediaType = type;
    document.getElementById('mediaTypeImg').classList.toggle('active', type === 'image');
    document.getElementById('mediaTypeVid').classList.toggle('active', type === 'video');
    document.getElementById('imageUrlGroup').style.display = type === 'image' ? '' : 'none';
    document.getElementById('videoUrlGroup').style.display = type === 'video' ? '' : 'none';
    document.getElementById('durationGroup').style.display = type === 'image' ? '' : 'none';
  };

  // ═══════════════════════════════════════════
  //  SLIDES
  // ═══════════════════════════════════════════
  let allSlides = [];
  let campaigns = [];
  let editSlideId = null;
  let deleteTarget = null;

  // Effective CPM fallback chain, mirrors the DB function get_effective_cpm():
  // slide.cpm_rate -> slide.tier -> campaign.cpm_rate -> campaign.tier -> 0
  function effectiveCpm(s) {
    if (s.cpm_rate && s.cpm_rate > 0) return parseFloat(s.cpm_rate);
    if (s.tier_id) {
      const tier = allTiers.find(t => t.id === s.tier_id);
      if (tier?.cpm_rate && tier.cpm_rate > 0) return parseFloat(tier.cpm_rate);
    }
    if (s.campaign_id) {
      const camp = campaigns.find(c => c.id === s.campaign_id);
      if (camp?.cpm_rate && camp.cpm_rate > 0) return parseFloat(camp.cpm_rate);
      if (camp?.tier_id) {
        const ctier = allTiers.find(t => t.id === camp.tier_id);
        if (ctier?.cpm_rate && ctier.cpm_rate > 0) return parseFloat(ctier.cpm_rate);
      }
    }
    return 0;
  }

  async function loadSlides() {
    const { data, error } = await supabase.from('kiosk_idle_ads').select('*').order('display_order', { ascending: true });
    if (error) { toast('Error loading slides', 'err'); return []; }
    return data || [];
  }

  async function renderSlides(filter = '') {
    allSlides = await loadSlides();
    const tbody = document.getElementById('slidesTbody');
    let slides = allSlides;
    if (filter) {
      const q = filter.toLowerCase();
      slides = slides.filter(s => (s.headline || '').toLowerCase().includes(q) || (s.tagline || '').toLowerCase().includes(q));
    }

    document.getElementById('statTotal').textContent = allSlides.length;
    document.getElementById('statActive').textContent = allSlides.filter(s => s.is_active).length;
    document.getElementById('statVideo').textContent = allSlides.filter(s => s.media_type === 'video' || s.video_url).length;
    document.getElementById('statImage').textContent = allSlides.filter(s => s.media_type !== 'video' && !s.video_url).length;
    document.getElementById('slideCount').textContent = `${allSlides.length} slides`;

    // Load impressions and calculate revenue
    let impCounts = {};
    const hasImps = await checkTable('kiosk_ad_impressions');
    if (hasImps) {
      const { data: impData } = await supabase.from('kiosk_ad_impressions').select('ad_id');
      (impData || []).forEach(i => { impCounts[i.ad_id] = (impCounts[i.ad_id] || 0) + 1; });
    }

    let totalRevenue = 0;
    allSlides.forEach(s => {
      const cpm = effectiveCpm(s);
      const cnt = impCounts[s.id] || 0;
      totalRevenue += (cnt / 1000) * cpm;
    });
    document.getElementById('statRevenue').textContent = fmtR(totalRevenue);

    if (!slides.length) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fas fa-images"></i><p>${filter ? 'No slides match your search.' : 'No slides yet. Add your first slide!'}</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = slides.map((s, i) => {
      const isVid = s.media_type === 'video' || !!s.video_url;
      const mediaThumb = isVid
        ? `<div class="thumb-video" title="${esc(s.video_url)}"><i class="fas fa-play"></i></div>`
        : (s.image_url ? `<img class="thumb" src="${esc(s.image_url)}" onclick="window.open('${esc(s.image_url)}')">` : '—');
      const isActive = !!s.is_active;

      // CPM display with effective rate fallback (slide -> tier -> campaign -> campaign tier)
      let cpmDisplay = '—';
      if (s.cpm_rate && s.cpm_rate > 0) {
        cpmDisplay = `<span style="color:var(--green);font-weight:600;">${fmtR(s.cpm_rate)}</span>`;
      } else {
        const eff = effectiveCpm(s);
        if (eff > 0) {
          const src = s.tier_id ? '(tier)' : '(campaign)';
          cpmDisplay = `<span style="color:var(--muted);font-size:0.68rem;">${fmtR(eff)} <span style="opacity:0.6;">${src}</span></span>`;
        }
      }

      return `<tr data-id="${s.id}">
        <td>
          <div class="order-ctrl">
            <button class="order-btn" data-dir="up" data-id="${s.id}" data-order="${s.display_order}" ${i === 0 ? 'disabled' : ''}>↑</button>
            <span style="min-width:20px;text-align:center;font-size:0.75rem;font-weight:700;">${s.display_order}</span>
            <button class="order-btn" data-dir="down" data-id="${s.id}" data-order="${s.display_order}" ${i === slides.length - 1 ? 'disabled' : ''}>↓</button>
          </div>
        </td>
        <td><span class="badge ${s.slide_type === 'venue' ? 'badge-venue' : 'badge-sponsor'}">${s.slide_type === 'venue' ? 'Venue' : 'Sponsor'}</span></td>
        <td><strong>${esc(s.headline)}</strong>${s.tagline ? `<br><span class="text-muted" style="font-size:0.65rem;">${esc(s.tagline)}</span>` : ''}</td>
        <td>${mediaThumb} <span class="badge ${isVid ? 'badge-video' : 'badge-image'}" style="margin-left:4px;">${isVid ? '▶ Video' : '🖼 Image'}</span></td>
        <td>${isVid ? '<span class="text-muted">Auto</span>' : `${s.duration_seconds || 60}s`}</td>
        <td>${cpmDisplay}</td>
        <td><span class="text-muted" style="font-size:0.65rem;">${s.campaign_id ? `#${String(s.campaign_id).substring(0,6)}…` : '—'}</span></td>
        <td><div class="toggle ${isActive ? 'on' : ''}" data-id="${s.id}" data-active="${isActive}"></div></td>
        <td>
          <div class="actions">
            <button class="icon-btn-sm" data-action="edit" data-id="${s.id}" title="Edit"><i class="fas fa-pencil-alt"></i></button>
            <button class="icon-btn-sm danger" data-action="delete" data-id="${s.id}" data-name="${esc(s.headline)}" title="Delete"><i class="fas fa-trash-alt"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('');

    // Event listeners
    tbody.querySelectorAll('[data-action="edit"]').forEach(btn => btn.addEventListener('click', () => openSlideModal(btn.dataset.id)));
    tbody.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener('click', () => openDelete('slide', btn.dataset.id, btn.dataset.name)));
    tbody.querySelectorAll('.toggle').forEach(tog => {
      tog.addEventListener('click', async () => {
        const newVal = tog.dataset.active === 'false' || tog.dataset.active === '';
        const { error } = await supabase.from('kiosk_idle_ads').update({ is_active: newVal, updated_at: new Date() }).eq('id', tog.dataset.id);
        if (error) toast('Update failed', 'err');
        else { toast(`Slide ${newVal ? 'activated' : 'deactivated'}`); renderSlides(document.getElementById('slideSearch').value); }
      });
    });
    tbody.querySelectorAll('[data-dir]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const dir = btn.dataset.dir;
        const id = btn.dataset.id;
        const order = parseInt(btn.dataset.order);
        await swapOrder(id, order, dir === 'up' ? order - 1 : order + 1);
      });
    });
  }

  async function swapOrder(id, oldO, newO) {
    const { data: other } = await supabase.from('kiosk_idle_ads').select('id').eq('display_order', newO).maybeSingle();
    if (!other) return;
    await supabase.from('kiosk_idle_ads').update({ display_order: newO, updated_at: new Date() }).eq('id', id);
    await supabase.from('kiosk_idle_ads').update({ display_order: oldO, updated_at: new Date() }).eq('id', other.id);
    toast('Order updated');
    renderSlides(document.getElementById('slideSearch').value);
  }

  // ═══════════════════════════════════════════
  //  SLIDE MODAL
  // ═══════════════════════════════════════════
  async function openSlideModal(id = null) {
    editSlideId = id;
    setMediaType('image');
    document.getElementById('slideId').value = '';
    document.getElementById('slideType').value = 'venue';
    document.getElementById('headline').value = '';
    document.getElementById('tagline').value = '';
    document.getElementById('imageUrl').value = '';
    document.getElementById('videoUrl').value = '';
    document.getElementById('imageUpload').value = '';
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('videoPreview').style.display = 'none';
    document.getElementById('duration').value = '60';
    document.getElementById('slideCpm').value = '';
    document.getElementById('displayOrder').value = '';
    document.getElementById('isActive').checked = true;
    document.getElementById('startsAt').value = '';
    document.getElementById('endsAt').value = '';
    document.getElementById('campaignId').innerHTML = '<option value="">None</option>';
    document.getElementById('slideTierId').innerHTML = '<option value="">None</option>';
    document.getElementById('slideModalTitle').textContent = id ? 'Edit Slide' : 'Add Slide';

    const hasCamp = await checkTable('kiosk_ad_campaigns');
    if (hasCamp && campaigns.length) {
      campaigns.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name || c.campaign_name || c.id;
        document.getElementById('campaignId').appendChild(opt);
      });
    }

    const hasTiers = await checkTable('ad_tiers');
    if (hasTiers) {
      const { data: tierData } = await supabase.from('ad_tiers').select('*').order('priority', { ascending: true });
      (tierData || []).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.name} (R${t.cpm_rate})`;
        document.getElementById('slideTierId').appendChild(opt);
      });
    }

    if (id) {
      const { data, error } = await supabase.from('kiosk_idle_ads').select('*').eq('id', id).single();
      if (error) { toast('Error loading slide', 'err'); return; }
      document.getElementById('slideId').value = data.id;
      document.getElementById('slideType').value = data.slide_type || 'venue';
      document.getElementById('headline').value = data.headline || '';
      document.getElementById('tagline').value = data.tagline || '';
      document.getElementById('duration').value = data.duration_seconds || 60;
      document.getElementById('slideCpm').value = data.cpm_rate != null ? data.cpm_rate : '';
      document.getElementById('displayOrder').value = data.display_order || '';
      document.getElementById('isActive').checked = !!data.is_active;
      document.getElementById('startsAt').value = data.starts_at ? data.starts_at.slice(0,16) : '';
      document.getElementById('endsAt').value = data.ends_at ? data.ends_at.slice(0,16) : '';
      if (data.campaign_id) document.getElementById('campaignId').value = data.campaign_id;
      if (data.tier_id) document.getElementById('slideTierId').value = data.tier_id;

      const isVid = data.media_type === 'video' || !!data.video_url;
      setMediaType(isVid ? 'video' : 'image');
      if (isVid) {
        document.getElementById('videoUrl').value = data.video_url || '';
        if (data.video_url) {
          document.getElementById('videoPreview').innerHTML = `<video src="${esc(data.video_url)}" controls style="max-width:100%;max-height:130px;"></video>`;
          document.getElementById('videoPreview').style.display = 'flex';
        }
      } else {
        document.getElementById('imageUrl').value = data.image_url || '';
        if (data.image_url) {
          document.getElementById('imagePreview').innerHTML = `<img src="${esc(data.image_url)}" style="max-width:100%;max-height:130px;object-fit:contain;border-radius:8px;">`;
          document.getElementById('imagePreview').style.display = 'flex';
        }
      }
    }
    document.getElementById('slideModal').classList.add('open');
  }

  document.getElementById('addSlideBtn').addEventListener('click', () => openSlideModal());
  document.getElementById('slideModalCancel').addEventListener('click', () => document.getElementById('slideModal').classList.remove('open'));
  // Modal only closes via the Cancel button (or Save) — clicking/moving outside no longer dismisses it.

  document.getElementById('imageUrl').addEventListener('input', e => {
    const url = e.target.value.trim();
    const prev = document.getElementById('imagePreview');
    if (url) { prev.innerHTML = `<img src="${esc(url)}" style="max-width:100%;max-height:130px;object-fit:contain;border-radius:8px;" onerror="this.style.display='none'">`; prev.style.display='flex'; }
    else prev.style.display='none';
  });
  document.getElementById('videoUrl').addEventListener('input', e => {
    const url = e.target.value.trim();
    const prev = document.getElementById('videoPreview');
    if (url) { prev.innerHTML = `<video src="${esc(url)}" controls style="max-width:100%;max-height:130px;"></video>`; prev.style.display='flex'; }
    else prev.style.display='none';
  });
  document.getElementById('imageUpload').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      document.getElementById('imagePreview').innerHTML = `<img src="${ev.target.result}" style="max-width:100%;max-height:130px;object-fit:contain;border-radius:8px;">`;
      document.getElementById('imagePreview').style.display = 'flex';
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('saveSlideBtn').addEventListener('click', async () => {
    const headlineVal = document.getElementById('headline').value.trim();
    if (!headlineVal) { toast('Headline is required', 'err'); return; }

    const btn = document.getElementById('saveSlideBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving…';

    let imageUrl = document.getElementById('imageUrl').value.trim();
    let videoUrl = document.getElementById('videoUrl').value.trim();
    const file = document.getElementById('imageUpload').files[0];

    if (currentMediaType === 'image' && file) {
      try {
        imageUrl = await uploadFile(file, headlineVal);
      } catch {
        toast('Image upload failed', 'err');
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save Slide';
        return;
      }
    }

    const isVid = currentMediaType === 'video';
    const payload = {
      slide_type: document.getElementById('slideType').value,
      headline: headlineVal,
      tagline: document.getElementById('tagline').value.trim() || null,
      media_type: isVid ? 'video' : 'image',
      image_url: isVid ? null : (imageUrl || null),
      video_url: isVid ? (videoUrl || null) : null,
      duration_seconds: isVid ? null : (parseInt(document.getElementById('duration').value) || 60),
      display_order: parseInt(document.getElementById('displayOrder').value) || allSlides.length + 1,
      is_active: document.getElementById('isActive').checked,
      starts_at: document.getElementById('startsAt').value ? new Date(document.getElementById('startsAt').value).toISOString() : null,
      ends_at: document.getElementById('endsAt').value ? new Date(document.getElementById('endsAt').value).toISOString() : null,
      campaign_id: document.getElementById('campaignId').value || null,
      tier_id: document.getElementById('slideTierId').value || null,
      cpm_rate: parseFloat(document.getElementById('slideCpm').value) || null,
      updated_at: new Date()
    };

    const id = document.getElementById('slideId').value;
    let error;
    if (id) {
      ({ error } = await supabase.from('kiosk_idle_ads').update(payload).eq('id', id));
    } else {
      payload.created_at = new Date();
      ({ error } = await supabase.from('kiosk_idle_ads').insert([payload]));
    }

    btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save Slide';
    if (error) { toast('Save failed: ' + error.message, 'err'); return; }
    toast('Slide saved');
    document.getElementById('slideModal').classList.remove('open');
    renderSlides();
  });

  document.getElementById('slideSearch').addEventListener('input', e => renderSlides(e.target.value));

  // ═══════════════════════════════════════════
  //  DELETE
  // ═══════════════════════════════════════════
  function openDelete(type, id, name) {
    deleteTarget = { type, id };
    document.getElementById('deleteTitle').textContent = `Delete ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    document.getElementById('deleteMsg').textContent = `Delete "${name}"? This cannot be undone.`;
    document.getElementById('deleteModal').classList.add('open');
  }
  document.getElementById('cancelDeleteBtn').addEventListener('click', () => { document.getElementById('deleteModal').classList.remove('open'); deleteTarget = null; });
  // Modal only closes via the Cancel button — clicking/moving outside no longer dismisses it.
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    if (!deleteTarget) return;
    const tableMap = { slide: 'kiosk_idle_ads', campaign: 'kiosk_ad_campaigns', tier: 'ad_tiers' };
    const tbl = tableMap[deleteTarget.type];
    const { error } = await supabase.from(tbl).delete().eq('id', deleteTarget.id);
    document.getElementById('deleteModal').classList.remove('open');
    if (error) { toast('Delete failed: ' + error.message, 'err'); return; }
    toast(`${deleteTarget.type.charAt(0).toUpperCase() + deleteTarget.type.slice(1)} deleted`);
    deleteTarget = null;
    if (tbl === 'kiosk_idle_ads') renderSlides();
    else if (tbl === 'kiosk_ad_campaigns') loadCampaigns();
    else if (tbl === 'ad_tiers') loadTiers();
  });

  // ═══════════════════════════════════════════
  //  CAMPAIGNS
  // ═══════════════════════════════════════════
  async function loadCampaigns() {
    const hasCamp = await checkTable('kiosk_ad_campaigns');
    document.getElementById('campaignsUnavail').style.display = hasCamp ? 'none' : '';
    document.getElementById('addCampaignBtn').style.display = hasCamp ? '' : 'none';
    const tbody = document.getElementById('campaignsTbody');
    if (!hasCamp) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-bullhorn"></i><p>Table <code>kiosk_ad_campaigns</code> not found.</p></div></td></tr>`;
      return;
    }
    const { data, error } = await supabase.from('kiosk_ad_campaigns').select('*').order('created_at', { ascending: false });
    campaigns = data || [];
    if (error || !campaigns.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-bullhorn"></i><p>No campaigns yet.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = campaigns.map(c => {
      const linked = allSlides.filter(s => s.campaign_id === c.id).length;
      const revenue = c.total_revenue != null ? c.total_revenue : 0;
      return `<tr>
        <td><strong>${esc(c.name || c.campaign_name)}</strong></td>
        <td>${esc(c.advertiser_name || c.advertiser || '—')}</td>
        <td>${c.cpm_rate != null ? fmtR(c.cpm_rate) : '—'}</td>
        <td>${c.budget != null ? fmtR(c.budget) : '—'}</td>
        <td style="color:var(--green);font-weight:700;">${fmtR(revenue)}</td>
        <td><span class="badge badge-sponsor">${linked}</span></td>
        <td>
          <div class="actions">
            <button class="icon-btn-sm" data-action="edit-camp" data-id="${c.id}" title="Edit"><i class="fas fa-pencil-alt"></i></button>
            <button class="icon-btn-sm danger" data-action="del-camp" data-id="${c.id}" data-name="${esc(c.name || c.campaign_name)}" title="Delete"><i class="fas fa-trash-alt"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-action="edit-camp"]').forEach(btn => btn.addEventListener('click', () => openCampaignModal(btn.dataset.id)));
    tbody.querySelectorAll('[data-action="del-camp"]').forEach(btn => btn.addEventListener('click', () => openDelete('campaign', btn.dataset.id, btn.dataset.name)));
  }

  async function openCampaignModal(id = null) {
    document.getElementById('campaignEditId').value = '';
    document.getElementById('campaignName').value = '';
    document.getElementById('campaignAdvertiser').value = '';
    document.getElementById('campaignCpm').value = '';
    document.getElementById('campaignTierId').innerHTML = '<option value="">None</option>';
    document.getElementById('campaignBudget').value = '';
    document.getElementById('campaignStart').value = '';
    document.getElementById('campaignEnd').value = '';
    document.getElementById('campaignModalTitle').textContent = id ? 'Edit Campaign' : 'New Campaign';

    const hasTiers = await checkTable('ad_tiers');
    if (hasTiers) {
      const { data: tierData } = await supabase.from('ad_tiers').select('*').order('priority', { ascending: true });
      (tierData || []).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.name} (R${t.cpm_rate})`;
        document.getElementById('campaignTierId').appendChild(opt);
      });
    }

    if (id) {
      const c = campaigns.find(c => c.id === id);
      if (c) {
        document.getElementById('campaignEditId').value = c.id;
        document.getElementById('campaignName').value = c.name || c.campaign_name || '';
        document.getElementById('campaignAdvertiser').value = c.advertiser_name || c.advertiser || '';
        document.getElementById('campaignCpm').value = c.cpm_rate != null ? c.cpm_rate : '';
        if (c.tier_id) document.getElementById('campaignTierId').value = c.tier_id;
        document.getElementById('campaignBudget').value = c.budget != null ? c.budget : '';
        document.getElementById('campaignStart').value = c.starts_at ? c.starts_at.slice(0,16) : '';
        document.getElementById('campaignEnd').value = c.ends_at ? c.ends_at.slice(0,16) : '';
      }
    }
    document.getElementById('campaignModal').classList.add('open');
  }

  document.getElementById('addCampaignBtn').addEventListener('click', () => openCampaignModal());
  document.getElementById('campaignModalCancel').addEventListener('click', () => document.getElementById('campaignModal').classList.remove('open'));
  // Modal only closes via the Cancel button (or Save) — clicking/moving outside no longer dismisses it.
  document.getElementById('saveCampaignBtn').addEventListener('click', async () => {
    const name = document.getElementById('campaignName').value.trim();
    if (!name) { toast('Campaign name is required', 'err'); return; }
    const id = document.getElementById('campaignEditId').value;
    const payload = {
      name, campaign_name: name,
      advertiser_name: document.getElementById('campaignAdvertiser').value.trim() || null,
      cpm_rate: parseFloat(document.getElementById('campaignCpm').value) || null,
      tier_id: document.getElementById('campaignTierId').value || null,
      budget: parseFloat(document.getElementById('campaignBudget').value) || null,
      starts_at: document.getElementById('campaignStart').value ? new Date(document.getElementById('campaignStart').value).toISOString() : null,
      ends_at: document.getElementById('campaignEnd').value ? new Date(document.getElementById('campaignEnd').value).toISOString() : null,
      updated_at: new Date()
    };
    let error;
    if (id) {
      ({ error } = await supabase.from('kiosk_ad_campaigns').update(payload).eq('id', id));
    } else {
      payload.created_at = new Date();
      ({ error } = await supabase.from('kiosk_ad_campaigns').insert([payload]));
    }
    if (error) { toast('Save failed: ' + error.message, 'err'); return; }
    toast('Campaign saved');
    document.getElementById('campaignModal').classList.remove('open');
    loadCampaigns();
  });

  // ═══════════════════════════════════════════
  //  TIERS
  // ═══════════════════════════════════════════
  let allTiers = [];
  async function loadTiers() {
    const hasTiers = await checkTable('ad_tiers');
    document.getElementById('tiersUnavail').style.display = hasTiers ? 'none' : '';
    document.getElementById('addTierBtn').style.display = hasTiers ? '' : 'none';
    const tbody = document.getElementById('tiersTbody');
    if (!hasTiers) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="fas fa-layer-group"></i><p>Table <code>ad_tiers</code> not found.</p></div></td></tr>`;
      return;
    }
    const { data, error } = await supabase.from('ad_tiers').select('*').order('priority', { ascending: true });
    allTiers = data || [];
    if (error || !allTiers.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="fas fa-layer-group"></i><p>No tiers yet.</p></div></td></tr>`;
      return;
    }
    function tierClass(name) {
      const n = (name || '').toLowerCase();
      if (n.includes('vip')) return 'tier-vip';
      if (n.includes('premium')) return 'tier-premium';
      return 'tier-basic';
    }
    tbody.innerHTML = allTiers.map(t => `<tr>
      <td><span class="tier-badge ${tierClass(t.name)}">${esc(t.name)}</span></td>
      <td>${t.cpm_rate != null ? fmtR(t.cpm_rate) : '—'}</td>
      <td>${t.priority != null ? t.priority : '—'}</td>
      <td style="font-size:0.7rem;color:var(--muted);">${esc(t.description || '—')}</td>
      <td>
        <div class="actions">
          <button class="icon-btn-sm" data-action="edit-tier" data-id="${t.id}" title="Edit"><i class="fas fa-pencil-alt"></i></button>
          <button class="icon-btn-sm danger" data-action="del-tier" data-id="${t.id}" data-name="${esc(t.name)}" title="Delete"><i class="fas fa-trash-alt"></i></button>
        </div>
      </td>
     </tr>`).join('');
    tbody.querySelectorAll('[data-action="edit-tier"]').forEach(btn => btn.addEventListener('click', () => openTierModal(btn.dataset.id)));
    tbody.querySelectorAll('[data-action="del-tier"]').forEach(btn => btn.addEventListener('click', () => openDelete('tier', btn.dataset.id, btn.dataset.name)));
  }

  async function openTierModal(id = null) {
    document.getElementById('tierId').value = '';
    document.getElementById('tierName').value = '';
    document.getElementById('tierCpm').value = '';
    document.getElementById('tierPriority').value = '';
    document.getElementById('tierDescription').value = '';
    document.getElementById('tierModalTitle').textContent = id ? 'Edit Tier' : 'New Tier';
    if (id) {
      const t = allTiers.find(t => t.id === id);
      if (t) {
        document.getElementById('tierId').value = t.id;
        document.getElementById('tierName').value = t.name || '';
        document.getElementById('tierCpm').value = t.cpm_rate != null ? t.cpm_rate : '';
        document.getElementById('tierPriority').value = t.priority != null ? t.priority : '';
        document.getElementById('tierDescription').value = t.description || '';
      }
    }
    document.getElementById('tierModal').classList.add('open');
  }

  document.getElementById('addTierBtn').addEventListener('click', () => openTierModal());
  document.getElementById('tierModalCancel').addEventListener('click', () => document.getElementById('tierModal').classList.remove('open'));
  // Modal only closes via the Cancel button (or Save) — clicking/moving outside no longer dismisses it.
  document.getElementById('saveTierBtn').addEventListener('click', async () => {
    const name = document.getElementById('tierName').value.trim();
    if (!name) { toast('Tier name is required', 'err'); return; }
    const id = document.getElementById('tierId').value;
    const payload = {
      name,
      cpm_rate: parseFloat(document.getElementById('tierCpm').value) || null,
      priority: parseInt(document.getElementById('tierPriority').value) || null,
      description: document.getElementById('tierDescription').value.trim() || null,
      updated_at: new Date()
    };
    let error;
    if (id) {
      ({ error } = await supabase.from('ad_tiers').update(payload).eq('id', id));
    } else {
      payload.created_at = new Date();
      ({ error } = await supabase.from('ad_tiers').insert([payload]));
    }
    if (error) { toast('Save failed: ' + error.message, 'err'); return; }
    toast('Tier saved');
    document.getElementById('tierModal').classList.remove('open');
    loadTiers();
  });

  // ═══════════════════════════════════════════
  //  KIOSK PREVIEW ENGINE
  // ═══════════════════════════════════════════
  let previewRunning = false;
  let previewSlides = [];
  let previewIndex = 0;
  let previewCycle = 0;
  const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
  let cycleShownSet = new Set();
  let previewImpLog = {};
  let imgTimer = null;
  let skipRequested = false;

  function stopPreview() {
    previewRunning = false;
    clearTimeout(imgTimer);
    const vid = document.getElementById('previewVid');
    vid.pause(); vid.src = '';
    document.getElementById('previewSlideWrap').classList.remove('active');
    document.getElementById('previewEmpty').style.display = '';
    document.getElementById('startPreviewBtn').style.display = '';
    document.getElementById('stopPreviewBtn').style.display = 'none';
    document.getElementById('nextSlideBtn').style.display = 'none';
    document.getElementById('previewCycleLabel').textContent = '';
  }

  async function runPreview() {
    if (!previewRunning) return;
    if (previewIndex >= previewSlides.length) {
      previewIndex = 0;
      previewCycle++;
      cycleShownSet.clear();
    }

    const slide = previewSlides[previewIndex];
    const total = previewSlides.length;
    const isVid = slide.media_type === 'video' || !!slide.video_url;

    document.getElementById('previewEmpty').style.display = 'none';
    const wrap = document.getElementById('previewSlideWrap');
    wrap.classList.add('active');
    document.getElementById('previewHeadline').textContent = slide.headline || '';
    document.getElementById('previewTagline').textContent = slide.tagline || '';
    document.getElementById('slideIndicator').textContent = `${previewIndex + 1} / ${total}  •  Cycle ${previewCycle + 1}`;
    document.getElementById('previewCycleLabel').textContent = `Cycle ${previewCycle + 1} — Slide ${previewIndex + 1}/${total}`;

    const img = document.getElementById('previewImg');
    const vid = document.getElementById('previewVid');
    const bar = document.getElementById('previewProgress');

    img.style.display = 'none';
    vid.style.display = 'none';
    bar.style.width = '0%';
    skipRequested = false;

    if (isVid && slide.video_url) {
      vid.src = slide.video_url;
      vid.style.display = 'block';
      vid.currentTime = 0;
      try { await vid.play(); } catch {}

      let vidInterval = setInterval(() => {
        if (!previewRunning || skipRequested) { clearInterval(vidInterval); return; }
        if (vid.duration) bar.style.width = ((vid.currentTime / vid.duration) * 100) + '%';
      }, 200);

      await new Promise(resolve => {
        vid.onended = () => {
          clearInterval(vidInterval);
          logImpression(slide);
          resolve();
        };
        const checkSkip = setInterval(() => {
          if (skipRequested || !previewRunning) {
            clearInterval(checkSkip);
            clearInterval(vidInterval);
            vid.pause();
            resolve();
          }
        }, 100);
      });

    } else if (slide.image_url) {
      img.src = slide.image_url;
      img.style.display = 'block';
      const dur = (slide.duration_seconds || 60) * 1000;
      const start = Date.now();

      await new Promise(resolve => {
        function tick() {
          if (!previewRunning || skipRequested) { resolve(); return; }
          const elapsed = Date.now() - start;
          const pct = Math.min((elapsed / dur) * 100, 100);
          bar.style.width = pct + '%';
          if (elapsed >= dur) {
            logImpression(slide);
            resolve();
          } else {
            imgTimer = setTimeout(tick, 100);
          }
        }
        tick();
      });

    } else {
      await new Promise(resolve => {
        imgTimer = setTimeout(() => {
          logImpression(slide);
          resolve();
        }, 5000);
      });
    }

    previewIndex++;
    if (previewRunning) setTimeout(runPreview, 300);
  }

  function logImpression(slide) {
    const adId = slide.id;
    if (cycleShownSet.has(adId)) {
      if (!previewImpLog[adId]) previewImpLog[adId] = { logged: 0, blocked: 0 };
      previewImpLog[adId].blocked++;
      updateImpTable();
      return;
    }
    cycleShownSet.add(adId);
    if (!previewImpLog[adId]) previewImpLog[adId] = { logged: 0, blocked: 0 };
    previewImpLog[adId].logged++;
    updateImpTable();

    (async () => {
      const hasImps = await checkTable('kiosk_ad_impressions');
      if (!hasImps) return;
      await supabase.from('kiosk_ad_impressions').insert([{
        ad_id: adId,
        session_id: sessionId,
        created_at: new Date(),
        impression_type: slide.media_type || 'image'
      }]);
    })();
  }

  function updateImpTable() {
    const tbody = document.getElementById('previewImpTbody');
    const slides = previewSlides;
    const rows = Object.entries(previewImpLog).map(([adId, data]) => {
      const slide = slides.find(s => s.id === adId);
      const name = slide ? esc(slide.headline) : esc(adId).substring(0,8);
      const isVid = slide?.media_type === 'video' || !!slide?.video_url;
      return `<tr>
        <td>${name}</td>
        <td><span class="badge ${isVid ? 'badge-video' : 'badge-image'}">${isVid ? '▶ Video' : '🖼 Image'}</span></td>
        <td style="color:var(--green);font-weight:700;">${data.logged}</td>
        <td style="color:var(--muted);">${data.blocked}</td>
      </tr>`;
    });
    tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:12px;">No impressions yet</td></tr>';
  }

  document.getElementById('startPreviewBtn').addEventListener('click', async () => {
    previewSlides = allSlides.length ? allSlides.filter(s => s.is_active) : (await loadSlides()).filter(s => s.is_active);
    if (!previewSlides.length) { toast('No active slides to preview', 'err'); return; }
    previewIndex = 0;
    previewCycle = 0;
    cycleShownSet.clear();
    previewImpLog = {};
    updateImpTable();
    previewRunning = true;
    document.getElementById('startPreviewBtn').style.display = 'none';
    document.getElementById('stopPreviewBtn').style.display = '';
    document.getElementById('nextSlideBtn').style.display = '';
    runPreview();
  });
  document.getElementById('stopPreviewBtn').addEventListener('click', stopPreview);
  document.getElementById('nextSlideBtn').addEventListener('click', () => { skipRequested = true; });

  // ═══════════════════════════════════════════
  //  DASHBOARD OVERLAY
  // ═══════════════════════════════════════════
  let chartInstances = {};

  function toggleDashboard() {
    const overlay = document.getElementById('dashboardOverlay');
    overlay.classList.toggle('open');
    document.getElementById('toggleDashBtn').classList.toggle('active-toggle', overlay.classList.contains('open'));
    if (overlay.classList.contains('open')) renderDashCharts();
  }
  window.toggleDashboard = toggleDashboard;

  async function renderDashCharts() {
    const hasImps = await checkTable('kiosk_ad_impressions');
    const today = new Date(); today.setHours(0,0,0,0);
    const todayStr = today.toISOString();
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

    let todayImps = [];
    let weekImps = [];
    if (hasImps) {
      const { data } = await supabase.from('kiosk_ad_impressions').select('id, ad_id, created_at').gte('created_at', todayStr);
      todayImps = data || [];
      const { data: weekData } = await supabase.from('kiosk_ad_impressions').select('id, ad_id').gte('created_at', weekAgo.toISOString());
      weekImps = weekData || [];
    }

    const slides = allSlides.length ? allSlides : await loadSlides();

    // Build slide map with effective CPM (slide → slide tier → campaign → campaign tier)
    const slideMap = {};
    slides.forEach(s => {
      slideMap[s.id] = { ...s, effective_cpm: effectiveCpm(s) };
    });

    const countByAd = {};
    todayImps.forEach(imp => { countByAd[imp.ad_id] = (countByAd[imp.ad_id] || 0) + 1; });
    const totalImps = todayImps.length;
    const totalSlides = slides.length;
    const activeSlides = slides.filter(s => s.is_active).length;
    let totalRev = 0;
    Object.entries(countByAd).forEach(([adId, cnt]) => {
      const cpm = slideMap[adId]?.effective_cpm || 0;
      totalRev += (cnt / 1000) * cpm;
    });

    const imgSlides = slides.filter(s => s.media_type !== 'video' && !s.video_url);
    const avgDur = imgSlides.length ? Math.round(imgSlides.reduce((a, s) => a + (s.duration_seconds || 60), 0) / imgSlides.length) : 0;

    document.getElementById('dashKpiGrid').innerHTML = `
      <div class="dash-kpi"><div class="val">${avgDur}s</div><div class="label">Avg Duration</div></div>
      <div class="dash-kpi"><div class="val">${fmt(totalImps)}</div><div class="label">Impressions Today</div></div>
      <div class="dash-kpi"><div class="val">${fmtR(totalRev)}</div><div class="label">Est. Revenue Today</div></div>
      <div class="dash-kpi"><div class="val">${Object.keys(countByAd).length}</div><div class="label">Ads Shown Today</div></div>
    `;

    // Impression chart (top 5)
    const sorted = Object.entries(countByAd).sort((a,b) => b[1]-a[1]).slice(0,5);
    const labels = sorted.map(([id]) => {
      const s = slideMap[id];
      return s ? s.headline?.slice(0,15) || id.slice(0,6) : id.slice(0,6);
    });
    const data = sorted.map(([,cnt]) => cnt);
    const ctx = document.getElementById('dashImpChart').getContext('2d');
    if (chartInstances.imp) chartInstances.imp.destroy();
    chartInstances.imp = new Chart(ctx, {
      type: 'bar',
      data: { labels: labels.length ? labels : ['No data'], datasets: [{ label: 'Impressions', data: data.length ? data : [0], backgroundColor: '#E30613', borderRadius: 4 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#71717a', stepSize: 1 } }, x: { ticks: { color: '#71717a' } } } }
    });

    // Top ads list
    const topContainer = document.getElementById('dashTopAds');
    if (sorted.length) {
      topContainer.innerHTML = sorted.slice(0,5).map(([adId, cnt], i) => {
        const s = slideMap[adId];
        const name = s ? esc(s.headline) : esc(adId).substring(0,8);
        return `<div class="dash-activity-item">
          <span style="font-weight:700;color:var(--muted);width:20px;">${i+1}</span>
          <div class="details"><strong>${name}</strong></div>
          <div style="font-weight:700;color:var(--red);">${fmt(cnt)}</div>
        </div>`;
      }).join('');
    } else {
      topContainer.innerHTML = '<div style="color:var(--muted);font-size:0.7rem;padding:8px 0;">No impressions today</div>';
    }

    // Revenue list
    const revContainer = document.getElementById('dashRevenueList');
    const revSorted = Object.entries(countByAd).sort((a,b) => {
      const cpmA = slideMap[a[0]]?.effective_cpm || 0;
      const cpmB = slideMap[b[0]]?.effective_cpm || 0;
      return (b[1]/1000*cpmB) - (a[1]/1000*cpmA);
    }).slice(0,5);
    if (revSorted.length) {
      revContainer.innerHTML = revSorted.map(([adId, cnt]) => {
        const s = slideMap[adId];
        const name = s ? esc(s.headline) : esc(adId).substring(0,8);
        const cpm = s?.effective_cpm || 0;
        const rev = (cnt/1000) * cpm;
        return `<div class="dash-activity-item" style="display:flex;justify-content:space-between;">
          <div class="details"><strong>${name}</strong><br><span style="font-size:0.6rem;color:var(--muted);">${fmt(cnt)} imps</span></div>
          <div style="font-weight:700;color:var(--green);">${fmtR(rev)}</div>
        </div>`;
      }).join('');
    } else {
      revContainer.innerHTML = '<div style="color:var(--muted);font-size:0.7rem;padding:8px 0;">No revenue data</div>';
    }

    // Alerts
    const alerts = [];
    if (activeSlides === 0 && totalSlides > 0) alerts.push({ level:'warning', title:'No Active Slides', desc:'Your kiosk will show nothing.' });
    if (totalImps === 0 && totalSlides > 0) alerts.push({ level:'info', title:'No Impressions Today', desc:'Run the preview or check your kiosk.' });
    const lowActive = activeSlides < 3 && totalSlides > 5;
    if (lowActive) alerts.push({ level:'info', title:'Low Active Slides', desc:`Only ${activeSlides} of ${totalSlides} slides are active.` });
    const alertDiv = document.getElementById('dashAlerts');
    if (alerts.length) {
      alertDiv.innerHTML = alerts.map(a => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.7rem;">
          <i class="fas fa-exclamation-circle" style="color:${a.level==='warning'?'var(--gold)':'#3b82f6'}"></i>
          <div><strong>${a.title}</strong> · ${a.desc}</div>
        </div>
      `).join('');
    } else {
      alertDiv.innerHTML = '<div style="color:var(--muted);font-size:0.7rem;">No alerts</div>';
    }
  }

  // ═══════════════════════════════════════════
  //  REFRESH
  // ═══════════════════════════════════════════
  async function refreshAll() {
    toast('Refreshing…', 'info');
    await renderSlides();
    if (document.getElementById('dashboardOverlay').classList.contains('open')) renderDashCharts();
    toast('Refreshed', 'ok');
  }
  window.refreshAll = refreshAll;

  // ═══════════════════════════════════════════
  //  REALTIME
  // ═══════════════════════════════════════════
  function setupRealtime() {
    supabase.channel('kiosk-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kiosk_idle_ads' }, () => renderSlides())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kiosk_ad_campaigns' }, () => loadCampaigns())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ad_tiers' }, () => loadTiers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kiosk_ad_impressions' }, () => { if (document.getElementById('dashboardOverlay').classList.contains('open')) renderDashCharts(); })
      .subscribe();
  }

  // ═══════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════
  async function init() {
    await ensureBucket();
    await loadCampaigns();
    await loadTiers();
    await renderSlides();
    setupRealtime();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const overlay = document.getElementById('dashboardOverlay');
        if (overlay.classList.contains('open')) toggleDashboard();
      }
    });
  }
  init();
