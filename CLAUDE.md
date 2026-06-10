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

**Import queue is bypassed**: `ImportQueueService` (BullMQ) is implemented but intentionally unused. `ImportsService.uploadFile()` parses Excel synchronously. Do not refactor to async unless explicitly asked.

**Dead code**: `ExcelParserService` has stubs for Garonor format — never inject it; it is not production-ready.

**Assignments.tsx and Import.tsx**: Files exist but are NOT routed. Assignments moved into Tours detail panel. Import moved to Settings → ImportCard. Do not reinstate their routes.

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
1. `npm run prisma:migrate` — creates and applies the migration
2. `npm run prisma:generate` — regenerates client types

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

## Pending / Not Yet Built

- **Mail service reads from DB**: Settings mail config saves to `system_config` table but `mail.service.ts` still reads from `.env`. Needs wiring so UI changes take effect without server restart.
- **Auto-sync cron**: currently manual (Actualiser button). Could be automated to run each morning.
- **Google Cloud migration**: OAuth project currently under personal Gmail (`couco1995@gmail.com`). Migrate to STP Gmail before production.
