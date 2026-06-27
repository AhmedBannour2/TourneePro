/**
 * Load a production snapshot (prod-snapshot.json) into the local database.
 * Run AFTER pull-prod-data.ts has created the snapshot file.
 *
 * Usage:
 *   npx ts-node scripts/load-prod-data.ts
 *
 * Safe to re-run — all operations are upserts.
 * Your local admin@stp.fr password stays as-is (prod user is skipped if already exists).
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function load() {
  const p = path.join(__dirname, 'prod-snapshot.json');
  if (!fs.existsSync(p)) {
    console.error('❌  prod-snapshot.json not found.');
    console.error('    Run pull-prod-data.ts first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

// Replace prod user IDs with local user IDs where emails match (e.g. admin@stp.fr
// has a different UUID locally vs prod). Returns an ID-to-ID mapping.
async function buildUserIdMap(snapUsers: any[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const u of snapUsers) {
    const local = await prisma.user.findUnique({ where: { email: u.email } });
    if (local && local.id !== u.id) {
      map.set(u.id, local.id); // prod ID → local ID
    }
  }
  return map;
}

function remap(id: string | null | undefined, map: Map<string, string>): string | null {
  if (!id) return id ?? null;
  return map.get(id) ?? id;
}

async function main() {
  const snap = load();
  console.log(`📦 Snapshot from: ${snap.exportedAt}`);
  console.log('');

  // ── 1. Users ───────────────────────────────────────────────────────────────
  // Skip if the user already exists locally (preserves local admin password).
  let userSkipped = 0;
  for (const u of snap.users) {
    const existsById = await prisma.user.findUnique({ where: { id: u.id } });
    const existsByEmail = await prisma.user.findUnique({ where: { email: u.email } });
    if (!existsById && !existsByEmail) {
      await prisma.user.create({ data: u });
    } else {
      userSkipped++;
    }
  }
  console.log(
    `✅ Users: ${snap.users.length - userSkipped} created, ${userSkipped} skipped (already exist)`,
  );

  // Build ID remapping for users whose emails already existed locally with different IDs
  const userIdMap = await buildUserIdMap(snap.users);

  // ── 2. Platforms ───────────────────────────────────────────────────────────
  for (const p of snap.platforms) {
    await prisma.platform.upsert({
      where: { id: p.id },
      update: { name: p.name, code: p.code },
      create: p,
    });
  }
  console.log(`✅ Platforms: ${snap.platforms.length}`);

  // ── 3. Trucks (without responsibleEmployeeId — circular FK) ───────────────
  for (const t of snap.trucks) {
    const { responsibleEmployeeId, ...rest } = t;
    await prisma.truck.upsert({
      where: { id: t.id },
      update: {
        immatriculation: t.immatriculation,
        isAvailable: t.isAvailable,
        status: t.status,
        notes: t.notes,
      },
      create: rest,
    });
  }
  console.log(`✅ Trucks: ${snap.trucks.length}`);

  // ── 4. Employees (without responsibleTruckId — circular FK) ───────────────
  for (const e of snap.employees) {
    const { responsibleTruckId, ...rest } = e;
    await prisma.employee.upsert({
      where: { id: e.id },
      update: {
        name: e.name,
        firstName: e.firstName,
        lastName: e.lastName,
        phone: e.phone,
        role: e.role,
        address: e.address,
        isActive: e.isActive,
        userId: e.userId,
      },
      create: rest,
    });
  }
  console.log(`✅ Employees: ${snap.employees.length}`);

  // ── 5. Wire circular FKs ───────────────────────────────────────────────────
  for (const e of snap.employees) {
    if (e.responsibleTruckId) {
      await prisma.employee.update({
        where: { id: e.id },
        data: { responsibleTruckId: e.responsibleTruckId },
      });
    }
  }
  for (const t of snap.trucks) {
    if (t.responsibleEmployeeId) {
      await prisma.truck.update({
        where: { id: t.id },
        data: { responsibleEmployeeId: t.responsibleEmployeeId },
      });
    }
  }
  console.log('✅ Truck ↔ employee relationships wired');

  // ── 6. Pay rates ───────────────────────────────────────────────────────────
  for (const r of snap.globalPayRates) {
    await prisma.globalPayRate.upsert({
      where: { tourType: r.tourType },
      update: { chauffeurRate: r.chauffeurRate, aideRate: r.aideRate },
      create: { ...r, updatedById: null },
    });
  }
  for (const r of snap.employeePayRates) {
    await prisma.employeePayRate.upsert({
      where: { employeeId_tourType: { employeeId: r.employeeId, tourType: r.tourType } },
      update: { chauffeurRate: r.chauffeurRate, aideRate: r.aideRate },
      create: { ...r, updatedById: null },
    });
  }
  console.log(
    `✅ Pay rates: ${snap.globalPayRates.length} global, ${snap.employeePayRates.length} employee`,
  );

  // ── 7. System config ───────────────────────────────────────────────────────
  for (const c of snap.systemConfig) {
    await prisma.systemConfig.upsert({
      where: { key: c.key },
      update: { value: c.value },
      create: c,
    });
  }
  console.log(`✅ System config: ${snap.systemConfig.length} entries`);

  // ── 8. Employee documents (Cloudinary URLs — work locally too) ─────────────
  for (const d of snap.employeeDocuments) {
    const uploadedById = remap(d.uploadedById, userIdMap);
    await prisma.employeeDocument.upsert({
      where: { id: d.id },
      update: { filePath: d.filePath, originalName: d.originalName },
      create: { ...d, uploadedById },
    });
  }
  console.log(`✅ Employee documents: ${snap.employeeDocuments.length}`);

  // ── 9. Truck documents ─────────────────────────────────────────────────────
  for (const d of snap.truckDocuments) {
    const uploadedById = remap(d.uploadedById, userIdMap);
    await prisma.truckDocument.upsert({
      where: { id: d.id },
      update: { filePath: d.filePath, fileName: d.fileName },
      create: { ...d, uploadedById },
    });
  }
  console.log(`✅ Truck documents: ${snap.truckDocuments.length}`);

  // ── 10. Tours ──────────────────────────────────────────────────────────────
  for (const t of snap.tours) {
    await prisma.tour.upsert({
      where: { id: t.id },
      update: {
        status: t.status,
        confirmationStatus: t.confirmationStatus,
        horaire: t.horaire,
        quai: t.quai,
      },
      create: t,
    });
  }
  console.log(`✅ Tours: ${snap.tours.length}`);

  // ── 11. Assignments ────────────────────────────────────────────────────────
  for (const a of snap.assignments) {
    await prisma.assignment.upsert({
      where: { id: a.id },
      update: { chauffeurId: a.chauffeurId, aideId: a.aideId, truckId: a.truckId },
      create: a,
    });
  }
  console.log(`✅ Assignments: ${snap.assignments.length}`);

  // ── 12. Tour confirmations ─────────────────────────────────────────────────
  for (const c of snap.tourConfirmations) {
    await prisma.tourConfirmation.upsert({
      where: { id: c.id },
      update: {
        totalClients: c.totalClients,
        delivered: c.delivered,
        absent: c.absent,
        nonConform: c.nonConform,
        d3e: c.d3e,
        notes: c.notes,
      },
      create: c,
    });
  }
  console.log(`✅ Tour confirmations: ${snap.tourConfirmations.length}`);

  // ── 13. Worked days ────────────────────────────────────────────────────────
  for (const w of snap.workedDays) {
    const overrideById = remap(w.overrideById, userIdMap);
    await prisma.workedDay.upsert({
      where: { id: w.id },
      update: { finalPay: w.finalPay, status: w.status, overridePay: w.overridePay },
      create: { ...w, overrideById },
    });
  }
  console.log(`✅ Worked days: ${snap.workedDays.length}`);

  // ── 14. Express deliveries ─────────────────────────────────────────────────
  for (const e of snap.expressDeliveries) {
    const createdById = remap(e.createdById, userIdMap);
    await prisma.expressDelivery.upsert({
      where: { id: e.id },
      update: { status: e.status, photo: e.photo, notes: e.notes },
      create: { ...e, createdById, pay: null, startTime: null, endTime: null },
    });
  }
  console.log(`✅ Express deliveries: ${snap.expressDeliveries.length}`);

  // ── 15. Express assignments ────────────────────────────────────────────────
  for (const a of snap.expressAssignments) {
    await prisma.expressAssignment.upsert({
      where: { id: a.id },
      update: { pay: a.pay, confirmedAt: a.confirmedAt, confirmedNotes: a.confirmedNotes },
      create: a,
    });
  }
  console.log(`✅ Express assignments: ${snap.expressAssignments.length}`);

  // ── 16. Express missions (worked day bonuses) ──────────────────────────────
  for (const m of snap.expressMissions) {
    const addedById = remap(m.addedById, userIdMap);
    await prisma.expressMission.upsert({
      where: { id: m.id },
      update: { pay: m.pay, notes: m.notes },
      create: { ...m, addedById },
    });
  }
  console.log(`✅ Express missions: ${snap.expressMissions.length}`);

  console.log('');
  console.log('🎉 All done! Your local database now mirrors production.');
  console.log('   Log in with your production credentials.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
