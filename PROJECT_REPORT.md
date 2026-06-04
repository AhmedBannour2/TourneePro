# TourneePro — Project Report

_Generated: 2026-05-31_

---

## 1. What the App Does

TourneePro is an internal logistics management platform for **STP**, a last-mile delivery company that operates under the Boulanger retail network. Every day, Boulanger sends an Excel file listing the delivery tours for each platform (depot). STP dispatchers must:

1. **Import** that Excel file into the system
2. **Preview** the parsed tours and commit them
3. **Assign** a chauffeur-livreur, an aide-livreur, and a truck to each tour
4. **Track** employee attendance, express (ad-hoc) deliveries, and overall fleet status

The app replaces a manual process (shared spreadsheets, phone calls) with a structured web interface for dispatchers and admins.

---

## 2. Tech Stack

### Backend
| Layer | Technology |
|---|---|
| Framework | NestJS 10 (TypeScript) |
| ORM | Prisma 5 |
| Database | PostgreSQL |
| Auth | JWT + Passport (`@nestjs/jwt`, `passport-jwt`) |
| File upload | Multer (memory storage, 10 MB limit) |
| Excel parsing | ExcelJS |
| Background queue | BullMQ + Redis (configured but bypassed — see §4) |
| API docs | Swagger / OpenAPI (`@nestjs/swagger`) |
| Validation | `class-validator` + `class-transformer` |

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 19 + Vite |
| Styling | TailwindCSS v4 |
| Component library | shadcn/ui (Radix UI primitives) |
| Server state | TanStack React Query v5 |
| Forms | React Hook Form + Zod |
| HTTP client | Axios |
| Charts | Recharts |
| Routing | React Router v7 |

### Infrastructure
| | |
|---|---|
| Containerisation | Docker Compose (PostgreSQL + Redis services defined) |
| Dev servers | `nest start --watch` (backend :3000) · `vite` (frontend :5173) |

---

## 3. Database Schema

```
User            – auth accounts (admin / dispatcher / employee)
Employee        – chauffeur-livreur or aide-livreur
Truck           – fleet vehicles (immatriculation, availability)
Platform        – logistics hubs (code, name) — auto-created on import commit
Tour            – one delivery route for one day (imported from Excel)
Assignment      – links Tour → chauffeur + aide + truck
ImportBatch     – one uploaded Excel file
ImportRow       – one parsed row inside a batch (status: parsed / skipped / error)
ExpressDelivery – ad-hoc delivery outside the normal tour schedule
WorkedDay       – attendance record per employee per day
AuditEvent      – append-only audit trail for assignments and imports
```

---

## 4. Implemented Features

### 4.1 Backend

#### Import Pipeline ✅
- `POST /imports/upload` — accepts `.xlsx`, enforces 10 MB limit and MIME type, parses synchronously with `BoulangerParserService`, saves all rows in one `createMany`, returns batch in `preview` status
- `GET /imports/:id/status` — batch status polling
- `GET /imports/:id/rows` — paginated rows with status filter (max 200/page)
- `POST /imports/:id/commit` — upserts tours into the `Tour` table, auto-creates platforms atomically via `upsert`, guards against re-committing, returns per-batch counts (created / updated / skipped)
- `POST /imports/:id/cancel` — cancels a batch with status guard (only `pending / processing / preview`)
- `GET /imports` — recent batches list

#### Tours ✅
- `GET /tours` — full filtering by `date`, `dateFrom`, `dateTo`, `platformId`, `status`, `chauffeurId`; server-side pagination; includes `platform`, `assignments[chauffeur + aide + truck]`
- `GET /tours/dashboard/stats` — today's tour count, unassigned count, active employee count, recent import errors
- `GET /tours/:id` — single tour with full relations
- `PATCH /tours/:id/assignment` — assign chauffeur + aide + truck, validates employee/truck existence and activity, writes audit event
- `DELETE /tours/:id/assignment` — unassign, reverts tour to `imported` status, writes audit event

#### Employees ✅
- Full CRUD (`GET`, `POST`, `PATCH`, `DELETE /employees`)
- `isActive` filter on list endpoint
- Soft-delete (sets `isActive = false`)

#### Trucks ✅
- Full CRUD (`GET`, `POST`, `PATCH`, `DELETE /trucks`)
- `isAvailable` filter on list endpoint
- Duplicate `immatriculation` guard (409)

#### Platforms ✅
- `GET /platforms` — list all
- `POST /platforms`, `PATCH /platforms/:id` — create / update

#### Auth ✅ (structure only — guards not enforced)
- `POST /auth/login` — returns JWT
- `POST /auth/register` — creates user
- JWT strategy + roles decorator defined
- `JwtAuthGuard` imported from auth module but **not applied** globally (see §4 Partial)

#### Worked Days ✅
- Full CRUD for attendance records
- Unique constraint per employee + date

#### Express Deliveries ✅
- Full CRUD for ad-hoc deliveries
- Status lifecycle: `pending → assigned → completed`

---

### 4.2 Frontend

#### Import Page ✅
- Drag-and-drop or browse file upload (`.xlsx`)
- Upload progress bar
- Auto-polling while batch is in `pending / processing` state (3 s interval)
- Preview table: row index, sheet name, tour code, date, platform, prestataire, status badge
- Tab filter: All / Parsed / Errors
- Confirm Import dialog showing count of tours to commit
- Cancel button with error feedback
- Recent imports history list

