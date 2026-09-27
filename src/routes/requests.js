const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { requireAuth, requireRole } = require('../lib/auth');
const { runMatchingSweep, findBestMatchForBatch } = require('../lib/matching');
const { notifyUser } = require('../lib/notify');

/** POST /api/requests — stall operator raises a "need food" request */
router.post('/', requireAuth, requireRole('STALL_OPERATOR'), async (req, res) => {
  const { foodNameWanted, quantityNeeded, urgency } = req.body;
  if (!quantityNeeded) return res.status(400).json({ error: 'quantityNeeded is required.' });
  const stall = await prisma.stall.findUnique({ where: { userId: req.user.id } });
  if (!stall) return res.status(404).json({ error: 'Stall profile not found.' });

  const request = await prisma.redistributionRequest.create({
    data: {
      requestingStallId: stall.id,
      foodNameWanted: foodNameWanted || null,
      quantityNeeded: Number(quantityNeeded),
      urgency: urgency ? Number(urgency) : 1,
    },
  });
  res.status(201).json({ request });
});

/** GET /api/requests — list (admin: all, distributor: open ones to fulfil) */
router.get('/', requireAuth, requireRole('ADMIN', 'DISTRIBUTOR'), async (req, res) => {
  const { status } = req.query;
  const requests = await prisma.redistributionRequest.findMany({
    where: status ? { status } : {},
    include: { requestingStall: { select: { stallName: true, latitude: true, longitude: true } } },
    orderBy: [{ urgency: 'desc' }, { createdAt: 'asc' }],
  });
  res.json({ requests });
});

/** GET /api/requests/mine — stall operator's own requests */
router.get('/mine', requireAuth, requireRole('STALL_OPERATOR'), async (req, res) => {
  const stall = await prisma.stall.findUnique({ where: { userId: req.user.id } });
  const requests = await prisma.redistributionRequest.findMany({
    where: { requestingStallId: stall.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ requests });
});

/**
 * POST /api/requests/match-sweep
 * Admin (or a scheduled job) triggers the matching engine across all
 * currently AVAILABLE batches and OPEN requests. Returns proposed matches;
 * does not itself move food — a distributor still has to accept the pickup.
 */
router.post('/match-sweep', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const results = await runMatchingSweep();
  for (const r of results) {
    await prisma.redistributionRequest.update({ where: { id: r.requestId }, data: { status: 'MATCHED', matchedBatchId: r.batchId } });
  }
  res.json({ matched: results.length, results });
});

module.exports = router;
