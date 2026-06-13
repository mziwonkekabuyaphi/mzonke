/**
 * config/auth.js — Rands Vibe Auth System
 *
 * Roles: admin | staff | customer  (from profiles.role — single source of truth)
 * Job titles: stored in staff_profiles.job_title — NOT used for access control
 */

import { supabase } from './supabase.js';

/* =========================
   ROLE ROUTES
   admin   → /admin/dashboard.html
   staff   → /staff/dashboard.html
   customer → /app/home.html
========================= */
export const ROLE_ROUTES = {
  admin:    '/admin/dashboard.html',
  staff:    '/staff/dashboard.html',
  customer: '/passport/home.html',
};

/* =========================
   SIGN IN
========================= */
export async function signIn(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { user: null, error: formatAuthError(error) };
    return { user: data.user, error: null };
  } catch (err) {
    console.error('❌ Sign in crash:', err);
    return { user: null, error: 'Network error. Please check your connection and try again.' };
  }
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
   Returns: { profile: { id, email, role, status, wallet_id, account_type } | null, error }

   Error values:
     null         → success
     'NO_PROFILE' → no row found for this user
     'NO_ROLE'    → row exists but role is null/empty
     Error object → unexpected DB / network error
========================= */
export async function getProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, role, status, wallet_id, account_type')
      .eq('id', userId)
      .maybeSingle();

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
     profile: { id, email, role, status, wallet_id, account_type }
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
