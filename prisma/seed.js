// Run with: npm run seed
// Creates a few zones and pilgrim distribution points so the app isn't empty on first launch.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const zoneNames = ['Sector 1 - Main Ghat', 'Sector 2 - Railway Side', 'Sector 3 - Camp Area', 'Sector 4 - Highway Entry'];
  const zones = [];
  for (const name of zoneNames) {
    const zone = await prisma.zone.upsert({ where: { name }, update: {}, create: { name } });
    zones.push(zone);
  }

  const points = [
    { name: 'Central Free Food Point', latitude: 25.4358, longitude: 81.8463, zoneId: zones[0].id },
    { name: 'Railway Side Distribution Point', latitude: 25.4402, longitude: 81.8501, zoneId: zones[1].id },
  ];
  for (const p of points) {
    const exists = await prisma.pilgrimDistributionPoint.findFirst({ where: { name: p.name } });
    if (!exists) await prisma.pilgrimDistributionPoint.create({ data: p });
  }

  console.log('Seed complete:', zones.length, 'zones,', points.length, 'pilgrim points.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
