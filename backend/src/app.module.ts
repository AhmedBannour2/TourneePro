import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './employees/employees.module';
import { TrucksModule } from './trucks/trucks.module';
import { PlatformsModule } from './platforms/platforms.module';
import { ImportsModule } from './imports/imports.module';
import { ToursModule } from './tours/tours.module';
import { ExpressDeliveriesModule } from './express-deliveries/express-deliveries.module';
import { WorkedDaysModule } from './worked-days/worked-days.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    EmployeesModule,
    TrucksModule,
    PlatformsModule,
    ImportsModule,
    ToursModule,
    ExpressDeliveriesModule,
    WorkedDaysModule,
    SettingsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
