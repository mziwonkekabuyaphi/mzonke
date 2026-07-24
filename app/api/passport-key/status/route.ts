// app/api/passport-key/status/route.ts
// Called by login.js right when the customer submits their email, before
// deciding whether to attempt a password sign-in or switch to the
// OTP/Passport-Key-setup flow.
import { NextRequest, NextResponse } from 'next/server';
import { checkPassportKeyStatus } from '@/lib/services/passport-key';

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email');
  if (!email || !email.trim()) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  try {
    const status = await checkPassportKeyStatus(email);
    return NextResponse.json(status);
  } catch (err) {
    console.error('passport-key status check failed:', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
