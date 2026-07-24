// lib/services/passport-key.ts  (WEB APP REPO)
/**
 * Passport Key setup — how a customer who registered via WhatsApp (name,
 * surname, email, wallet — no password, in the OTHER repo) later gets web
 * access from THIS repo.
 *
 * This repo and the WhatsApp repo are separate deployments that share one
 * Supabase project. This file talks to Supabase directly (profiles table +
 * auth admin API) rather than importing anything from the WhatsApp repo —
 * there is no shared code between the two, only the shared database and
 * one internal HTTP call (to deliver the OTP over WhatsApp, since only
 * that repo holds WhatsApp send credentials).
 *
 * Flow:
 *   1. requestPassportKeyOtp(email)
 *        - looks up the profile by email directly in `profiles`
 *        - refuses if the profile doesn't exist, or already has a
 *          Passport Key (auth_user_id set)
 *        - generates a 6-digit code, stores a HASH of it (never the code
 *          itself) with a short expiry in `passport_key_otps`
 *        - calls the WhatsApp repo's internal send endpoint to deliver it
 *   2. verifyPassportKeyOtp(email, code)
 *        - checks the code against the stored hash, respecting expiry and
 *          a max-attempts limit
 *        - on success, marks that OTP row verified and returns its id as a
 *          one-time `verificationToken`
 *   3. setPassportKey(email, password, verificationToken)
 *        - re-checks the token is for a verified, unexpired, unconsumed OTP
 *          row belonging to this email
 *        - creates the Supabase Auth user directly (admin.createUser) and
 *          links `profiles.auth_user_id`
 *        - deletes the OTP row so the token can't be replayed
 *
 * Requires:
 *   - the `passport_key_otps` table — see migrations/002_passport_key_otps.sql
 *   - env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (new —
 *     this repo needs service-role access now, it didn't before),
 *     WHATSAPP_REPO_INTERNAL_URL, INTERNAL_API_SECRET (shared with the
 *     WhatsApp repo)
 *
 * Only ever called from this repo's server-side API routes
 * (app/api/passport-key/*) — never import this into client-side code, it
 * uses the service-role key.
 */

import crypto from 'crypto';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

// -----------------------------------------------------------------------------
// Supabase admin client (service role — bypasses RLS)
// -----------------------------------------------------------------------------

function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
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
}

async function findProfileByEmail(admin: SupabaseClient, email: string): Promise<ProfileRow | null> {
  const { data, error } = await admin
    .from('profiles')
    .select('id, phone, name, surname, email, auth_user_id')
    .ilike('email', email)
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

/**
 * Delivers the OTP by calling the WhatsApp repo's internal send endpoint.
 * That repo is the only one with WhatsApp send credentials — see
 * app/api/internal/send-whatsapp-message/route.ts over there.
 */
async function deliverOtpOverWhatsApp(phone: string, code: string): Promise<void> {
  const url = process.env.WHATSAPP_REPO_INTERNAL_URL;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!url || !secret) {
    throw new Error('Missing WHATSAPP_REPO_INTERNAL_URL or INTERNAL_API_SECRET env vars.');
  }

  const message =
    `🔐 Your Rands Vibe *Passport Key* setup code is *${code}*.\n\n` +
    `It expires in ${OTP_TTL_MINUTES} minutes. Never share this code with anyone — Rands staff will never ask for it.`;

  const res = await fetch(`${url}/api/internal/send-whatsapp-message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify({ phone, message }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Failed to deliver OTP over WhatsApp: ${body.error || res.statusText}`);
  }
}

// -----------------------------------------------------------------------------
// Status check
// -----------------------------------------------------------------------------

export interface PassportKeyStatus {
  exists: boolean;
  hasPassportKey: boolean;
}

export async function checkPassportKeyStatus(emailRaw: string): Promise<PassportKeyStatus> {
  const email = emailRaw.trim().toLowerCase();
  const admin = getAdminClient();
  const profile = await findProfileByEmail(admin, email);
  if (!profile) return { exists: false, hasPassportKey: false };
  return { exists: true, hasPassportKey: Boolean(profile.auth_user_id) };
}

// -----------------------------------------------------------------------------
// Step 1 — request a code
// -----------------------------------------------------------------------------

