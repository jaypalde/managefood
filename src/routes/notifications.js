const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { requireAuth } = require('../lib/auth');

/** GET /api/notifications — logged-in user's notifications (any role) */
router.get('/', requireAuth, async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ notifications });
});

/** PATCH /api/notifications/:id/read */
router.patch('/:id/read', requireAuth, async (req, res) => {
  const notif = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notif || notif.userId !== req.user.id) return res.status(404).json({ error: 'Notification not found.' });
  const updated = await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
  res.json({ notification: updated });
});

/** PATCH /api/notifications/read-all */
router.patch('/read-all', requireAuth, async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } });
  res.json({ ok: true });
});

module.exports = router;
