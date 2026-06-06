import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  Res,
  HttpCode,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { TruckDocumentsService } from './truck-documents.service';
import { UpsertTruckDocumentDto } from './dto/truck-document.dto';

@ApiTags('truck-documents')
@Controller('trucks/:truckId/documents')
export class TruckDocumentsController {
  constructor(private readonly service: TruckDocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List all documents for a truck' })
  list(@Param('truckId') truckId: string) {
    return this.service.list(truckId);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Add a document entry (with optional file upload)' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upsert(
    @Param('truckId') truckId: string,
    @Body() dto: UpsertTruckDocumentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Request() req: any,
  ) {
    const userId: string | null = req.user?.id ?? null;
    return this.service.upsert(truckId, dto, file, userId);
  }

  @Delete(':documentId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a truck document' })
  delete(@Param('truckId') truckId: string, @Param('documentId') documentId: string) {
    return this.service.delete(truckId, documentId);
  }

  @Get(':documentId/file')
  @ApiOperation({ summary: 'Download/view a truck document file' })
  async downloadFile(
    @Param('truckId') truckId: string,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const doc = await this.service.findDocumentOrThrow(truckId, documentId);
    const filePath = this.service.getFilePath(doc);

    if (!filePath) {
      res.status(404).json({ message: 'No file attached to this document' });
      return;
    }

    res.setHeader('Content-Type', doc.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName ?? 'document'}"`);
    res.sendFile(filePath);
  }
}
