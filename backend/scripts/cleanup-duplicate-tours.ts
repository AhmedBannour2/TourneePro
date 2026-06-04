/**
 * One-time cleanup: remove duplicate tours that share (tourCode, date, platformId).
 *
 * Strategy per duplicate group:
 *  - Keep the tour that is assigned or confirmed (if any).
 *  - If multiple are assigned/confirmed, keep the most recent one.
 *  - If all are unassigned, keep the one with the latest createdAt.
 *  - Delete the rest (cascade deletes assignments, workedDays, etc.).
 *
 * Run with:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/cleanup-duplicate-tours.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Scanning for duplicate tours...');

  // Fetch all tours with their assignment counts
  const tours = await prisma.tour.findMany({
    select: {
      id: true,
      tourCode: true,
      date: true,
      platformId: true,
      status: true,
      createdAt: true,
      confirmationStatus: true,
      _count: { select: { assignments: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Group by (tourCode, date ISO, platformId)
  const groups = new Map<string, typeof tours>();
  for (const tour of tours) {
    const key = `${tour.tourCode}__${tour.date.toISOString().split('T')[0]}__${tour.platformId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tour);
  }

  let deletedTotal = 0;

  for (const [key, group] of groups) {
    if (group.length <= 1) continue;

    console.log(`Duplicate group: ${key} — ${group.length} tours`);

    const isActive = (t: (typeof tours)[0]) =>
      t._count.assignments > 0 ||
      t.status === 'assigned' ||
      t.confirmationStatus === 'CONFIRMED';

    // Sort: active tours first, then by createdAt desc
    group.sort((a, b) => {
      if (isActive(a) && !isActive(b)) return -1;
      if (!isActive(a) && isActive(b)) return 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const [keep, ...toDelete] = group;
    console.log(`  Keeping ${keep.id} (status: ${keep.status})`);

    for (const dup of toDelete) {
      console.log(`  Deleting ${dup.id} (status: ${dup.status})`);
      await prisma.tour.delete({ where: { id: dup.id } }).catch((err: Error) => {
        console.warn(`  Could not delete ${dup.id}: ${err.message}`);
      });
      deletedTotal++;
    }
  }

  console.log(`\nDone. Deleted ${deletedTotal} duplicate tour(s).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
