import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { WorkedDaysService } from './worked-days.service';
import { GetWorkedDaysQueryDto } from './dto/get-worked-days-query.dto';
import { OverrideWorkedDayDto } from './dto/override-worked-day.dto';
import { AddExpressDto } from './dto/add-express.dto';
import { CreateManualWorkedDayDto } from './dto/create-manual-worked-day.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/register.dto';

@ApiTags('worked-days')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('worked-days')
export class WorkedDaysController {
  constructor(private readonly workedDaysService: WorkedDaysService) {}

  // ── GET list ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List worked days for a month (with optional employee filter)' })
  findAll(@Query() query: GetWorkedDaysQueryDto) {
    return this.workedDaysService.findAll(query);
  }

  // ── GET summary ───────────────────────────────────────────────────────────

  @Get('summary')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Payroll summary for all employees for a month' })
  getSummary(@Query() query: GetWorkedDaysQueryDto) {
    return this.workedDaysService.getSummary({ month: query.month, year: query.year });
  }

  // ── GET single ────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get a single worked day by ID' })
  @ApiParam({ name: 'id' })
  findOne(@Param('id') id: string) {
    return this.workedDaysService.findOne(id);
  }

  // ── Manual create (dispatcher) ────────────────────────────────────────────

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Manually create a worked day' })
  createManual(@Body() dto: CreateManualWorkedDayDto) {
    return this.workedDaysService.createManual(dto);
  }

  // ── Confirm (employee only) ───────────────────────────────────────────────

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Employee confirms their worked day' })
  @ApiParam({ name: 'id' })
  confirm(@Param('id') id: string, @Request() req: any) {
    return this.workedDaysService.confirm(id, req.user.id);
  }

  // ── Override (dispatcher) ─────────────────────────────────────────────────

  @Patch(':id/override')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Dispatcher overrides the pay for a worked day' })
  @ApiParam({ name: 'id' })
  override(
    @Param('id') id: string,
    @Body() dto: OverrideWorkedDayDto,
    @Request() req: any,
  ) {
    return this.workedDaysService.override(id, dto, req.user.id);
  }

  // ── Cancel (dispatcher) ───────────────────────────────────────────────────

  @Patch(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Cancel a worked day' })
  @ApiParam({ name: 'id' })
  cancel(@Param('id') id: string) {
    return this.workedDaysService.cancel(id);
  }

  // ── Express missions ──────────────────────────────────────────────────────

  @Post(':id/express')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Add an express mission to a worked day' })
  @ApiParam({ name: 'id' })
  addExpress(
    @Param('id') id: string,
    @Body() dto: AddExpressDto,
    @Request() req: any,
  ) {
    return this.workedDaysService.addExpress(id, dto, req.user.id);
  }

  @Delete(':id/express/:expressId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Remove an express mission from a worked day' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'expressId' })
  removeExpress(@Param('id') id: string, @Param('expressId') expressId: string) {
    return this.workedDaysService.removeExpress(id, expressId);
  }
}
