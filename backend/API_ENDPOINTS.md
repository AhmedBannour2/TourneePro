# TourneePro Backend API Endpoints

## Overview
This document lists all available REST API endpoints for the TourneePro backend.

All endpoints require JWT authentication via `Authorization: Bearer <token>` header unless otherwise noted.

Base URL: `http://localhost:3000` (development)

---

## Authentication (`/auth`)

### POST /auth/login
Login with email and password.
- **Body**: `{ email: string, password: string }`
- **Response**: `{ access_token: string, user: { id, email, role } }`
- **Public**: Yes (no auth required)

---

## Employees (`/employees`)

### GET /employees
List all employees with optional filtering.
- **Query params**: `isActive?: boolean, role?: string`
- **Response**: `Employee[]`

### GET /employees/:id
Get single employee by ID.
- **Response**: `Employee`

### POST /employees
Create new employee.
- **Body**: `{ name: string, email: string, phone: string, role: string, isActive?: boolean }`
- **Response**: `Employee`

### PATCH /employees/:id
Update employee.
- **Body**: Partial employee fields
- **Response**: `Employee`

### DELETE /employees/:id
Delete employee.
- **Response**: `Employee`

---

## Trucks (`/trucks`)

### GET /trucks
List all trucks with optional filtering.
- **Query params**: `isAvailable?: boolean`
- **Response**: `Truck[]`

### GET /trucks/:id
Get single truck by ID.
- **Response**: `Truck`

### POST /trucks
Create new truck.
- **Body**: `{ immatriculation: string, isAvailable?: boolean, notes?: string }`
- **Response**: `Truck`

### PATCH /trucks/:id
Update truck.
- **Body**: Partial truck fields
- **Response**: `Truck`

### DELETE /trucks/:id
Delete truck.
- **Response**: `Truck`

---

## Platforms (`/platforms`)

### GET /platforms
List all platforms.
- **Response**: `Platform[]`

### GET /platforms/:id
Get single platform by ID.
- **Response**: `Platform`

### POST /platforms
Create new platform/depot.
- **Body**: `{ name: string, address: string, notes?: string }`
- **Response**: `Platform`

### PATCH /platforms/:id
Update platform.
- **Body**: Partial platform fields
- **Response**: `Platform`

### DELETE /platforms/:id
Delete platform.
- **Response**: `Platform`

---

## Tours (`/tours`)

### GET /tours
List all tours with filtering and pagination.
- **Query params**:
  - `page?: number` (default: 1)
  - `limit?: number` (default: 20)
  - `date?: string` (ISO date format)
  - `employeeId?: string` (UUID)
  - `truckId?: string` (UUID)
  - `platformId?: string` (UUID)
  - `status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'`
- **Response**: `{ data: Tour[], total: number, page: number, limit: number }`

### GET /tours/dashboard/stats
Get dashboard statistics.
- **Response**: `{ toursToday: number, pendingTours: number, inProgressTours: number, completedTours: number }`

### GET /tours/:id
Get single tour by ID.
- **Response**: `Tour` (includes related Employee, Truck, Platform)

### PATCH /tours/:id/assign
Assign driver and/or truck to tour.
- **Body**: `{ driverDelivererId?: string, truckId?: string, notes?: string }`
- **Response**: `Tour`
- **Validation**: Checks for scheduling conflicts (same driver or truck assigned to multiple tours on same date)

### PATCH /tours/:id/unassign
Remove assignment from tour.
- **Response**: `Tour`

### DELETE /tours/:id
Delete tour.
- **Response**: `Tour`

---

## Express Deliveries (`/express-deliveries`)

### GET /express-deliveries
List all express deliveries with filtering.
- **Query params**:
  - `date?: string` (ISO date format)
  - `status?: string`
- **Response**: `ExpressDelivery[]`

### GET /express-deliveries/:id
Get single express delivery by ID.
- **Response**: `ExpressDelivery`

### POST /express-deliveries
Create manual express delivery.
- **Body**: `{ address: string, date: string, assigneeId?: string, truckId?: string, notes?: string }`
- **Response**: `ExpressDelivery`

### PATCH /express-deliveries/:id
Update express delivery.
- **Body**: Partial express delivery fields
- **Response**: `ExpressDelivery`

