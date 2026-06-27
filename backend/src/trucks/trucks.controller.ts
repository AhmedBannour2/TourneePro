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
  UseInterceptors,
  UploadedFiles,
  Request,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Logger } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TrucksService } from './trucks.service';
import { CreateTruckDto } from './dto/create-truck.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';
import { CreateRepairLogDto } from './dto/create-repair-log.dto';
import { UpdateTruckStatusDto } from './dto/update-truck-status.dto';
import { SetResponsibleDto } from './dto/set-responsible.dto';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { SubmitInspectionDto } from './dto/submit-inspection.dto';
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
  create(@Body() createTruckDto: CreateTruckDto) {
    return this.trucksService.create(createTruckDto);
  }

  @Get()
  @ApiQuery({ name: 'isAvailable', required: false, type: Boolean })
  findAll(@Query('isAvailable') isAvailable?: string) {
    const filter = isAvailable === 'true' ? true : isAvailable === 'false' ? false : undefined;
    return this.trucksService.findAll(filter);
  }

  @Get(':id/history')
  @UseGuards(JwtAuthGuard)
  getHistory(@Param('id') id: string) {
    return this.trucksService.getHistory(id);
  }

  @Get(':id/inspections')
  @UseGuards(JwtAuthGuard)
  listInspections(@Param('id') id: string) {
    return this.trucksService.listInspections(id);
  }

  @Post(':id/inspections')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  createInspection(@Param('id') id: string, @Body() dto: CreateInspectionDto, @Request() req: any) {
    return this.trucksService.createInspection(id, dto, req.user?.id);
  }

  @Post(':id/repair-logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  createRepairLog(@Param('id') id: string, @Body() dto: CreateRepairLogDto, @Request() req: any) {
    return this.trucksService.createRepairLog(id, dto, req.user?.id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTruckStatusDto, @Request() req: any) {
    return this.trucksService.updateStatus(id, dto, req.user?.id);
  }

  @Patch(':id/responsible')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  setResponsible(@Param('id') id: string, @Body() dto: SetResponsibleDto) {
    return this.trucksService.setResponsible(id, dto.employeeId ?? null);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.trucksService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTruckDto: UpdateTruckDto) {
    return this.trucksService.update(id, updateTruckDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.trucksService.remove(id);
  }
}

// ── Inspections controller (separate prefix) ──────────────────────────────────

@ApiTags('inspections')
@ApiBearerAuth()
@Controller('inspections')
export class InspectionsController {
  private readonly logger = new Logger(InspectionsController.name);
  constructor(private readonly trucksService: TrucksService) {}

  @Get('pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  listPending() {
    return this.trucksService.listPendingInspections();
  }

  @Post(':id/submit')
  @UseGuards(JwtAuthGuard)
  submit(@Param('id') id: string, @Body() dto: SubmitInspectionDto, @Request() req: any) {
    return this.trucksService.submitInspection(id, dto, req.user.id);
  }

  @Post(':id/photos')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('photos', 5, {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new Error(
              `Type de fichier non accepté : ${file.mimetype}. Seuls JPEG et PNG sont autorisés.`,
            ),
            false,
          );
        }
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadPhotos(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: any,
  ) {
    const fileList = (files ?? [])
      .map((f) => `${f.originalname}→${f.filename}(${f.size}b)`)
      .join(', ');
    this.logger.log(
      `Photo upload for inspection ${id}: ${files?.length ?? 0} file(s) from user ${req.user?.id} [${fileList}]`,
    );
    try {
      return await this.trucksService.uploadInspectionPhotos(id, files ?? [], req.user?.id);
    } catch (err) {
      this.logger.error(`Photo upload failed for inspection ${id}:`, err);
      throw err;
    }
  }

  @Post(':id/acknowledge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DISPATCHER)
  acknowledge(@Param('id') id: string, @Request() req: any) {
    return this.trucksService.acknowledgeInspection(id, req.user?.id);
  }
}
