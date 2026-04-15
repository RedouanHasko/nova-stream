# Nova Stream — Run Guide

This repository contains several sub-projects (backend, frontend, player, and landing/panel frontends). This document explains how to run each folder locally for development and how to build for production.

Prerequisites
- Node.js (recommended >= 18)
- npm (or yarn/pnpm)
- Git

Tips
- Many folders include a `.env.example`. Copy it to `.env` and fill the values before running:

  - Unix/macOS: `cp .env.example .env`
  - PowerShell: `Copy-Item .env.example .env`

- `.env` files and local DB dumps are intentionally ignored by `.gitignore`. Do NOT commit secrets or `dev.db`.

---

## Backend (server)

Path: `backend`

Quick start (development):

```bash
cd backend
npm install
# copy environment variables
cp .env.example .env   # (or PowerShell: Copy-Item .env.example .env)
# generate Prisma client and prepare DB
npm run prisma:generate
# optional: create/migrate database
npm run migrate:dev
# optional seed
npm run seed
# start in dev mode (nodemon)
npm run dev
```

Start (production):

```bash
cd backend
npm install --production
npm start
```

Notes:
- The backend listens on `PORT` (default 5000). Set `PORT` in `.env` if you need a different value.
- By default development uses a local SQLite DB (configure `DATABASE_URL` in `.env` to change).
- The embedded WhatsApp gateway is controlled by `WHATSAPP_GATEWAY_AUTOSTART` (set to `false` to disable auto-start).

---

## Frontend (app)

Path: `frontend`

```bash
cd frontend
npm install
npm run dev        # starts Vite dev server (default port 3000)

# To run frontend + backend concurrently (if supported):
npm run dev:all

# Build for production
npm run build
npm run preview
```

There are also separate frontends:
- `frontend-panel` (admin panel): `cd frontend-panel && npm install && npm run dev`
- `frontend-landing` (marketing landing): `cd frontend-landing && npm install && npm run dev`

---

## Player (electron/web player)

Path: `player`

```bash
cd player
npm install
npm run dev     # starts the local player server (`server.ts` via tsx)
npm run build
npm run preview
```

---

## Running multiple services

From the repo root you can install dependencies for sub-projects quickly:

```bash
npm --prefix backend install
npm --prefix frontend install
npm --prefix player install
```

Or use the `frontend` helper script to start both the backend and frontend together (if configured):

```bash
cd frontend
npm run dev:all
```

---

## Security & housekeeping
- Do not commit `.env` files or local DB files (e.g., `dev.db`). These are ignored by `.gitignore`.
- If you accidentally commit secrets, remove them from the history (use `git rm --cached <file>` then commit and push, and rotate secrets).

If you want, I can also add short `README.md` files inside each subfolder with extra configuration points. I already added backend-specific notes in `backend/README.md`.
