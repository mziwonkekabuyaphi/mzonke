// lib/services/passport.ts  (WEB APP REPO)
/**
 * Merged Passport Key credential system — replaces lib/services/passport-key.ts
 * and lib/services/phone-pin.ts. A customer sets up ONE password, using
 * whichever identifier (email or phone) they prefer at that moment, and can
 * then log in with either. Attaching a second identifier later links to the
 * SAME auth.users row and does not create a second credential.
 *
 * Reuses the exact "attach to existing auth_user_id if present, else create"
 * branch that used to live only in phone-pin.ts's setCustomerPin() — that
 * branch is now the normal path for both identifier types, not a fallback.
 *
 * Requires (see 004_passport_merge.sql, not yet applied):
 *   - profiles.passport_set boolean
 *   - passport_otps table (RLS enabled, zero policies — service-role only,
 *     see the passport_key_otps incident note in the task doc)
 *
 * Only ever called from this repo's server-side API routes (api/passport/*)
 * — never import this into client-side code, it uses the service-role key.
 */

import crypto from 'crypto';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { deliverOtpOverWhatsApp } from './passport-key';

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MIN_PASSWORD_LENGTH = 6;

export type IdentifierType = 'email' | 'phone';

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
  email: string | null;
  name: string | null;
  surname: string | null;
  auth_user_id: string | null;
  passport_set: boolean;
  registration_complete: boolean;
}

const PROFILE_COLUMNS =
  'id, phone, email, name, surname, auth_user_id, passport_set, registration_complete';

// -----------------------------------------------------------------------------
// Identifier normalization
// -----------------------------------------------------------------------------

/**
 * Mirrors phone-pin.ts's normalizePhone() exactly: local 0xxxxxxxxx ->
 * 27xxxxxxxxx, anything else passed through as-is.
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (/^0[0-9]{9}$/.test(digits)) {
    return '27' + digits.slice(1);
  }
  return digits;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizeIdentifier(type: IdentifierType, raw: string): string {
  return type === 'phone' ? normalizePhone(raw) : normalizeEmail(raw);
}

async function findProfileByIdentifier(
  admin: SupabaseClient,
  type: IdentifierType,
  value: string,
): Promise<ProfileRow | null> {
  const column = type === 'phone' ? 'phone' : 'email';
  const { data, error } = await admin
    .from('profiles')
    .select(PROFILE_COLUMNS)
    // Same restriction as phone-pin.ts's findProfileByPhone — staff/admin/
    // mobile_scanner rows must never be reachable through this flow.
    .eq('role', 'customer')
    .eq(column, value)
    .maybeSingle();
  if (error) throw new Error(`Profile lookup failed: ${error.message}`);
  return data as ProfileRow | null;
}

async function findProfileById(admin: SupabaseClient, profileId: string): Promise<ProfileRow | null> {
  const { data, error } = await admin
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('role', 'customer')
    .eq('id', profileId)
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

export interface PassportStatus {
  exists: boolean;
  passportSet: boolean;
  hasIdentifier: boolean;
  /**
   * NOT in the original task spec — added because requestPassportOtp() and
   * verifyPassportOtp() are keyed by profileId, and the client has no other
   * way to obtain it (it only ever has the raw identifier the customer
   * typed). Flagging this as a deliberate addition rather than a silent
   * change: without it, the client-side flow in passport.js has no way to
   * call the next endpoint at all. Only present when exists is true.
   */
  profileId?: string;
}

