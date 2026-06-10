const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  const dataPath = path.join(__dirname, 'prod-data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('❌ prod-data.json not found.');
    process.exit(1);
  }

  const { employees, trucks } = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`Importing ${employees.length} employees and ${trucks.length} trucks...`);

  // Step 1 — trucks without responsibleEmployeeId
  for (const truck of trucks) {
    await prisma.truck.upsert({
      where: { id: truck.id },
      update: { immatriculation: truck.immatriculation, isAvailable: truck.isAvailable, status: truck.status, notes: truck.notes },
      create: { id: truck.id, immatriculation: truck.immatriculation, isAvailable: truck.isAvailable, status: truck.status, notes: truck.notes },
    });
  }
  console.log(`✅ ${trucks.length} trucks upserted`);

  // Step 2 — employees without responsibleTruckId
  for (const emp of employees) {
    await prisma.employee.upsert({
      where: { id: emp.id },
      update: { name: emp.name, firstName: emp.firstName, lastName: emp.lastName, phone: emp.phone, role: emp.role, address: emp.address, isActive: emp.isActive },
      create: { id: emp.id, name: emp.name, firstName: emp.firstName, lastName: emp.lastName, phone: emp.phone, role: emp.role, address: emp.address, isActive: emp.isActive },
    });
  }
  console.log(`✅ ${employees.length} employees upserted`);

  // Step 3 — wire relationships
  for (const emp of employees) {
    if (emp.responsibleTruckId) {
      await prisma.employee.update({ where: { id: emp.id }, data: { responsibleTruckId: emp.responsibleTruckId } });
    }
  }
  for (const truck of trucks) {
    if (truck.responsibleEmployeeId) {
      await prisma.truck.update({ where: { id: truck.id }, data: { responsibleEmployeeId: truck.responsibleEmployeeId } });
    }
  }
  console.log('✅ Chauffeur ↔ truck relationships wired');
  console.log('🎉 Import complete!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
