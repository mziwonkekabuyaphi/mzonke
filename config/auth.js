/**
 * config/auth.js — Rands Vibe Auth System
 *
 * Roles: superadmin | admin | staff | customer | mobile_scanner  (from profiles.role — single source of truth)
 * Job titles: stored in staff_profiles.job_title — NOT used for access control
 * Note: mobile_scanner is a standalone role — it does NOT carry a job title and
 * is routed straight to the scanner app instead of the staff console.
 */

import { supabase } from './supabase.js';

/* =========================
   ROLE ROUTES
   superadmin      → /superadmin/dashboard.html (platform-level, above tenant admin)
   admin           → /tenant/dashboard.html
   staff           → /staff/console.html
   customer        → /passport/index.html
   mobile_scanner  → /staff/scanner.html   (standalone — bypasses the staff console)
========================= */
export const ROLE_ROUTES = {
  admin:           '/tenant/dashboard.html',
  staff:           '/staff/console.html',
  customer:        '/passport/index.html',
  mobile_scanner:  '/staff/scanner.html',
  superadmin:      '/superadmin/dashboard.html',
};

/* =========================
   SIGN IN — PASSPORT (unified email OR phone + password)
   Single credential, either identifier. signIn()/signInWithPhone() below
   are kept as thin wrappers so nothing else in the codebase breaks.
========================= */
export async function signInWithPassport(identifierType, identifierValue, password) {
  try {
    const payload =
      identifierType === 'email'
        ? { email: identifierValue, password }
        : { phone: identifierValue, password };
    const { data, error } = await supabase.auth.signInWithPassword(payload);
    if (error) return { user: null, error: formatAuthError(error) };
    return { user: data.user, error: null };
  } catch (err) {
    console.error('❌ Passport sign in crash:', err);
    return { user: null, error: 'Network error. Please check your connection and try again.' };
  }
}

/* =========================
   SIGN IN  (thin wrapper over signInWithPassport)
========================= */
export async function signIn(email, password) {
  return signInWithPassport('email', email, password);
}

/* =========================
   SIGN IN — PHONE + PIN  (thin wrapper over signInWithPassport)
   Kept for any code that still imports signInWithPhone directly.
========================= */
export async function signInWithPhone(phone, pin) {
  return signInWithPassport('phone', phone, pin);
}

/* =========================
   SIGN OUT
========================= */
export async function signOutUser() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('❌ Sign out error:', error.message);
      return { error };
    }
    window.location.href = '/login.html';
    return { error: null };
  } catch (err) {
    console.error('❌ Sign out crash:', err);
    return { error: { message: 'Failed to sign out.' } };
  }
}

/* =========================
   GET PROFILE
   Fetches the full profile row from `profiles` for a given auth user ID.
   Returns: { profile: { id, email, role, status, wallet_id, account_type, registration_complete } | null, error }

   Error values:
     null         → success
     'NO_PROFILE' → no row found for this user
     'NO_ROLE'    → row exists but role is null/empty
     Error object → unexpected DB / network error
========================= */
export async function getProfile(userId) {
  try {
    // Customers registered via WhatsApp get their `profiles` row created
    // (with a DB-generated id) before any auth user exists; the auth user
    // is linked afterwards via `profiles.auth_user_id`, and `profiles.id`
    // is deliberately never changed to match it (see lib/services/customer.ts).
    // Customers registered through the web flow have `profiles.id === auth.users.id`.
    // Looking up by auth_user_id first — with an id-based fallback for that
    // web-flow case — covers both, and stops WhatsApp customers from being
    // told their account "isn't configured" on their very first web login.
    let { data, error } = await supabase
      .from('profiles')
      .select('id, email, role, status, wallet_id, account_type, auth_user_id, registration_complete')
      .eq('auth_user_id', userId)
      .maybeSingle();

    if (!error && !data) {
      const fallback = await supabase
        .from('profiles')
        .select('id, email, role, status, wallet_id, account_type, auth_user_id, registration_complete')
        .eq('id', userId)
        .maybeSingle();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('❌ Profile fetch error:', error.message);
      return { profile: null, error };
    }

    if (!data) {
      console.warn('⚠️ No profile found for user:', userId);
      return { profile: null, error: 'NO_PROFILE' };
    }

    if (!data.role) {
      console.warn('⚠️ Profile has no role for user:', userId);
      return { profile: null, error: 'NO_ROLE' };
    }

    console.log('✅ Profile loaded — role:', data.role, '| status:', data.status);
    return { profile: data, error: null };
  } catch (err) {
    console.error('❌ Profile fetch crash:', err);
    return { profile: null, error: err };
  }
}

