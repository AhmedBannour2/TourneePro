# TourneePro Backend

NestJS + TypeScript backend API for TourneePro logistics management system.

## Tech Stack

- **Framework**: NestJS 10 + TypeScript (strict mode)
- **Database**: PostgreSQL 16
- **ORM**: Prisma 5
- **Authentication**: JWT (passport-jwt)
- **Validation**: class-validator + class-transformer
- **API Documentation**: Swagger/OpenAPI
- **Job Queue**: Redis (for BullMQ background jobs)

## Prerequisites

- Node.js 20+ and npm
- Docker Desktop (for PostgreSQL and Redis)
- Git Bash or WSL (on Windows)

## Project Setup

### 1. Clone or navigate to the project

```bash
cd C:/Users/Ahmed/tourneepro/backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start PostgreSQL and Redis with Docker Compose

From the project root directory (`C:/Users/Ahmed/tourneepro/`):

```bash
docker compose up -d
```

This will start:
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`

Check containers are running:
```bash
docker compose ps
```

### 4. Configure environment variables

Copy `.env.example` to `.env` if needed, or verify the `.env` file contains:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tourneepro"
JWT_SECRET="change-me-in-production"
JWT_EXPIRES_IN="7d"
PORT=3000
NODE_ENV="development"
```

### 5. Run Prisma migrations

This creates the database schema:

```bash
npm run prisma:migrate
```

Or directly:
```bash
npx prisma migrate dev --name init
```

### 6. Generate Prisma Client

```bash
npm run prisma:generate
```

Or:
```bash
npx prisma generate
```

### 7. Start the development server

```bash
npm run start:dev
```

The API will be available at:
- **API**: http://localhost:3000
- **Swagger Documentation**: http://localhost:3000/api

## Database Schema

The initial schema includes:

- **User**: Authentication and authorization
- **Employee**: Chauffeur-livreur, aide-livreur staff
- **Truck**: Vehicle fleet management
- **Platform**: Delivery platforms/depots (Alfortville, Garonor, etc.)
- **Tour**: Daily delivery tours from Boulanger Excel imports
- **ImportBatch**: Excel file import metadata
- **ImportRow**: Individual rows from imports with validation
- **Assignment**: Employee + truck assignments to tours
- **ExpressDelivery**: Manual express delivery requests
- **WorkedDay**: Employee worked days tracking for payroll
- **AuditEvent**: Audit trail for critical operations

## Useful Commands

### Development

```bash
npm run start:dev       # Start with hot-reload
npm run start:debug     # Start with debugging
npm run build           # Build for production
npm run start:prod      # Run production build
```

### Database

```bash
npm run prisma:generate   # Generate Prisma Client
npm run prisma:migrate    # Run migrations
npm run prisma:studio     # Open Prisma Studio (DB GUI)
npx prisma migrate reset  # Reset database (CAUTION: deletes all data)
```

### Testing

```bash
npm run test            # Run unit tests
npm run test:watch      # Run tests in watch mode
npm run test:cov        # Run tests with coverage
npm run test:e2e        # Run end-to-end tests
```

### Linting & Formatting

```bash
npm run lint            # Lint code
npm run format          # Format code with Prettier
```

## Docker Commands

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# Stop and remove volumes (CAUTION: deletes all data)
docker compose down -v

# View logs
docker compose logs -f postgres
docker compose logs -f redis

# Access PostgreSQL CLI
docker exec -it tourneepro-postgres psql -U postgres -d tourneepro
```

## Project Structure

```
backend/
├── prisma/
│   └── schema.prisma        # Prisma database schema
├── src/
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   ├── app.module.ts        # Root application module
│   └── main.ts              # Application entry point
├── .env                     # Environment variables (not in git)
├── .gitignore
├── nest-cli.json
├── package.json
├── tsconfig.json            # TypeScript config (strict mode)
└── tsconfig.build.json
```

## Next Steps

This scaffold provides:
- ✅ NestJS project with TypeScript strict mode
- ✅ Prisma schema with all core models
- ✅ Docker Compose for local PostgreSQL + Redis
- ✅ Global validation and Swagger documentation
- ✅ ConfigModule for environment variables
- ✅ PrismaService for database access

**TODO for Phase 2+:**
1. Implement auth module (JWT authentication)
2. Create modules: employees, trucks, platforms, tours, imports, assignments
3. Build Excel import pipeline with validation
4. Add BullMQ job queue for background processing
5. Implement API endpoints for core business logic
6. Add comprehensive tests (unit + integration + e2e)
7. Set up proper error handling and logging

## License

UNLICENSED - Internal use only
