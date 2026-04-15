# Before Production Recommendations

This checklist should be reviewed **before deploying NOVA Panel to real production traffic**.

## Current status

The system is in a much better state now, but it is **not yet fully production-hardened for heavy concurrent usage**.

It is likely fine for:

- internal use
- demo/staging environments
- small real-world usage with proper hosting setup

It still needs more work before confidently handling **many users at the same time without falling**.

---

## High-priority recommendations before production

### 1) Use a production-grade database

**Current concern:** the project still has SQLite / `sql.js` fallback behavior.

**Recommendation:**

- move production to **PostgreSQL** (preferred) or MySQL
- keep SQLite only for local/dev fallback if needed

**Why:**

- better concurrency handling
- safer under multiple simultaneous writes
- more reliable for scaling and backups

---

### 2) Put the backend behind proper production infrastructure

**Recommendation:**

- run backend with **PM2**, **Docker**, or `systemd`
- put it behind **Nginx** or another reverse proxy
- enforce **HTTPS**
- enable restart-on-failure and log rotation

**Why:**

- improves stability
- protects from direct exposure
- makes deployment and uptime more reliable

---

### 3) Make all major lists fully DB-driven

This is still an important pending item.

All major list pages should be fully database-driven for:

- **pagination**
- **search**
- **filtering**

**Correct behavior:**

- frontend sends query params like:
  - `page`
  - `pageSize`
  - `search`
  - `status`
  - `type`
- backend performs filtering/searching in the database or query stage
- backend returns:
  - current page items
  - `total`
  - `hasMore`

**Not ideal:**

- fetching many rows first and filtering them only in the browser

---

### 4) Make the top navbar search actually useful globally

This is another important pending item.

The navbar search should work for both:

- **superadmin**
- **reseller/subreseller**

It should help them find things relevant to the pages they can access, such as:

- devices / MACs
- resellers / sub-resellers
- users
- credits / logs
- playlists
- apps
- notifications / settings sections where applicable

**Recommendation:**

- create a global search endpoint or scoped multi-entity search
- return results grouped by section
- filter results by role permissions

Example behavior:

- superadmin searches “john” → sees matching reseller/user/device/log/app results
- reseller searches “AA:BB:CC” → sees only records linked to their accessible scope

---

### 5) Keep uploads safe and persistent

**Recommendation:**

- use persistent storage for uploads
- consider S3 / R2 / object storage later
- keep file validation strict
- continue deleting old orphaned files where applicable

---

### 6) Add monitoring, backups, and alerts

**Recommendation:**

- database backups
- uptime monitoring
- error logging/alerting
- resource monitoring (CPU, memory, disk)

**Why:**

- production readiness is not only about code
- it is also about recovery and visibility when something goes wrong

---

### 7) Load testing before launch

Before calling the system production-ready, run load/concurrency tests.

Suggested tools:

- `k6`
- `autocannon`
- `Artillery`

Test cases should include:

- login bursts
- dashboard loads
- device search/check requests
- reseller and credits list browsing
- notification load

---

## Recommended next implementation priorities

### Priority A — finish list/data architecture

Make sure all major lists are truly DB-driven for:

- pagination
- search
- filtering

### Priority B — implement global navbar search

Make the top search bar useful for admins/resellers with scoped results based on their role and accessible data.

### Priority C — prepare deployment stack

When the above is stable, prepare:

- production `.env`
- PostgreSQL setup
- reverse proxy config
- process manager / Docker
- backup strategy

---

## Honest readiness summary

### Ready now for:

- local use
- internal usage
- small controlled deployment

### Not fully ready yet for:

- heavier public usage
- many concurrent users
- high-confidence production scale

---

## Final note

Before production, the two feature-level priorities still explicitly requested are:

1. ensure **all major lists are fully DB-driven** for pagination/search/filtering
2. make the **navbar search** work globally and intelligently based on each user’s role and accessible pages
