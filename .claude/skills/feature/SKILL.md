---
name: feature
description: Scaffold a new full-stack TourneePro feature. Creates a NestJS module (module/service/controller/DTOs) and a connected React page. Usage: /feature <name> (e.g. /feature notifications).
disable-model-invocation: true
---

Scaffold a new full-stack feature named "$ARGUMENTS". Follow the existing module structure exactly.

## Backend — `backend/src/$ARGUMENTS/`

Create these files mirroring the pattern in `backend/src/trucks/` or `backend/src/employees/`:

- `$ARGUMENTS.module.ts` — imports `PrismaModule`, exports the service
- `$ARGUMENTS.service.ts` — inject `PrismaService`; implement basic CRUD
- `$ARGUMENTS.controller.ts` — REST endpoints with `@ApiTags('$ARGUMENTS')` for Swagger
- `dto/create-$ARGUMENTS.dto.ts` — fields with `class-validator` decorators
- `dto/update-$ARGUMENTS.dto.ts` — extends create DTO via `PartialType`

Register the module in `backend/src/app.module.ts`.

## Frontend — `frontend/src/pages/`

Create `frontend/src/pages/<Feature>.tsx` (PascalCase) — a working page (not a placeholder) with:
- Data fetching via TanStack React Query `useQuery`
- Table or list using TanStack React Table (see `Tours.tsx` for reference)
- shadcn/ui components for layout and actions
- API calls through `src/lib/api.ts` using the Axios instance

Add the route in `frontend/src/routes/AppRouter.tsx` and a sidebar nav entry in the layout component.

## Commit

After scaffolding, suggest a conventional commit message:
`feat($ARGUMENTS): scaffold $ARGUMENTS module and page`
