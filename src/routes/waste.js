const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { requireAuth, requireRole } = require('../lib/auth');

// Note: creation happens via PATCH /api/food-batches/:id/mark-unfit (foodBatches.js)
// so every waste record is always tied to a specific reported batch/quantity.

/** GET /api/waste — admin: all waste records, filterable */
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { status, category } = req.query;
  const records = await prisma.wasteRecord.findMany({
    where: { ...(status && { status }), ...(category && { category }) },
    include: { stall: true, reportedBy: { select: { name: true, phone: true } } },
    orderBy: { reportedAt: 'desc' },
  });
  res.json({ records });
});

/** GET /api/waste/mine — stall operator's own waste reports */
router.get('/mine', requireAuth, requireRole('STALL_OPERATOR'), async (req, res) => {
  const stall = await prisma.stall.findUnique({ where: { userId: req.user.id } });
  const records = await prisma.wasteRecord.findMany({ where: { stallId: stall.id }, orderBy: { reportedAt: 'desc' } });
  res.json({ records });
});

/** PATCH /api/waste/:id/collect — admin/collection crew marks waste as collected/processed */
router.patch('/:id/collect', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { status } = req.body; // COLLECTED | PROCESSED
  if (!['COLLECTED', 'PROCESSED'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const record = await prisma.wasteRecord.update({
    where: { id: req.params.id },
    data: { status, ...(status === 'COLLECTED' && { collectedAt: new Date() }) },
  });
  res.json({ record });
});

module.exports = router;
