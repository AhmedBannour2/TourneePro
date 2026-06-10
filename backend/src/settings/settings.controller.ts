import { Controller, Get, Put, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators';
import { UserRole } from '../auth/dto/register.dto';
import { SettingsService } from './settings.service';
import { MailService } from '../notification/mail.service';
import { UpsertGlobalPayRatesDto } from './dto/upsert-global-pay-rates.dto';
import { MailConfigDto } from './dto/mail-config.dto';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly mailService: MailService,
  ) {}

  @Get('pay-rates')
  @ApiOperation({ summary: 'Get global default pay rates' })
  getGlobalPayRates() {
    return this.settingsService.getGlobalPayRates();
  }

  @Put('pay-rates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update global default pay rates (admin only)' })
  upsertGlobalPayRates(@Body() dto: UpsertGlobalPayRatesDto, @Request() req: any) {
    return this.settingsService.upsertGlobalPayRates(dto.rates, req.user.id);
  }

  @Get('mail')
  @ApiOperation({ summary: 'Get mail configuration (password masked)' })
  getMailConfig() {
    return this.settingsService.getMailConfig();
  }

  @Post('mail')
  @ApiOperation({ summary: 'Save mail configuration' })
  saveMailConfig(@Body() dto: MailConfigDto) {
    return this.settingsService.saveMailConfig(dto);
  }

  @Post('mail/test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Send a test email to the current admin account' })
  async testMail(@Request() req: any) {
    await this.mailService.sendRaw({
      to: req.user.email,
      subject: 'TourneePro — Test SMTP ✅',
      text: 'La configuration mail fonctionne correctement. Cet email a été envoyé depuis noreply@tournee.pro via Railway.',
    });
    return { sent: true, to: req.user.email };
  }
}
