// lib/services/phone-pin.ts  (WEB APP REPO)
/**
 * Phone + PIN — a second, parallel credential type for customers, alongside
 * email+password and Passport Key. Modeled closely on passport-key.ts, with
 * one deliberate scope difference: like Passport Key, this ONLY works for a
 * phone number that already has a `profiles` row (e.g. from a prior
 * WhatsApp conversation) — it never creates a profile from nothing. If the
 * phone isn't found, requestPhonePinOtp() returns `not_found`, same as
 * Passport Key does for an unknown email.
 *
 * Flow:
 *   1. requestPhonePinOtp(phone)
 *        - normalizes the phone the same way handle_new_auth_user() does
 *          (0xxxxxxxxx -> 27xxxxxxxxx) so lookups match how the trigger
 *          stores it
 *        - looks up the profile by phone directly, restricted to
 *          role = 'customer' (staff phone numbers, if any exist, must
 *          never be reachable through this flow — see hard constraint #1
 *          in the task)
 *        - refuses if no profile exists, or the profile already has a PIN
 *          set (profiles.phone_pin_set)
 *        - generates a 6-digit code, stores a HASH of it (never the code
 *          itself) with a short expiry in `phone_pin_otps`
 *        - delivers it over WhatsApp via the same internal call
 *          passport-key.ts uses (deliverOtpOverWhatsApp, imported — not
 *          reimplemented)
 *   2. verifyPhonePinOtp(phone, code)
 *        - checks the code against the stored hash, respecting expiry and
 *          a max-attempts limit
 *        - on success, marks that OTP row verified and returns its id as a
 *          one-time `verificationToken`
 *   3. setCustomerPin(phone, pin, verificationToken)
 *        - re-checks the token is for a verified, unexpired row belonging
 *          to this profile
 *        - if the profile has no auth_user_id yet: creates the Supabase
 *          Auth user directly via admin.createUser({ phone, password: pin,
 *          phone_confirm: true }) and links profiles.auth_user_id
 *        - if the profile ALREADY has an auth_user_id (e.g. this customer
 *          previously set up a Passport Key, or signed in with Google or a
 *          Passkey): does NOT create a second auth user — a profile has
 *          exactly one auth_user_id — instead attaches the phone+password
 *          to that SAME existing auth.users row via
 *          admin.updateUserById(existingAuthUserId, { phone, password: pin,
 *          phone_confirm: true })
 *        - either way, sets profiles.phone_pin_set = true
 *        - runs registration completion the same wallet-first way
 *          completeCustomerRegistration()/register.html's activateAccount()
 *          do: ensure_customer_wallet() first, registration_complete
 *          flipped strictly after, and only if not already complete. This
 *          is deliberately NOT skipped even though Passport Key's
 *          equivalent step assumes the wallet already exists (WhatsApp
 *          registration completed it) — a phone-only profile created by
 *          ensureCustomer() on first WhatsApp contact, before name/
 *          surname/email were ever collected, may not have a wallet yet,
 *          and this must never flip registration_complete early (hard
 *          constraint #4).
 *        - deletes the OTP row so the token can't be replayed
 *
 * Requires:
 *   - the `phone_pin_otps` table and `profiles.phone_pin_set` column — see
 *     migrations/003_phone_pin.sql (NOT YET APPLIED — draft only)
 *   - same env vars as passport-key.ts: SUPABASE_URL,
 *     SUPABASE_SERVICE_ROLE_KEY, WHATSAPP_REPO_INTERNAL_URL,
 *     INTERNAL_API_SECRET
 *
 * Only ever called from this repo's server-side API routes
 * (app/api/phone-pin/*) — never import this into client-side code, it uses
 * the service-role key.
 */

import crypto from 'crypto';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { deliverOtpOverWhatsApp } from './passport-key';

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MIN_PIN_LENGTH = 4;
const MAX_PIN_LENGTH = 6;

// -----------------------------------------------------------------------------
// Supabase admin client (service role — bypasses RLS)
// -----------------------------------------------------------------------------

function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase admin credentials');
  }
  return createSupabaseAdmin(url, key);
}

interface ProfileRow {
  id: string;
  phone: string;
  name: string | null;
  surname: string | null;
  email: string | null;
  auth_user_id: string | null;
  phone_pin_set: boolean;
  registration_complete: boolean;
}

