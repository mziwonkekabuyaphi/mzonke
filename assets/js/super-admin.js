const STORAGE_KEYS = { TENANTS: 'qless_tenants', STAFF: 'qless_staff', TENANT_MODULES: 'qless_tenant_modules', SYSTEM_SETTINGS: 'qless_system_settings', CUSTOM_MODULES: 'qless_custom_modules', TENANT_PRICING: 'qless_tenant_pricing', AGENTS: 'qless_agents', COMMISSIONS: 'qless_commissions', PAYOUTS: 'qless_payouts', MESSAGES: 'qless_messages' };
    
    // BASE_MODULES with new Private Label / Venue Branding module (base price: 500, no per-unit fee, monthly)
    const BASE_MODULES = [
        { id: 1, name: 'Tickets', description: 'Event ticketing & reservations', icon: 'fas fa-ticket-alt', isCustom: false, basePrice: 10, perUnitFee: 0, perUnitLabel: 'Per Ticket', pricingTier: 'Pay as you go' },
        { id: 2, name: 'Queue Management', description: 'Smart virtual queuing', icon: 'fas fa-hourglass-half', isCustom: false, basePrice: 2, perUnitFee: 0, perUnitLabel: 'Per Queue', pricingTier: 'Pay as you go' },
        { id: 3, name: 'Sales and Orders', description: 'Sales & order management from Kiosk, Wallet & WhatsApp', icon: 'fas fa-cash-register', isCustom: false, basePrice: 8, perUnitFee: 0, perUnitLabel: 'Per Order', pricingTier: 'Pay as you go' },
        { id: 4, name: 'Virtual Booze Lockers', description: 'Secure bottle storage', icon: 'fas fa-lock', isCustom: false, basePrice: 1, perUnitFee: 0, perUnitLabel: 'Per Locker', pricingTier: 'Pay as you go' },
        { id: 5, name: 'Shisha Lounge System', description: 'Hookah management', icon: 'fas fa-smoking', isCustom: false, basePrice: 5, perUnitFee: 0, perUnitLabel: 'Per Session', pricingTier: 'Pay as you go' },
        { id: 6, name: 'VVIP Management', description: 'Exclusive VIP accounts', icon: 'fas fa-crown', isCustom: false, basePrice: 0, perUnitFee: 3, perUnitLabel: '% of Transaction', pricingTier: 'Percentage' },
        { id: 7, name: 'Staff Management', description: 'Staff payroll & management', icon: 'fas fa-users', isCustom: false, basePrice: 10, perUnitFee: 0, perUnitLabel: 'Per Staff Member', pricingTier: 'Monthly' },
        { id: 8, name: 'Ordering Service Flow', description: 'Orders via Kiosk, WhatsApp, and wallet (Self-Serve Kiosk alternative)', icon: 'fas fa-mobile-alt', isCustom: false, basePrice: 8, perUnitFee: 0, perUnitLabel: 'Per Order', pricingTier: 'Pay as you go' },
        { id: 9, name: 'Private Label / Venue Branding', description: 'White-label branding for your venue - custom logo, colors, and domain', icon: 'fas fa-trademark', isCustom: false, basePrice: 500, perUnitFee: 0, perUnitLabel: 'Monthly', pricingTier: 'Monthly' }
    ];

    new Vue({
        el: '#app',
        data: {
            sidebarOpen: false, currentSection: 'dashboard', adminName: 'Super Admin (Dev Mode)', tenants: [], tenantModules: {}, selectedTenantId: null,
            showTenantModal: false, showViewModal: false, showResetModal: false, showCreateModuleModal: false, viewingTenant: null, resettingTenant: null, newPassword: '',
            newTenant: { businessName: '', ownerName: '', phone: '', username: '', password: '', agent_id: null },
            newModule: { name: '', description: '', icon: 'fas fa-plug' },
            customModulesList: [], systemSettings: { systemName: 'Rands Venue OS', sidebarHeading: 'Rands Venue OS', logoUrl: '', primaryColor: '#E30613', secondaryColor: '#9f0110', currency: 'ZAR', dateFormat: 'DD/MM/YYYY' },
            showConfirmModal: false, pendingModule: null, pendingModuleAction: null, pendingModuleName: '', pendingOriginalState: false, showToast: false, toastMessage: '', toastTimeout: null,
            billingSelectedTenantId: null, showBillingConfirmModal: false, billingPendingModule: null, billingPendingAction: null, billingPendingModuleName: '', billingPendingOriginalState: false,
            showBillingCreateModal: false, billingNewModule: { name: '', description: '', icon: 'fas fa-plug', basePrice: 29, perUnitFee: 0, perUnitLabel: 'Per Use' },
            showPricingModal: false, pricingModalTenant: null, pricingModalModule: null, pricingForm: { basePrice: 0, perUnitFee: 0, perUnitLabel: '' }, tenantPricing: {},
            agents: [], showAgentModal: false, editingAgent: null, agentForm: { name: '', email: '', phone: '' }, showAgentDetailModal: false, selectedAgent: null,
            globalCommissionRate: 10, globalCommissionType: 'recurring', commissions: [], payouts: [], messages: [], showCustomCommissionModal: false,
            customCommissionForm: { agent_id: null, custom_rate: 10, tenant_id: null }, messageRecipient: 'all', messageSubject: '', messageBody: '', salesChart: null
        },
        computed: {
            currentSectionTitle() { const titles = { dashboard: 'Dashboard', tenants: 'Tenants', modules: 'Modules', 'module-billing': 'Module Billing', 'sales-agents': 'Sales Agents', commissions: 'Commissions', payouts: 'Payouts', messages: 'Messages', settings: 'Settings' }; return titles[this.currentSection] || 'Dashboard'; },
            activeTenantsCount() { return this.tenants.filter(t => t.status === 'Active').length; },
            totalStaffCount() { const allStaff = JSON.parse(localStorage.getItem(STORAGE_KEYS.STAFF) || '[]'); return allStaff.length; },
            recentTenants() { return this.tenants.slice(0, 5); },
            selectedTenant() { return this.tenants.find(t => t.id === this.selectedTenantId); },
            billingSelectedTenant() { return this.tenants.find(t => t.id === this.billingSelectedTenantId); },
            activeAgentsCount() { return this.agents.filter(a => a.status === 'Active').length; },
            totalSalesRevenue() { return this.tenants.reduce((sum, t) => sum + (t.revenue || 0), 0); },
            newClientsThisMonth() { return this.tenants.filter(t => t.createdAt && new Date(t.createdAt).getMonth() === new Date().getMonth()).length; },
            conversionRate() { return Math.floor(Math.random() * 30) + 60; },
            totalAgentCommission() { return this.commissions.reduce((sum, c) => sum + c.amount, 0); },
            topAgents() { return [...this.agents].sort((a,b) => this.getAgentCommission(b.id) - this.getAgentCommission(a.id)).slice(0,5); },
            currentTenantModules() {
                if (!this.selectedTenantId) return [];
                if (!this.tenantModules[this.selectedTenantId]) {
                    const allModules = [...BASE_MODULES];
                    this.customModulesList.forEach(custom => { allModules.push({ id: custom.id, name: custom.name, description: custom.description, icon: custom.icon, isCustom: true, basePrice: custom.basePrice || 29, perUnitFee: custom.perUnitFee || 0, perUnitLabel: custom.perUnitLabel || 'Per Use', pricingTier: 'Custom' }); });
                    this.tenantModules[this.selectedTenantId] = allModules.map(m => ({ ...m, enabled: false }));
                }
                const tenantPricingMap = this.tenantPricing[this.selectedTenantId] || {};
                return this.tenantModules[this.selectedTenantId].map(module => ({ ...module, basePrice: tenantPricingMap[module.id]?.basePrice !== undefined ? tenantPricingMap[module.id].basePrice : module.basePrice, perUnitFee: tenantPricingMap[module.id]?.perUnitFee !== undefined ? tenantPricingMap[module.id].perUnitFee : module.perUnitFee, perUnitLabel: tenantPricingMap[module.id]?.perUnitLabel || module.perUnitLabel }));
            },
        },
        methods: {
            closeSidebar() { if (window.innerWidth <= 768) this.sidebarOpen = false; },
            showSuccessToast(message) { this.toastMessage = message; this.showToast = true; if (this.toastTimeout) clearTimeout(this.toastTimeout); this.toastTimeout = setTimeout(() => { this.showToast = false; }, 3000); },
            copyToClipboard(text) { navigator.clipboard.writeText(text); this.showSuccessToast('Copied to clipboard!'); },
            triggerSync() { window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.TENANT_MODULES, newValue: JSON.stringify(this.tenantModules) })); },
            formatMoney(value) { return (value || 0).toLocaleString(undefined, {minimumFractionDigits: 2}); },
            getAgentName(agentId) { const agent = this.agents.find(a => a.id === agentId); return agent ? agent.name : 'No Agent'; },
            getTenantName(tenantId) { const tenant = this.tenants.find(t => t.id === tenantId); return tenant ? tenant.businessName : 'All Clients'; },
            loadAgents() { const agentsStr = localStorage.getItem(STORAGE_KEYS.AGENTS); if (agentsStr) { this.agents = JSON.parse(agentsStr); } else { this.agents = [{ id: 1, name: 'Sarah Johnson', email: 'sarah@qless.co.za', phone: '+27821234567', status: 'Active', createdAt: '2024-01-15' }, { id: 2, name: 'David Chen', email: 'david@qless.co.za', phone: '+27827654321', status: 'Active', createdAt: '2024-01-20' }, { id: 3, name: 'Maria Garcia', email: 'maria@qless.co.za', phone: '+27829876543', status: 'Active', createdAt: '2024-02-01' }]; localStorage.setItem(STORAGE_KEYS.AGENTS, JSON.stringify(this.agents)); } },
            saveAgents() { localStorage.setItem(STORAGE_KEYS.AGENTS, JSON.stringify(this.agents)); },
            openAddAgentModal() { this.editingAgent = null; this.agentForm = { name: '', email: '', phone: '' }; this.showAgentModal = true; },
            editAgent(agent) { this.editingAgent = agent; this.agentForm = { ...agent }; this.showAgentModal = true; },
            saveAgent() { if (this.editingAgent) { Object.assign(this.editingAgent, this.agentForm); } else { this.agentForm.id = Date.now(); this.agentForm.status = 'Active'; this.agentForm.createdAt = new Date().toISOString().split('T')[0]; this.agents.push({ ...this.agentForm }); } this.saveAgents(); this.showAgentModal = false; this.showSuccessToast('Agent saved successfully!'); },
            toggleAgentStatus(id) { const agent = this.agents.find(a => a.id === id); if (agent) { agent.status = agent.status === 'Active' ? 'Inactive' : 'Active'; this.saveAgents(); this.showSuccessToast(`${agent.name} is now ${agent.status}`); } },
            getAgentTenantCount(agentId) { return this.tenants.filter(t => t.agent_id === agentId).length; },
            getAgentRevenue(agentId) { return this.tenants.filter(t => t.agent_id === agentId).reduce((sum, t) => sum + (t.revenue || 0), 0); },
            getAgentCommission(agentId) { return this.commissions.filter(c => c.agent_id === agentId).reduce((sum, c) => sum + c.amount, 0); },
            getAgentTenants(agentId) { return this.tenants.filter(t => t.agent_id === agentId).map(t => ({ ...t, commission: this.commissions.find(c => c.tenant_id === t.id)?.amount || 0 })); },
            viewAgentDetails(agent) { this.selectedAgent = agent; this.showAgentDetailModal = true; },
            updateTenantAgent(tenant) { this.saveTenants(); this.showSuccessToast(`Tenant assigned to ${this.getAgentName(tenant.agent_id)}`); },
            loadCommissions() { const commissionsStr = localStorage.getItem(STORAGE_KEYS.COMMISSIONS); if (commissionsStr) { this.commissions = JSON.parse(commissionsStr); } else { this.commissions = []; localStorage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify(this.commissions)); } },
            saveCommissions() { localStorage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify(this.commissions)); },
            loadGlobalSettings() { const globalRate = localStorage.getItem('qless_global_commission_rate'); if (globalRate) this.globalCommissionRate = parseFloat(globalRate); const globalType = localStorage.getItem('qless_global_commission_type'); if (globalType) this.globalCommissionType = globalType; },
            saveGlobalCommission() { localStorage.setItem('qless_global_commission_rate', this.globalCommissionRate); localStorage.setItem('qless_global_commission_type', this.globalCommissionType); this.showSuccessToast('Global commission settings saved'); },
            openCustomCommissionModal() { this.customCommissionForm = { agent_id: null, custom_rate: this.globalCommissionRate, tenant_id: null }; this.showCustomCommissionModal = true; },
            saveCustomCommission() { const newCommission = { id: Date.now(), agent_id: this.customCommissionForm.agent_id, custom_rate: this.customCommissionForm.custom_rate, tenant_id: this.customCommissionForm.tenant_id, revenue: 0, amount: 0, status: 'pending', createdAt: new Date().toISOString() }; this.commissions.push(newCommission); this.saveCommissions(); this.showCustomCommissionModal = false; this.showSuccessToast('Custom commission rate set'); },
            approveCommission(commission) { commission.status = 'approved'; this.saveCommissions(); this.showSuccessToast('Commission approved'); },
            markCommissionPaid(commission) { commission.status = 'paid'; this.saveCommissions(); this.showSuccessToast('Commission marked as paid'); },
            loadPayouts() { const payoutsStr = localStorage.getItem(STORAGE_KEYS.PAYOUTS); if (payoutsStr) { this.payouts = JSON.parse(payoutsStr); } else { this.payouts = []; localStorage.setItem(STORAGE_KEYS.PAYOUTS, JSON.stringify(this.payouts)); } },
            savePayouts() { localStorage.setItem(STORAGE_KEYS.PAYOUTS, JSON.stringify(this.payouts)); },
            approvePayout(payout) { payout.status = 'approved'; this.savePayouts(); this.showSuccessToast('Payout approved'); },
            rejectPayout(payout) { payout.status = 'rejected'; this.savePayouts(); this.showSuccessToast('Payout rejected'); },
            markPayoutPaid(payout) { payout.status = 'paid'; this.savePayouts(); this.showSuccessToast('Payout marked as paid'); },
            loadMessages() { const messagesStr = localStorage.getItem(STORAGE_KEYS.MESSAGES); if (messagesStr) { this.messages = JSON.parse(messagesStr); } else { this.messages = [{ id: 1, sender: 'System', subject: 'Welcome', message: 'Welcome to QLess Super Admin', date: '2024-02-01', type: 'incoming', read: true }]; localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(this.messages)); } },
            saveMessages() { localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(this.messages)); },
            sendMessage() { if (!this.messageSubject || !this.messageBody) { this.showSuccessToast('Please fill subject and message'); return; } const newMessage = { id: Date.now(), sender: 'Super Admin', recipient: this.messageRecipient, subject: this.messageSubject, message: this.messageBody, date: new Date().toISOString().split('T')[0], type: 'outgoing', read: false }; this.messages.unshift(newMessage); this.saveMessages(); this.messageSubject = ''; this.messageBody = ''; this.showSuccessToast('Message sent successfully'); },
            viewMessage(msg) { if (!msg.read) { msg.read = true; this.saveMessages(); } },
            initSalesChart() { const ctx = document.getElementById('salesChart'); if (!ctx) return; const salesData = this.agents.map(a => this.getAgentRevenue(a.id)); if (this.salesChart) this.salesChart.destroy(); this.salesChart = new Chart(ctx, { type: 'bar', data: { labels: this.agents.map(a => a.name.split(' ')[0]), datasets: [{ label: 'Revenue (R)', data: salesData, backgroundColor: '#E30613', borderRadius: 8 }] }, options: { responsive: true, maintainAspectRatio: true } }); },
            refreshAllData() { this.loadTenantPricing(); this.loadAgents(); this.loadCommissions(); this.loadPayouts(); this.loadMessages(); this.loadGlobalSettings(); this.initSalesChart(); this.$forceUpdate(); },
            loadTenantPricing() { const pricingStr = localStorage.getItem(STORAGE_KEYS.TENANT_PRICING); this.tenantPricing = pricingStr ? JSON.parse(pricingStr) : {}; },
            saveTenantPricing() { localStorage.setItem(STORAGE_KEYS.TENANT_PRICING, JSON.stringify(this.tenantPricing)); this.triggerSync(); },
            openPricingModal(module) { this.pricingModalTenant = this.selectedTenant; this.pricingModalModule = module; const existingPricing = this.tenantPricing[this.selectedTenantId]?.[module.id] || {}; this.pricingForm = { basePrice: existingPricing.basePrice !== undefined ? existingPricing.basePrice : module.basePrice, perUnitFee: existingPricing.perUnitFee !== undefined ? existingPricing.perUnitFee : module.perUnitFee, perUnitLabel: existingPricing.perUnitLabel || module.perUnitLabel }; this.showPricingModal = true; },
            closePricingModal() { this.showPricingModal = false; this.pricingModalTenant = null; this.pricingModalModule = null; },
            saveModulePricing() { if (!this.selectedTenantId || !this.pricingModalModule) return; if (!this.tenantPricing[this.selectedTenantId]) this.tenantPricing[this.selectedTenantId] = {}; this.tenantPricing[this.selectedTenantId][this.pricingModalModule.id] = { basePrice: parseFloat(this.pricingForm.basePrice) || 0, perUnitFee: parseFloat(this.pricingForm.perUnitFee) || 0, perUnitLabel: this.pricingForm.perUnitLabel || 'Per Use' }; this.saveTenantPricing(); this.showSuccessToast(`Pricing updated for ${this.pricingModalModule.name}`); this.closePricingModal(); this.loadTenantModules(); },
            loadData() {
                const tenantsStr = localStorage.getItem(STORAGE_KEYS.TENANTS);
                if (tenantsStr) { this.tenants = JSON.parse(tenantsStr); } else { this.tenants = [{ id: 1, businessName: 'Skyline Lounge', ownerName: 'Thabo Nkosi', phone: '0821112233', username: 'skyline_admin', password: 'skyline123', status: 'Active', agent_id: null, revenue: 28500, createdAt: '2024-02-15' }, { id: 2, businessName: 'Cape Tavern', ownerName: 'Lerato Dlamini', phone: '0834455667', username: 'capetavern', password: 'tavern456', status: 'Active', agent_id: 1, revenue: 18900, createdAt: '2024-02-10' }, { id: 3, businessName: 'Gold Reef Venue', ownerName: 'Sipho Mbele', phone: '0719988776', username: 'goldreef', password: 'reef789', status: 'Suspended', agent_id: 2, revenue: 5200, createdAt: '2024-01-20' }]; localStorage.setItem(STORAGE_KEYS.TENANTS, JSON.stringify(this.tenants)); }
                const customStr = localStorage.getItem(STORAGE_KEYS.CUSTOM_MODULES); this.customModulesList = customStr ? JSON.parse(customStr) : [];
                const modulesStr = localStorage.getItem(STORAGE_KEYS.TENANT_MODULES); if (modulesStr) { this.tenantModules = JSON.parse(modulesStr); }
                const settingsStr = localStorage.getItem(STORAGE_KEYS.SYSTEM_SETTINGS); if (settingsStr) { this.systemSettings = JSON.parse(settingsStr); }
                if (!this.systemSettings.sidebarHeading) this.systemSettings.sidebarHeading = 'Rands Venue OS';
                if (!this.systemSettings.secondaryColor) this.systemSettings.secondaryColor = '#9f0110';
                this.loadTenantPricing();
                if (this.tenants.length > 0 && !this.selectedTenantId) { this.selectedTenantId = this.tenants[0].id; }
                if (this.tenants.length > 0 && !this.billingSelectedTenantId) { this.billingSelectedTenantId = this.tenants[0].id; }
            },
            saveTenants() { localStorage.setItem(STORAGE_KEYS.TENANTS, JSON.stringify(this.tenants)); this.triggerSync(); },
            saveModules() { localStorage.setItem(STORAGE_KEYS.TENANT_MODULES, JSON.stringify(this.tenantModules)); this.triggerSync(); },
            saveSystemSettings() { localStorage.setItem(STORAGE_KEYS.SYSTEM_SETTINGS, JSON.stringify(this.systemSettings)); },
            saveCustomModules() { localStorage.setItem(STORAGE_KEYS.CUSTOM_MODULES, JSON.stringify(this.customModulesList)); this.triggerSync(); },
            openCreateTenantModal() { this.newTenant = { businessName: '', ownerName: '', phone: '', username: '', password: '', agent_id: null }; this.showTenantModal = true; },
            openCreateModuleModal() { this.newModule = { name: '', description: '', icon: 'fas fa-plug' }; this.showCreateModuleModal = true; },
            createCustomModule() {
                if (!this.newModule.name) { this.showSuccessToast('❌ Module name is required'); return; }
                const exists = this.customModulesList.some(m => m.name.toLowerCase() === this.newModule.name.toLowerCase());
                if (exists) { this.showSuccessToast('❌ A module with this name already exists'); return; }
                const newId = 100 + this.customModulesList.length + 1;
                const newCustomModule = { id: newId, name: this.newModule.name, description: this.newModule.description || 'Custom module', icon: this.newModule.icon || 'fas fa-plug', isCustom: true, createdAt: new Date().toISOString(), basePrice: 29, perUnitFee: 0, perUnitLabel: 'Per Use', pricingTier: 'Custom' };
                this.customModulesList.push(newCustomModule); this.saveCustomModules();
                Object.keys(this.tenantModules).forEach(tenantId => { if (this.tenantModules[tenantId] && !this.tenantModules[tenantId].some(m => m.id === newId)) { this.tenantModules[tenantId].push({ id: newId, name: newCustomModule.name, description: newCustomModule.description, icon: newCustomModule.icon, isCustom: true, enabled: false, basePrice: 29, perUnitFee: 0, perUnitLabel: 'Per Use', pricingTier: 'Custom' }); } });
                this.saveModules(); if (this.selectedTenantId) { this.loadTenantModules(); }
                this.showCreateModuleModal = false; this.showSuccessToast(`✅ Custom module "${this.newModule.name}" created!`);
            },
            createTenant() {
                if (!this.newTenant.businessName || !this.newTenant.ownerName || !this.newTenant.username || !this.newTenant.password) { alert('Please fill all required fields'); return; }
                if (this.newTenant.password.length < 4) { alert('Password must be at least 4 characters'); return; }
                const newId = this.tenants.length > 0 ? Math.max(...this.tenants.map(t => t.id)) + 1 : 1;
                const allModulesForTenant = [...BASE_MODULES]; this.customModulesList.forEach(custom => { allModulesForTenant.push({ id: custom.id, name: custom.name, description: custom.description, icon: custom.icon, isCustom: true, enabled: false, basePrice: custom.basePrice || 29, perUnitFee: custom.perUnitFee || 0, perUnitLabel: custom.perUnitLabel || 'Per Use', pricingTier: 'Custom' }); });
                const newTenantObj = { id: newId, businessName: this.newTenant.businessName, ownerName: this.newTenant.ownerName, phone: this.newTenant.phone || 'N/A', username: this.newTenant.username, password: this.newTenant.password, status: 'Active', agent_id: this.newTenant.agent_id, revenue: 0, createdAt: new Date().toISOString() };
                this.tenants.push(newTenantObj); this.tenantModules[newId] = allModulesForTenant.map(m => ({ ...m, enabled: false }));
                this.saveTenants(); this.saveModules(); this.showTenantModal = false; this.showSuccessToast(`Tenant "${this.newTenant.businessName}" created!`);
                this.refreshAllData();
            },
            deleteTenant(tenant) {
                if (!confirm(`⚠️ PERMANENT DELETE - Type "${tenant.businessName}" to confirm:`)) return;
                const confirmText = prompt(`Type "${tenant.businessName}" to confirm:`);
                if (confirmText !== tenant.businessName) { this.showSuccessToast('Deletion cancelled'); return; }
                const tenantIndex = this.tenants.findIndex(t => t.id === tenant.id); if (tenantIndex !== -1) { this.tenants.splice(tenantIndex, 1); }
                const allStaff = JSON.parse(localStorage.getItem(STORAGE_KEYS.STAFF) || '[]'); localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(allStaff.filter(s => s.tenantId !== tenant.id)));
                const allModules = JSON.parse(localStorage.getItem(STORAGE_KEYS.TENANT_MODULES) || '{}'); delete allModules[tenant.id]; localStorage.setItem(STORAGE_KEYS.TENANT_MODULES, JSON.stringify(allModules)); this.tenantModules = allModules;
                localStorage.removeItem(`qless_tenant_branding_${tenant.id}`);
                if (this.tenantPricing[tenant.id]) { delete this.tenantPricing[tenant.id]; this.saveTenantPricing(); }
                if (this.selectedTenantId === tenant.id) { this.selectedTenantId = this.tenants.length > 0 ? this.tenants[0].id : null; if (this.selectedTenantId) { this.loadTenantModules(); } }
                if (this.billingSelectedTenantId === tenant.id) { this.billingSelectedTenantId = this.tenants.length > 0 ? this.tenants[0].id : null; }
                this.saveTenants(); this.showSuccessToast(`✅ "${tenant.businessName}" deleted`);
                this.refreshAllData();
            },
            suspendTenant(id) { const tenant = this.tenants.find(t => t.id === id); if (tenant) { tenant.status = 'Suspended'; this.saveTenants(); this.showSuccessToast(`${tenant.businessName} suspended`); } },
            activateTenant(id) { const tenant = this.tenants.find(t => t.id === id); if (tenant) { tenant.status = 'Active'; this.saveTenants(); this.showSuccessToast(`${tenant.businessName} activated`); } },
            viewTenant(tenant) { this.viewingTenant = tenant; this.showViewModal = true; },
            resetTenantPassword(tenant) { this.resettingTenant = tenant; this.newPassword = ''; this.showResetModal = true; },
            confirmResetPassword() { if (!this.newPassword || this.newPassword.length < 4) { alert('Password must be at least 4 characters'); return; } if (this.resettingTenant) { this.resettingTenant.password = this.newPassword; this.saveTenants(); this.showSuccessToast(`Password reset for ${this.resettingTenant.businessName}: ${this.newPassword}`); this.showResetModal = false; this.resettingTenant = null; } },
            loadTenantModules() { this.$forceUpdate(); },
            confirmModuleToggle(module) { this.pendingModule = module; this.pendingModuleName = module.name; this.pendingModuleAction = module.enabled ? 'enable' : 'disable'; this.pendingOriginalState = !module.enabled; this.showConfirmModal = true; },
            cancelModuleToggle() { if (this.pendingModule) { this.pendingModule.enabled = this.pendingOriginalState; } this.showConfirmModal = false; this.pendingModule = null; },
            confirmModuleToggleSave() { const tenantId = this.selectedTenantId; if (!tenantId || !this.pendingModule) { this.showConfirmModal = false; return; } const index = this.tenantModules[tenantId].findIndex(m => m.id === this.pendingModule.id); if (index !== -1) { this.tenantModules[tenantId][index].enabled = this.pendingModule.enabled; } this.saveModules(); const tenant = this.tenants.find(t => t.id === tenantId); this.showSuccessToast(`${tenant?.businessName}: ${this.pendingModule.name} is now ${this.pendingModule.enabled ? 'ENABLED' : 'DISABLED'}`); this.showConfirmModal = false; this.pendingModule = null; },
            saveBranding() { this.saveSystemSettings(); this.showSuccessToast(`Branding saved! Sidebar heading updated to "${this.systemSettings.sidebarHeading}"`); },
            saveSystemConfig() { this.saveSystemSettings(); this.showSuccessToast('System configuration saved!'); },
            logout() { sessionStorage.clear(); window.location.href = 'login.html'; }
        },
        mounted() {
            this.loadData();
            this.loadAgents();
            this.loadCommissions();
            this.loadPayouts();
            this.loadMessages();
            this.loadGlobalSettings();
            window.addEventListener('resize', () => { if (window.innerWidth > 768) this.sidebarOpen = false; });
            // Fullscreen mode removed - no buttons or functionality
        }
    });
