# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TourneePro is a logistics management platform for STP (last-mile delivery under Boulanger). Monorepo with `backend/` (NestJS + Prisma + PostgreSQL) and `frontend/` (React 19 + Vite + Tailwind CSS + shadcn/ui).

## Dev Startup

PostgreSQL and Redis must be running before the backend:

```bash
# From project root
docker compose up -d

# Backend (port 3000, Swagger at /api)
cd backend && npm run prisma:migrate && npm run start:dev

# Frontend (port 5173)
cd frontend && npm run dev
```

## Key Commands

### Backend (`backend/`)
| Command | Purpose |
|---|---|
| `npm run start:dev` | Hot-reload dev server |
| `npm run prisma:migrate` | Apply pending migrations |
| `npm run prisma:generate` | Regenerate Prisma Client after schema changes |
| `npm run prisma:seed` | Seed database with dev data |
| `npm run prisma:studio` | Open Prisma GUI |
| `npm run lint` | ESLint with auto-fix |
| `npm run format` | Prettier on `src/**/*.ts` |
| `npm run test` | Jest unit tests |
| `npm run test:cov` | Jest with coverage report |

### Frontend (`frontend/`)
| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | TypeScript check + Vite production build |
| `npm run lint` | ESLint |

## Architecture — Intentional Decisions

**JWT auth guards are ACTIVE globally**: `JwtAuthGuard` is registered as `APP_GUARD` in `app.module.ts` — all routes require a valid token by default. Use `@Public()` decorator to exempt a route. Do NOT bypass or remove this.

**Import queue removed**: `ImportQueueService` (BullMQ) was implemented but unused — `ImportsService.uploadFile()` parses Excel synchronously. Archived out of `backend/src/imports/` (2026-09-05, zero references confirmed) to `TourneePro-Cleanup-Archive/dead-code/backend-imports/` alongside the repo. Do not refactor imports to async unless explicitly asked; restore from the archive first if that work is picked up again.

**Dead code removed**: `ExcelParserService` (Garonor-format stubs, never production-ready) was never registered in `imports.module.ts` and had zero references. Archived to `TourneePro-Cleanup-Archive/dead-code/backend-imports/` (2026-09-05). The active parser is `BoulangerParserService`.

**Assignments.tsx and Import.tsx**: Removed from `frontend/src/pages/` (2026-09-05, unrouted, zero references confirmed) — archived to `TourneePro-Cleanup-Archive/dead-code/frontend-pages/` alongside the repo. Assignments functionality lives in the Tours detail panel; Import moved to Settings → ImportCard. Do not reinstate their routes; restore from the archive first if that old UI is needed as a reference.

## Security (all active as of June 2026)

- `helmet()` in `main.ts` — secure HTTP headers
- CORS strict via `CORS_ORIGINS` env var — whitelist only
- JWT global guard (`APP_GUARD`) — all routes protected by default
- `@nestjs/throttler` — 20 req/60s global, 5 req/60s on login
- `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`
- `RolesGuard` + `@Roles()` on admin routes
- Prisma ORM — no raw SQL, no injection risk
- bcrypt salt 10 for passwords

## Tests (Jest — as of June 2026)

7 suites, 61+ tests passing:
- `auth.service.spec.ts`, `employees.service.spec.ts`, `platforms.service.spec.ts`
- `trucks.service.spec.ts`, `tours.service.spec.ts`, `worked-days.service.spec.ts`
- `excel-parser.service.spec.ts`

## Prisma Workflow

After any change to `prisma/schema.prisma`:
1. Stop the backend (`Ctrl+C` in the terminal running `start:dev`)
2. `npm run prisma:migrate` — creates and applies the migration (requires shadow DB)
3. `npm run prisma:generate` — regenerates client types (backend must be stopped — DLL lock on Windows)
4. Restart the backend

**CRITICAL RULES — never break these:**
- **NEVER use `prisma db push` on a database with real data.** It syncs the schema directly and can drop/recreate enum types and tables, wiping all data with no rollback. It is only acceptable on a completely empty/throwaway database.
- **NEVER use `prisma migrate dev` while the backend is running on Windows** — the Prisma DLL is locked and `generate` will fail with EPERM.
- The P3006 shadow DB error is solved permanently by `SHADOW_DATABASE_URL` in `.env` pointing to `tourneepro_shadow` (already created in Docker). Do not work around P3006 with `db push`.

Never edit migration SQL files manually.

## Code Style

- TypeScript strict mode; avoid `any` (ESLint warns)
- 2-space indentation, single quotes, 100-char line width (Prettier)
- Backend DTOs use `class-validator` decorators (`@IsString()`, `@IsEnum()`, etc.)
- Frontend form validation: React Hook Form + Zod schemas
- Frontend UI components: shadcn/ui (Radix primitives in `src/components/ui/`)
- Frontend page titles: `usePageTitle('Page Name')` hook in every page component
- Commit messages: conventional commits format (`feat:`, `fix:`, `chore:`, etc.)

## Production