#### Tours Page ✅
- Filter bar: date picker, platform dropdown, status dropdown, tour code search (client-side)
- Full data table: tour code, date, platform name, type, status badge, chauffeur, aide, truck
- Server-side pagination with rows-per-page selector
- Detail panel (plain CSS slide-in, zero Radix UI) showing all tour fields
- All UI uses plain HTML `<input>` / `<select>` — no Radix dropdowns (stability fix)

#### Dashboard ✅
- 4 stat cards: Tours Today, Unassigned, Active Employees, Import Errors
- All cards correctly wired to backend field names
- Loading skeleton and error state

#### Assignments Page ✅
- Date picker to scope the board
- Left panel: unassigned tours for the selected date (status = `imported`)
- Assignment form: chauffeur select (active only), aide select (optional), truck select (available only)
- Warning when selected chauffeur already has a tour that day
- Warning when selected truck is already assigned
- Today's Assignments table: shows chauffeur / aide / truck from `assignments[0]`
- Unassign button per row
- Cache invalidates trucks + employees after every assignment

#### Trucks Page ✅
- Summary cards (Total / Available / Unavailable)
- Table with immatriculation, status badge, notes, date added
- Add truck dialog (immatriculation required, notes optional, availability toggle)
- Edit dialog (pre-filled)
- One-click availability toggle per row
- Delete with confirmation dialog

---

## 5. Partially Done Features

### 5.1 Authentication Guards — Structure exists, not enforced
The `JwtAuthGuard` and `RolesGuard` are fully implemented in `src/auth/` and the JWT strategy validates tokens correctly. However **no controller applies `@UseGuards(JwtAuthGuard)`** — every endpoint is publicly accessible. The frontend does send the JWT from `localStorage` via an Axios interceptor, and the 401 handler redirects to `/login`, but the backend never rejects unauthenticated requests.

### 5.2 Import Queue (BullMQ / Redis) — Wired but bypassed
`ImportQueueService` and the BullMQ worker are fully implemented in `src/imports/import-queue.service.ts` and correctly handle async parse jobs, idempotent retries, and status transitions. However `ImportsService.uploadFile()` parses the file **synchronously** in the request handler and never enqueues a job. The queue service is registered in the module but unused. For large files this blocks the event loop.

### 5.3 Employees Page — Placeholder
The backend employees endpoints are fully functional (CRUD + `isActive` filter). The frontend `src/pages/Employees.tsx` is a placeholder component. No list, no add/edit, no delete UI exists yet.

### 5.4 Express Deliveries Page — Placeholder
Backend is complete. Frontend `src/pages/ExpressDeliveries.tsx` is a placeholder.

### 5.5 Worked Days Page — Placeholder
Backend is complete. Frontend `src/pages/WorkedDays.tsx` is a placeholder.

### 5.6 Settings Page — Placeholder
`src/pages/Settings.tsx` is a placeholder. No user management or system settings UI.

### 5.7 Tour Code Search — Backend not implemented
The Tours filter bar has a tour-code search input that filters **client-side** only (because the backend `GetToursQueryDto` has no `search` or `tourCode` field). With large datasets this is inaccurate (only searches the current page). A backend `tourCode` `LIKE` / `startsWith` filter is needed.

### 5.8 Multi-platform Excel Parsing — Garonor only partial
`BoulangerParserService` handles the Alfortville (`F166`) format. `ExcelParserService` has stubs for Garonor and Alfortville but is **dead code** — it is never injected or called. Only one parser path is active in production.

---

## 6. Current Stage

**The core loop works end-to-end:**

```
Upload Excel → Parse → Preview rows → Commit tours
    → Go to Assignments → Select date → Assign chauffeur + truck
    → See assignment in Today's Assignments table
```

The import pipeline, tours browser, assignments board, and trucks management are all functional and stable. The dashboard shows live stats. The app is at a **functional MVP** for dispatchers who need to manage daily tour assignments.

**What is NOT yet safe for production:**
- All API endpoints are publicly accessible (no auth enforcement)
- No real login/logout flow tested end-to-end
- Several pages are placeholders
- File parsing blocks the Node.js event loop for large files

---

## 7. Suggested Next Steps

### Priority 1 — Close security gap
1. Apply `@UseGuards(JwtAuthGuard)` globally in `main.ts` via `app.useGlobalGuards(new JwtAuthGuard(jwtService))` or at the controller level
2. Test the login flow end-to-end (frontend → backend → JWT → protected routes)
3. Add route-level role guards where needed (`admin` vs `dispatcher`)

### Priority 2 — Build missing pages
4. **Employees page** — same pattern as Trucks: table + add/edit dialog + soft-delete toggle. Add `role` field display (chauffeur-livreur / aide-livreur) and phone number.
5. **Express Deliveries page** — table with date/address/status, add form, assign employee + truck.
6. **Worked Days page** — calendar or table view per employee, mark as worked / rest / sick / vacation.

### Priority 3 — Backend polish
7. Add `tourCode` filter to `GetToursQueryDto` so the search input works server-side across all pages
8. Wire `ImportQueueService` into the upload flow so large files are processed asynchronously without blocking
9. Add `filePath` column to `ImportBatch` schema so uploaded files can be re-parsed or cleaned up
10. Migrate `import-queue.service.ts` worker creation from constructor to `onModuleInit()`

### Priority 4 — UX improvements
11. Add real-time assignment conflict feedback on the backend (return conflicts in the API response instead of only logging them)
12. Add a "notify" status transition button on assigned tours
13. Add date range filtering to the Worked Days and Express Deliveries pages
14. Add export (CSV/Excel) for the tours and worked days views
15. Recharts dashboard charts (tour volume by day, assignment rate) — the library is already installed

---

_Report covers codebase state as of 2026-05-31. All 44 bugs identified by the automated multi-agent audit have been fixed._
