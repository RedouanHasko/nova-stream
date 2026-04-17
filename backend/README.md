# Backend — Nova Stream

This document covers local development steps for the backend service located at `backend`.

Prerequisites

- Node.js (>= 18 recommended)
- npm
- (Optional) Prisma CLI (`npx prisma` is used via npm scripts)

Quick start (development)

```bash
cd backend
npm install
# copy env template and update values
cp .env.example .env   # (or PowerShell: Copy-Item .env.example .env)

# generate prisma client
npm run prisma:generate

# if you want to run migrations (creates or updates DB)
npm run migrate:dev

# optionally seed sample data
npm run seed

# run in development mode
npm run dev
```

Production

```bash
cd backend
npm install --production
npm start
```

Configuration notes

- Default port: `5000`. Override with `PORT` in your `.env` file.
- Database: The project uses Prisma. In development the default may be a local SQLite DB — set `DATABASE_URL` in `.env` for other databases.
- WhatsApp gateway: The embedded WhatsApp gateway will auto-start unless `WHATSAPP_GATEWAY_AUTOSTART=false` is set in `.env`.

Uploads and static files

- The `backend/uploads` folder is used to serve static files via `/uploads`.

Security

- Never commit your `.env` or local DB files. These are ignored by `.gitignore`.

Troubleshooting

- If you see `dev.db` or `.env` tracked by git, remove locally and untrack:

```bash
git rm --cached dev.db
git rm --cached .env
git commit -m "Remove local secrets from repo"
git push
```
