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

## Vercel Backend Deployment (Serverless)
Backend is prepared for Vercel serverless functions under `server/`.

1. Push repo to GitHub.
2. In Vercel, import the repository and set Root Directory to `server`.
3. Framework preset can be left as `Other`.
4. Add these environment variables in Vercel Project Settings:
   - `DATABASE_URL`
   - `DATABASE_URL_DIRECT` (optional but recommended for Neon direct host)
   - `ADMIN_PASSWORD_HASH`
5. Deploy.

What is already configured:
- Serverless entrypoint: `server/api/index.js`
- Vercel function config: `server/vercel.json`
- Express app mounted for serverless runtime: `server/src/app.js`
- CSV admin upload uses in-memory parsing (no local disk dependency), so it works in serverless environments.

Serverless runtime notes:
- Avoid very large CSV uploads; this project enforces a 4MB upload cap per request for compatibility with Vercel limits.
- Database schema/migrations are not run automatically during deployment. Run `npm run db:init --prefix server` when needed.
