/**
 * config/auth-staff.js — Staff-specific auth features
 * Extends your existing auth.js
 */

import { supabase } from './supabase.js';
import { getCurrentUser, getUserRole } from './auth.js';

/* =========================
   STAFF CLOCK-IN/OUT SYSTEM
========================= */

/**
 * Clock in staff member with PIN verification
 * @param {string} pin - 4-6 digit PIN
 * @param {string} kioskId - Optional kiosk UUID
 */
export async function clockIn(pin, kioskId = null) {
  try {
    const { user, error: userError } = await getCurrentUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get profile with PIN validation
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, clock_in_pin, status')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return { success: false, error: 'Profile not found' };
    }

    // Verify staff role
    if (!['admin', 'staff'].includes(profile.role)) {
      return { success: false, error: 'Only staff can clock in' };
    }

    // Check if already clocked in
    const { data: activeShift, error: shiftError } = await supabase
      .from('staff_shifts')
      .select('id')
      .eq('staff_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (activeShift) {
      return { success: false, error: 'Already clocked in' };
    }

    // Verify PIN (in production, use hashed comparison)
    if (profile.clock_in_pin !== pin) {
      // Log failed attempt
      await logStaffActivity(user.id, 'clock_in_failed', 'auth', 'Invalid PIN attempt');
      return { success: false, error: 'Invalid PIN' };
    }

    if (profile.status !== 'Active') {
      return { success: false, error: 'Account is inactive' };
    }

    // Create shift record
    const { data: shift, error: createError } = await supabase
      .from('staff_shifts')
      .insert({
        staff_id: user.id,
        kiosk_id: kioskId,
        login_time: new Date().toISOString(),
        status: 'active',
        login_method: 'pin',
        ip_address: await getClientIP(),
        device_info: navigator.userAgent
      })
      .select()
      .single();

    if (createError) {
      return { success: false, error: createError.message };
    }

    // Log successful clock-in
    await logStaffActivity(user.id, 'clock_in', 'auth', 'Clocked in successfully', shift.id);

    return { success: true, shift, error: null };
  } catch (err) {
    console.error('❌ Clock in error:', err);
    return { success: false, error: 'Clock in failed' };
  }
}

/**
 * Clock out staff member
 */
