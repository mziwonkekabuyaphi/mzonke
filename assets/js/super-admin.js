import { supabase } from '../../config/supabase.js';

/* =========================
   VUE APP
========================= */

new Vue({
    el: '#app',

    data: {
        sidebarOpen: false,
        currentSection: 'dashboard',

        adminName: 'Super Admin (Dev Mode)',

        tenants: [],
        selectedTenantId: null,
        currentModules: [],

        agents: [],
        commissions: [],
        payouts: [],
        messages: [],

        systemSettings: {
            systemName: 'Rands Venue OS',
            sidebarHeading: 'Rands Venue OS',
            primaryColor: '#E30613',
            secondaryColor: '#9f0110',
            currency: 'ZAR',
            dateFormat: 'DD/MM/YYYY'
        },

        showTenantModal: false,
        showViewModal: false,
        showResetModal: false,

        viewingTenant: null,
        resettingTenant: null,
        newPassword: '',

        newTenant: {
            businessName: '',
            ownerName: '',
            phone: '',
            username: '',
            password: '',
            agent_id: null
        },

        showToast: false,
        toastMessage: '',

        showConfirmModal: false,
        pendingModule: null,
        pendingModuleAction: null,

        showPricingModal: false,
        pricingModalModule: null,
        pricingForm: {},

        globalCommissionRate: 10,
        globalCommissionType: 'recurring',

        showCustomCommissionModal: false,
        customCommissionForm: {
            agent_id: null,
            custom_rate: 10,
            tenant_id: null
        }
    },

    computed: {

        currentSectionTitle() {
            const titles = {
                dashboard: 'Dashboard',
                tenants: 'Tenants',
                modules: 'Modules',
                'sales-agents': 'Sales Agents',
                commissions: 'Commissions',
                payouts: 'Payouts',
                messages: 'Messages',
                settings: 'Settings'
            };
            return titles[this.currentSection] || 'Dashboard';
        },

        selectedTenant() {
            return this.tenants.find(t => t.id === this.selectedTenantId);
        },

        activeTenantsCount() {
            return this.tenants.filter(t => t.status === 'Active').length;
        }
    },

    async mounted() {
        console.log('Vue app mounted');
        await this.loadTenants();
        await this.loadAgents();
    },

    methods: {

        showSuccessToast(msg) {
            this.toastMessage = msg;
            this.showToast = true;
            setTimeout(() => {
                this.showToast = false;
            }, 3000);
        },

        async loadTenants() {
            console.log('Loading tenants...');
            
            const { data, error } = await supabase
                .from('tenants')
                .select('id, name, owner_id, created_at')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Load tenants error:', error.message);
                return;
            }

            console.log('Tenants loaded:', data);
            this.tenants = data || [];

            if (!this.selectedTenantId && this.tenants.length > 0) {
                this.selectedTenantId = this.tenants[0].id;
                await this.loadTenantModules();
            }
        },

        async createTenant() {
            if (!this.newTenant.businessName) {
                alert('Business name is required');
                return;
            }

            try {
                const { data: tenant, error: tenantError } = await supabase
                    .from('tenants')
                    .insert([{
                        name: this.newTenant.businessName,
                        owner_id: null
                    }])
                    .select()
                    .single();

                if (tenantError) {
                    console.error('Tenant error:', tenantError.message);
                    alert(tenantError.message);
                    return;
                }

                this.tenants.unshift(tenant);
                await this.createTenantModules(tenant.id);
                this.showTenantModal = false;

                this.newTenant = {
                    businessName: '',
                    ownerName: '',
                    phone: '',
                    username: '',
                    password: '',
                    agent_id: null
                };

                this.showSuccessToast('Tenant created successfully');

            } catch (err) {
                console.error('Unexpected error:', err);
            }
        },

        async deleteTenant(tenant) {
            if (!confirm(`Delete ${tenant.name}?`)) return;

            const { error } = await supabase
                .from('tenants')
                .delete()
                .eq('id', tenant.id);

            if (error) {
                console.error(error.message);
                return;
            }

            this.tenants = this.tenants.filter(t => t.id !== tenant.id);
            this.showSuccessToast('Tenant deleted');
        },

        async loadTenantModules() {
            console.log('Loading modules for tenant:', this.selectedTenantId);
            
            if (!this.selectedTenantId) {
                console.log('No tenant selected');
                return;
            }

            const { data, error } = await supabase
                .from('tenant_modules')
                .select(`
                    id,
                    enabled,
                    module:module_id (
                        id,
                        name,
                        description,
                        icon,
                        base_price,
                        per_unit_fee,
                        per_unit_label
                    )
                `)
                .eq('tenant_id', this.selectedTenantId);

            if (error) {
                console.error('Load modules error:', error.message);
                return;
            }

            console.log('Modules loaded:', data);
            this.currentModules = data || [];
        },

        async createTenantModules(tenantId) {
            const { data: existing } = await supabase
                .from('tenant_modules')
                .select('id')
                .eq('tenant_id', tenantId);

            if (existing && existing.length > 0) {
                console.log('Modules already exist for tenant');
                return;
            }

            const { data: modules, error } = await supabase
                .from('modules')
                .select('id');

            if (error) {
                console.error('Error fetching modules:', error.message);
                return;
            }

            if (!modules || modules.length === 0) {
                console.log('No modules found in modules table');
                return;
            }

            const rows = modules.map(m => ({
                tenant_id: tenantId,
                module_id: m.id,
                enabled: false
            }));

            const { error: insertError } = await supabase
                .from('tenant_modules')
                .insert(rows);

            if (insertError) {
                console.error('Module insert error:', insertError.message);
            } else {
                console.log('Modules created successfully for tenant');
            }
        },

        async toggleModule(moduleRow) {
            const newEnabledState = !moduleRow.enabled;
            const originalState = moduleRow.enabled;
            
            moduleRow.enabled = newEnabledState;
            
            try {
                const { error } = await supabase
                    .from('tenant_modules')
                    .update({ enabled: newEnabledState })
                    .eq('id', moduleRow.id);
                
                if (error) throw error;
                
                this.showSuccessToast(`${moduleRow.module.name} ${newEnabledState ? 'enabled' : 'disabled'}`);
                
            } catch (error) {
                moduleRow.enabled = originalState;
                console.error('Toggle error:', error.message);
                alert('Failed to toggle module: ' + error.message);
            }
        },

        async loadAgents() {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'tenant_admin');

            if (error) {
                console.error(error.message);
                return;
            }

            this.agents = data || [];
        },

        closeSidebar() {
            if (window.innerWidth < 768) {
                this.sidebarOpen = false;
            }
        },

        logout() {
            sessionStorage.clear();
            window.location.href = 'login.html';
        }
    }
});
