import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ImportsService } from './imports.service';
import {
  ImportBatchResponseDto,
  PaginatedImportRowsDto,
} from './dto/import-batch-response.dto';
import { GetImportRowsQueryDto } from './dto/get-import-rows-query.dto';

@ApiTags('imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Get()
  @ApiOperation({ summary: 'List recent import batches' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max results (default 10)' })
  @ApiResponse({ status: 200, description: 'Recent import batches', type: [ImportBatchResponseDto] })
  async listBatches(@Query('limit') limit?: string) {
    return this.importsService.listBatches(limit ? parseInt(limit, 10) : 10);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const isXlsx = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        || file.originalname.toLowerCase().endsWith('.xlsx');
      cb(isXlsx ? null : new BadRequestException('Only .xlsx files are allowed'), isXlsx);
    },
  }))
  @ApiOperation({ summary: 'Upload an Excel file for import' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'File uploaded and parse job queued',
    type: ImportBatchResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.importsService.uploadFile(file);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get import batch status' })
  @ApiResponse({
    status: 200,
    description: 'Import batch status retrieved',
    type: ImportBatchResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Import batch not found' })
  async getBatchStatus(@Param('id') id: string) {
    return this.importsService.getBatchStatus(id);
  }

  @Get(':id/rows')
  @ApiOperation({ summary: 'Get import rows with pagination' })
  @ApiResponse({
    status: 200,
    description: 'Import rows retrieved',
    type: PaginatedImportRowsDto,
  })
  @ApiResponse({ status: 404, description: 'Import batch not found' })
  async getImportRows(
    @Param('id') id: string,
    @Query() query: GetImportRowsQueryDto,
  ) {
    return this.importsService.getImportRows(
      id,
      query.status,
      query.page,
      query.limit,
    );
  }

  @Post(':id/commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Commit import batch - create Tour records' })
  @ApiResponse({
    status: 200,
    description: 'Import batch committed successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid batch status for commit' })
  @ApiResponse({ status: 404, description: 'Import batch not found' })
  async commitBatch(@Param('id') id: string) {
    return this.importsService.commitBatch(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel import batch' })
  @ApiResponse({
    status: 200,
    description: 'Import batch cancelled',
  })
  @ApiResponse({ status: 404, description: 'Import batch not found' })
  async cancelBatch(@Param('id') id: string) {
    return this.importsService.cancelBatch(id);
  }
}
