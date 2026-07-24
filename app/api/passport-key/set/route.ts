// app/api/passport-key/set/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { setPassportKey } from '@/lib/services/passport-key';

export async function POST(req: NextRequest) {
  let email: unknown;
  let password: unknown;
  let verificationToken: unknown;
  try {
    const body = await req.json();
    email = body?.email;
    password = body?.password;
    verificationToken = body?.verificationToken;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (
    typeof email !== 'string' || !email.trim() ||
    typeof password !== 'string' ||
    typeof verificationToken !== 'string' || !verificationToken.trim()
  ) {
    return NextResponse.json({ error: 'Email, password, and verification token are required.' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Passport Key must be at least 8 characters.' }, { status: 400 });
  }

  try {
    await setPassportKey(email, password, verificationToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('set-passport-key failed:', err);
    const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