- **Frontend**: Vercel @ `https://tournee.pro`
- **Backend**: Railway @ `https://api.tournee.pro`
- **DNS**: OVH — `@` A → Vercel, `api` CNAME → Railway
- **Google OAuth**: configured for `api.tournee.pro/auth/google/callback` ✅
- **Env vars on Railway**: `FRONTEND_URL`, `CORS_ORIGINS`, `GOOGLE_REDIRECT_URI`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` all set ✅

## Built Pages — All Fully Implemented

All pages are built and working as of June 2026. Do not treat any of these as stubs.

### Dispatcher / Admin pages
| Page | Status | Notes |
|---|---|---|
| `Tours.tsx` | ✅ Full | Filters, pagination, manual create + **edit** tour, detail panel, confirmation flow, inline assignment, **Actualiser** (Google Sheets sync), create platform inline, custom tour type |
| `Employees.tsx` | ✅ Full | List, inline edit, role/status filters, documents, pay rates panel, **hard delete**, **edit account** (email + password) |
| `Trucks.tsx` | ✅ Full | Click-to-detail pattern, quick actions panel, inspection system, repair logs |
| `ExpressDeliveries.tsx` | ✅ Full | Mission list grouped by date, create modal, detail panel, employee assign, photo upload |
| `WorkedDays.tsx` | ✅ Full | Admin payroll tracking, employee/month filters, day CRUD, summary stats |
| `Settings.tsx` | ✅ Full | Pay rates, Google Sheets OAuth connect/disconnect + sheet URLs, Mail SMTP config, Import card |
| `Dashboard.tsx` | ✅ Full | Summary stats and quick-access cards |

### Employee pages
| Page | Status | Notes |
|---|---|---|
| `MyAssignments.tsx` | ✅ Full | Employee's own tours + express missions, inspection submit |
| `MyWorkedDays.tsx` | ✅ Full | Employee's own payroll view by month |
| `EmployeeDashboard.tsx` | ✅ Full | Employee home with upcoming assignments |

## Google Sheets Sync

Two Boulanger Google Sheets are synced via the **"Actualiser"** button on the Tours page:
- Sheet 1 (Garonor): reads tomorrow's day-numbered tab
- Sheet 2 (Alfortville): reads the main sheet + "Jours Fériés /Dimanche" sheet when present (Sundays/holidays)

OAuth credentials stored in Railway env vars (not .env). Admin can reconnect or swap accounts in Settings → Google Sheets.
Sync is idempotent: re-running updates existing tours, never duplicates.

## Email (Resend — active as of June 2026)

- Provider: **Resend** HTTP API (`https://api.resend.com/emails`) — Railway blocks all SMTP ports, never use nodemailer/SMTP
- Sender: `TourneePro <noreply@tournee.pro>` — domain verified on Resend (DKIM + SPF + MX on OVH)
- Config: `RESEND_API_KEY` env var in Railway (fallback); also reads `resend.api_key` from SystemConfig DB
- From address: reads `mail.from` from SystemConfig DB, falls back to `MAIL_FROM` env var, then hardcoded default
- Test endpoint: `POST /settings/mail/test` (admin only) — sends test email to current user

## Pending / Not Yet Built

- **Auto-sync cron**: currently manual (Actualiser button). Could be automated to run each morning.
- **Google Cloud migration**: OAuth project currently under personal Gmail (`couco1995@gmail.com`). Migrate to STP Gmail before production.

## Known Issue — Investigating: "Actualiser" returning no tours (opened 2026-09-08)

Reported symptom: the Actualiser button on Tours (Garonor + Alfortville sync) used to pull tours and recently stops returning any data.

**Investigation so far (2026-09-08, verified against a fresh prod DB pull restored locally):**
- OAuth refresh token is valid (confirmed live against Google's token endpoint), both sheet URLs are reachable, and the parser's column offsets match the live sheet headers exactly for both Garonor (`boulanger-parser.service.ts` → `parseGaronorGrid`) and Alfortville (`parseAlfortvilleGrid`). Confirmed correct parsing against Garonor's already-filled "today" tab (49 real STP tours parsed correctly).
- At the moment of testing: Garonor's tomorrow-tab (day-ahead sheet) had zero tour numbers entered — empty template. Alfortville's today-tab had all tour-number placeholders present but the **Société (company) column was blank for every row** — STP filter (`isStp()`) matches on that column, so an unfilled sheet yields zero rows with no error thrown. This looks like normal "not filled in by Boulanger yet today" state, not a code bug.
- DB evidence: last tour synced for **any** platform was **2026-08-31** — a full 8-day gap with zero new tours as of 2026-09-08. That gap is too long to be just "checked at the wrong time of day" — points to either nobody running Actualiser at the right time since Aug 31, or the upstream sheets not being filled in during that window.

**Not yet confirmed:**
- Whether clicking Actualiser in production shows an error or silently succeeds with 0 created/updated (need the user's direct observation from the actual button click).
- Whether the source sheets are being filled in at all during Sept 1–8 (needs checking once Boulanger populates a day's sheet — the current empty-column state blocks further diagnosis).

**Next step:** once the Garonor/Alfortville sheets are actually filled in for a given day (Société column populated with STP entries), re-run Actualiser and check: (a) does it now correctly pick up the rows, confirming this was purely a data-timing issue; or (b) does it still return zero/error even with a filled sheet, which would point to a real regression (e.g. token scope, sheet permission change, or a parser edge case not caught by this pass). Resume by re-fetching the live grids the same way as this session did (Sheets API `values.get` with the stored `sheets.url_1`/`sheets.url_2`) and re-running the parser logic against them.
