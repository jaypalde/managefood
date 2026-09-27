const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { requireAuth, requireRole } = require('../lib/auth');

/** GET /api/stalls/me — the logged-in stall operator's own stall */
router.get('/me', requireAuth, requireRole('STALL_OPERATOR'), async (req, res) => {
  const stall = await prisma.stall.findUnique({ where: { userId: req.user.id }, include: { zone: true } });
  if (!stall) return res.status(404).json({ error: 'Stall profile not found.' });
  res.json({ stall });
});

/** PATCH /api/stalls/me — update own stall details */
router.patch('/me', requireAuth, requireRole('STALL_OPERATOR'), async (req, res) => {
  const { stallName, zoneId, latitude, longitude, contactPhone } = req.body;
  const stall = await prisma.stall.update({
    where: { userId: req.user.id },
    data: {
      ...(stallName && { stallName }),
      ...(zoneId !== undefined && { zoneId }),
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(contactPhone && { contactPhone }),
    },
  });
  res.json({ stall });
});

/** GET /api/stalls — admin: list all stalls (filter by status/zone) */
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { status, zoneId } = req.query;
  const stalls = await prisma.stall.findMany({
    where: { ...(status && { status }), ...(zoneId && { zoneId }) },
    include: { user: true, zone: true, _count: { select: { foodBatches: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ stalls });
});

/** PATCH /api/stalls/:id/verify — admin: verify or suspend a stall */
router.patch('/:id/verify', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { status } = req.body; // VERIFIED | SUSPENDED | PENDING_VERIFICATION
  if (!['VERIFIED', 'SUSPENDED', 'PENDING_VERIFICATION'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const stall = await prisma.stall.update({ where: { id: req.params.id }, data: { status } });
  await prisma.auditLog.create({
    data: { userId: req.user.id, action: 'STALL_STATUS_CHANGE', entity: 'Stall', entityId: stall.id, metadata: JSON.stringify({ status }) },
  });
  res.json({ stall });
});

module.exports = router;
