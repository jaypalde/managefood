const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { hashPassword, comparePassword, signToken, requireAuth } = require('../lib/auth');

const VALID_ROLES = ['STALL_OPERATOR', 'DISTRIBUTOR', 'ADMIN'];

/**
 * POST /api/auth/register
 * ONE unified registration endpoint for all three roles.
 * Body: { name, phone, email?, password, role, ...roleSpecificFields }
 *   role = STALL_OPERATOR -> stallName, zoneId?, latitude?, longitude?
 *   role = DISTRIBUTOR    -> vehicleInfo?
 *   role = ADMIN          -> designation?, adminInviteCode (required, see .env)
 *
 * Stall operators and distributors are created with PENDING_VERIFICATION
 * status — an Admin must verify them before they can transact. Admin
 * accounts require a secret invite code so the public register page can't
 * be used to self-grant admin access.
 */
router.post('/register', async (req, res) => {
  try {
    const { name, phone, email, password, role } = req.body;

    if (!name || !phone || !password || !role) {
      return res.status(400).json({ error: 'name, phone, password and role are required.' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role selected.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) return res.status(409).json({ error: 'An account with this phone number already exists.' });
// 1. Phone check
const existingPhone = await prisma.user.findUnique({ where: { phone } });
if (existingPhone) {
  return res.status(409).json({ error: 'An account with this phone number already exists.' });
}

// 2. Email check (Agar email provide kiya gaya hai)
if (email) {
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
}

// 3. User create ko try-catch me wrap karein
try {
  const user = await prisma.user.create({
    data: {
      name,
      phone,
      email: email ? email : null,
      passwordHash,
      role
    }
  });

  // Aapka aage ka role-based code (STALL_OPERATOR, DISTRIBUTOR, etc.)...
  
} catch (error) {
  if (error.code === 'P2002') {
    return res.status(409).json({ error: 'Phone or Email already registered.' });
  }
  return res.status(500).json({ error: 'Internal server error during registration.' });
}
    if (role === 'ADMIN') {
      const { adminInviteCode } = req.body;
      if (!process.env.ADMIN_INVITE_CODE || adminInviteCode !== process.env.ADMIN_INVITE_CODE) {
        return res.status(403).json({ error: 'Invalid admin invite code.' });
      }
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: { name, phone, email: email || null, passwordHash, role },
    });

    if (role === 'STALL_OPERATOR') {
      const { stallName, zoneId, latitude, longitude, contactPhone } = req.body;
      if (!stallName) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ error: 'stallName is required for stall operator registration.' });
      }
      await prisma.stall.create({
        data: {
          userId: user.id,
          stallName,
          zoneId: zoneId || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          contactPhone: contactPhone || phone,
        },
      });
    } else if (role === 'DISTRIBUTOR') {
      const { vehicleInfo } = req.body;
      await prisma.distributor.create({ data: { userId: user.id, vehicleInfo: vehicleInfo || null } });
    } else if (role === 'ADMIN') {
      const { designation } = req.body;
      await prisma.admin.create({ data: { userId: user.id, designation: designation || null } });
    }

    const token = signToken({ id: user.id, role: user.role, name: user.name });
    return res.status(201).json({
      token,
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
      message:
        role === 'ADMIN'
          ? 'Admin account created.'
          : 'Account created. Verification by admin is required before you can transact.',
    });
  } catch (err) {
    console.error('register error', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

/**
 * POST /api/auth/login
 * ONE unified login endpoint. Body: { phone, password, role }
 * role is required so the same phone number space can't be spoofed across
 * roles, and so the client can render the correct dashboard immediately.
 */
router.post('/login', async (req, res) => {
  try {
    const { phone, password, role } = req.body;
    if (!phone || !password || !role) {
      return res.status(400).json({ error: 'phone, password and role are required.' });
    }
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || user.role !== role) {
      return res.status(401).json({ error: 'Invalid credentials or role.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'This account has been deactivated. Contact admin.' });
    }
    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials or role.' });

    const token = signToken({ id: user.id, role: user.role, name: user.name });
    return res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role } });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

/** GET /api/auth/me — returns current user + role-linked profile */
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { stall: true, distributor: true, adminProfile: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const { passwordHash, ...safe } = user;
  return res.json({ user: safe });
});

module.exports = router;
