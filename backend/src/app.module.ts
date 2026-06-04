import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './employees/employees.module';
import { TrucksModule } from './trucks/trucks.module';
import { PlatformsModule } from './platforms/platforms.module';
import { ImportsModule } from './imports/imports.module';
import { ToursModule } from './tours/tours.module';
import { ExpressDeliveriesModule } from './express-deliveries/express-deliveries.module';
import { WorkedDaysModule } from './worked-days/worked-days.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    EmployeesModule,
    TrucksModule,
    PlatformsModule,
    ImportsModule,
    ToursModule,
    ExpressDeliveriesModule,
    WorkedDaysModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
