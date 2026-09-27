const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { requireAuth, requireRole } = require('../lib/auth');

/** GET /api/pilgrim-points — PUBLIC, no auth: active distribution points for the Pilgrim App/map */
router.get('/', async (req, res) => {
  const points = await prisma.pilgrimDistributionPoint.findMany({
    where: { isActive: true },
    include: {
      zone: true,
      distributionRecords: { orderBy: { distributedAt: 'desc' }, take: 1 },
    },
  });
  const withAvailability = points.map((p) => ({
    id: p.id,
    name: p.name,
    zone: p.zone?.name || null,
    latitude: p.latitude,
    longitude: p.longitude,
    lastDistributionAt: p.distributionRecords[0]?.distributedAt || null,
  }));
  res.json({ points: withAvailability });
});

/** POST /api/pilgrim-points — admin: create a distribution point */
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { name, zoneId, latitude, longitude } = req.body;
  if (!name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'name, latitude and longitude are required.' });
  }
  const point = await prisma.pilgrimDistributionPoint.create({ data: { name, zoneId: zoneId || null, latitude, longitude } });
  res.status(201).json({ point });
});

module.exports = router;
