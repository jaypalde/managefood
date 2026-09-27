const prisma = require('./db');

// Haversine distance in km between two lat/lng points
function distanceKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined)) return Infinity;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Scores how good a match is between an available food batch and an open request.
 * Lower score = better match. Factors (all configurable weights):
 *  - urgency of request (higher urgency -> more negative/better score)
 *  - remaining usable time of the batch (food closer to expiry is prioritized -> better score)
 *  - distance between stalls
 *  - quantity fit (avoid huge over/under supply where possible)
 */
function scoreMatch(batch, request, sourceStall, destStall, weights = {}) {
  const w = {
    distance: weights.distance ?? 1.0,
    urgency: weights.urgency ?? -15, // negative -> higher urgency lowers score (better)
    expiry: weights.expiry ?? -1, // sooner expiry -> lower score (prioritized)
    quantityMismatch: weights.quantityMismatch ?? 0.05,
    ...weights,
  };

  const dist = distanceKm(sourceStall?.latitude, sourceStall?.longitude, destStall?.latitude, destStall?.longitude);
  const distScore = Number.isFinite(dist) ? dist * w.distance : 50; // penalize unknown location moderately

  const minutesToExpiry = Math.max(0, (new Date(batch.usableUntil) - Date.now()) / 60000);
  const expiryScore = (1 / (minutesToExpiry + 1)) * w.expiry * -100; // sooner expiry => lower (better) score

  const urgencyScore = request.urgency * w.urgency;

  const qtyMismatch = Math.abs(batch.remainingServings - request.quantityNeeded) * w.quantityMismatch;

  return distScore + expiryScore + urgencyScore + qtyMismatch;
}

/**
 * Core matching engine: for a given available FoodBatch, find the best OPEN
 * RedistributionRequest to match it against (excess -> nearby demand).
 * Prioritizes food that will expire sooner across the whole available pool.
 */
async function findBestMatchForBatch(batchId) {
  const batch = await prisma.foodBatch.findUnique({ where: { id: batchId }, include: { stall: true } });
  if (!batch || batch.status !== 'AVAILABLE' || batch.remainingServings <= 0) return null;

  const openRequests = await prisma.redistributionRequest.findMany({
    where: { status: 'OPEN' },
    include: { requestingStall: true },
  });
  if (openRequests.length === 0) return null;

  let best = null;
  let bestScore = Infinity;
  for (const req of openRequests) {
    if (req.requestingStallId === batch.stallId) continue; // a stall shouldn't fulfil its own request
    const score = scoreMatch(batch, req, batch.stall, req.requestingStall);
    if (score < bestScore) {
      bestScore = score;
      best = req;
    }
  }
  return best ? { request: best, score: bestScore } : null;
}

/**
 * Runs across ALL available batches (ordered by soonest-expiring first, per
 * requirement: "prioritize food that will expire sooner") and greedily matches
 * them to the best open request. Returns a list of proposed matches for the
 * admin/distributor layer to act on (creates DeliveryRecord elsewhere).
 */
async function runMatchingSweep() {
  const availableBatches = await prisma.foodBatch.findMany({
    where: { status: 'AVAILABLE', remainingServings: { gt: 0 } },
    include: { stall: true },
    orderBy: { usableUntil: 'asc' }, // soonest-expiring first
  });

  const results = [];
  for (const batch of availableBatches) {
    const match = await findBestMatchForBatch(batch.id);
    if (match) {
      results.push({
        batchId: batch.id,
        batchCode: batch.batchCode,
        requestId: match.request.id,
        requestingStallId: match.request.requestingStallId,
        score: match.score,
      });
    }
  }
  return results;
}

module.exports = { distanceKm, scoreMatch, findBestMatchForBatch, runMatchingSweep };
