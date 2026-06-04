import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { TrucksService } from './trucks.service';
import { CreateTruckDto } from './dto/create-truck.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';
import { CreateRepairLogDto } from './dto/create-repair-log.dto';
import { UpdateTruckStatusDto } from './dto/update-truck-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators';
import { UserRole } from '../auth/dto/register.dto';

@ApiTags('trucks')
@ApiBearerAuth()
@Controller('trucks')
export class TrucksController {
  constructor(private readonly trucksService: TrucksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new truck' })
  @ApiResponse({ status: 201, description: 'Truck created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Truck with this immatriculation already exists' })
  create(@Body() createTruckDto: CreateTruckDto) {
    return this.trucksService.create(createTruckDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all trucks' })
  @ApiQuery({ name: 'isAvailable', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Returns all trucks' })
  findAll(@Query('isAvailable') isAvailable?: string) {
    const filter = isAvailable === 'true' ? true : isAvailable === 'false' ? false : undefined;
    return this.trucksService.findAll(filter);
  }

  @Get(':id/history')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get full history for a truck (assignments + repair logs)' })
  @ApiParam({ name: 'id', description: 'Truck UUID' })
  @ApiResponse({ status: 200, description: 'Returns { assignments, repairs }' })
  getHistory(@Param('id') id: string) {
    return this.trucksService.getHistory(id);
  }

  @Post(':id/repair-logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Add a repair log entry for a truck (admin/dispatcher only)' })
  @ApiParam({ name: 'id', description: 'Truck UUID' })
  @ApiResponse({ status: 201, description: 'Repair log created' })
  createRepairLog(
    @Param('id') id: string,
    @Body() dto: CreateRepairLogDto,
    @Request() req: any,
  ) {
    return this.trucksService.createRepairLog(id, dto, req.user?.id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Update truck status (available | unavailable | in_repair)' })
  @ApiParam({ name: 'id', description: 'Truck UUID' })
  @ApiResponse({ status: 200, description: 'Truck status updated' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTruckStatusDto,
    @Request() req: any,
  ) {
    return this.trucksService.updateStatus(id, dto, req.user?.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get truck by ID' })
  @ApiParam({ name: 'id', description: 'Truck UUID' })
  @ApiResponse({ status: 200, description: 'Returns the truck' })
  @ApiResponse({ status: 404, description: 'Truck not found' })
  findOne(@Param('id') id: string) {
    return this.trucksService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update truck' })
  @ApiParam({ name: 'id', description: 'Truck UUID' })
  @ApiResponse({ status: 200, description: 'Truck updated successfully' })
  @ApiResponse({ status: 404, description: 'Truck not found' })
  @ApiResponse({ status: 409, description: 'Truck with this immatriculation already exists' })
  update(@Param('id') id: string, @Body() updateTruckDto: UpdateTruckDto) {
    return this.trucksService.update(id, updateTruckDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete truck' })
  @ApiParam({ name: 'id', description: 'Truck UUID' })
  @ApiResponse({ status: 200, description: 'Truck deleted successfully' })
  @ApiResponse({ status: 404, description: 'Truck not found' })
  remove(@Param('id') id: string) {
    return this.trucksService.remove(id);
  }
}
