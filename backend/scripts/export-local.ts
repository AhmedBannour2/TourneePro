import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Exporting employees and trucks from local database...');

  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      address: true,
      isActive: true,
      responsibleTruckId: true,
    },
    orderBy: { name: 'asc' },
  });

  const trucks = await prisma.truck.findMany({
    select: {
      id: true,
      immatriculation: true,
      isAvailable: true,
      status: true,
      notes: true,
      responsibleEmployeeId: true,
    },
    orderBy: { immatriculation: 'asc' },
  });

  const data = { employees, trucks };
  const outPath = path.join(__dirname, 'prod-data.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));

  console.log(`✅ Exported ${employees.length} employees and ${trucks.length} trucks`);
  console.log(`📄 Written to: ${outPath}`);
  console.log('');
  console.log('Next steps:');
  console.log(
    '  1. git add scripts/prod-data.json && git commit -m "chore: add prod seed data" && git push',
  );
  console.log('  2. In Railway Console: npx ts-node scripts/import-prod.ts');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
