---
name: db-reset
description: Wipe and rebuild the local development database. Stops Docker, removes all volumes, restarts services, runs Prisma migrations and seed. Use when the DB is in a broken state or you need a clean slate.
disable-model-invocation: true
---

Reset the local TourneePro development database from the project root:

1. Stop all Docker services and remove volumes:
   ```
   docker compose down -v
   ```

2. Start fresh Docker services:
   ```
   docker compose up -d
   ```

3. Wait ~5 seconds for PostgreSQL to be ready, then run:
   ```
   cd backend && npm run prisma:migrate && npm run prisma:seed
   ```

4. Report what migrations were applied and what the seed created.
