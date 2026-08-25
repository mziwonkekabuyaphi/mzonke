// Supabase is loaded via a dynamic import (instead of a static top-level
// `import { supabase } from ...`) because a static import that can't
// resolve a named export throws immediately and silently kills the whole
// module — Vue never mounts and every feature (not just Add Product)
// stops working. Doing it dynamically, with a fallback for either a
// default or named export, mirrors the working approach and means a
// missing/mismatched config file degrades gracefully instead of taking
// the whole app down.
let supabase = null;

async function initSupabase() {
  try {
    const mod = await import('../../config/supabase.js');
    supabase = mod.default || mod.supabase;
    if (!supabase) throw new Error('No supabase client exported');
  } catch (err) {
    console.error('Failed to load supabase config:', err);
  }
}

// ── Config ──────────────────────────────────────────────────────────
const STORAGE_BUCKET = 'product-images';
const VALID_CATEGORIES = [
  'beers', 'champagne', 'ciders', 'cognac', 'gin', 'liqueur',
  'soft drinks', 'sparkling wine', 'tequila', 'vodka', 'whiskey',
  'butcher', 'shisha', 'other'
];

function normalizeCategory(cat) {
  if (!cat) return 'other';
  return VALID_CATEGORIES.includes(cat) ? cat : 'other';
}

function generateSafeFileName(name, ext) {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  const safe = (name || 'product').replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 50);
  return `products/${ts}-${rand}-${safe}.${ext}`;
}

// ── Vue App ──────────────────────────────────────────────────────────
const { createApp, nextTick } = Vue;

