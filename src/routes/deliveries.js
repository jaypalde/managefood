const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { requireAuth, requireRole } = require('../lib/auth');
const { newScanToken } = require('../lib/qr');
const { notifyUser } = require('../lib/notify');

/**
 * POST /api/deliveries/assign
 * Distributor, after pickup, assigns the picked-up batch to a destination:
 * either a requesting stall (fulfils a RedistributionRequest) or a pilgrim
 * distribution point (when no stall needs it).
 * Body: { foodBatchId, quantity, targetType: 'STALL'|'PILGRIM_POINT',
 *         targetStallId?, redistributionRequestId?, pilgrimPointId? }
 */
router.post('/assign', requireAuth, requireRole('DISTRIBUTOR'), async (req, res) => {
  const { foodBatchId, quantity, targetType, targetStallId, redistributionRequestId, pilgrimPointId } = req.body;
  const distributor = await prisma.distributor.findUnique({ where: { userId: req.user.id } });
  const batch = await prisma.foodBatch.findUnique({ where: { id: foodBatchId } });

  if (!batch || batch.status !== 'PICKED_UP') return res.status(400).json({ error: 'Batch must be picked up before it can be assigned for delivery.' });
  if (!['STALL', 'PILGRIM_POINT'].includes(targetType)) return res.status(400).json({ error: 'targetType must be STALL or PILGRIM_POINT.' });
  if (targetType === 'STALL' && !targetStallId) return res.status(400).json({ error: 'targetStallId is required for stall deliveries.' });
  if (targetType === 'PILGRIM_POINT' && !pilgrimPointId) return res.status(400).json({ error: 'pilgrimPointId is required for pilgrim distribution.' });

  const qty = quantity ? Number(quantity) : batch.remainingServings;

  const [delivery, updatedBatch] = await prisma.$transaction([
    prisma.deliveryRecord.create({
      data: {
        foodBatchId: batch.id,
        distributorId: distributor.id,
        targetType,
        targetStallId: targetType === 'STALL' ? targetStallId : null,
        redistributionRequestId: redistributionRequestId || null,
        pilgrimPointId: targetType === 'PILGRIM_POINT' ? pilgrimPointId : null,
        quantity: qty,
        status: 'IN_TRANSIT',
      },
    }),
    prisma.foodBatch.update({ where: { id: batch.id }, data: { status: 'IN_TRANSIT' } }),
  ]);

  if (targetType === 'STALL') {
    const targetStall = await prisma.stall.findUnique({ where: { id: targetStallId } });
    if (targetStall) {
      await notifyUser(targetStall.userId, {
        type: 'DELIVERY_COMPLETED',
        title: 'Food on the way',
        message: `${qty} ${batch.unit} of ${batch.foodName} is on its way to your stall.`,
        relatedBatchId: batch.id,
      });
    }
  }

  res.status(201).json({ delivery, batch: updatedBatch });
});

/**
 * POST /api/deliveries/:id/confirm-scan
 * QR scan at destination confirms delivery. For STALL deliveries, the
 * receiving stall operator confirms; for PILGRIM_POINT, the distributor
 * (or an authorized volunteer account) confirms.
 */
router.post('/:id/confirm-scan', requireAuth, requireRole('DISTRIBUTOR', 'STALL_OPERATOR'), async (req, res) => {
  const { scannedBatchCode, latitude, longitude } = req.body;
  const delivery = await prisma.deliveryRecord.findUnique({ where: { id: req.params.id }, include: { foodBatch: true } });
  if (!delivery) return res.status(404).json({ error: 'Delivery record not found.' });
  if (delivery.status !== 'IN_TRANSIT') return res.status(400).json({ error: 'This delivery has already been confirmed or cancelled.' });
  if (delivery.foodBatch.batchCode !== scannedBatchCode) return res.status(400).json({ error: 'Scanned QR does not match this delivery.' });

  const ops = [
    prisma.deliveryRecord.update({ where: { id: delivery.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } }),
    prisma.qRTransaction.create({
      data: {
        foodBatchId: delivery.foodBatchId,
        action: delivery.targetType === 'PILGRIM_POINT' ? 'PILGRIM_HANDOUT' : 'DELIVERY',
        scannedByUserId: req.user.id,
        quantity: delivery.quantity,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        scanToken: newScanToken(),
      },
    }),
  ];

  if (delivery.targetType === 'PILGRIM_POINT') {
    ops.push(
      prisma.pilgrimDistributionRecord.create({
        data: {
          foodBatchId: delivery.foodBatchId,
          pointId: delivery.pilgrimPointId,
          quantity: delivery.quantity,
          distributedByUserId: req.user.id,
        },
      }),
      prisma.foodBatch.update({ where: { id: delivery.foodBatchId }, data: { status: 'PILGRIM_DISTRIBUTED' } })
    );
  } else {
    ops.push(prisma.foodBatch.update({ where: { id: delivery.foodBatchId }, data: { status: 'DELIVERED' } }));
    if (delivery.redistributionRequestId) {
      const request = await prisma.redistributionRequest.findUnique({ where: { id: delivery.redistributionRequestId } });
      if (request) {
        const newFulfilled = request.quantityFulfilled + delivery.quantity;
        ops.push(
          prisma.redistributionRequest.update({
            where: { id: request.id },
            data: {
              quantityFulfilled: newFulfilled,
              status: newFulfilled >= request.quantityNeeded ? 'FULFILLED' : 'PARTIALLY_FULFILLED',
            },
          })
        );
      }
    }
  }

  const results = await prisma.$transaction(ops);
  res.json({ delivery: results[0] });
});

/** GET /api/deliveries/mine — distributor's deliveries */
router.get('/mine', requireAuth, requireRole('DISTRIBUTOR'), async (req, res) => {
  const distributor = await prisma.distributor.findUnique({ where: { userId: req.user.id } });
  const deliveries = await prisma.deliveryRecord.findMany({
    where: { distributorId: distributor.id },
    include: { foodBatch: true, pilgrimPoint: true },
    orderBy: { assignedAt: 'desc' },
  });
  res.json({ deliveries });
});

module.exports = router;