export async function clockOut() {
  try {
    const { user, error: userError } = await getCurrentUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get active shift
    const { data: shift, error: shiftError } = await supabase
      .from('staff_shifts')
      .select('id, login_time')
      .eq('staff_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!shift) {
      return { success: false, error: 'No active shift found' };
    }

    const logoutTime = new Date();
    const hoursWorked = calculateHoursWorked(shift.login_time, logoutTime);

    // Update shift
    const { error: updateError } = await supabase
      .from('staff_shifts')
      .update({
        logout_time: logoutTime.toISOString(),
        hours_worked: hoursWorked,
        status: 'completed'
      })
      .eq('id', shift.id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    await logStaffActivity(user.id, 'clock_out', 'auth', `Clocked out after ${hoursWorked} hours`, shift.id);

    return { success: true, hoursWorked, error: null };
  } catch (err) {
    console.error('❌ Clock out error:', err);
    return { success: false, error: 'Clock out failed' };
  }
}

/**
 * Get current shift status
 */
export async function getCurrentShift() {
  try {
    const { user } = await getCurrentUser();
    if (!user) return { isClockedIn: false, shift: null };

    const { data: shift, error } = await supabase
      .from('staff_shifts')
      .select(`
        id,
        login_time,
        kiosk_id,
        status,
        kiosks (name, location)
      `)
      .eq('staff_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (error) throw error;

    return {
      isClockedIn: !!shift,
      shift: shift || null
    };
  } catch (err) {
    console.error('❌ Get shift error:', err);
    return { isClockedIn: false, shift: null };
  }
}

/* =========================
   PERMISSION SYSTEM
========================= */

/**
 * Check if staff has permission for an action
 * @param {string} module - e.g., 'orders', 'ticketing', 'shisha'
 * @param {string} permission - e.g., 'create', 'read', 'update', 'delete'
 */
export async function hasPermission(module, permission) {
  try {
    const { user } = await getCurrentUser();
    if (!user) return false;

    const { role } = await getUserRole(user.id);
    if (!role) return false;

    // Super admin and admin have all permissions
    if (role === 'super_admin' || role === 'admin') return true;

    // Check role_permissions table
    const { data, error } = await supabase
      .from('role_permissions')
      .select('id')
      .eq('role', role)
      .eq('module', module)
      .eq('permission', permission)
      .maybeSingle();

    if (error) {
      console.error('Permission check error:', error);
      return false;
    }

    return !!data;
  } catch (err) {
    console.error('❌ Permission check error:', err);
    return false;
  }
}

/**
 * Get all permissions for current staff
 */
export async function getUserPermissions() {
  try {
    const { user } = await getCurrentUser();
    if (!user) return [];

    const { role } = await getUserRole(user.id);
    if (!role) return [];

    if (role === 'super_admin' || role === 'admin') {
      // Return all possible permissions (simplified)
      return ['*'];
    }

    const { data, error } = await supabase
      .from('role_permissions')
      .select('module, permission')
      .eq('role', role);

    if (error) throw error;

    return data.map(p => `${p.module}:${p.permission}`);
  } catch (err) {
    console.error('❌ Get permissions error:', err);
    return [];
  }
}

/* =========================
   KIOSK ACCESS CONTROL
========================= */

/**
 * Get kiosks assigned to staff member
 */
export async function getAssignedKiosks() {
  try {
    const { user } = await getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('staff_kiosk_access')
      .select(`
        kiosk_id,
        is_primary,
        kiosks (id, name, location, status)
      `)
      .eq('staff_id', user.id);

    if (error) throw error;

    return data.map(item => ({
      id: item.kiosks.id,
      name: item.kiosks.name,
      location: item.kiosks.location,
      status: item.kiosks.status,
      isPrimary: item.is_primary
    }));
  } catch (err) {
    console.error('❌ Get assigned kiosks error:', err);
    return [];
  }
}

/**
 * Verify staff can access specific kiosk
 */
export async function canAccessKiosk(kioskId) {
  try {
    const { user } = await getCurrentUser();
    if (!user) return false;

    const { role } = await getUserRole(user.id);
    if (role === 'super_admin' || role === 'admin') return true;

    const { data, error } = await supabase
      .from('staff_kiosk_access')
      .select('id')
      .eq('staff_id', user.id)
      .eq('kiosk_id', kioskId)
      .maybeSingle();

    if (error) throw error;

    return !!data;
  } catch (err) {
    console.error('❌ Kiosk access check error:', err);
    return false;
  }
}

/* =========================
   STAFF ACTIVITY LOGGING
========================= */

/**
 * Log staff activity
 */
export async function logStaffActivity(staffId, action, module, description, relatedId = null) {
  try {
    await supabase
      .from('staff_activity_logs')
      .insert({
        staff_id: staffId,
        action,
        module,
        description,
        related_id: relatedId,
        created_at: new Date().toISOString()
      });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

/* =========================
   STAFF DASHBOARD DATA
========================= */

/**
 * Get today's shift summary
 */
export async function getTodayShiftSummary() {
  try {
    const { user } = await getCurrentUser();
    if (!user) return null;

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('staff_shifts')
      .select('id, login_time, logout_time, hours_worked, status')
      .eq('staff_id', user.id)
      .gte('login_time', today)
      .lt('login_time', tomorrow);

    if (error) throw error;

    const activeShift = data.find(s => s.status === 'active');
    const completedShifts = data.filter(s => s.status === 'completed');
    const totalHours = completedShifts.reduce((sum, s) => sum + (s.hours_worked || 0), 0);

    return {
      activeShift,
      completedShifts,
      totalHours,
      shiftsCount: data.length
    };
  } catch (err) {
    console.error('❌ Get shift summary error:', err);
    return null;
  }
}

/* =========================
   HELPER FUNCTIONS
========================= */

function calculateHoursWorked(loginTime, logoutTime) {
  const start = new Date(loginTime);
  const end = new Date(logoutTime);
  const hours = (end - start) / (1000 * 60 * 60);
  return Math.round(hours * 100) / 100;
}

async function getClientIP() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch {
    return null;
  }
}

/* =========================
   MIDDLEWARE / GUARD
========================= */

/**
 * Require staff role with optional permission check
 * @param {string} permission - Optional permission (e.g., 'orders:create')
 */
export async function requireStaff(allowedModules = []) {
  const authResult = await requireAuth(['staff', 'admin', 'super_admin']);
  if (!authResult) return null;

  // Check if user has required permissions
  for (const module of allowedModules) {
    const [mod, perm] = module.split(':');
    const hasAccess = await hasPermission(mod, perm);
    if (!hasAccess) {
      console.warn(`⛔ Missing permission: ${module}`);
      // Redirect to staff dashboard
      window.location.href = '/staff/dashboard.html';
      return null;
    }
  }

  return authResult;
}