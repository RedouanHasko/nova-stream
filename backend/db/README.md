# New DB Structure Scaffold

This folder is a **parallel refactor scaffold** for the current `backend/prisma.js` fallback adapter.

## Goals

- keep the current `backend/prisma.js` file untouched
- split schema/init/helpers/repositories into smaller modules
- preserve the same adapter surface so the app can later be tested against `backend/db/index.js`

## Layout

- `connection.js` — SQL.js boot + persistence
- `schema.js` — table creation + migration-like guards
- `helpers.js` — shared query/filter/mapping utilities
- `repositories/` — grouped model repositories
- `fallback-adapter.js` — composed adapter with the Prisma-like surface
- `index.js` — future drop-in entry point for Prisma client or fallback adapter
