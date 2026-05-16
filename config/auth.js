/**
 * config/auth.js — Rands Vibe Auth System (FIXED)
 */

import { supabase } from './supabase.js';

/* =========================
   ROLE ROUTES – updated to your exact spec
========================= */
export const ROLE_ROUTES = {
  super_admin: '/super-admin/dashboard.html',
  admin: '/tenant/dashboard.html',
  staff: '/staff/dashboard.html',
  customer: '/passport/home.html',
};

/* =========================
   SIGN IN
========================= */
export async function signIn(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return {
        user: null,
        error: formatAuthError(error),
      };
    }

    return {
      user: data.user,
      error: null,
    };
  } catch (err) {
    console.error('❌ Sign in crash:', err);
    return {
      user: null,
      error: 'Network error. Please check connection and try again.',
    };
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
   GET USER ROLE
========================= */
export async function getUserRole(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('❌ Role fetch error:', error.message);
      return { role: null, error };
    }

    if (!data || !data.role) {
      console.warn('⚠️ No role found for user:', userId);
      return { role: null, error: 'NO_ROLE' };
    }

    console.log('✅ Role loaded:', data.role);
    return { role: data.role, error: null };
  } catch (err) {
    console.error('❌ Role system crash:', err);
    return { role: null, error: err };
  }
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
    return { user: data?.user || null, error };
  } catch (err) {
    console.error('❌ Current user crash:', err);
    return { user: null, error: err };
  }
}

/* =========================
   ROLE REDIRECT
========================= */
export function getRoleRedirectUrl(role) {
  if (!role) return null;
  return ROLE_ROUTES[role] || null;
}

export function redirectByRole(role) {
  const url = getRoleRedirectUrl(role);
  if (!url) {
    console.error('❌ Cannot redirect: invalid or missing role', role);
    return false;
  }
  console.log('➡️ Redirecting to:', url);
  window.location.href = url;
  return true;
}

/* =========================
   REQUIRE AUTH
========================= */
export async function requireAuth(allowedRoles = []) {
  try {
    const { session } = await getCurrentSession();
    if (!session) {
      console.warn('⚠️ No session found');
      window.location.href = '/login.html';
      return null;
    }

    const user = session.user;
    const { role, error } = await getUserRole(user.id);

    if (error || !role) {
      console.warn('⚠️ Role validation failed – signing out');
      await supabase.auth.signOut();
      window.location.href = '/login.html';
      return null;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
      console.warn('⛔ Access denied for role:', role);
      redirectByRole(role);
      return null;
    }

    return { user, role };
  } catch (err) {
    console.error('❌ Auth guard crash:', err);
    window.location.href = '/login.html';
    return null;
  }
}

/* =========================
   AUTH ERROR FORMATTER
========================= */
function formatAuthError(error) {
  const msg = error.message?.toLowerCase() || '';
  const status = error.status;

  if (msg.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please verify your email before signing in.';
  }
  if (status === 429 || msg.includes('too many')) {
    return 'Too many attempts. Please wait and try again.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Network error. Check your connection.';
  }
  return error.message || 'Authentication failed.';
}