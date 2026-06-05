import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Patch,
  Delete,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/register.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ToursService } from './tours.service';
import { GetToursQueryDto } from './dto/get-tours-query.dto';
import { AssignTourDto } from './dto/assign-tour.dto';
import { ConfirmTourDto } from './dto/confirm-tour.dto';
import { CreateTourDto } from './dto/create-tour.dto';
import { DashboardStatsResponseDto } from './dto/dashboard-stats-response.dto';

@ApiTags('tours')
@ApiBearerAuth()
@Controller('tours')
export class ToursController {
  constructor(private readonly toursService: ToursService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Manually create a tour' })
  createTour(@Body() dto: CreateTourDto) {
    return this.toursService.createTour(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all tours with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Returns paginated tours list' })
  findAll(@Query() query: GetToursQueryDto) {
    return this.toursService.findAll(query);
  }

  @Get('dashboard/stats')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Returns dashboard stats',
    type: DashboardStatsResponseDto,
  })
  getDashboardStats(): Promise<DashboardStatsResponseDto> {
    return this.toursService.getDashboardStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tour by ID' })
  @ApiParam({ name: 'id', description: 'Tour UUID' })
  @ApiResponse({ status: 200, description: 'Returns the tour' })
  @ApiResponse({ status: 404, description: 'Tour not found' })
  findOne(@Param('id') id: string) {
    return this.toursService.findOne(id);
  }

  @Patch(':id/assignment')
  @ApiOperation({ summary: 'Assign chauffeur, aide, and truck to a tour' })
  @ApiParam({ name: 'id', description: 'Tour UUID' })
  @ApiResponse({ status: 200, description: 'Tour assigned successfully' })
  @ApiResponse({ status: 404, description: 'Tour not found' })
  @ApiResponse({ status: 400, description: 'Invalid assignment data' })
  assignTour(@Param('id') id: string, @Body() assignDto: AssignTourDto, @Req() req: any) {
    const userId = req.user?.userId;
    return this.toursService.assignTour(id, assignDto, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Delete a tour (only if not assigned)' })
  @ApiParam({ name: 'id', description: 'Tour UUID' })
  @ApiResponse({ status: 200, description: 'Tour deleted' })
  @ApiResponse({ status: 400, description: 'Tour is assigned — unassign first' })
  deleteTour(@Param('id') id: string) {
    return this.toursService.deleteTour(id);
  }

  @Delete(':id/assignment')
  @ApiOperation({ summary: 'Unassign tour (remove all assignments)' })
  @ApiParam({ name: 'id', description: 'Tour UUID' })
  @ApiResponse({ status: 200, description: 'Tour unassigned successfully' })
  @ApiResponse({ status: 404, description: 'Tour not found' })
  @ApiResponse({ status: 400, description: 'Tour is not assigned' })
  unassignTour(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.userId;
    return this.toursService.unassignTour(id, userId);
  }

  @Post(':id/confirm-admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Admin/dispatcher confirms tour delivery details on behalf of the team',
  })
  @ApiParam({ name: 'id', description: 'Tour UUID' })
  adminConfirmTour(@Param('id') id: string, @Body() dto: ConfirmTourDto) {
    return this.toursService.adminConfirmTour(id, dto);
  }

  @Patch(':id/confirm-admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Admin/dispatcher updates a tour confirmation' })
  @ApiParam({ name: 'id', description: 'Tour UUID' })
  adminUpdateConfirmation(@Param('id') id: string, @Body() dto: ConfirmTourDto) {
    return this.toursService.adminUpdateConfirmation(id, dto);
  }

  @Post(':id/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Employee confirms tour delivery details' })
  @ApiParam({ name: 'id', description: 'Tour UUID' })
  confirmTour(@Param('id') id: string, @Body() dto: ConfirmTourDto, @Req() req: any) {
    return this.toursService.confirmTour(id, dto, req.user.id);
  }

  @Patch(':id/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Employee edits their tour confirmation' })
  @ApiParam({ name: 'id', description: 'Tour UUID' })
  updateConfirmation(@Param('id') id: string, @Body() dto: ConfirmTourDto, @Req() req: any) {
    return this.toursService.updateConfirmation(id, dto, req.user.id);
  }

  @Post(':id/assignment/seen')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mark the assignment as seen by the authenticated employee' })
  @ApiParam({ name: 'id', description: 'Tour UUID' })
  @ApiResponse({ status: 201, description: 'Assignment marked as seen' })
  @ApiResponse({ status: 404, description: 'No assignment for this employee on this tour' })
  markAssignmentSeen(@Param('id') id: string, @Req() req: any) {
    return this.toursService.markAssignmentSeen(id, req.user.id);
  }
}
