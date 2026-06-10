import { Module } from '@nestjs/common';
import { SystemConfigModule } from '../system-config/system-config.module';
import { MailService } from './mail.service';

@Module({
  imports: [SystemConfigModule],
  providers: [MailService],
  exports: [MailService],
})
export class NotificationModule {}