/* =========================
   GET USER ROLE  (thin wrapper kept for backwards compat)
========================= */
export async function getUserRole(userId) {
  const { profile, error } = await getProfile(userId);
  return { role: profile?.role ?? null, error };
}

/* =========================
   RESOLVE ROLE
   Given a profile object, validates the role is one we recognise.
   Returns the role string or null.
========================= */
export function resolveRole(profile) {
  if (!profile?.role) return null;
  const valid = Object.keys(ROLE_ROUTES);
  if (!valid.includes(profile.role)) {
    console.error('❌ Unknown role:', profile.role);
    return null;
  }
  return profile.role;
}

/* =========================
   CURRENT SESSION
========================= */
export async function getCurrentSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    return { session: data.session, error };
  } catch (err) {
    console.error('❌ Session fetch crash:', err);
    return { session: null, error: err };
  }
}

/* =========================
   CURRENT USER
========================= */
export async function getCurrentUser() {
  try {
    const { data, error } = await supabase.auth.getUser();
    return { user: data?.user ?? null, error };
  } catch (err) {
    console.error('❌ Current user crash:', err);
    return { user: null, error: err };
  }
}

/* =========================
   GET SESSION WITH PROFILE
   Returns the combined session object expected by the app:
   {
     user:    { id, email },
     profile: { id, email, role, status, wallet_id, account_type, registration_complete }
   }
   Returns null if there is no active session.
========================= */
export async function getSessionWithProfile() {
  try {
    const { session } = await getCurrentSession();
    if (!session) return null;

    const user = session.user;
    const { profile, error } = await getProfile(user.id);

    if (error || !profile) return null;

    return {
      user:    { id: user.id, email: user.email },
      profile,
    };
  } catch (err) {
    console.error('❌ getSessionWithProfile crash:', err);
    return null;
  }
}

/* =========================
   COMPLETE CUSTOMER REGISTRATION
   Mirrors register.html's activateAccount(): wallet first, then flip
   registration_complete strictly after — never the other order. Any login
   path (email, Google, passkey) can hit a profile that was created by the
   `handle_new_auth_user` DB trigger but never finished this step — e.g. an
   OAuth user whose provider redirect skipped register.html entirely — so
   this lives here rather than being duplicated per auth method.

   No-ops (returns immediately) if the profile is already complete.
========================= */
export async function completeCustomerRegistration(profile) {
  if (profile.registration_complete) return { error: null };

  try {
    const { error: walletError } = await supabase
      .rpc('ensure_customer_wallet', { p_profile_id: profile.id });
    if (walletError) {
      console.error('❌ Wallet creation failed:', walletError.message);
      return { error: walletError };
    }

    const { error: completeError } = await supabase
      .from('profiles')
      .update({ registration_complete: true })
      .eq('id', profile.id);
    if (completeError) {
      console.error('❌ Failed to flag registration complete:', completeError.message);
      return { error: completeError };
    }

    console.log('✅ Registration completed (wallet created) for profile:', profile.id);
    return { error: null };
  } catch (err) {
    console.error('❌ completeCustomerRegistration crash:', err);
    return { error: err };
  }
}

