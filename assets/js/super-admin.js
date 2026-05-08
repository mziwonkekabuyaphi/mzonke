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

        /* =========================
           SUPABASE DATA
        ========================= */

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

        /* =========================
           UI STATES
        ========================= */

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

        /* =========================
           COMMISSION
        ========================= */

        globalCommissionRate: 10,
        globalCommissionType: 'recurring',

        showCustomCommissionModal: false,
        customCommissionForm: {
            agent_id: null,
            custom_rate: 10,
            tenant_id: null
        }
    },

    /* =========================
       COMPUTED
    ========================= */

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

    /* =========================
       MOUNTED
========================= */

    async mounted() {
        await this.loadTenants();
        await this.loadAgents();
    },

    /* =========================
       METHODS
========================= */

    methods: {

        /* =========================
           TOAST
        ========================= */

        showSuccessToast(msg) {
            this.toastMessage = msg;
            this.showToast = true;

            setTimeout(() => {
                this.showToast = false;
            }, 3000);
        },

        /* =========================
           TENANTS
        ========================= */

        async loadTenants() {

            const { data, error } = await supabase
                .from('tenants')
                .select(`
                    id,
                    name,
                    owner_id,
                    created_at,
                    profiles:owner_id (
                        name,
                        surname,
                        phone
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Load tenants error:', error);
                return;
            }

            this.tenants = data || [];

            if (!this.selectedTenantId && this.tenants.length > 0) {
                this.selectedTenantId = this.tenants[0].id;
                this.loadTenantModules();
            }
        },

        async createTenant() {

            if (!this.newTenant.businessName || !this.newTenant.username) {
                alert('Missing required fields');
                return;
            }

            const { data, error } = await supabase
                .from('tenants')
                .insert([{
                    name: this.newTenant.businessName,
                    owner_id: null
                }])
                .select()
                .single();

            if (error) {
                console.error(error);
                return;
            }

            this.tenants.unshift(data);

            this.showTenantModal = false;
            this.showSuccessToast('Tenant created');

            await this.createTenantModules(data.id);
        },

        async deleteTenant(tenant) {

            if (!confirm(`Delete ${tenant.name}?`)) return;

            const { error } = await supabase
                .from('tenants')
                .delete()
                .eq('id', tenant.id);

            if (error) {
                console.error(error);
                return;
            }

            this.tenants = this.tenants.filter(t => t.id !== tenant.id);

            this.showSuccessToast('Tenant deleted');
        },

        /* =========================
           MODULES
        ========================= */

        async loadTenantModules() {

            if (!this.selectedTenantId) return;

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
                console.error(error);
                return;
            }

            this.currentModules = data || [];
        },

        async createTenantModules(tenantId) {

            const { data: modules } = await supabase
                .from('modules')
                .select('id');

            if (!modules) return;

            const rows = modules.map(m => ({
                tenant_id: tenantId,
                module_id: m.id,
                enabled: false
            }));

            await supabase.from('tenant_modules').insert(rows);
        },

        async toggleModule(moduleRow) {

            const { error } = await supabase
                .from('tenant_modules')
                .update({
                    enabled: moduleRow.enabled
                })
                .eq('id', moduleRow.id);

            if (error) {
                console.error(error);
                return;
            }

            this.showSuccessToast(
                moduleRow.module.name + ' updated'
            );
        },

        /* =========================
           AGENTS (basic stub for now)
        ========================= */

        async loadAgents() {
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'tenant_admin');

            this.agents = data || [];
        },

        /* =========================
           UI HELPERS
        ========================= */

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
