/**
 * Pull all useful data from production (Railway) and save to a local JSON snapshot.
 *
 * Usage:
 *   PROD_DATABASE_URL="postgresql://..." npx ts-node scripts/pull-prod-data.ts
 *
 * The PROD_DATABASE_URL is available in Railway → backend service → Variables tab.
 * Copy the "DATABASE_URL" value from there.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prodUrl = process.env.PROD_DATABASE_URL;
if (!prodUrl) {
  console.error('❌  Set PROD_DATABASE_URL env var first.');
  console.error('    PROD_DATABASE_URL="postgresql://..." npx ts-node scripts/pull-prod-data.ts');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: prodUrl } } });

async function main() {
  console.log('🔗 Connecting to production database…');

  const [
    users,
    employees,
    trucks,
    platforms,
    globalPayRates,
    employeePayRates,
    systemConfig,
    employeeDocuments,
    truckDocuments,
    tours,
    assignments,
    tourConfirmations,
    workedDays,
    expressMissions,
    expressDeliveries,
    expressAssignments,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.employee.findMany(),
    prisma.truck.findMany(),
    prisma.platform.findMany(),
    prisma.globalPayRate.findMany(),
    prisma.employeePayRate.findMany(),
    prisma.systemConfig.findMany(),
    prisma.employeeDocument.findMany(),
    prisma.truckDocument.findMany(),
    // Only pull last 90 days of tours to keep the file manageable
    prisma.tour.findMany({
      where: { date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.assignment.findMany(),
    prisma.tourConfirmation.findMany(),
    prisma.workedDay.findMany({
      where: { date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.expressMission.findMany(),
    // Select only columns that exist in prod (pay/startTime/endTime not deployed yet)
    prisma.expressDelivery.findMany({
      where: { date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      select: {
        id: true,
        type: true,
        date: true,
        status: true,
        photo: true,
        notes: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.expressAssignment.findMany(),
  ]);

  const snapshot = {
    exportedAt: new Date().toISOString(),
    users,
    employees,
    trucks,
    platforms,
    globalPayRates,
    employeePayRates,
    systemConfig,
    employeeDocuments,
    truckDocuments,
    tours,
    assignments,
    tourConfirmations,
    workedDays,
    expressMissions,
    expressDeliveries,
    expressAssignments,
  };

  const outPath = path.join(__dirname, 'prod-snapshot.json');
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));

  console.log('');
  console.log('✅ Export complete:');
  console.log(`   ${users.length} users`);
  console.log(`   ${employees.length} employees`);
  console.log(`   ${trucks.length} trucks`);
  console.log(`   ${platforms.length} platforms`);
  console.log(`   ${tours.length} tours (last 90 days)`);
  console.log(`   ${workedDays.length} worked days (last 90 days)`);
  console.log(`   ${expressDeliveries.length} express deliveries (last 90 days)`);
  console.log('');
  console.log(`📄 Saved to: ${outPath}`);
  console.log('');
  console.log('Next step:');
  console.log('   npx ts-node scripts/load-prod-data.ts');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
