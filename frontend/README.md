# TourneePro Frontend

Modern React + TypeScript frontend for TourneePro logistics management system.

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Component library built on Radix UI
- **TanStack Query** - Server state management
- **TanStack Table** - Powerful table component
- **React Router** - Client-side routing
- **React Hook Form** + **Zod** - Form handling and validation
- **Axios** - HTTP client
- **Recharts** - Data visualization

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure API URL:
```bash
cp .env.example .env
```

Edit `.env` and set the backend API URL:
```
VITE_API_URL=http://localhost:3000
```

### Development

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

Create a production build:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Project Structure

```
src/
├── components/
│   ├── ui/              # shadcn/ui components
│   └── layout/          # Layout components (AppShell, Sidebar, Header)
├── pages/               # Page components
│   ├── Dashboard.tsx
│   ├── Tours.tsx
│   ├── Import.tsx
│   ├── Assignments.tsx
│   ├── Employees.tsx
│   ├── Trucks.tsx
│   ├── ExpressDeliveries.tsx
│   ├── WorkedDays.tsx
│   └── Login.tsx
├── hooks/               # Custom React hooks
├── lib/                 # Utilities and configurations
│   ├── api.ts          # Axios HTTP client
│   ├── queryClient.ts  # TanStack Query configuration
│   └── utils.ts        # Helper functions
├── types/              # TypeScript type definitions
│   └── index.ts
├── routes/             # Router configuration
│   └── AppRouter.tsx
└── main.tsx            # Application entry point
```

## Environment Variables

- `VITE_API_URL` - Backend API base URL (default: `http://localhost:3000`)

## Features

- ✅ Modern React 18 setup with TypeScript
- ✅ Tailwind CSS with custom configuration
- ✅ Responsive layout with sidebar navigation
- ✅ Client-side routing with React Router
- ✅ Server state management with TanStack Query
- ✅ Type-safe API client with Axios
- ✅ Authentication scaffolding (placeholder)
- ✅ Page stubs for all main features
- 🚧 Real API integration (pending backend)
- 🚧 shadcn/ui components (to be added as needed)
- 🚧 Form implementations with validation
- 🚧 Data tables with TanStack Table

## Development Workflow

1. Backend API should be running at the configured `VITE_API_URL`
2. Run `npm run dev` to start the development server
3. Make changes - Vite will hot-reload automatically
4. Build for production with `npm run build`

## Next Steps

1. Add actual authentication logic
2. Implement API endpoints integration
3. Add shadcn/ui components as needed (Button, Dialog, Table, etc.)
4. Build data tables for tours, imports, employees, trucks
5. Implement forms for creating/editing entities
6. Add filters and search functionality
7. Implement notification system
8. Add error boundaries and loading states
