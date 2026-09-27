const prisma = require('./db');
const { distanceKm } = require('./matching');

async function notifyUser(userId, { type, title, message, relatedBatchId }) {
  return prisma.notification.create({
    data: { userId, type, title, message, relatedBatchId: relatedBatchId || null },
  });
}

/**
 * Notifies distributors that are verified, available, and within a
 * configurable radius of the source stall (falls back to notifying all
 * verified+available distributors if the stall has no lat/lng on file).
 */
async function notifyNearbyDistributors(batch, stall, radiusKm = 15) {
  const distributors = await prisma.distributor.findMany({
    where: { status: 'VERIFIED', isAvailable: true },
    include: { user: true },
  });

  const inRange = distributors.filter((d) => {
    if (!stall.latitude || !stall.longitude || !d.currentLat || !d.currentLng) return true; // no location -> notify anyway
    return distanceKm(stall.latitude, stall.longitude, d.currentLat, d.currentLng) <= radiusKm;
  });

  await Promise.all(
    inRange.map((d) =>
      notifyUser(d.userId, {
        type: 'FOOD_AVAILABLE',
        title: 'Food available for pickup',
        message: `${batch.remainingServings} ${batch.unit} of ${batch.foodName} available at ${stall.stallName}.`,
        relatedBatchId: batch.id,
      })
    )
  );
}

module.exports = { notifyUser, notifyNearbyDistributors };
