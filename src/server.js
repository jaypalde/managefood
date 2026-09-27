require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet({ contentSecurityPolicy: false })); // CSP relaxed for the bundled static frontend; tighten if you replace it
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// Basic rate limiting on auth endpoints to slow down brute force / fraud attempts
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
app.use('/api/auth', authLimiter);

// General API rate limit
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 300 }));

// ---- Routes ----
app.use('/api/auth', require('./routes/auth'));
app.use('/api/stalls', require('./routes/stalls'));
app.use('/api/food-batches', require('./routes/foodBatches'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/pickups', require('./routes/pickups'));
app.use('/api/deliveries', require('./routes/deliveries'));
app.use('/api/waste', require('./routes/waste'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/zones', require('./routes/zones'));
app.use('/api/pilgrim-points', require('./routes/pilgrim'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'KumbhSetu API', time: new Date().toISOString() }));

// ---- Static frontend (public/) ----
app.use(express.static(path.join(__dirname, '..', 'public')));

// 404 for unmatched API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Fallback to login page for any other route (simple SPA-ish behaviour)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`KumbhSetu server running on port ${PORT}`);
  });
}

module.exports = app;