/**
 * Normalizes a raw phone string the same way handle_new_auth_user() does,
 * so lookups against `profiles.phone` match how it's actually stored:
 * local 0xxxxxxxxx -> 27xxxxxxxxx, anything else passed through as-is
 * (already-E.164 values fall through unchanged).
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (/^0[0-9]{9}$/.test(digits)) {
    return '27' + digits.slice(1);
  }
  return digits;
}

async function findProfileByPhone(admin: SupabaseClient, phone: string): Promise<ProfileRow | null> {
  const { data, error } = await admin
    .from('profiles')
    .select('id, phone, name, surname, email, auth_user_id, phone_pin_set, registration_complete')
    // Restricted to role = 'customer' — staff/admin/mobile_scanner must
    // never be reachable through this flow, even if a phone number happens
    // to collide (hard constraint #1).
    .eq('role', 'customer')
    .eq('phone', phone)
    .maybeSingle();
  if (error) throw new Error(`Profile lookup failed: ${error.message}`);
  return data as ProfileRow | null;
}

// -----------------------------------------------------------------------------
// OTP helpers
// -----------------------------------------------------------------------------

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// -----------------------------------------------------------------------------
// Status check
// -----------------------------------------------------------------------------

export interface PhonePinStatus {
  exists: boolean;
  hasPin: boolean;
}

export async function checkPhonePinStatus(phoneRaw: string): Promise<PhonePinStatus> {
  const phone = normalizePhone(phoneRaw);
  const admin = getAdminClient();
  const profile = await findProfileByPhone(admin, phone);
  if (!profile) return { exists: false, hasPin: false };
  return { exists: true, hasPin: Boolean(profile.phone_pin_set) };
}

// -----------------------------------------------------------------------------
// Step 1 — request a code
// -----------------------------------------------------------------------------

export interface RequestOtpResult {
  ok: boolean;
  reason?: 'not_found' | 'already_has_pin';
}

export async function requestPhonePinOtp(phoneRaw: string): Promise<RequestOtpResult> {
  const phone = normalizePhone(phoneRaw);
  const admin = getAdminClient();
  const profile = await findProfileByPhone(admin, phone);

  if (!profile) return { ok: false, reason: 'not_found' };
  if (profile.phone_pin_set) return { ok: false, reason: 'already_has_pin' };

  const code = generateCode();

  const { error } = await admin.from('phone_pin_otps').insert({
    profile_id: profile.id,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
  });
  if (error) {
    throw new Error(`Failed to store Phone+PIN OTP: ${error.message}`);
  }

  await deliverOtpOverWhatsApp(profile.phone, code);

  return { ok: true };
}

// -----------------------------------------------------------------------------
// Step 2 — verify the code
// -----------------------------------------------------------------------------

export interface VerifyOtpResult {
  ok: boolean;
  reason?: 'not_found' | 'invalid_or_expired' | 'too_many_attempts';
  verificationToken?: string;
}

export async function verifyPhonePinOtp(phoneRaw: string, codeRaw: string): Promise<VerifyOtpResult> {
  const phone = normalizePhone(phoneRaw);
  const code = codeRaw.trim();
  const admin = getAdminClient();

  const profile = await findProfileByPhone(admin, phone);
  if (!profile) return { ok: false, reason: 'not_found' };

  const { data: row, error } = await admin
    .from('phone_pin_otps')
    .select('*')
    .eq('profile_id', profile.id)
    .is('verified_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up Phone+PIN OTP: ${error.message}`);
  }
  if (!row) return { ok: false, reason: 'invalid_or_expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'invalid_or_expired' };
  }

  if (row.code_hash !== hashCode(code)) {
    await admin.from('phone_pin_otps').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return { ok: false, reason: 'invalid_or_expired' };
  }

  await admin.from('phone_pin_otps').update({ verified_at: new Date().toISOString() }).eq('id', row.id);

  return { ok: true, verificationToken: row.id as string };
}

// -----------------------------------------------------------------------------
// Step 3 — set the PIN
// -----------------------------------------------------------------------------

function isPhoneAlreadyRegisteredError(error: unknown): boolean {
  const anyError = error as { code?: string } | null;
  if (anyError?.code === 'phone_exists') return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('phone_exists') || message.includes('already registered');
}

async function findAuthUserByPhone(admin: SupabaseClient, phone: string): Promise<User | null> {
  const perPage = 200;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Failed to look up existing auth user by phone: ${error.message}`);
    const match = data.users.find((u) => u.phone === phone);
    if (match) return match;
    if (data.users.length < perPage) break;
  }
  return null;
}

/**
 * Ensures a wallet exists and flips registration_complete, in that order —
 * mirrors completeCustomerRegistration() in config/auth.js and
 * register.html's activateAccount() step 3. No-ops if already complete.
 * Deliberately duplicated here (rather than imported) because auth.js is a
 * client-side ES module (imports '../supabase.js', uses the browser
 * Supabase client) and this file is server-only with the admin client —
 * they can't share the import, only the ordering contract.
 */
