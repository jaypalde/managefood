const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { requireAuth, requireRole } = require('../lib/auth');

/** GET /api/zones — public: list all zones (used by registration forms, pilgrim map) */
router.get('/', async (req, res) => {
  const zones = await prisma.zone.findMany({ orderBy: { name: 'asc' } });
  res.json({ zones });
});

/** POST /api/zones — admin: create a zone */
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const zone = await prisma.zone.create({ data: { name, description: description || null } });
  res.status(201).json({ zone });
});

module.exports = router;
