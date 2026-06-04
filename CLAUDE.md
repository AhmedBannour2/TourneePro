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

## Placeholder Pages — Do Not Implement Unless Asked

These frontend pages exist as stubs; backend CRUD is ready but UI is not built yet:
- `frontend/src/pages/Employees.tsx`
- `frontend/src/pages/ExpressDeliveries.tsx`
- `frontend/src/pages/WorkedDays.tsx`
- `frontend/src/pages/Settings.tsx`
