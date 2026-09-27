const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { requireAuth, requireRole } = require('../lib/auth');

/** GET /api/admin/stats — top-line dashboard numbers */
router.get('/stats', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const [
    totalStalls,
    activeStalls,
    totalDistributors,
    activeDistributors,
    availableBatches,
    pendingPickups,
    pendingDeliveries,
    redistributedAgg,
    pilgrimAgg,
    wasteAgg,
  ] = await Promise.all([
    prisma.stall.count(),
    prisma.stall.count({ where: { status: 'VERIFIED' } }),
    prisma.distributor.count(),
    prisma.distributor.count({ where: { status: 'VERIFIED', isAvailable: true } }),
    prisma.foodBatch.count({ where: { status: 'AVAILABLE' } }),
    prisma.pickupRecord.count({ where: { status: 'ASSIGNED' } }),
    prisma.deliveryRecord.count({ where: { status: { in: ['ASSIGNED', 'IN_TRANSIT'] } } }),
    prisma.deliveryRecord.aggregate({ where: { status: 'DELIVERED', targetType: 'STALL' }, _sum: { quantity: true } }),
    prisma.pilgrimDistributionRecord.aggregate({ _sum: { quantity: true } }),
    prisma.wasteRecord.aggregate({ _sum: { quantity: true } }),
  ]);

  res.json({
    totalStalls,
    activeStalls,
    totalDistributors,
    activeDistributors,
    foodAvailableBatches: availableBatches,
    pendingPickupRequests: pendingPickups,
    pendingDeliveryRequests: pendingDeliveries,
    totalServingsRedistributedToStalls: redistributedAgg._sum.quantity || 0,
    totalServingsGivenToPilgrims: pilgrimAgg._sum.quantity || 0,
    totalServingsWasted: wasteAgg._sum.quantity || 0,
  });
});

/** GET /api/admin/most-active-stalls */
router.get('/most-active-stalls', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const stalls = await prisma.stall.findMany({
    include: { _count: { select: { foodBatches: true } } },
    orderBy: { foodBatches: { _count: 'desc' } },
    take: 10,
  });
  res.json({ stalls: stalls.map((s) => ({ id: s.id, name: s.stallName, batchCount: s._count.foodBatches })) });
});

/** GET /api/admin/zone-stats — zone-wise food + waste breakdown */
router.get('/zone-stats', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const zones = await prisma.zone.findMany({
    include: { stalls: { include: { foodBatches: true, wasteRecords: true } } },
  });
  const stats = zones.map((z) => {
    const allBatches = z.stalls.flatMap((s) => s.foodBatches);
    const allWaste = z.stalls.flatMap((s) => s.wasteRecords);
    return {
      zone: z.name,
      stallCount: z.stalls.length,
      totalBatches: allBatches.length,
      totalWasteServings: allWaste.reduce((sum, w) => sum + w.quantity, 0),
    };
  });
  res.json({ zones: stats });
});

/**
 * GET /api/admin/trends?range=daily|weekly
 * Simple trend series for charts: food saved (redistributed) vs wasted, per day.
 */
router.get('/trends', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const days = req.query.range === 'weekly' ? 7 * 8 : 14;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [deliveries, waste, pilgrimDist] = await Promise.all([
    prisma.deliveryRecord.findMany({ where: { status: 'DELIVERED', deliveredAt: { gte: since } }, select: { deliveredAt: true, quantity: true } }),
    prisma.wasteRecord.findMany({ where: { reportedAt: { gte: since } }, select: { reportedAt: true, quantity: true } }),
    prisma.pilgrimDistributionRecord.findMany({ where: { distributedAt: { gte: since } }, select: { distributedAt: true, quantity: true } }),
  ]);

  const bucket = (rows, dateField) => {
    const map = {};
    for (const r of rows) {
      const day = r[dateField].toISOString().slice(0, 10);
      map[day] = (map[day] || 0) + r.quantity;
    }
    return map;
  };

  res.json({
    redistributed: bucket(deliveries, 'deliveredAt'),
    wasted: bucket(waste, 'reportedAt'),
    pilgrimDistributed: bucket(pilgrimDist, 'distributedAt'),
  });
});

/** GET /api/admin/distributors — manage distributors */
router.get('/distributors', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const distributors = await prisma.distributor.findMany({ include: { user: true }, orderBy: { createdAt: 'desc' } });
  res.json({ distributors });
});

/** PATCH /api/admin/distributors/:id/verify */
router.patch('/distributors/:id/verify', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { status } = req.body;
  if (!['VERIFIED', 'SUSPENDED', 'PENDING_VERIFICATION'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const distributor = await prisma.distributor.update({ where: { id: req.params.id }, data: { status } });
  res.json({ distributor });
});

module.exports = router;
