# TourneePro Backend - Import Pipeline Documentation

## Overview

The Excel import pipeline handles Boulanger daily tour files with the following flow:

1. **Upload** - User uploads .xlsx file via POST /imports/upload
2. **Parse** - Background job parses the file and detects STP tours
3. **Preview** - User reviews parsed rows and any errors
4. **Commit** - User commits the import, creating Tour records

## Endpoints

### POST /imports/upload
Accepts multipart/form-data with `file` field.

**Validations:**
- File extension must be .xlsx
- Max file size: 10MB

**Response:**
```json
{
  "id": "batch-uuid",
  "fileName": "boulanger_2026-05-27.xlsx",
  "uploadedAt": "2026-05-27T10:00:00Z",
  "status": "pending",
  "rowCount": 0,
  "errorCount": 0
}
```

After upload, a background job is queued automatically.

### GET /imports/:id/status
Get the current status of an import batch.

**Response:**
```json
{
  "id": "batch-uuid",
  "fileName": "boulanger_2026-05-27.xlsx",
  "uploadedAt": "2026-05-27T10:00:00Z",
  "status": "preview",
  "rowCount": 42,
  "errorCount": 2
}
```

**Status values:**
- `pending` - Upload received, parse job queued
- `processing` - Parser is reading the file
- `preview` - Parsing complete, ready for review
- `committed` - Tours created from parsed rows
- `cancelled` - Import was cancelled
- `failed` - Parsing failed

### GET /imports/:id/rows?status=&page=&limit=
Get paginated import rows with optional status filter.

**Query params:**
- `status` (optional): filter by row status (e.g., 'parsed', 'error')
- `page` (optional, default 1): page number
- `limit` (optional, default 50): items per page

**Response:**
```json
{
  "rows": [
    {
      "id": "row-uuid",
      "batchId": "batch-uuid",
      "sheetName": "Alfortville",
      "rowIndex": 5,
      "rawData": { "code_tournee": "ALF-001", ... },
      "parsedData": { "tourCode": "ALF-001", "platform": "F166", ... },
      "status": "parsed",
      "errorMessage": null
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 50
}
```

### POST /imports/:id/commit
Commit the import batch - creates Tour records from all `parsed` rows.

**Business logic:**
- Only rows with status `parsed` are committed
- Tours are created with tourCode, date, platformId
- Platform is created automatically if it doesn't exist
- Tours are linked to the ImportBatch via `importBatchId`
- Batch status is updated to `committed`

**Response:**
```json
{
  "batchId": "batch-uuid",
  "toursCreated": 40,
  "status": "committed"
}
```

### POST /imports/:id/cancel
Cancel an import batch. Sets status to `cancelled`.

**Response:**
```json
{
  "batchId": "batch-uuid",
  "status": "cancelled"
}
```

## Parser Behavior

The `ExcelParserService` scans all sheets in the workbook and:

1. **Detects header rows** by looking for known column patterns (e.g., "N tournée", "code tournée", "transporteur", "date")
2. **Extracts data rows** after the header
3. **Filters for STP tours** - only rows where `transporteur` or `titulaire` contains "STP" (case-insensitive) are kept
4. **Infers platform** from sheet name:
   - "Alfortville" or "F166" → platform `F166`
   - "Garonor" → platform `GARONOR`
5. **Parses structured data**:
   - `tourCode` from "code tournée" or "N tournée" columns
   - `date` from "date" or similar columns
   - `nbColis`, `volume`, etc. when present

**Column name flexibility:**
The parser normalizes column names to handle variations like:
- "N° tournée" vs "N tournee" vs "numero tournee"
- Spaces, accents, dashes, underscores are all normalized

**Error handling:**
Rows that fail parsing (e.g., missing required fields) are saved with `status: 'error'` and an error message.

## Background Job Queue

Uses **BullMQ** with Redis for job processing.

**Configuration:**
- Redis host: `process.env.REDIS_HOST || 'localhost'`
- Redis port: `process.env.REDIS_PORT || 6379`
- Worker concurrency: 2 (can process 2 imports in parallel)

**Job lifecycle:**
1. User uploads file → job queued with `batchId` and `filePath`
2. Worker picks up job and calls `ExcelParserService.parseExcelFile()`
3. Parsed rows are saved to database
4. Batch status is updated to `preview` or `failed`

## Database Schema

### ImportBatch
- `id` (uuid)
- `fileName` (string)
- `uploadedAt` (datetime)
- `status` (string: pending/processing/preview/committed/cancelled/failed)
- `rowCount` (int) - count of successfully parsed rows
- `errorCount` (int) - count of error rows

### ImportRow
- `id` (uuid)
- `batchId` (uuid, foreign key to ImportBatch)
- `sheetName` (string) - Excel sheet name
- `rowIndex` (int) - row number in Excel
- `rawData` (json) - raw extracted columns
- `parsedData` (json) - structured data for business logic
- `status` (string: pending/parsed/error)
- `errorMessage` (string, nullable)

## Testing

Unit tests for the parser are in `excel-parser.service.spec.ts`.

**Test cases:**
- STP tour detection and filtering
- Platform inference (Alfortville → F166, Garonor → GARONOR)
- Column name normalization

Run tests:
```bash
npm run test
```

## Setup

1. Ensure Redis is running:
```bash
docker compose up -d
```

2. Run Prisma migrations to create tables:
```bash
npm run prisma:migrate
```

3. Start the server:
```bash
npm run start:dev
```

4. API docs available at:
```
http://localhost:3000/api
```

## Next Steps

- Add support for tour_type inference from tour codes
- Add validation for date formats
- Add duplicate tour detection during commit
- Add audit events for import commits
- Add file retention policy (cleanup old uploads)
