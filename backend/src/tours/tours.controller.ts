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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/dto/register.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { ToursService } from './tours.service';
import { GetToursQueryDto } from './dto/get-tours-query.dto';
import { AssignTourDto } from './dto/assign-tour.dto';
import { ConfirmTourDto } from './dto/confirm-tour.dto';
import { CreateTourDto } from './dto/create-tour.dto';
import { UpdateTourDto } from './dto/update-tour.dto';
import { ValidateDayDto } from './dto/validate-day.dto';
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

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update tour details (code, date, platform, quai, horaire, type)' })
  @ApiParam({ name: 'id', description: 'Tour UUID' })
  updateTour(@Param('id') id: string, @Body() dto: UpdateTourDto) {
    return this.toursService.updateTour(id, dto);
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

  @Post(':id/confirmation-photos')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Add a confirmation photo to a tour (proof of D3E pickup, multiple allowed)',
  })
  @ApiParam({ name: 'id', description: 'Tour UUID' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new BadRequestException('Only PDF, JPG, PNG allowed') as any, false);
      },
    }),
  )
  addConfirmationPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    return this.toursService.addConfirmationPhoto(id, file);
  }

  @Delete(':id/confirmation-photos/:photoId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a tour confirmation photo' })
  @ApiParam({ name: 'id', description: 'Tour UUID' })
  @ApiParam({ name: 'photoId', description: 'Photo UUID' })
  async deleteConfirmationPhoto(@Param('id') id: string, @Param('photoId') photoId: string) {
    await this.toursService.deleteConfirmationPhoto(id, photoId);
  }

  @Get(':id/confirmation-photos/:photoId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Stream a tour confirmation photo' })
  @ApiParam({ name: 'id', description: 'Tour UUID' })
  @ApiParam({ name: 'photoId', description: 'Photo UUID' })
  async getConfirmationPhoto(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Res() res: any,
  ) {
    const { buffer, contentType } = await this.toursService.getConfirmationPhoto(id, photoId);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'private, max-age=300');
    return res.send(buffer);
  }

  @Get('dashboard/monthly-report')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({
    summary:
      'Monthly delivery report: delivered/absent/D3E totals and delivery rate, global and per platform',
  })
  @ApiQuery({ name: 'month', description: 'Month in YYYY-MM format', required: false })
  getMonthlyReport(@Query('month') month?: string) {
    return this.toursService.getMonthlyReport(month);
  }

  @Get('days/:date/validation-preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Preview who will be notified when validating a day' })
  @ApiParam({ name: 'date', description: 'Date in YYYY-MM-DD format' })
  getValidationPreview(@Param('date') date: string) {
    return this.toursService.getValidationPreview(date);
  }

  @Post('days/:date/validate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Send day validation emails and record snapshot' })
  @ApiParam({ name: 'date', description: 'Date in YYYY-MM-DD format' })
  validateDay(@Param('date') date: string, @Body() dto: ValidateDayDto, @Req() req: any) {
    return this.toursService.validateDay(date, dto, req.user.id);
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
