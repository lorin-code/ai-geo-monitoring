# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI GEO Monitoring System for Generative Engine Optimization, with a Next.js 16.1.1 frontend (App Router) and Express.js backend. The system monitors brand visibility across AI platforms (豆包, DeepSeek, Kimi, 千问) by analyzing AI-generated responses for keyword mentions.

## Development Setup

### Frontend (Next.js)
- **Port**: 3001 in the unified dev script
- **Environment**: `.env.local` contains API configuration
- **Key env vars**:
  - `NEXT_PUBLIC_API_URL`: Backend API URL for client-side axios (default: http://localhost:3002)
  - `NEXT_PUBLIC_API_BASE_URL`: Alias for `NEXT_PUBLIC_API_URL` (default: http://localhost:3002)
  - `API_BASE_URL`: Used for Next.js rewrites in `next.config.ts` (default: http://localhost:3002)
  - `NEXT_PUBLIC_SITE_URL`: Frontend site URL (default: http://localhost:3001)

**Commands**:
```bash
cd nextjs-frontend
npm run dev -- --webpack -p 3001  # Start development server
npm run build    # Build for production
PORT=3001 npm run start # Start production server
npm run lint     # Run ESLint
```

### Backend (Express.js)
- **Port**: 3002
- **Database**: SQLite with Sequelize ORM
- **Key features**: JWT authentication, rate limiting, scheduled tasks

**Commands**:
```bash
cd backend
npm run dev      # Start with nodemon
npm start        # Start production
```

## Architecture

### Frontend Structure (Next.js App Router)
```
src/app/
├── layout.tsx           # Root layout with AntdRegistry
├── page.tsx            # Homepage (landing)
├── login/              # Authentication
├── register/
├── geo/                # Main GEO functionality
│   ├── layout.tsx      # GEO-specific layout with Header
│   ├── page.tsx        # GEO detection interface
│   ├── dashboard/      # Analytics dashboard
│   ├── history/        # Detection history
│   ├── tasks/          # Scheduled tasks
│   ├── profile/        # User profile
│   └── notice/         # GEO notices
├── admin/              # Admin panel
│   ├── layout.tsx      # Admin layout with Header
│   ├── users/          # User management
│   ├── memberships/    # Membership plans
│   ├── settings/       # System settings
│   ├── platforms/      # Platform configuration
│   ├── history/        # Admin history view
│   ├── health/         # System health
│   └── notice/         # Admin notices
└── tools/writer/       # Content writing tool
```

### Key Frontend Components
- **`src/lib/axiosConfig.js`**: Global axios configuration with interceptors for:
  - Automatic token injection from localStorage (`agd_token`)
  - 401 error handling (auto-redirects to `/login`)
  - Token expiration warnings (30min/5min before expiry)
  - Helper functions: `setAuthToken()`, `clearAuth()`, `shouldRefreshToken()`, `getCurrentToken()`
  - **Important**: Import from `@/lib/axiosConfig` instead of direct `axios` import
- **`src/utils/concurrentLimit.js`**: Utility for controlled API calls with:
  - `concurrentLimit()`: Generic concurrency control (default 5 concurrent)
  - `sequential()`: Sequential execution (concurrency = 1)
  - `sequentialWithDelay()`: Sequential with delays (100ms default) to avoid rate limits
  - **Use case**: Batch operations like deleting multiple records
- **`src/components/Header.jsx`**: Shared header component with user menu
- **`src/components/Footer.jsx`**: Shared footer component

### Backend Structure
```
backend/
├── app.js              # Main Express app with middleware
├── config/database.js  # Sequelize configuration
├── models/             # Sequelize models
├── middleware/         # Custom middleware
│   ├── auth.js        # JWT authentication
│   └── quota.js       # Usage quota checking
├── routes/             # API routes
│   ├── detection.js   # GEO detection endpoints
│   ├── user.js        # User authentication & management
│   ├── schedules.js   # Scheduled task management
│   ├── statistics.js  # Analytics endpoints
│   ├── platforms.js   # Platform configuration
│   ├── membership.js  # Membership plans
│   ├── settings.js    # System settings
│   └── captcha.js     # CAPTCHA generation
└── services/          # Business logic
    └── SchedulerService.js  # Task scheduling
```

### API Architecture
- **Authentication**: JWT tokens stored in localStorage (`agd_token`)
- **Rate Limiting**:
  - General API: 500 requests/15 minutes
  - Schedules API: 1000 requests/15 minutes (higher limit for batch operations)
  - Public endpoints excluded: `/health`, `/captcha`, `/settings/seo`, `/settings/notice`
- **CORS**: Configured with allowed origins from `ALLOWED_ORIGINS` env var
- **API Proxy**: Next.js rewrites `/api/*` to backend (configured in `next.config.ts`)
  - Rewrites use `API_BASE_URL` env var
  - Client-side axios uses `NEXT_PUBLIC_API_URL` env var
  - **Important**: Both should point to the same backend URL

## Key Technical Patterns

### Authentication Flow
1. Login → JWT token returned → stored in localStorage as `agd_token`
2. `axiosConfig.js` interceptors automatically add `Authorization: Bearer <token>` header
3. 401 errors trigger automatic logout and redirect to `/login`
4. Token expiration warnings at 30min and 5min before expiry

### Rate Limit Avoidance
- **Frontend**: Use `sequentialWithDelay()` for batch operations (100ms delay between requests)
- **Backend**: Higher limits for `/api/schedules` endpoint (1000/15min)
- **Polling**: GEO detection uses 30-second intervals (not 1-second)

### State Management
- **Client-side**: React state with localStorage for persistence
- **No global state library**: Uses component state and prop drilling
- **Authentication state**: Derived from localStorage token presence

### UI Framework
- **Ant Design (antd)**: Primary UI component library
- **Important**: Use `orientation="vertical"` not `direction="vertical"` (deprecated)
- **Alert components**: Use `title` prop not `message` (deprecated)

### Next.js Configuration
- **App Router**: All pages use the App Router (`src/app/`)
- **Layouts**: Each route has its own layout (`layout.tsx`) with authentication checks
- **Client Components**: Pages using React state/effects need `'use client'` directive
- **Server Components**: Default, no `'use client'` needed for static pages
- **API Rewrites**: Configured in `next.config.ts` to proxy `/api/*` to backend
- **Environment Variables**: Client-side variables must be prefixed with `NEXT_PUBLIC_`

## Development Guidelines

### API Calls
- **Always import from `@/lib/axiosConfig`** for axios instance (not direct `axios` import)
- Use helper functions: `setAuthToken()`, `clearAuth()` for auth state management
- **For batch operations**, wrap in `sequentialWithDelay()` to avoid rate limits (100ms default delay)
- Handle 401 errors gracefully (already handled by interceptors - auto-redirects to login)
- **Important**: Avoid setting `axios.defaults.baseURL` or `axios.defaults.headers.common['Authorization']` in individual components - use the global config

### Error Handling
- API errors are caught and displayed using Ant Design's `message` component
- Network errors should show user-friendly messages
- Token expiration is handled automatically by interceptors

### TypeScript
- Project uses TypeScript with strict mode
- Fix type errors before committing
- Use proper type annotations for function parameters

### Styling
- Tailwind CSS v4 with PostCSS
- Ant Design components for UI
- Custom styles in `src/app/globals.css`

### File Organization
- Page components in `src/app/[route]/page.tsx`
- Layout components in `src/app/[route]/layout.tsx`
- Shared components in `src/components/`
- Utilities in `src/utils/`
- Configuration in `src/lib/`

## Common Development Tasks

### Adding a New API Endpoint
1. Add route in `backend/routes/`
2. Register route in `backend/app.js`
3. Add rate limiting if needed
4. Test with Postman or curl
5. Call from frontend using axios from `@/lib/axiosConfig`

### Creating a New Page
1. Create `src/app/[route]/page.tsx`
2. Add `'use client'` directive if using React state/effects
3. Import necessary components and utilities
4. Add to navigation if needed (update Header or layout)

### Debugging API Issues
1. Check browser DevTools Network tab
2. Verify token is being sent (Authorization header)
3. Check backend logs for errors
4. Test endpoint directly with curl:
   ```bash
   curl -H "Authorization: Bearer <token>" http://localhost:3002/api/endpoint
   ```

### Handling Rate Limit Errors
- Increase delay in `sequentialWithDelay()` calls (e.g., from 100ms to 500ms)
- Reduce batch sizes
- Consider implementing exponential backoff for retries
- Check if endpoint needs higher limit in backend
- **Common pattern**: Use `sequentialWithDelay(selectedRowKeys, async (id) => { ... }, 100)` for batch deletions

## Deployment Notes

### Environment Variables
- Frontend: `.env.local` for development, set in deployment platform for production
- Backend: `.env` file with database credentials, JWT secret, etc.

### Build Process
1. Frontend: `npm run build` creates optimized Next.js build
2. Backend: No build step, runs directly with Node.js

### Port Configuration
- Default: Frontend 3001, Backend 3002
- Change via environment variables:
  - Frontend: Update `NEXT_PUBLIC_API_URL` and `API_BASE_URL`
  - Backend: Update `PORT` in `.env`

## Troubleshooting

### Common Issues
1. **"React has detected a change in the order of Hooks"**: Ensure all hooks are called before any conditional returns
2. **API 401 errors**: Check token expiration, clear localStorage and re-login (auto-handled by interceptors)
3. **Rate limit errors**: Implement `sequentialWithDelay()` for batch operations, increase delays
4. **CORS errors**: Verify `ALLOWED_ORIGINS` includes frontend URL
5. **TypeScript errors**: Fix type annotations before proceeding
6. **Ant Design deprecation warnings**:
   - `direction="vertical"` → `orientation="vertical"`
   - `message` prop in Alert → `title` prop
   - `List` component deprecated → use custom layout
7. **API requests not working**: Ensure importing from `@/lib/axiosConfig` not direct `axios`
8. **Port conflicts**: Frontend default 3001, backend default 3002

### Database Issues
- SQLite database file: `backend/database.sqlite`
- Reset admin password: `node backend/reset_admin_pwd.js`
- Sequelize models auto-sync in development

This documentation should help Claude Code understand the project structure and conventions when working with this codebase.