export interface RequestOtpResult {
  ok: boolean;
  reason?: 'not_found' | 'already_has_passport_key';
}

export async function requestPassportKeyOtp(emailRaw: string): Promise<RequestOtpResult> {
  const email = emailRaw.trim().toLowerCase();
  const admin = getAdminClient();
  const profile = await findProfileByEmail(admin, email);

  if (!profile) return { ok: false, reason: 'not_found' };
  if (profile.auth_user_id) return { ok: false, reason: 'already_has_passport_key' };

  const code = generateCode();

  const { error } = await admin.from('passport_key_otps').insert({
    profile_id: profile.id,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
  });
  if (error) {
    throw new Error(`Failed to store Passport Key OTP: ${error.message}`);
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

export async function verifyPassportKeyOtp(emailRaw: string, codeRaw: string): Promise<VerifyOtpResult> {
  const email = emailRaw.trim().toLowerCase();
  const code = codeRaw.trim();
  const admin = getAdminClient();

  const profile = await findProfileByEmail(admin, email);
  if (!profile) return { ok: false, reason: 'not_found' };

  const { data: row, error } = await admin
    .from('passport_key_otps')
    .select('*')
    .eq('profile_id', profile.id)
    .is('verified_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up Passport Key OTP: ${error.message}`);
  }
  if (!row) return { ok: false, reason: 'invalid_or_expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'invalid_or_expired' };
  }

  if (row.code_hash !== hashCode(code)) {
    await admin.from('passport_key_otps').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return { ok: false, reason: 'invalid_or_expired' };
  }

  await admin.from('passport_key_otps').update({ verified_at: new Date().toISOString() }).eq('id', row.id);

  return { ok: true, verificationToken: row.id as string };
}

// -----------------------------------------------------------------------------
// Step 3 — set the Passport Key (password)
// -----------------------------------------------------------------------------

function isEmailAlreadyRegisteredError(error: unknown): boolean {
  const anyError = error as { code?: string } | null;
  if (anyError?.code === 'email_exists') return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('already registered') || message.includes('email_exists');
}

async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Failed to look up existing auth user by email: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < perPage) break;
  }
  return null;
}

export async function setPassportKey(
  emailRaw: string,
  password: string,
  verificationToken: string,
): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  if (password.length < 8) {
    throw new Error('Passport Key must be at least 8 characters.');
  }

  const admin = getAdminClient();
  const profile = await findProfileByEmail(admin, email);
  if (!profile) throw new Error('Account not found.');
  if (profile.auth_user_id) throw new Error('This account already has a Passport Key set up.');
  if (!profile.email) throw new Error('Account has no email on file.');

  const { data: row, error } = await admin
    .from('passport_key_otps')
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

  // Create (or reuse an orphaned) Supabase Auth user and link it.
  let authUser: User;
  try {
    const { data, error: createError } = await admin.auth.admin.createUser({
      email: profile.email,
      password,
      email_confirm: true,
      user_metadata: {
        phone: profile.phone,
        name: profile.name,
        surname: profile.surname,
      },
    });
    if (createError) throw createError;
    if (!data.user) throw new Error('No user returned from auth creation.');
    authUser = data.user;
  } catch (err) {
    if (!isEmailAlreadyRegisteredError(err)) {
      throw new Error(`Failed to create auth user: ${err instanceof Error ? err.message : String(err)}`);
    }
    const existing = await findAuthUserByEmail(admin, profile.email);
    if (!existing) {
      throw new Error(`Failed to create auth user: ${err instanceof Error ? err.message : String(err)}`);
    }
    await admin.auth.admin.updateUserById(existing.id, { password });
    authUser = existing;
  }

  const { error: updateError } = await admin
    .from('profiles')
    .update({ auth_user_id: authUser.id, registration_complete: true })
    .eq('id', profile.id);

  if (updateError) {
    try {
      await admin.auth.admin.deleteUser(authUser.id);
    } catch (cleanupError) {
      console.error('Failed to roll back auth user after profile update failure', {
        profileId: profile.id,
        authUserId: authUser.id,
        cleanupError,
      });
    }
    throw new Error(`Failed to link Passport Key to profile: ${updateError.message}`);
  }

  // Burn the OTP row so the token can't be replayed.
  await admin.from('passport_key_otps').delete().eq('id', row.id);
}
