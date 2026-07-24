// app/api/passport-key/verify-otp/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyPassportKeyOtp } from '@/lib/services/passport-key';

export async function POST(req: NextRequest) {
  let email: unknown;
  let code: unknown;
  try {
    const body = await req.json();
    email = body?.email;
    code = body?.code;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (typeof email !== 'string' || !email.trim() || typeof code !== 'string' || !code.trim()) {
    return NextResponse.json({ error: 'Email and code are required.' }, { status: 400 });
  }

  try {
    const result = await verifyPassportKeyOtp(email, code);

    if (!result.ok) {
      const messages: Record<string, string> = {
        not_found: 'We could not find an account with that email.',
        invalid_or_expired: 'That code is incorrect or has expired. Please request a new one.',
        too_many_attempts: 'Too many incorrect attempts. Please request a new code.',
      };
      return NextResponse.json(
        { error: messages[result.reason ?? ''] ?? 'Verification failed.' },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, verificationToken: result.verificationToken });
  } catch (err) {
    console.error('verify-otp failed:', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
