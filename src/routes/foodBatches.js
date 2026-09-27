const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { requireAuth, requireRole } = require('../lib/auth');
const { generateBatchQR } = require('../lib/qr');
const { notifyNearbyDistributors, notifyUser } = require('../lib/notify');

function genBatchCode() {
  const y = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `KS-${y}-${rand}`;
}

/** POST /api/food-batches — stall operator adds a new food batch */
router.post('/', requireAuth, requireRole('STALL_OPERATOR'), async (req, res) => {
  try {
    const stall = await prisma.stall.findUnique({ where: { userId: req.user.id } });
    if (!stall) return res.status(404).json({ error: 'Stall profile not found.' });
    if (stall.status !== 'VERIFIED') {
      return res.status(403).json({ error: 'Your stall must be verified by admin before adding food batches.' });
    }

    const { foodName, totalServings, unit, preparedAt, usableUntil, isTemperatureSensitive, notes } = req.body;
    if (!foodName || !totalServings || !preparedAt || !usableUntil) {
      return res.status(400).json({ error: 'foodName, totalServings, preparedAt and usableUntil are required.' });
    }

    const batch = await prisma.foodBatch.create({
      data: {
        batchCode: genBatchCode(),
        stallId: stall.id,
        foodName,
        totalServings: Number(totalServings),
        remainingServings: Number(totalServings),
        unit: unit || 'servings',
        preparedAt: new Date(preparedAt),
        usableUntil: new Date(usableUntil),
        isTemperatureSensitive: !!isTemperatureSensitive,
        notes: notes || null,
        status: 'CREATED',
      },
    });
    res.status(201).json({ batch });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create food batch.' });
  }
});

/** GET /api/food-batches/mine — stall operator's own batches */
router.get('/mine', requireAuth, requireRole('STALL_OPERATOR'), async (req, res) => {
  const stall = await prisma.stall.findUnique({ where: { userId: req.user.id } });
  if (!stall) return res.status(404).json({ error: 'Stall profile not found.' });
  const batches = await prisma.foodBatch.findMany({ where: { stallId: stall.id }, orderBy: { createdAt: 'desc' } });
  res.json({ batches });
});

/** GET /api/food-batches/available — distributors browse available pickups */
router.get('/available', requireAuth, requireRole('DISTRIBUTOR', 'ADMIN'), async (req, res) => {
  const batches = await prisma.foodBatch.findMany({
    where: { status: 'AVAILABLE', remainingServings: { gt: 0 } },
    include: { stall: { select: { stallName: true, latitude: true, longitude: true, zoneId: true } } },
    orderBy: { usableUntil: 'asc' }, // soonest-expiring first, per matching priority rule
  });
  res.json({ batches });
});

/**
 * PATCH /api/food-batches/:id/mark-available
 * Stall operator marks remaining servings as available for redistribution.
 * Generates the batch QR code and notifies distributors.
 */
router.patch('/:id/mark-available', requireAuth, requireRole('STALL_OPERATOR'), async (req, res) => {
  const stall = await prisma.stall.findUnique({ where: { userId: req.user.id } });
  const batch = await prisma.foodBatch.findUnique({ where: { id: req.params.id } });
  if (!batch || batch.stallId !== stall.id) return res.status(404).json({ error: 'Food batch not found.' });
  if (batch.remainingServings <= 0) return res.status(400).json({ error: 'No servings remaining to redistribute.' });
  if (new Date(batch.usableUntil) <= new Date()) {
    return res.status(400).json({ error: 'This batch has passed its usable-until time and cannot be marked available. Report it as waste instead.' });
  }

  const updated = await prisma.foodBatch.update({ where: { id: batch.id }, data: { status: 'AVAILABLE' } });
  await notifyNearbyDistributors(updated, stall);
  res.json({ batch: updated });
});

/** GET /api/food-batches/:id/qr — get (or lazily generate) the QR image for a batch */
router.get('/:id/qr', requireAuth, requireRole('STALL_OPERATOR', 'DISTRIBUTOR', 'ADMIN'), async (req, res) => {
  const batch = await prisma.foodBatch.findUnique({ where: { id: req.params.id } });
  if (!batch) return res.status(404).json({ error: 'Food batch not found.' });
  const dataUrl = await generateBatchQR(batch.batchCode);
  res.json({ qr: dataUrl, batchCode: batch.batchCode });
});

/**
 * PATCH /api/food-batches/:id/mark-unfit
 * Stall operator reports food as NOT FIT FOR DISTRIBUTION.
 * Creates a WasteRecord and routes the batch into the waste workflow —
 * it is removed from the redistribution pool entirely.
 */
router.patch('/:id/mark-unfit', requireAuth, requireRole('STALL_OPERATOR'), async (req, res) => {
  const { quantity, reason, category } = req.body; // category: EXPIRED|SPOILED|CONTAMINATED|UNSAFE|OTHER
  if (!quantity || !reason || !category) {
    return res.status(400).json({ error: 'quantity, reason and category are required.' });
  }
  const stall = await prisma.stall.findUnique({ where: { userId: req.user.id } });
  const batch = await prisma.foodBatch.findUnique({ where: { id: req.params.id } });
  if (!batch || batch.stallId !== stall.id) return res.status(404).json({ error: 'Food batch not found.' });
  if (quantity > batch.remainingServings) {
    return res.status(400).json({ error: 'Quantity exceeds remaining servings on this batch.' });
  }

  const [waste, updatedBatch] = await prisma.$transaction([
    prisma.wasteRecord.create({
      data: {
        foodBatchId: batch.id,
        stallId: stall.id,
        foodName: batch.foodName,
        quantity: Number(quantity),
        reason,
        category,
        reportedById: req.user.id,
      },
    }),
    prisma.foodBatch.update({
      where: { id: batch.id },
      data: {
        remainingServings: batch.remainingServings - Number(quantity),
        status: batch.remainingServings - Number(quantity) <= 0 ? 'NOT_FIT' : batch.status,
      },
    }),
  ]);

  res.status(201).json({ waste, batch: updatedBatch });
});

module.exports = router;