export async function checkPassportStatus(
  type: IdentifierType,
  valueRaw: string,
): Promise<PassportStatus> {
  const value = normalizeIdentifier(type, valueRaw);
  const admin = getAdminClient();
  const profile = await findProfileByIdentifier(admin, type, value);
  if (!profile) return { exists: false, passportSet: false, hasIdentifier: false };

  let hasIdentifier = false;
  if (profile.auth_user_id) {
    const { data, error } = await admin.auth.admin.getUserById(profile.auth_user_id);
    if (error) throw new Error(`Failed to look up auth identity: ${error.message}`);
    const authValue = type === 'phone' ? data.user?.phone : data.user?.email;
    hasIdentifier = Boolean(authValue && normalizeIdentifier(type, authValue) === value);
  }

  return {
    exists: true,
    passportSet: Boolean(profile.passport_set),
    hasIdentifier,
    profileId: profile.id,
  };
}

// -----------------------------------------------------------------------------
// Step 1 — request a code
// -----------------------------------------------------------------------------

export interface RequestOtpResult {
  ok: boolean;
}

/**
 * Always delivers to profiles.phone over WhatsApp, regardless of which
 * identifier (email or phone) the customer is currently attaching — phone
 * is the one channel actually verified as belonging to them (see task doc).
 * Never sends a setup code to an email address.
 */
export async function requestPassportOtp(profileId: string): Promise<RequestOtpResult> {
  const admin = getAdminClient();
  const profile = await findProfileById(admin, profileId);
  if (!profile) throw new Error('Account not found.');

  const code = generateCode();

  const { error } = await admin.from('passport_otps').insert({
    profile_id: profile.id,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
  });
  if (error) {
    throw new Error(`Failed to store Passport OTP: ${error.message}`);
  }

  await deliverOtpOverWhatsApp(profile.phone, code);

  return { ok: true };
}

// -----------------------------------------------------------------------------
// Step 2 — verify the code
// -----------------------------------------------------------------------------

export interface VerifyOtpResult {
  ok: boolean;
  reason?: 'invalid_or_expired' | 'too_many_attempts';
  verificationToken?: string;
}

export async function verifyPassportOtp(profileId: string, codeRaw: string): Promise<VerifyOtpResult> {
  const code = codeRaw.trim();
  const admin = getAdminClient();

  const { data: row, error } = await admin
    .from('passport_otps')
    .select('*')
    .eq('profile_id', profileId)
    .is('verified_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up Passport OTP: ${error.message}`);
  }
  if (!row) return { ok: false, reason: 'invalid_or_expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'invalid_or_expired' };
  }

  if (row.code_hash !== hashCode(code)) {
    await admin.from('passport_otps').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return { ok: false, reason: 'invalid_or_expired' };
  }

  await admin.from('passport_otps').update({ verified_at: new Date().toISOString() }).eq('id', row.id);

  return { ok: true, verificationToken: row.id as string };
}

// -----------------------------------------------------------------------------
// Step 3 — set the Passport Key
// -----------------------------------------------------------------------------

function isIdentifierAlreadyRegisteredError(error: unknown): boolean {
  const anyError = error as { code?: string } | null;
  if (anyError?.code === 'phone_exists' || anyError?.code === 'email_exists') return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('phone_exists') ||
    message.includes('email_exists') ||
    message.includes('already registered')
  );
}

