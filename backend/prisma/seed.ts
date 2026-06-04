import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Check if admin user already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@stp.fr' },
  });

  if (existingAdmin) {
    console.log('✅ Admin user already exists');
    return;
  }

  // Create default admin user
  const passwordHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.create({
    data: {
      email: 'admin@stp.fr',
      passwordHash,
      role: 'ADMIN',
    },
  });

  console.log('✅ Created default admin user:');
  console.log(`   Email: ${admin.email}`);
  console.log(`   Password: admin123`);
  console.log(`   Role: ${admin.role}`);
  console.log('');
  console.log('⚠️  IMPORTANT: Change this password in production!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
