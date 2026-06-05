import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync, createReadStream, existsSync } from 'fs';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators';
import { UserRole } from '../auth/dto/register.dto';
import { ExpressDeliveriesService } from './express-deliveries.service';
import { CreateExpressDeliveryDto } from './dto/create-express-delivery.dto';
import { AssignExpressDeliveryDto } from './dto/assign-express-delivery.dto';
import { ConfirmExpressDeliveryDto } from './dto/confirm-express-delivery.dto';
import { UpdateExpressDeliveryDto } from './dto/update-express-delivery.dto';
import { GetExpressDeliveriesQueryDto } from './dto/get-express-deliveries-query.dto';

@ApiTags('express')
@ApiBearerAuth()
@Controller('express')
export class ExpressDeliveriesController {
  constructor(private readonly service: ExpressDeliveriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new express delivery' })
  create(@Body() dto: CreateExpressDeliveryDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List express deliveries with filters' })
  findAll(@Query() query: GetExpressDeliveriesQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get express delivery by ID' })
  @ApiParam({ name: 'id', description: 'Express delivery UUID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/assign')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Assign or update employees on an express delivery' })
  @ApiParam({ name: 'id', description: 'Express delivery UUID' })
  assign(@Param('id') id: string, @Body() dto: AssignExpressDeliveryDto, @Request() req: any) {
    return this.service.assign(id, dto, req.user.id);
  }

  @Post(':id/photo')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Upload photo/screenshot for an express delivery (max 10 MB, jpg/png/pdf)',
  })
  @ApiParam({ name: 'id', description: 'Express delivery UUID' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'express', req.params.id);
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
  uploadPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    return this.service.savePhoto(id, file.path);
  }

  @Get(':id/photo')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Stream/download the photo attached to an express delivery' })
  @ApiParam({ name: 'id', description: 'Express delivery UUID' })
  async getPhoto(@Param('id') id: string, @Res() res: any) {
    const delivery = await this.service.findOne(id);
    if (!delivery.photo) {
      return res.status(404).json({ message: 'No photo attached to this delivery' });
    }
    if (!existsSync(delivery.photo)) {
      return res.status(404).json({ message: 'Photo file not found on disk' });
    }
    const mime = delivery.photo.endsWith('.pdf')
      ? 'application/pdf'
      : delivery.photo.endsWith('.png')
        ? 'image/png'
        : 'image/jpeg';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    createReadStream(delivery.photo).pipe(res);
  }

  @Post(':id/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Employee confirms an express delivery (any assigned employee)' })
  @ApiParam({ name: 'id', description: 'Express delivery UUID' })
  confirm(@Param('id') id: string, @Body() dto: ConfirmExpressDeliveryDto, @Request() req: any) {
    return this.service.confirm(id, req.user.id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update express delivery details (not allowed if CONFIRMED)' })
  @ApiParam({ name: 'id', description: 'Express delivery UUID' })
  update(@Param('id') id: string, @Body() dto: UpdateExpressDeliveryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Soft-cancel an express delivery' })
  @ApiParam({ name: 'id', description: 'Express delivery UUID' })
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }
}
