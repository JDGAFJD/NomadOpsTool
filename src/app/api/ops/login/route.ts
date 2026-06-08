import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryOpsDb, logActivity } from '@/lib/opsDb';
import { createSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password, rememberMe } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Lookup user in ops_users tracking table natively over database pool
    const result = await queryOpsDb('SELECT id, email, password_hash, role FROM ops_users WHERE email = $1 LIMIT 1', [email]);
    const user = result.rows[0];

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Verify bcrypt hash
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Automatically spins up 24hr or 30d session token & attaches HttpOnly cookie
    await createSession(user.id, user.email, user.role, Boolean(rememberMe));

    // Inject Telemetry trace
    await logActivity(user.email, 'signin', null, request);

    return NextResponse.json({ success: true, role: user.role });
  } catch (error: any) {
    console.error('OPS Login Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
