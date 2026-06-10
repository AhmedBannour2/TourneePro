import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, UserRole } from './dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { JwtAuthGuard } from './guards';
import { Roles, Public } from './decorators';
import { RolesGuard } from './guards/roles.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      properties: {
        access_token: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a new user (admin only, or open if no users exist)' })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    schema: {
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        role: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(@Body() registerDto: RegisterDto, @Request() req: any) {
    // Extract user from request if authenticated, otherwise allow first user creation
    const currentUser = req.user || undefined;
    return this.authService.register(registerDto, currentUser);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile',
    schema: {
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        role: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@Request() req: any) {
    return this.authService.getMe(req.user.id);
  }

  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (requires current password)' })
  @ApiResponse({ status: 200, description: 'Password updated' })
  @ApiResponse({ status: 401, description: 'Current password incorrect' })
  async changePassword(@Body() dto: ChangePasswordDto, @Request() req: any) {
    return this.authService.changePassword(req.user.id, dto);
  }

  @Patch('me/email')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change email (requires current password, forces re-login)' })
  @ApiResponse({ status: 200, description: 'Email updated' })
  @ApiResponse({ status: 401, description: 'Current password incorrect' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async changeEmail(@Body() dto: ChangeEmailDto, @Request() req: any) {
    return this.authService.changeEmail(req.user.id, dto);
  }
}
