import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
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
  @ApiOperation({ summary: 'Send a test email via Resend to the configured test recipient' })
  async testMail(@Request() req: any) {
    try {
      // Get configured test recipient or fallback to current user's email
      const testRecipient = await this.settingsService.getTestRecipient();
      const recipient = testRecipient || req.user?.email;

      if (!recipient) {
        throw new Error('Aucune adresse email de test configurée');
      }

      await this.mailService.sendRaw({
        to: recipient,
        subject: 'TourneePro — Test Resend ✅',
        text: "La configuration email (Resend) fonctionne correctement. Cet email a été envoyé via l'API Resend.",
      });
      return { sent: true, to: recipient };
    } catch (err: any) {
      throw new HttpException(
        { sent: false, error: err.message ?? 'Erreur Resend' },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
