import { Controller, Get, Post, Patch, Delete, Query, Body, Res, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { IsString, IsOptional } from 'class-validator';
import { Response } from 'express';
import { GoogleSheetsService } from './google-sheets.service';

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
  @ApiOperation({ summary: 'Redirect to Google OAuth consent screen' })
  redirectToGoogle(@Res() res: Response) {
    const url = this.googleSheetsService.getAuthUrl();
    res.redirect(url);
  }

  @Get('auth/google/callback')
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

  // ── Settings endpoints ─────────────────────────────────────────────────────

  @Get('settings/google/status')
  @ApiOperation({ summary: 'Get Google connection status and sheet URLs' })
  getStatus() {
    return this.googleSheetsService.getStatus();
  }

  @Delete('settings/google/disconnect')
  @HttpCode(204)
  @ApiOperation({ summary: 'Disconnect Google account' })
  disconnect() {
    return this.googleSheetsService.disconnect();
  }

  @Patch('settings/google/sheets')
  @ApiOperation({ summary: 'Save Google Sheet URLs' })
  saveSheetUrls(@Body() dto: SaveSheetUrlsDto) {
    return this.googleSheetsService.saveSheetUrls(dto.url1, dto.url2);
  }

  // ── Sync ───────────────────────────────────────────────────────────────────

  @Post('settings/google/sync')
  @ApiOperation({ summary: 'Sync tours from configured Google Sheets' })
  sync() {
    return this.googleSheetsService.syncFromSheets();
  }
}
