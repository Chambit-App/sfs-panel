# SFSPanel Deployment Guide

## Architecture Overview

```
Browser (Angular SPA)
  ├── Supabase Client (anon key - public, safe for browser)
  │     ├── Auth (login/logout)
  │     ├── Database (RLS-protected queries)
  │     └── Edge Functions (server-side operations)
  │
Supabase Backend
  ├── PostgreSQL (RLS policies enforce tenant isolation)
  ├── GoTrue Auth (user authentication)
  └── Edge Functions (service role key - server-side only)
        └── create-user (admin user creation)
```

## Security Model

| Key | Location | Exposure |
|-----|----------|----------|
| `supabaseUrl` | Environment file (browser) | Public - just a URL |
| `supabaseKey` (anon key) | Environment file (browser) | Public by design - RLS protects data |
| `supabaseServiceRoleKey` | Edge Function env (server only) | NEVER in browser - bypasses RLS |

## Prerequisites

- Node.js 22+
- Supabase CLI (`brew install supabase/tap/supabase`)
- Docker (for containerized deployment)
- Supabase project (cloud or self-hosted)

## Environment Setup

### 1. Create Supabase Project

- Go to https://supabase.com and create a new project
- Note down from Settings > API:
  - **Project URL** (`supabaseUrl`)
  - **anon/public key** (`supabaseKey`)
  - **service_role key** (for edge functions only, never put in frontend)

### 2. Run Database Migrations

```bash
# Option A: Via Supabase CLI (recommended)
supabase link --project-ref YOUR_PROJECT_REF
supabase db push

# Option B: Via SQL Editor in Supabase Dashboard
# 1. Paste and run: supabase/migrations/00001_core_schema.sql
# 2. Paste and run: supabase/seed.sql (for demo data, optional)
```

### 3. Deploy Edge Functions

```bash
# Deploy the create-user function (handles admin user creation securely)
supabase functions deploy create-user --project-ref YOUR_PROJECT_REF

# The function automatically has access to SUPABASE_URL, SUPABASE_ANON_KEY,
# and SUPABASE_SERVICE_ROLE_KEY via environment - no manual config needed.
```

### 4. Create Super Admin User

```bash
# Via Supabase Dashboard > Authentication > Users > Add User
# Email: admin@yourcompany.com
# Password: (your choice)
# Auto Confirm: Yes

# Then insert profile via SQL Editor:
INSERT INTO user_profiles (id, tenant_id, firm_id, role, full_name, is_super_admin, is_active)
VALUES (
  'USER_ID_FROM_AUTH',  -- copy from Authentication > Users
  NULL,                 -- will be set after creating first tenant
  NULL,
  'super_admin',
  'Admin Name',
  true,
  true
);
```

### 5. Configure Frontend Environment

Update the target environment file (`src/environments/environment.*.ts`):

```typescript
export const environment = {
  production: true,
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseKey: 'YOUR_ANON_KEY',  // safe for browser
};
```

**Important:** Only `supabaseUrl` and `supabaseKey` (anon key) go in the frontend. The service role key stays server-side in edge functions.

## Build Configurations

| Configuration | Command | Environment File | Use Case |
|--------------|---------|-----------------|----------|
| Development | `ng serve` | environment.ts | Local dev with local Supabase |
| QA | `ng build -c qa` | environment.qa.ts | QA/staging testing |
| Production | `ng build -c production` | environment.prod.ts | Live deployment |

## Local Development

```bash
# 1. Start local Supabase (requires Docker)
supabase start

# 2. Serve edge functions locally
supabase functions serve --no-verify-jwt

# 3. Start Angular dev server
ng serve

# App: http://localhost:4200
# Supabase Studio: http://127.0.0.1:54323
# Edge Functions: http://127.0.0.1:54321/functions/v1/
```

## Deployment Options

### Option 1: Docker (Recommended for self-hosted)

**QA:**
```bash
# 1. Update src/environments/environment.qa.ts with Supabase credentials
# 2. Build and run
docker compose -f docker-compose.qa.yml up -d --build
# App available at http://localhost:8080
```

**Production:**
```bash
docker build --build-arg CONFIGURATION=production -t sfspanel:latest .
docker run -d -p 80:80 --name sfspanel sfspanel:latest
```

### Option 2: Vercel / Netlify (Recommended for cloud)

```bash
ng build -c production
# Output: dist/sfspanel/browser/
# Upload to your hosting provider
# Configure: all routes fallback to index.html (SPA mode)
```

For Vercel, add `vercel.json`:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### Option 3: Azure App Service / AWS S3 + CloudFront

```bash
ng build -c production
# Deploy dist/sfspanel/browser/ to cloud storage
# Configure SPA fallback (all routes -> index.html)
# Enable gzip compression
# Set Cache-Control headers for hashed assets
```

## Supabase Edge Functions

Edge functions handle operations that require the service role key:

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `create-user` | `POST /functions/v1/create-user` | Creates auth user + profile (super admin only) |

### Deploying Edge Functions

```bash
# Deploy all functions
supabase functions deploy --project-ref YOUR_PROJECT_REF

# Deploy specific function
supabase functions deploy create-user --project-ref YOUR_PROJECT_REF

# Verify
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/create-user \
  -H "Authorization: Bearer USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123","full_name":"Test","tenant_id":"...","role":"viewer"}'
```

## Environment Checklist

Before deploying to any environment:

- [ ] `supabaseUrl` set in environment file
- [ ] `supabaseKey` (anon key) set in environment file
- [ ] Database migrations applied
- [ ] Edge functions deployed
- [ ] Super admin user created
- [ ] RLS policies verified (test with non-admin user)
- [ ] CORS configured if using custom domain

## Post-Deployment Verification

1. Open the app URL - verify login page loads
2. Login with super admin credentials
3. Navigate to Settings > Tenantlar - create a tenant
4. Navigate to Settings > Firma Yonetimi - create a firm
5. Select the new tenant and firm from topbar
6. Navigate to Settings > Kategoriler - add income/expense categories
7. Navigate to Settings > Kullanicilar - create a test user
8. Log out, log in as the test user - verify role-based access
9. Create a test transaction in Odemeler
10. Check Dashboard for KPI data
11. Test on mobile device or DevTools mobile emulation
12. Verify PWA install prompt appears (production only, HTTPS required)

## Monitoring

- **Supabase Dashboard:** Monitor database, auth, and edge function logs
- **Browser Console:** Check for errors (all errors use `console.error`)
- **Network Tab:** Verify all API calls return 200 (no 403/500 errors)

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| 403 on data queries | RLS policy blocking | Check user's tenant_id and firm_id match |
| White screen after login | Profile fetch failed | Verify user_profiles row exists for the auth user |
| Edge function 500 | Service role key missing | Check Supabase project env vars |
| Tenant switch doesn't persist | localStorage cleared | Check browser privacy settings |
| Charts not rendering | Chart.js not registered | Clear cache, hard refresh |
