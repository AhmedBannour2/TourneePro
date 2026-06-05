import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Put,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync, createReadStream, existsSync } from 'fs';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { TrucksService } from '../trucks/trucks.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CreateEmployeeAccountDto } from './dto/create-account.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators';
import { UserRole } from '../auth/dto/register.dto';

@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly trucksService: TrucksService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a new employee' })
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all employees' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAll(@Query('isActive') isActive?: string) {
    const filter = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.employeesService.findAll(filter);
  }

  // ── Employee-facing endpoints (before /:id to avoid param collision) ───────

  @Get('me/profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get the authenticated employee's own profile" })
  getMyProfile(@Request() req: any) {
    return this.employeesService.getMyProfile(req.user.id);
  }

  @Patch('me/profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Update the authenticated employee's own profile" })
  updateMyProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    return this.employeesService.updateMyProfile(req.user.id, dto);
  }

  @Get('me/dashboard')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Dashboard data for the authenticated employee' })
  getEmployeeDashboard(@Request() req: any) {
    return this.employeesService.getEmployeeDashboard(req.user.id);
  }

  @Get('me/assignments')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upcoming assignments for the authenticated employee' })
  getMyAssignments(@Request() req: any) {
    return this.employeesService.getMyAssignments(req.user.id);
  }

  @Get('me/express')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Express assignments for the authenticated employee' })
  getMyExpress(@Request() req: any) {
    return this.employeesService.getMyExpress(req.user.id);
  }

  @Get('me/inspections')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Pending truck inspections for the authenticated employee' })
  getMyInspections(@Request() req: any) {
    return this.trucksService.listMyInspections(req.user.id);
  }

  // ── Single employee ────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get employee by ID' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update employee' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete employee (isActive=false)' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  remove(@Param('id') id: string) {
    return this.employeesService.remove(id);
  }

  // ── Account ────────────────────────────────────────────────────────────────

  @Post(':id/create-account')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create login credentials for an employee (admin only)' })
  createAccount(@Param('id') id: string, @Body() dto: CreateEmployeeAccountDto) {
    return this.employeesService.createAccount(id, dto);
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  // ── Pay rates ──────────────────────────────────────────────────────────────

  @Get(':id/pay-rates')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get pay rates for an employee' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  getPayRates(@Param('id') id: string) {
    return this.employeesService.getPayRates(id);
  }

  @Put(':id/pay-rates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Upsert pay rates for an employee (dispatcher only)' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  upsertPayRates(
    @Param('id') id: string,
    @Body()
    body: { rates: { tourType: string; chauffeurRate: number; aideRate?: number | null }[] },
    @Request() req: any,
  ) {
    return this.employeesService.upsertPayRates(id, body.rates as any, req.user.id);
  }

  @Get(':id/documents')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List documents for an employee' })
  listDocuments(@Param('id') id: string) {
    return this.employeesService.listDocuments(id);
  }

  @Post(':id/documents')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload a document for an employee (max 10 MB, pdf/jpg/png)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'employees', req.params.id);
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new BadRequestException('Only PDF, JPG, PNG allowed') as any, false);
      },
    }),
  )
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.employeesService.createDocument(id, file, dto, req.user?.id);
  }

  @Delete(':id/documents/:docId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a document' })
  deleteDocument(@Param('id') id: string, @Param('docId') docId: string) {
    return this.employeesService.deleteDocument(id, docId);
  }

  @Get(':id/documents/:docId/download')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Download a document' })
  async downloadDocument(@Param('id') id: string, @Param('docId') docId: string, @Res() res: any) {
    const doc = await this.employeesService.findDocument(id, docId);
    if (!existsSync(doc.filePath)) {
      return res.status(404).json({ message: 'File not found on disk' });
    }
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.originalName)}"`,
    );
    createReadStream(doc.filePath).pipe(res);
  }
}
