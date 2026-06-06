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

### Frontend (`frontend/`)
| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | TypeScript check + Vite production build |
| `npm run lint` | ESLint |

## Architecture — Intentional Decisions

**JWT auth guards are bypassed**: No controller applies `@UseGuards(JwtAuthGuard)` — all endpoints are intentionally public for now. Do not add guards unless explicitly asked.

**Import queue is bypassed**: `ImportQueueService` (BullMQ) is implemented but intentionally unused. `ImportsService.uploadFile()` parses Excel synchronously. Do not refactor to async unless explicitly asked.

**Dead code**: `ExcelParserService` has stubs for Garonor format — never inject it; it is not production-ready.

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
- Commit messages: conventional commits format (`feat:`, `fix:`, `chore:`, etc.)

## Built Pages — All Fully Implemented

All pages are built and working as of June 2026. Do not treat any of these as stubs.

### Dispatcher / Admin pages
| Page | Status | Notes |
|---|---|---|
| `Tours.tsx` | ✅ Full | Filters, pagination, manual create, detail panel, confirmation flow, **Actualiser** button (Google Sheets sync) |
| `Assignments.tsx` | ✅ Full | Date picker, unassigned list, assignment form, assigned table, mobile cards |
| `Import.tsx` | ✅ Full | Excel upload → preview → commit; manual fallback kept alongside Google Sheets sync |
| `Employees.tsx` | ✅ Full | List, inline edit, role/status filters, responsible truck, documents, pay rates panel |
| `Trucks.tsx` | ✅ Full | Click-to-detail pattern, quick actions panel, inspection system, repair logs |
| `ExpressDeliveries.tsx` | ✅ Full | Mission list grouped by date, create modal, detail panel, employee assign, photo upload |
| `WorkedDays.tsx` | ✅ Full | Admin payroll tracking, employee/month filters, day CRUD, summary stats |
| `Settings.tsx` | ✅ Full | Pay rates, Google Sheets OAuth connect/disconnect + sheet URLs, Mail SMTP config |
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

OAuth credentials stored in `backend/.env`. Admin can reconnect or swap accounts in Settings → Google Sheets.
Sync is idempotent: re-running updates existing tours, never duplicates.

## Pending / Not Yet Built

- **Page consolidation**: merging Import + Tours + Assignments into a unified "Journée" view (discussed, not started)
- **Mail service reads from DB**: Settings mail config saves to `system_config` table but `mail.service.ts` still reads from `.env`. Needs wiring so UI changes take effect without server restart.
- **Auto-sync cron**: currently manual (Actualiser button). Could be automated to run each morning.
- **Google Cloud migration**: OAuth project currently under personal Gmail (`couco1995@gmail.com`). Migrate to STP Gmail before production.
