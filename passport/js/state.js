// ============================================
// APP STATE — single source of truth, lives for the whole SPA session.
// Pages read from here instead of re-querying Supabase on every navigation.
// Call refreshSession()/refreshWallet() only when the data might actually
// be stale (e.g. right after login, or when a realtime event fires) —
// NOT on every page mount.
// ============================================

import { supabase } from '../../config/supabase.js';

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
        .select('id, name, surname, phone, card_number, card_cvv, role')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

    if (!profile) {
        const fallback = await supabase
            .from('profiles')
            .select('id, name, surname, phone, card_number, card_cvv, role')
            .eq('id', session.user.id)
            .maybeSingle();
        profile = fallback.data;
    }

    if (!profile) {
        // First-time login: no profiles row yet under either lookup path.
        // This used to live duplicated inside tickets.js's own initAuth();
        // moved here since every page relies on appState.profile existing,
        // not just tickets.
        const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
                id: session.user.id,
                auth_user_id: session.user.id,
                name: session.user.user_metadata?.full_name || 'User',
                phone: session.user.user_metadata?.phone || '',
                role: 'customer'
            })
            .select('id, name, surname, phone, card_number, card_cvv, role')
            .single();
        if (insertError) console.error('[state] Profile creation failed:', insertError);
        profile = newProfile || null;
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
        .select('id, balance, status, block_reason')
        .eq('user_id', profileId)
        .maybeSingle();

    // Postgres numeric/decimal columns (wallets.balance) come back from
    // PostgREST as strings, not numbers, to avoid float rounding loss.
    // Normalizing here — once, centrally — means every page can safely
    // treat appState.wallet.balance as a number instead of each consumer
    // having to know/guess the wire type itself. (A `typeof balance ===
    // 'number'` check on the raw value would silently fail and read as 0 —
    // that's exactly what was happening in lockers.js / shisha.js.)
    appState.wallet = wallet ? { ...wallet, balance: Number(wallet.balance) || 0 } : null;
    notify();
    return appState.wallet;
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
            appState.wallet = { ...appState.wallet, ...payload.new, balance: Number(payload.new.balance) || 0 };
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
    // login.html is a static page at the repo root, NOT an SPA route —
    // this file lives at passport/js/state.js, so ../../ gets us out of
    // passport/ entirely to the repo root where login.html sits.
    window.location.href = '../../login.html';
}
