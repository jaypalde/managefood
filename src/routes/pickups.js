const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { requireAuth, requireRole } = require('../lib/auth');
const { newScanToken } = require('../lib/qr');
const { notifyUser } = require('../lib/notify');

/** POST /api/pickups/accept — distributor accepts a pickup request for a batch */
router.post('/accept', requireAuth, requireRole('DISTRIBUTOR'), async (req, res) => {
  const { foodBatchId, quantity } = req.body;
  const distributor = await prisma.distributor.findUnique({ where: { userId: req.user.id } });
  if (!distributor || distributor.status !== 'VERIFIED') {
    return res.status(403).json({ error: 'Distributor must be verified to accept pickups.' });
  }
  const batch = await prisma.foodBatch.findUnique({ where: { id: foodBatchId }, include: { stall: { include: { user: true } } } });
  if (!batch || batch.status !== 'AVAILABLE') return res.status(400).json({ error: 'This batch is not available for pickup.' });

  const qty = quantity ? Number(quantity) : batch.remainingServings;
  if (qty > batch.remainingServings) return res.status(400).json({ error: 'Requested quantity exceeds available servings.' });

  const [pickup, updatedBatch] = await prisma.$transaction([
    prisma.pickupRecord.create({ data: { foodBatchId: batch.id, distributorId: distributor.id, quantity: qty } }),
    prisma.foodBatch.update({ where: { id: batch.id }, data: { status: 'PICKUP_ACCEPTED' } }),
  ]);

  await notifyUser(batch.stall.userId, {
    type: 'PICKUP_ACCEPTED',
    title: 'Pickup accepted',
    message: `A distributor is on the way to collect ${qty} ${batch.unit} of ${batch.foodName}.`,
    relatedBatchId: batch.id,
  });

  res.status(201).json({ pickup, batch: updatedBatch });
});

/**
 * POST /api/pickups/:id/confirm-scan
 * Distributor scans the QR at the stall. Body: { scannedBatchCode, latitude?, longitude? }
 * Validates the scanned code matches the batch, prevents duplicate scans via
 * a fresh one-time scanToken recorded in QRTransaction, updates inventory.
 */
router.post('/:id/confirm-scan', requireAuth, requireRole('DISTRIBUTOR'), async (req, res) => {
  const { scannedBatchCode, latitude, longitude } = req.body;
  const distributor = await prisma.distributor.findUnique({ where: { userId: req.user.id } });
  const pickup = await prisma.pickupRecord.findUnique({ where: { id: req.params.id }, include: { foodBatch: { include: { stall: true } } } });

  if (!pickup || pickup.distributorId !== distributor.id) return res.status(404).json({ error: 'Pickup record not found.' });
  if (pickup.status !== 'ASSIGNED') return res.status(400).json({ error: 'This pickup has already been confirmed or cancelled.' });
  if (pickup.foodBatch.batchCode !== scannedBatchCode) {
    return res.status(400).json({ error: 'Scanned QR does not match the assigned food batch.' });
  }

  const [confirmedPickup, , updatedBatch] = await prisma.$transaction([
    prisma.pickupRecord.update({
      where: { id: pickup.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), pickupLat: latitude ?? null, pickupLng: longitude ?? null },
    }),
    prisma.qRTransaction.create({
      data: {
        foodBatchId: pickup.foodBatchId,
        action: 'PICKUP',
        scannedByUserId: req.user.id,
        quantity: pickup.quantity,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        scanToken: newScanToken(),
      },
    }),
    prisma.foodBatch.update({
      where: { id: pickup.foodBatchId },
      data: {
        remainingServings: pickup.foodBatch.remainingServings - pickup.quantity,
        status: 'PICKED_UP',
      },
    }),
  ]);

  res.json({ pickup: confirmedPickup, batch: updatedBatch });
});

/** GET /api/pickups/mine — distributor's active + past pickups */
router.get('/mine', requireAuth, requireRole('DISTRIBUTOR'), async (req, res) => {
  const distributor = await prisma.distributor.findUnique({ where: { userId: req.user.id } });
  const pickups = await prisma.pickupRecord.findMany({
    where: { distributorId: distributor.id },
    include: { foodBatch: { include: { stall: true } } },
    orderBy: { acceptedAt: 'desc' },
  });
  res.json({ pickups });
});

module.exports = router;