### DELETE /express-deliveries/:id
Soft delete (sets status to CANCELLED).
- **Response**: `ExpressDelivery`

---

## Worked Days (`/worked-days`)

### GET /worked-days
List all worked day records with filtering.
- **Query params**:
  - `employeeId?: string` (UUID)
  - `month?: string` (format: YYYY-MM)
- **Response**: `WorkedDay[]`

### GET /worked-days/summary
Get worked days summary for an employee and month.
- **Query params** (required):
  - `employeeId: string` (UUID)
  - `month: string` (format: YYYY-MM, e.g., "2026-05")
- **Response**: `{ workedCount: number, restCount: number, absentCount: number, holidayCount: number }`

### GET /worked-days/:id
Get single worked day record by ID.
- **Response**: `WorkedDay`

### POST /worked-days
Create worked day record.
- **Body**: `{ employeeId: string, date: string, type: 'WORKED' | 'REST' | 'ABSENT' | 'HOLIDAY', notes?: string }`
- **Response**: `WorkedDay`
- **Validation**: Prevents duplicate records (same employee + date)

### PATCH /worked-days/:id
Update worked day record.
- **Body**: Partial worked day fields
- **Response**: `WorkedDay`

### DELETE /worked-days/:id
Delete worked day record.
- **Response**: `WorkedDay`

---

## Imports (`/imports`)

### GET /imports
List all import batches.
- **Response**: `ImportBatch[]`

### GET /imports/:id
Get single import batch by ID.
- **Response**: `ImportBatch`

### POST /imports/upload
Upload and parse Boulanger Excel file.
- **Body**: Multipart form data with Excel file
- **Response**: `ImportBatch`
- **Process**: Creates background job to parse and validate rows

### POST /imports/:id/commit
Commit validated import rows to create/update Tours.
- **Response**: `ImportBatch`
- **Validation**: Only valid rows are committed

---

## Error Responses

All endpoints may return standard HTTP error responses:

- **400 Bad Request**: Invalid input, validation errors, business rule violations
- **401 Unauthorized**: Missing or invalid authentication token
- **403 Forbidden**: User doesn't have required role/permissions
- **404 Not Found**: Resource with specified ID not found
- **500 Internal Server Error**: Unexpected server error

Error response format:
```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Bad Request"
}
```

---

## Data Models

### Tour
- `id`: string (UUID)
- `tourCode`: string
- `tourType`: string
- `scheduledDate`: Date
- `status`: enum (PENDING, IN_PROGRESS, COMPLETED, CANCELLED)
- `platformId`: string (UUID)
- `driverDelivererId`: string | null (UUID)
- `truckId`: string | null (UUID)
- `notes`: string | null
- `createdAt`: Date
- Relations: `platform`, `driverDeliverer`, `truck`

### Employee
- `id`: string (UUID)
- `name`: string
- `email`: string
- `phone`: string
- `role`: string
- `isActive`: boolean
- `createdAt`: Date

### Truck
- `id`: string (UUID)
- `immatriculation`: string
- `isAvailable`: boolean
- `notes`: string | null
- `createdAt`: Date

### Platform
- `id`: string (UUID)
- `name`: string
- `address`: string
- `notes`: string | null
- `createdAt`: Date

### ExpressDelivery
- `id`: string (UUID)
- `address`: string
- `date`: Date
- `status`: string
- `assigneeId`: string (UUID)
- `truckId`: string | null (UUID)
- `notes`: string | null
- `completedAt`: Date | null
- `createdAt`: Date
- Relations: `assignee`, `truck`

### WorkedDay
- `id`: string (UUID)
- `employeeId`: string (UUID)
- `date`: Date
- `type`: enum (WORKED, REST, ABSENT, HOLIDAY)
- `notes`: string | null
- Relations: `employee`

---

## Notes

1. **Pagination**: Tours endpoint supports pagination. Other endpoints return all matching records.
2. **Filtering**: Query parameters are optional and can be combined.
3. **Soft Deletes**: Express deliveries use soft delete (status=CANCELLED). Other resources use hard delete.
4. **Conflict Detection**: Tour assignment checks for scheduling conflicts (same driver/truck on same date).
5. **Duplicate Prevention**: WorkedDay creation prevents duplicate employee+date records.
6. **OpenAPI/Swagger**: Full API documentation available at `/api` when server is running.
