// ============================================
// APP STATE — single source of truth, lives for the whole SPA session.
// Pages read from here instead of re-querying Supabase on every navigation.
// Call refreshSession()/refreshWallet() only when the data might actually
// be stale (e.g. right after login, or when a realtime event fires) —
// NOT on every page mount.
// ============================================

import { supabase } from '../../../config/supabase.js';

export const appState = {
    session: null,
    profile: null,      // profiles row (id, name, surname, phone, card_number, card_cvv)
    wallet: null,        // wallets row (id, balance, status)
    channels: {
        wallet: null,
        payment: null
    }
};

const listeners = new Set();

export function onStateChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn); // returns an unsubscribe fn
}

function notify() {
    listeners.forEach(fn => fn(appState));
}

export async function refreshSession() {
    const { data: { session } } = await supabase.auth.getSession();
    appState.session = session;
    if (!session) return null;

    let { data: profile } = await supabase
        .from('profiles')
        .select('id, name, surname, phone, card_number, card_cvv')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

    if (!profile) {
        const fallback = await supabase
            .from('profiles')
            .select('id, name, surname, phone, card_number, card_cvv')
            .eq('id', session.user.id)
            .maybeSingle();
        profile = fallback.data;
    }

    appState.profile = profile;
    notify();
    return session;
}

export async function refreshWallet() {
    const profileId = appState.profile?.id || appState.session?.user?.id;
    if (!profileId) return null;

    const { data: wallet } = await supabase
        .from('wallets')
        .select('id, balance, status')
        .eq('user_id', profileId)
        .maybeSingle();

    appState.wallet = wallet;
    notify();
    return wallet;
}

// Set up ONE realtime subscription for the whole app session — pages
// subscribe via onStateChange() instead of each page opening its own
// channel and tearing it down on navigation.
export function setupWalletRealtime() {
    if (appState.channels.wallet || !appState.wallet?.id) return;
    appState.channels.wallet = supabase
        .channel(`wallet-${appState.wallet.id}`)
        .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'wallets',
            filter: `id=eq.${appState.wallet.id}`
        }, (payload) => {
            appState.wallet = { ...appState.wallet, ...payload.new };
            notify();
        })
        .subscribe();
}

export async function logout() {
    Object.values(appState.channels).forEach(ch => ch && supabase.removeChannel(ch));
    appState.channels = { wallet: null, payment: null };
    await supabase.auth.signOut();
    appState.session = null;
    appState.profile = null;
    appState.wallet = null;
    location.hash = '#/login'; // or wherever your login route/page lives
}
