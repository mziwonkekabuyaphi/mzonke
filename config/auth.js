/**
 * aconfig/auth.js — Rands Vibe (FIXED)
 * Handles Supabase auth + role system cleanly
 */

import { supabase } from './supabase.js';

/* =========================
   ROLE ROUTES
========================= */
export const ROLE_ROUTES = {
  super_admin:  '/super-admin/dashboard.html',
  tenant_admin: '/tenant/dashboard.html',
  staff:        '/staff/dashboard.html',
  customer:     '/customer/home.html',
};

/* =========================
   SIGN IN
========================= */
export async function signIn(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return { user: null, error: formatAuthError(error) };
    }

    return { user: data.user, error: null };

  } catch (err) {
    return {
      user: null,
      error: 'Network error. Please check connection and try again.'
    };
  }
}

/* =========================
   GET USER ROLE (FIXED)
   - NO silent fallback
   - NO .single() crash trap
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
   SESSION
========================= */
export async function getCurrentSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    return { session: data.session, error };
  } catch (err) {
    return { session: null, error: err };
  }
}

/* =========================
   REDIRECT (SAFE)
========================= */
export function redirectByRole(role) {
  if (!role) {
    console.error('❌ Cannot redirect: role is missing');
    window.location.href = '/login.html';
    return;
  }

  const route = ROLE_ROUTES[role];

  if (!route) {
    console.error('❌ Unknown role:', role);
    window.location.href = '/login.html';
    return;
  }

  console.log('➡️ Redirecting to:', route);
  window.location.href = route;
}

/* =========================
   ERROR HANDLING
========================= */
function formatAuthError(error) {
  const msg = error.message?.toLowerCase() || '';
  const status = error.status;

  if (msg.includes('invalid login')) {
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
