/**
 * middleware/staff-guard.js — Protect staff routes
 */

import { getCurrentShift, hasPermission, getAssignedKiosks } from '../config/auth-staff.js';
import { getCurrentUser, getUserRole } from '../config/auth.js';

export async function initStaffGuard() {
  // Check if user is authenticated
  const { user } = await getCurrentUser();
  if (!user) {
    window.location.href = '/login.html';
    return false;
  }

  const { role } = await getUserRole(user.id);
  
  // Staff-specific checks
  if (role === 'staff') {
    const { isClockedIn, shift } = await getCurrentShift();
    
    // Check if clocked in (optional: enforce for certain pages)
    const requiresClockIn = window.location.pathname.includes('/staff/operations/');
    if (requiresClockIn && !isClockedIn) {
      alert('Please clock in before accessing this page');
      window.location.href = '/staff/dashboard.html';
      return false;
    }

    // Store shift info in session
    if (shift) {
      sessionStorage.setItem('currentShiftId', shift.id);
      sessionStorage.setItem('currentKioskId', shift.kiosk_id || '');
    }
  }

  return true;
}

export async function checkPagePermission(requiredModule, requiredAction) {
  const hasAccess = await hasPermission(requiredModule, requiredAction);
  if (!hasAccess) {
    window.location.href = '/staff/unauthorized.html';
    return false;
  }
  return true;
}