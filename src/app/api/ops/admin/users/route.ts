import { NextResponse } from 'next/server';
import { queryOpsDb } from '@/lib/opsDb';
import { verifyAuth } from '@/lib/auth';
import bcrypt from 'bcryptjs';

// GET — Fetch full user roster
export async function GET() {
  try {
    const session = await verifyAuth();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin role required.' }, { status: 403 });
    }
    const res = await queryOpsDb(
      'SELECT id, email, role, created_at FROM ops_users ORDER BY created_at ASC'
    );
    return NextResponse.json({ success: true, users: res.rows });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch users', message: err.message }, { status: 500 });
  }
}

// POST — Create new agent
export async function POST(request: Request) {
  try {
    const session = await verifyAuth();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin role required.' }, { status: 403 });
    }

    const { email, password, role } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const existing = await queryOpsDb('SELECT id FROM ops_users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 10);
    const assignedRole = role === 'admin' ? 'admin' : 'agent';
    await queryOpsDb(
      'INSERT INTO ops_users (email, password_hash, role) VALUES ($1, $2, $3)',
      [email, hash, assignedRole]
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to create agent', message: err.message }, { status: 500 });
  }
}

// PATCH — Update user role
export async function PATCH(request: Request) {
  try {
    const session = await verifyAuth();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin role required.' }, { status: 403 });
    }

    const { id, role } = await request.json();
    if (!id || !role) {
      return NextResponse.json({ error: 'id and role required' }, { status: 400 });
    }
    if (!['admin', 'agent'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Prevent self-demotion
    const target = await queryOpsDb('SELECT email FROM ops_users WHERE id = $1', [id]);
    if (target.rows[0]?.email === session.email) {
      return NextResponse.json({ error: 'Cannot modify your own account role.' }, { status: 400 });
    }

    await queryOpsDb('UPDATE ops_users SET role = $1 WHERE id = $2', [role, id]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to update role', message: err.message }, { status: 500 });
  }
}

// DELETE — Remove user
export async function DELETE(request: Request) {
  try {
    const session = await verifyAuth();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin role required.' }, { status: 403 });
    }

    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    // Prevent self-deletion
    const target = await queryOpsDb('SELECT email FROM ops_users WHERE id = $1', [id]);
    if (target.rows[0]?.email === session.email) {
      return NextResponse.json({ error: 'Cannot delete your own account.' }, { status: 400 });
    }

    await queryOpsDb('DELETE FROM ops_users WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to delete user', message: err.message }, { status: 500 });
  }
}