async function ensureRegistrationComplete(admin: SupabaseClient, profile: ProfileRow): Promise<void> {
  if (profile.registration_complete) return;

  const { error: walletError } = await admin.rpc('ensure_customer_wallet', { p_profile_id: profile.id });
  if (walletError) {
    throw new Error(`Failed to provision wallet: ${walletError.message}`);
  }

  const { error: completeError } = await admin
    .from('profiles')
    .update({ registration_complete: true })
    .eq('id', profile.id);
  if (completeError) {
    throw new Error(`Failed to finalize registration: ${completeError.message}`);
  }
}

export async function setCustomerPin(
  phoneRaw: string,
  pin: string,
  verificationToken: string,
): Promise<void> {
  const phone = normalizePhone(phoneRaw);
  if (pin.length < MIN_PIN_LENGTH || pin.length > MAX_PIN_LENGTH || !/^[0-9]+$/.test(pin)) {
    throw new Error(`Passport PIN must be ${MIN_PIN_LENGTH}–${MAX_PIN_LENGTH} digits.`);
  }

  const admin = getAdminClient();
  const profile = await findProfileByPhone(admin, phone);
  if (!profile) throw new Error('Account not found.');
  if (profile.phone_pin_set) throw new Error('This account already has a PIN set up.');

  const { data: row, error } = await admin
    .from('phone_pin_otps')
    .select('*')
    .eq('id', verificationToken)
    .eq('profile_id', profile.id)
    .maybeSingle();

  if (error || !row || !row.verified_at) {
    throw new Error('Verification expired — please request a new code.');
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error('Verification expired — please request a new code.');
  }

  let authUserId: string;

  if (!profile.auth_user_id) {
    // No auth identity at all yet for this profile — create one.
    try {
      const { data, error: createError } = await admin.auth.admin.createUser({
        phone,
        password: pin,
        phone_confirm: true,
        user_metadata: {
          name: profile.name,
          surname: profile.surname,
        },
      });
      if (createError) throw createError;
      if (!data.user) throw new Error('No user returned from auth creation.');
      authUserId = data.user.id;
    } catch (err) {
      if (!isPhoneAlreadyRegisteredError(err)) {
        throw new Error(`Failed to create auth user: ${err instanceof Error ? err.message : String(err)}`);
      }
      const existing = await findAuthUserByPhone(admin, phone);
      if (!existing) {
        throw new Error(`Failed to create auth user: ${err instanceof Error ? err.message : String(err)}`);
      }
      await admin.auth.admin.updateUserById(existing.id, { password: pin, phone_confirm: true });
      authUserId = existing.id;
    }
  } else {
    // Profile already has an auth identity (Passport Key / Google / Passkey)
    // — attach phone+password to that SAME auth.users row rather than
    // creating a second one. A profile has exactly one auth_user_id.
    const { error: updateAuthError } = await admin.auth.admin.updateUserById(profile.auth_user_id, {
      phone,
      password: pin,
      phone_confirm: true,
    });
    if (updateAuthError) {
      throw new Error(`Failed to attach Phone+PIN to existing account: ${updateAuthError.message}`);
    }
    authUserId = profile.auth_user_id;
  }

  const { error: linkError } = await admin
    .from('profiles')
    .update({ auth_user_id: authUserId, phone_pin_set: true })
    .eq('id', profile.id);

  if (linkError) {
    throw new Error(`Failed to link Phone+PIN to profile: ${linkError.message}`);
  }

  await ensureRegistrationComplete(admin, { ...profile, auth_user_id: authUserId });

  // Burn the OTP row so the token can't be replayed.
  await admin.from('phone_pin_otps').delete().eq('id', row.id);
}