createApp({
  data() {
    return {
      supabase: null,
      supabaseConnected: false,

      products: [],
      searchQuery: '',
      filterCategory: '',
      newProduct: { name: '', description: '', price: 0, category: 'beers', alcohol: false, image: '', imagePreview: null },
      toast: { visible: false, text: '', type: '', icon: '' },
      toastTimer: null,
      uploadingNewProduct: false,
      uploadingProducts: new Set(),
      categories: VALID_CATEGORIES,
      charts: {},
      dashboardOpen: false,
      loading: false,
      editingId: null,

      // ── Manage Product editor (new) ──
      editModalOpen: false,
      editingProduct: null,       // working copy of the product being edited (incl. meta)
      savingManage: false,
      uploadingGalleryImage: false,
      editSections: {             // collapsible state per section, mirrors .add-panel pattern
        general: true, visibility: false, analytics: false, quick: false,
      },
    };
  },

  computed: {
    filteredProducts() {
      let list = this.products;
      if (this.filterCategory) list = list.filter(p => p.category === this.filterCategory);
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        list = list.filter(p =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q)
        );
      }
      return list;
    },
    alcoholCount() { return this.products.filter(p => p.alcohol).length; },
    nonAlcoholCount() { return this.products.filter(p => !p.alcohol && p.category !== 'butcher').length; },
    butcherCount() { return this.products.filter(p => p.category === 'butcher').length; },
    premiumPercent() {
      if (!this.products.length) return 0;
      return Math.round((this.products.filter(p => p.price > 100).length / this.products.length) * 100);
    },
    alcoholPercent() {
      if (!this.products.length) return 0;
      return Math.round((this.alcoholCount / this.products.length) * 100);
    },
    avgPrice() {
      if (!this.products.length) return '0';
      const avg = this.products.reduce((s, p) => s + (p.price || 0), 0) / this.products.length;
      return avg.toFixed(0);
    },

    // ── Manage Product editor computeds (new) ──
    // Live profit/margin recompute automatically because Vue tracks the
    // .price / .cost_price fields used here.
    profitValue() {
      if (!this.editingProduct) return 0;
      const sell = Number(this.editingProduct.price) || 0;
      const cost = Number(this.editingProduct.cost_price) || 0;
      return sell - cost;
    },
    marginValue() {
      if (!this.editingProduct) return 0;
      const sell = Number(this.editingProduct.price) || 0;
      if (!sell) return 0;
      const cost = Number(this.editingProduct.cost_price) || 0;
      return ((sell - cost) / sell) * 100;
    },
    // Manual is_available override always wins — that's the point of the
    // toggle. Quantity-based status only kicks in when tracking is on
    // and the product hasn't been manually marked out of stock.
    stockStatus() {
      if (!this.editingProduct) return { label: '—', cls: '' };
      if (!this.editingProduct.is_available) return { label: 'Out of Stock', cls: 'out-stock' };
      if (!this.editingProduct.track_inventory) return { label: 'In Stock', cls: 'in-stock' };
      const qty = Number(this.editingProduct.stock_quantity) || 0;
      const low = Number(this.editingProduct.low_stock_threshold) || 0;
      if (qty <= 0) return { label: 'Out of Stock', cls: 'out-stock' };
      if (qty <= low) return { label: 'Low Stock', cls: 'low-stock' };
      return { label: 'In Stock', cls: 'in-stock' };
    },
    // Analytics is sourced from meta.analytics if present; falls back to
    // "—" everywhere instead of throwing, since real sales data isn't
    // wired into this admin yet (per the "never show errors" spec).
    analyticsDisplay() {
      const a = (this.editingProduct && this.editingProduct.meta.analytics) || {};
      const fmt = (v, prefix = '') => (v === undefined || v === null || v === '') ? '—' : (prefix + v);
      return {
        totalSales: fmt(a.totalSales),
        revenue: fmt(a.revenue, 'R '),
        unitsSold: fmt(a.unitsSold),
        profit: fmt(a.profit, 'R '),
        lastSold: fmt(a.lastSold),
        views: fmt(a.views),
        conversionRate: fmt(a.conversionRate, ''),
      };
    },
    currentStockDisplay() {
      if (!this.editingProduct) return '—';
      if (!this.editingProduct.track_inventory) return 'No data yet';
      const qty = this.editingProduct.stock_quantity;
      return (qty === undefined || qty === null || qty === '') ? '—' : qty;
    },
    // All products except the one currently being edited, for the
    // Related Products pickers.
    otherProducts() {
      if (!this.editingProduct) return [];
      return this.products.filter(p => p.id !== this.editingProduct.id);
    },
  },

  watch: {
    dashboardOpen(val) {
      if (val) nextTick(() => this.renderCharts());
    },
  },

  async mounted() {
    await initSupabase();
    this.supabase = supabase;
    this.supabaseConnected = !!supabase;
    if (this.supabase) {
      await this.loadProducts();
    } else {
      this.showToast('Could not connect to Supabase. Check that ../../config/supabase.js exists.', 'error');
    }
  },

  methods: {
    // ── Toast ──
    showToast(text, type = 'info') {
      if (this.toastTimer) clearTimeout(this.toastTimer);
      const icons = { success: 'fas fa-check-circle', error: 'fas fa-times-circle', info: 'fas fa-info-circle' };
      this.toast = { visible: true, text, type, icon: icons[type] || icons.info };
      this.toastTimer = setTimeout(() => { this.toast.visible = false; }, 3000);
    },

    // ── Image helpers ──
    getValidImageUrl(img) {
      if (!img) return 'https://placehold.co/80x80/18181c/71717a?text=?';
      if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:')) return img;
      return 'https://placehold.co/80x80/18181c/71717a?text=?';
    },

    // ── Storage ──
    async uploadToStorage(file, productName) {
      if (!this.supabase) throw new Error('Not connected');
      if (!file.type.startsWith('image/')) throw new Error('File must be an image');
      if (file.size > 2 * 1024 * 1024) throw new Error('Max file size is 2MB');
      const ext = file.name.split('.').pop();
      const path = generateSafeFileName(productName, ext);
      const { error } = await this.supabase.storage.from(STORAGE_BUCKET).upload(path, file, { cacheControl: '3600', upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = this.supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      return publicUrl;
    },

    // ── Load ──
    async loadProducts() {
      if (!this.supabase) { this.showToast('Connect to Supabase first', 'error'); return; }
      this.loading = true;
      try {
        const { data, error } = await this.supabase.from('products').select('*').order('id', { ascending: true });
        if (error) throw error;
        this.products = (data || []).map(p => ({ ...p, category: normalizeCategory(p.category) }));
        this.showToast(`${this.products.length} products loaded`, 'success');
        if (this.dashboardOpen) nextTick(() => this.renderCharts());
      } catch (err) {
        this.showToast('Load failed: ' + err.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    // ── Save (update) ──
    async saveProduct(product) {
      if (!this.supabase) return;
      product.category = normalizeCategory(product.category);
      try {
        const { error } = await this.supabase.from('products').update({
          name: product.name,
          description: product.description,
          price: product.price,
          category: product.category,
          alcohol: product.alcohol,
          image: product.image,
          is_available: product.is_available,
          stock_quantity: product.stock_quantity,
        }).eq('id', product.id);
        if (error) throw error;
        this.showToast('Saved', 'success');
      } catch (err) {
        this.showToast('Save failed: ' + err.message, 'error');
      }
    },

    // ── Add ──
    async addProduct() {
      if (!this.supabase) { this.showToast('Connect to Supabase first', 'error'); return; }
      if (!this.newProduct.name.trim()) { this.showToast('Product name is required', 'error'); return; }
      this.uploadingNewProduct = true;
      try {
        const item = {
          name: this.newProduct.name.trim(),
          description: this.newProduct.description.trim(),
          price: parseFloat(this.newProduct.price) || 0,
          category: normalizeCategory(this.newProduct.category),
          alcohol: this.newProduct.alcohol,
          image: this.newProduct.image || '',
        };
        const { data, error } = await this.supabase.from('products').insert([item]).select();
        if (error) throw error;
        this.products.push({ ...data[0], category: normalizeCategory(data[0].category) });
        this.newProduct = { name: '', description: '', price: 0, category: 'beers', alcohol: false, image: '', imagePreview: null };
        this.showToast('Product added', 'success');
        if (this.dashboardOpen) nextTick(() => this.renderCharts());
        
        // Scroll to the newly added product after a short delay
        await nextTick();
        const tableWrap = document.querySelector('.table-wrap');
        if (tableWrap) {
          tableWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } catch (err) {
        this.showToast('Add failed: ' + err.message, 'error');
      } finally {
        this.uploadingNewProduct = false;
      }
    },

    // ── Delete ──
    confirmDelete(id, name) {
      if (confirm(`Delete "${name}"?\nThis cannot be undone.`)) this.deleteProduct(id);
    },
    async deleteProduct(id) {
      if (!this.supabase) return;
      try {
        const { error } = await this.supabase.from('products').delete().eq('id', id);
        if (error) throw error;
        this.products = this.products.filter(p => p.id !== id);
        this.showToast('Product deleted', 'success');
        if (this.dashboardOpen) nextTick(() => this.renderCharts());
      } catch (err) {
        this.showToast('Delete failed: ' + err.message, 'error');
      }
    },

    // ── Image upload ──
    async handleNewProductImage(e) {
      const file = e.target.files[0];
      if (!file) return;
      this.uploadingNewProduct = true;
      try {
        const url = await this.uploadToStorage(file, this.newProduct.name || 'product');
        this.newProduct.image = url;
        this.newProduct.imagePreview = url;
        this.showToast('Image uploaded', 'success');
      } catch (err) {
        this.showToast(err.message, 'error');
      } finally {
        this.uploadingNewProduct = false;
        e.target.value = '';
      }
    },
    clearNewProductImage() { this.newProduct.image = ''; this.newProduct.imagePreview = null; },

    triggerImageUpload(product) {
      const key = 'img_' + product.id;
      const refs = this.$refs[key];
      const el = Array.isArray(refs) ? refs[0] : refs;
      if (el) el.click();
    },
    async handleProductImageChange(e, product) {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const url = await this.uploadToStorage(file, product.name);
        product.image = url;
        await this.saveProduct(product);
        this.showToast('Image updated', 'success');
      } catch (err) {
        this.showToast(err.message, 'error');
      } finally {
        e.target.value = '';
      }
    },

    // ── Charts ──
    // ── Manage Product editor (new) ──────────────────────────────────
    // Default shape for the JSONB "meta" column — only for things that
    // don't have a real column on products (images/variants/options/
    // visibility/related/analytics/reserved_stock). Everything else
    // (brand, sku, barcode, status, featured, cost_price, track_inventory,
    // stock_quantity, low_stock_threshold, is_available) is a real column
    // on the table and is read/written directly, not shadowed in here.
    defaultMeta() {
      return {
        reserved_stock: null,
        images: [],
        variants: [],
        options: [],
        visibility: { pos: true, whatsapp: true, kiosk: true, website: true },
        related: { upsell: [], fbt: [] },
        analytics: {}, // left empty until real sales data exists
      };
    },

    openManage(product) {
      // Deep-clone so edits don't mutate the table row until Save is clicked.
      const meta = Object.assign(this.defaultMeta(), JSON.parse(JSON.stringify(product.meta || {})));
      // Make sure nested objects/arrays always exist even on older meta blobs.
      meta.visibility = Object.assign({ pos: true, whatsapp: true, kiosk: true, website: true }, meta.visibility || {});
      meta.related = Object.assign({ upsell: [], fbt: [] }, meta.related || {});
      meta.images = Array.isArray(meta.images) ? meta.images : [];
      meta.variants = Array.isArray(meta.variants) ? meta.variants : [];
      meta.options = Array.isArray(meta.options) ? meta.options : [];
      // If there's already a main product image but no gallery yet, seed
      // the gallery with it so "Set Main Image" has something to show.
      if (!meta.images.length && product.image) {
        meta.images.push({ url: product.image, isMain: true });
      }
      this.editingProduct = { ...JSON.parse(JSON.stringify(product)), meta };
      // Real columns fall back to sane defaults if a row was inserted
      // manually (e.g. straight into Supabase) and left them null.
      const ep = this.editingProduct;
      if (ep.is_available === null || ep.is_available === undefined) ep.is_available = true;
      if (ep.track_inventory === null || ep.track_inventory === undefined) ep.track_inventory = false;
      if (ep.stock_quantity === null || ep.stock_quantity === undefined) ep.stock_quantity = 0;
      if (ep.low_stock_threshold === null || ep.low_stock_threshold === undefined) ep.low_stock_threshold = 0;
      if (ep.status === null || ep.status === undefined) ep.status = 'active';
      if (ep.featured === null || ep.featured === undefined) ep.featured = false;
      if (ep.cost_price === null || ep.cost_price === undefined) ep.cost_price = 0;
      this.editModalOpen = true;
    },
    closeManage() {
      this.editModalOpen = false;
      this.editingProduct = null;
    },

    async saveManage() {
      if (!this.editingProduct) return;
      if (!this.editingProduct.name || !this.editingProduct.name.trim()) {
        this.showToast('Product name is required', 'error');
        return;
      }
      this.savingManage = true;
      const ep = this.editingProduct;
      // Keep the main "image" column pointing at whichever gallery image
      // is marked as main, so the table/list view stays correct.
      const mainImg = ep.meta.images.find(i => i.isMain) || ep.meta.images[0];
      if (mainImg) ep.image = mainImg.url;
      try {
        const payload = {
          name: ep.name,
          description: ep.description,
          price: ep.price,
          category: normalizeCategory(ep.category),
          alcohol: ep.alcohol,
          image: ep.image,
          meta: ep.meta,
          brand: ep.brand,
          sku: ep.sku,
          barcode: ep.barcode,
          status: ep.status,
          featured: ep.featured,
          cost_price: ep.cost_price,
          is_available: ep.is_available,
          track_inventory: ep.track_inventory,
          stock_quantity: ep.stock_quantity,
          low_stock_threshold: ep.low_stock_threshold,
        };
        const { error } = await this.supabase.from('products').update(payload).eq('id', ep.id);
        if (error) throw error;
        // Reflect changes back into the main products list.
        const idx = this.products.findIndex(p => p.id === ep.id);
        if (idx !== -1) this.products[idx] = { ...this.products[idx], ...payload };
        this.showToast('Product saved', 'success');
        this.closeManage();
      } catch (err) {
        // If the "meta" column doesn't exist yet in Supabase, fall back to
        // saving just the base columns so the basics still work.
        if ((err.message || '').toLowerCase().includes('meta')) {
          try {
            await this.supabase.from('products').update({
              name: ep.name, description: ep.description, price: ep.price,
              category: normalizeCategory(ep.category), alcohol: ep.alcohol, image: ep.image,
              is_available: ep.is_available, stock_quantity: ep.stock_quantity,
              track_inventory: ep.track_inventory, low_stock_threshold: ep.low_stock_threshold,
            }).eq('id', ep.id);
            this.showToast('Saved (add a "meta" jsonb column in Supabase to store the extra product details)', 'info');
            this.closeManage();
          } catch (err2) {
            this.showToast('Save failed: ' + err2.message, 'error');
          }
        } else {
          this.showToast('Save failed: ' + err.message, 'error');
        }
      } finally {
        this.savingManage = false;
      }
    },

    // ── Images ──
    setMainImage(idx) {
      this.editingProduct.meta.images.forEach((img, i) => { img.isMain = (i === idx); });
    },
    removeGalleryImage(idx) {
      const wasMain = this.editingProduct.meta.images[idx].isMain;
      this.editingProduct.meta.images.splice(idx, 1);
      if (wasMain && this.editingProduct.meta.images.length) this.editingProduct.meta.images[0].isMain = true;
    },
    async handleGalleryImageUpload(e) {
      const file = e.target.files[0];
      if (!file) return;
      this.uploadingGalleryImage = true;
      try {
        const url = await this.uploadToStorage(file, this.editingProduct.name || 'product');
        this.editingProduct.meta.images.push({ url, isMain: !this.editingProduct.meta.images.length });
        this.showToast('Image added — preview it above before saving', 'success');
      } catch (err) {
        this.showToast(err.message, 'error');
      } finally {
        this.uploadingGalleryImage = false;
        e.target.value = '';
      }
    },

    // ── Variants ──
    addVariant() {
      this.editingProduct.meta.variants.push({ size: '', sku: '', price: this.editingProduct.price || 0, stock: 0, barcode: '', image: '' });
    },
    triggerVariantImage(idx) {
      const refs = this.$refs['variant_img_' + idx];
      const el = Array.isArray(refs) ? refs[0] : refs;
      if (el) el.click();
    },
    async handleVariantImage(e, idx) {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const url = await this.uploadToStorage(file, (this.editingProduct.name || 'product') + '-variant');
        this.editingProduct.meta.variants[idx].image = url;
        this.showToast('Variant image set', 'success');
      } catch (err) {
        this.showToast(err.message, 'error');
      } finally {
        e.target.value = '';
      }
    },

    // ── Options ──
    addOption() {
      this.editingProduct.meta.options.push({ name: '', value: '' });
    },

    // ── Quick Actions ──
    async duplicateProduct() {
      if (!this.editingProduct || !this.supabase) return;
      try {
        const ep = this.editingProduct;
        const copy = {
          name: ep.name + ' (Copy)', description: ep.description, price: ep.price,
          category: normalizeCategory(ep.category), alcohol: ep.alcohol, image: ep.image,
          meta: JSON.parse(JSON.stringify(ep.meta)),
        };
        const { data, error } = await this.supabase.from('products').insert([copy]).select();
        if (error) throw error;
        this.products.push({ ...data[0], category: normalizeCategory(data[0].category) });
        this.showToast('Product duplicated', 'success');
      } catch (err) {
        this.showToast('Duplicate failed: ' + err.message, 'error');
      }
    },
    archiveProduct() {
      if (!this.editingProduct) return;
      this.editingProduct.status = 'archived';
      this.showToast('Marked as Archived — click Save to confirm', 'info');
    },
    viewSales() {
      // No sales pipeline wired up yet — never error, just say so.
      this.showToast('No sales data yet', 'info');
    },
    previewProduct() {
      if (this.editingProduct && this.editingProduct.image) {
        window.open(this.getValidImageUrl(this.editingProduct.image), '_blank');
      } else {
        this.showToast('No preview available yet', 'info');
      }
    },
    generateQrCode() {
      // Placeholder per spec — wire up a real QR endpoint/library later.
      this.showToast('QR code generation coming soon', 'info');
    },

    toggleDashboard() {
      this.dashboardOpen = !this.dashboardOpen;
    },
    renderCharts() {
      const catMap = {};
      this.products.forEach(p => { catMap[p.category] = (catMap[p.category] || 0) + 1; });
      const labels = Object.keys(catMap);
      const data = Object.values(catMap);
      const colors = ['#E30613','#f59e0b','#10b981','#8b5cf6','#06b6d4','#f97316','#ec4899','#14b8a6','#6366f1','#84cc16','#f43f5e','#0ea5e9','#d946ef','#facc15'];

      const ctx1 = document.getElementById('categoryChart');
      if (ctx1) {
        if (this.charts.category) this.charts.category.destroy();
        this.charts.category = new Chart(ctx1, {
          type: 'doughnut',
          data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length) }] },
          options: { responsive: true, plugins: { legend: { labels: { color: '#71717a', boxWidth: 8, font: { size: 9 } } } } },
        });
      }

      const alco = this.products.filter(p => p.alcohol).length;
      const non = this.products.length - alco;
      const ctx2 = document.getElementById('alcoholChart');
      if (ctx2) {
        if (this.charts.alcohol) this.charts.alcohol.destroy();
        this.charts.alcohol = new Chart(ctx2, {
          type: 'bar',
          data: { labels: ['Alcohol', 'Non-Alcohol'], datasets: [{ label: 'Count', data: [alco, non], backgroundColor: ['#E30613','#22c55e'] }] },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              y: { ticks: { color: '#71717a', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } },
              x: { ticks: { color: '#71717a' } },
            },
          },
        });
      }
    },
  },
}).mount('#app');
