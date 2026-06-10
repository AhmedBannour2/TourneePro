import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Body,
  Res,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { IsString, IsOptional } from 'class-validator';
import { Response } from 'express';
import { GoogleSheetsService } from './google-sheets.service';
import { Public } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators';
import { UserRole } from '../auth/dto';

class SaveSheetUrlsDto {
  @IsString()
  @IsOptional()
  url1!: string;

  @IsString()
  @IsOptional()
  url2!: string;
}

@ApiTags('google-sheets')
@Controller()
export class GoogleSheetsController {
  constructor(
    private readonly googleSheetsService: GoogleSheetsService,
    private readonly config: ConfigService,
  ) {}

  // ── OAuth flow ─────────────────────────────────────────────────────────────

  @Get('auth/google')
  @Public()
  @ApiOperation({ summary: 'Redirect to Google OAuth consent screen' })
  redirectToGoogle(@Res() res: Response) {
    const url = this.googleSheetsService.getAuthUrl();
    res.redirect(url);
  }

  @Get('auth/google/callback')
  @Public()
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  async handleCallback(@Query('code') code: string, @Res() res: Response) {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    try {
      const { email } = await this.googleSheetsService.handleCallback(code);
      res.redirect(`${frontendUrl}/settings?google=connected&email=${encodeURIComponent(email)}`);
    } catch (err: any) {
      res.redirect(
        `${frontendUrl}/settings?google=error&message=${encodeURIComponent(err.message)}`,
      );
    }
  }

  // ── Settings endpoints (admin only) ───────────────────────────────────────

  @Get('settings/google/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Google connection status and sheet URLs' })
  getStatus() {
    return this.googleSheetsService.getStatus();
  }

  @Delete('settings/google/disconnect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(204)
  @ApiOperation({ summary: 'Disconnect Google account' })
  disconnect() {
    return this.googleSheetsService.disconnect();
  }

  @Patch('settings/google/sheets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save Google Sheet URLs' })
  saveSheetUrls(@Body() dto: SaveSheetUrlsDto) {
    return this.googleSheetsService.saveSheetUrls(dto.url1, dto.url2);
  }

  // ── Sync ───────────────────────────────────────────────────────────────────

  @Post('settings/google/sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync tours from configured Google Sheets' })
  sync() {
    return this.googleSheetsService.syncFromSheets();
  }
}
