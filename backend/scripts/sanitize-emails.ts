import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '.')
    .replace(/[^a-z.]/g, '');
}

async function main() {
  // Replace emails for users linked to an employee (non-admin)
  const employees = await prisma.employee.findMany({
    where: { userId: { not: null } },
    include: { user: true },
  });

  let updated = 0;
  for (const emp of employees) {
    if (!emp.user || emp.user.role === 'ADMIN') continue;
    const testEmail = `${toSlug(emp.name)}@stp.fr`;
    await prisma.user.update({ where: { id: emp.user.id }, data: { email: testEmail } });
    console.log(`  ${emp.user.email}  →  ${testEmail}`);
    updated++;
  }

  // Also sanitize non-admin users not linked to an employee
  const others = await prisma.user.findMany({
    where: { role: { not: 'ADMIN' }, employee: null },
  });
  for (const u of others) {
    const testEmail = `user.${u.id.slice(0, 6)}@stp.fr`;
    await prisma.user.update({ where: { id: u.id }, data: { email: testEmail } });
    console.log(`  ${u.email}  →  ${testEmail}`);
    updated++;
  }

  console.log(`\n✅ ${updated} emails sanitized. No real accounts will receive emails.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