/* =========================
   ROLE REDIRECT HELPERS
========================= */
export function getRoleRedirectUrl(role) {
  if (!role) return null;
  return ROLE_ROUTES[role] ?? null;
}

export function redirectByRole(role) {
  const url = getRoleRedirectUrl(role);
  if (!url) {
    console.error('❌ Cannot redirect: invalid or missing role →', role);
    return false;
  }
  console.log('➡️  Redirecting to:', url);
  window.location.href = url;
  return true;
}

/* =========================
   REQUIRE AUTH  (route guard)

   Usage:
     const { user, profile } = await requireAuth(['admin']) ?? {};
     if (!user) return; // already redirected

   allowedRoles: [] → any authenticated, active user may proceed
   allowedRoles: ['admin'] → only admins; others are redirected to their own dashboard

   Redirects to /login.html when:
     • no session
     • profile missing (NO_PROFILE / NO_ROLE)
     • status !== 'Active'
     • unexpected DB error

   Redirects to role dashboard when:
     • user is authenticated + active but role not in allowedRoles
========================= */
export async function requireAuth(allowedRoles = []) {
  try {
    const { session } = await getCurrentSession();
    if (!session) {
      console.warn('⚠️ No session — redirecting to login');
      window.location.href = '/login.html';
      return null;
    }

    const user = session.user;
    const { profile, error } = await getProfile(user.id);

    // Profile missing or role absent → account genuinely not configured
    if (error === 'NO_PROFILE' || error === 'NO_ROLE' || !profile) {
      console.warn('⚠️ Profile/role missing — signing out');
      await supabase.auth.signOut();
      window.location.href = '/login.html?error=no_profile';
      return null;
    }

    // Unexpected DB / network error → don't expose details, send to login
    if (error) {
      console.error('❌ Auth guard — profile fetch failed:', error);
      window.location.href = '/login.html?error=auth_error';
      return null;
    }

    // Account inactive
    if (profile.status !== 'Active') {
      console.warn('⛔ Account inactive — status:', profile.status);
      await supabase.auth.signOut();
      window.location.href = '/login.html?error=inactive';
      return null;
    }

    // Role not in allowedRoles → send to their own dashboard
    if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
      console.warn('⛔ Access denied for role:', profile.role, '| allowed:', allowedRoles);
      redirectByRole(profile.role);
      return null;
    }

    return { user, profile };
  } catch (err) {
    console.error('❌ Auth guard crash:', err);
    window.location.href = '/login.html';
    return null;
  }
}

/* =========================
   GOOGLE OAUTH
========================= */
export async function signInWithGoogle() {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/login.html' },
    });
    if (error) return { error: formatAuthError(error) };
    // Supabase immediately redirects the browser — nothing to return
    return { error: null };
  } catch (err) {
    console.error('❌ Google OAuth crash:', err);
    return { error: 'Network error. Please check your connection and try again.' };
  }
}

/* =========================
   PASSKEY (WebAuthn)
========================= */
export async function isPasskeySupported() {
  try {
    return (
      window.PublicKeyCredential !== undefined &&
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function' &&
      (await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

export async function signInWithPasskey() {
  try {
    const { data, error } = await supabase.auth.signInWithPasskey();
    if (error) return { user: null, error: formatAuthError(error) };
    return { user: data?.user ?? null, error: null };
  } catch (err) {
    console.error('❌ Passkey sign-in crash:', err);
    return { user: null, error: 'Passkey sign-in failed. Please try another method.' };
  }
}

/* =========================
   AUTH ERROR FORMATTER
========================= */
function formatAuthError(error) {
  const msg    = error.message?.toLowerCase() ?? '';
  const status = error.status;

  if (msg.includes('invalid login credentials'))  return 'Incorrect email or password.';
  if (msg.includes('email not confirmed'))         return 'Please verify your email before signing in.';
  if (status === 429 || msg.includes('too many')) return 'Too many attempts. Please wait and try again.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Network error. Check your connection.';
  return error.message || 'Authentication failed.';
}
