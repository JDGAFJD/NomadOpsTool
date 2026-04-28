import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// Secret key from environment variable — set JWT_SECRET in Vercel dashboard
const secretKey = process.env.JWT_SECRET || 'nomad_super_secret_auth_key_v2_operational_system';
const key = new TextEncoder().encode(secretKey);

export async function encrypt(payload: any, expirationString: string) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expirationString)
    .sign(key);
}

export async function decrypt(input: string): Promise<any> {
  const { payload } = await jwtVerify(input, key, {
    algorithms: ['HS256'],
  });
  return payload;
}

export async function createSession(userId: number, email: string, role: string, rememberMe: boolean) {
  const expirationString = rememberMe ? '30 d' : '24 h';
  const expires = new Date(Date.now() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000));
  
  const token = await encrypt({ userId, email, role, expires }, expirationString);

  (await cookies()).set('ops_v2_session', token, {
    expires,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export async function verifyAuth() {
  const cookie = (await cookies()).get('ops_v2_session')?.value;
  if (!cookie) return null;

  try {
    const parsed = await decrypt(cookie);
    if (!parsed) return null;
    if (new Date(parsed.expires) < new Date()) {
      return null;
    }
    return parsed;
  } catch (err) {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).set('ops_v2_session', '', {
    expires: new Date(0),
    httpOnly: true,
    path: '/',
  });
}
