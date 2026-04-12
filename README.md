# Result Checker (React + Express + Neon Postgres)

Simple platform for students to check:
- Current GPA
- Cumulative GPA
- Semester-by-semester cumulative summary

## Stack
- Frontend: Vite + React (JavaScript)
- Backend: Express (JavaScript)
- Database: PostgreSQL (Neon compatible)

## Setup
1. Install dependencies from project root:
   - `npm install`
2. Copy `server/.env.example` to `server/.env` and fill in the values.
3. If you are deploying the frontend separately, copy `client/.env.example` to `client/.env` and set the API URL.
4. Initialize DB table:
   - `npm run db:init`
5. Import CSV data from `json/*.csv`:
   - `npm run import:data`
6. Start frontend + backend together:
   - `npm run dev`

## API
- `GET /api/health`
- `GET /api/results/:regNo`
- `POST /api/admin/upload-csv` (multipart/form-data fields: `file`, `level`, `semesterName`)

Admin auth:
- Set `ADMIN_PASSWORD_HASH` in `server/.env`
- Send header `x-admin-password: <plain_password>` when calling admin route

Frontend API config:
- Set `VITE_API_BASE_URL` in `client/.env` for production deployments
- Local development can keep using the Vite proxy in `client/vite.config.js`

Example:
- `GET /api/results/CME%2F20%2F109001`

## Vercel Deployment (Single Project)

This repository is configured for a single Vercel deployment that serves:
- Frontend static app from `client/dist`
- Backend API from `server/api/index.js`

### 1. Before Deploying

1. Push this repo to GitHub.
2. Ensure `vercel.json` exists at the repo root.
3. Ensure root scripts in `package.json` include `build` and `start`.

### 2. Vercel Project Settings

In Vercel, import the repository and set:

1. Root Directory: repository root (do not set to `server` or `client`)
2. Framework Preset: Other
3. Build Command: `npm run build`
4. Output Directory: `client/dist`
5. Install Command: `npm install`

### 3. Required Environment Variables (Vercel)

Set these in Vercel Project Settings -> Environment Variables:

- `DATABASE_URL` or `DATABASE_URL_DIRECT`
- `ADMIN_PASSWORD_HASH`
- `FRONTEND_ORIGIN` (set to your final deployed app URL)

Optional:

- `FRONTEND_ORIGINS` (comma-separated list for multiple domains)
- `PG_CONNECTION_TIMEOUT_MS`
- `PG_QUERY_TIMEOUT_MS`
- `PG_POOL_MAX` (recommended `1` on serverless)

### 4. Routing/Runtime Behavior

Configured in root `vercel.json`:

- `/api/*` rewrites to `server/api/index.js`
- All other routes rewrite to `/index.html` (SPA fallback)

Backend serverless notes:

- API handler is in `server/api/index.js`
- Shared Express app is in `server/src/app.js`
- DB pool is serverless-optimized in `server/src/config/db.js`
- CSV upload is memory-based and works in serverless environments

### 5. Post-Deploy Checks

Run these checks on your deployed domain:

1. `GET /` should load the React app
2. `GET /api/health` should respond quickly
3. `GET /api/results/<REG_NO>` should return result data

### 6. Data Initialization

Database schema and imports are not run automatically by Vercel deploy.
Run from your local machine when needed:

- `npm run db:init`
- `npm run import:data`

These commands use the server scripts under `server/`.