async function findAuthUserByIdentifier(
  admin: SupabaseClient,
  type: IdentifierType,
  value: string,
): Promise<User | null> {
  const perPage = 200;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Failed to look up existing auth user: ${error.message}`);
    const match = data.users.find((u) => (type === 'phone' ? u.phone === value : u.email === value));
    if (match) return match;
    if (data.users.length < perPage) break;
  }
  return null;
}

/**
 * Copied unchanged from phone-pin.ts's ensureRegistrationComplete() — wallet
 * first, registration_complete flipped strictly after, no-op if already
 * complete. Deliberately duplicated rather than imported (server-only admin
 * client here vs. the client-side supabase in config/auth.js) — only the
 * ordering contract is shared, not the code.
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

/**
 * `password` is optional — see Decision 1 in the task doc. Omitted only
 * when attaching a second identifier to an account that already has a
 * password (profile.auth_user_id already set): the customer already proved
 * ownership of their existing password, and re-attaching a fresh OTP-proven
 * identifier shouldn't silently force a re-prompt. A brand-new credential
 * (no auth_user_id yet) always requires one — there's nothing to fall back
 * on. When a password IS supplied on the "already has an identity" branch,
 * it's applied — the freshest OTP-verified identifier is treated as valid
 * proof to also reset the password, exactly as originally specified.
 */
export async function setPassportKey(
  profileId: string,
  identifierType: IdentifierType,
  identifierValueRaw: string,
  password: string | undefined,
  verificationToken: string,
): Promise<void> {
  const identifierValue = normalizeIdentifier(identifierType, identifierValueRaw);
  const admin = getAdminClient();

  const profile = await findProfileById(admin, profileId);
  if (!profile) throw new Error('Account not found.');

  if (!profile.auth_user_id && password === undefined) {
    throw new Error('A password is required to set up your Passport Key.');
  }
  if (password !== undefined) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Passport Key must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
  }

  const { data: row, error: rowError } = await admin
    .from('passport_otps')
    .select('*')
    .eq('id', verificationToken)
    .eq('profile_id', profile.id)
    .maybeSingle();

  if (rowError || !row || !row.verified_at) {
    throw new Error('Verification expired — please request a new code.');
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error('Verification expired — please request a new code.');
  }

  const confirmField = identifierType === 'email' ? 'email_confirm' : 'phone_confirm';
  let authUserId: string;

  if (!profile.auth_user_id) {
    // No auth identity at all yet for this profile — create one.
    try {
      const { data, error: createError } = await admin.auth.admin.createUser({
        [identifierType]: identifierValue,
        password,
        [confirmField]: true,
        user_metadata: {
          name: profile.name,
          surname: profile.surname,
        },
      } as never);
      if (createError) throw createError;
      if (!data.user) throw new Error('No user returned from auth creation.');
      authUserId = data.user.id;
    } catch (err) {
      if (!isIdentifierAlreadyRegisteredError(err)) {
        throw new Error(`Failed to create auth user: ${err instanceof Error ? err.message : String(err)}`);
      }
      const existing = await findAuthUserByIdentifier(admin, identifierType, identifierValue);
      if (!existing) {
        throw new Error(`Failed to create auth user: ${err instanceof Error ? err.message : String(err)}`);
      }
      await admin.auth.admin.updateUserById(existing.id, { password, [confirmField]: true } as never);
      authUserId = existing.id;
    }
  } else {
    // Profile already has an auth identity — attach this identifier (and
    // password, if one was supplied) to that SAME row rather than creating
    // a second one. A profile has exactly one auth_user_id.
    const update: Record<string, unknown> = {
      [identifierType]: identifierValue,
      [confirmField]: true,
    };
    if (password !== undefined) {
      update.password = password;
    }
    const { error: updateAuthError } = await admin.auth.admin.updateUserById(
      profile.auth_user_id,
      update as never,
    );
    if (updateAuthError) {
      throw new Error(`Failed to attach Passport Key identifier: ${updateAuthError.message}`);
    }
    authUserId = profile.auth_user_id;
  }

  const profileUpdate: Record<string, unknown> = {
    auth_user_id: authUserId,
    passport_set: true,
  };
  // Keep profiles.email in sync when email is the identifier just attached.
  // profiles.phone is never changed here — it's the WhatsApp-verified
  // channel and stays the source of truth for OTP delivery regardless.
  if (identifierType === 'email') {
    profileUpdate.email = identifierValue;
  }

  const { error: linkError } = await admin.from('profiles').update(profileUpdate).eq('id', profile.id);
  if (linkError) {
    throw new Error(`Failed to link Passport Key to profile: ${linkError.message}`);
  }

  await ensureRegistrationComplete(admin, { ...profile, auth_user_id: authUserId });

  // Burn the OTP row so the token can't be replayed.
  await admin.from('passport_otps').delete().eq('id', row.id);
}
