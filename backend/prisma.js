// SQLite adapter using `sql.js` (WASM). This avoids native compilation issues on Windows.
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const initSqlJs = require("sql.js");

const dbFile = (process.env.DATABASE_URL || "file:./dev.db").replace(
  /^file:/,
  "",
);
const dbPath = path.isAbsolute(dbFile)
  ? dbFile
  : path.join(__dirname, "..", dbFile);

let SQL = null;
let db = null;
let initPromise = null;

async function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    SQL = await initSqlJs({
      locateFile: (file) => {
        const candidates = [
          path.join(
            __dirname,
            "node_modules",
            "sql.js",
            "dist",
            "sql-wasm.wasm",
          ),
          path.join(
            __dirname,
            "..",
            "node_modules",
            "sql.js",
            "dist",
            "sql-wasm.wasm",
          ),
          path.join(
            process.cwd(),
            "node_modules",
            "sql.js",
            "dist",
            "sql-wasm.wasm",
          ),
        ];
        for (const c of candidates) if (fs.existsSync(c)) return c;
        return path.join(
          __dirname,
          "..",
          "node_modules",
          "sql.js",
          "dist",
          "sql-wasm.wasm",
        );
      },
    });

    if (fs.existsSync(dbPath)) {
      const buf = fs.readFileSync(dbPath);
      db = new SQL.Database(new Uint8Array(buf));
    } else {
      db = new SQL.Database();
    }

    // initialize schema
    db.run(`
      CREATE TABLE IF NOT EXISTS resellers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        phone TEXT,
        parentId INTEGER,
        credits REAL DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE',
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        phone TEXT,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'subreseller',
        resellerId INTEGER,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS creditTransactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        status TEXT,
        amount REAL,
        fromResellerId INTEGER,
        fromBeforeBalance REAL,
        fromAfterBalance REAL,
        toResellerId INTEGER,
        toBeforeBalance REAL,
        toAfterBalance REAL,
        performedById INTEGER,
        notes TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        processedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mac TEXT UNIQUE,
        deviceKey TEXT,
        ownerResellerId INTEGER,
        domainUrl TEXT,
        status TEXT DEFAULT 'ACTIVE',
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS activatedApps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deviceId INTEGER,
        applicationId INTEGER,
        appName TEXT,
        duration TEXT DEFAULT '1_year',
        expiresAt TEXT,
        status TEXT DEFAULT 'ACTIVE',
        activatedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        logoUrl TEXT,
        description TEXT,
        status TEXT DEFAULT 'ACTIVE',
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ownerResellerId INTEGER,
        name TEXT,
        url TEXT,
        content TEXT,
        type TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS devicePlaylists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deviceId INTEGER,
        playlistId INTEGER,
        addedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pricingPlans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        price REAL,
        credits INTEGER DEFAULT 0,
        currency TEXT DEFAULT 'USD',
        features TEXT,
        planType TEXT DEFAULT 'CREDIT_RECHARGE',
        duration TEXT,
        active INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS apiIntegrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        provider TEXT,
        apiKey TEXT,
        webhookUrl TEXT,
        config TEXT,
        active INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS systemSettings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        value TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS notificationSettings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        emailEnabled INTEGER DEFAULT 1,
        smsEnabled INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        type TEXT DEFAULT 'INFO',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        link TEXT,
        read INTEGER DEFAULT 0,
        data TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        readAt TEXT
      );

      CREATE TABLE IF NOT EXISTS phoneVerificationCodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        purpose TEXT,
        email TEXT,
        phone TEXT,
        codeHash TEXT,
        attempts INTEGER DEFAULT 0,
        expiresAt TEXT,
        consumedAt TEXT,
        createdAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS parentChangeRequests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resellerId INTEGER,
        newParentId INTEGER,
        status TEXT DEFAULT 'PENDING',
        reason TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        processedAt TEXT
      );
    `);

    ensureColumn("devices", "deviceKey", "TEXT");
    ensureColumn("activatedApps", "applicationId", "INTEGER");
    ensureColumn("activatedApps", "duration", "TEXT DEFAULT '1_year'");
    ensureColumn("activatedApps", "expiresAt", "TEXT");
    ensureColumn("activatedApps", "status", "TEXT DEFAULT 'ACTIVE'");
    ensureColumn("creditTransactions", "fromResellerId", "INTEGER");
    ensureColumn("creditTransactions", "fromBeforeBalance", "REAL");
    ensureColumn("creditTransactions", "fromAfterBalance", "REAL");
    ensureColumn("creditTransactions", "toResellerId", "INTEGER");
    ensureColumn("creditTransactions", "toBeforeBalance", "REAL");
    ensureColumn("creditTransactions", "toAfterBalance", "REAL");
    ensureColumn("creditTransactions", "performedById", "INTEGER");
    ensureColumn("creditTransactions", "notes", "TEXT");
    ensureColumn("creditTransactions", "processedAt", "TEXT");
    ensureColumn("users", "phone", "TEXT");
    ensureColumn("resellers", "phone", "TEXT");
    ensureColumn("applications", "logoUrl", "TEXT");
    ensureColumn("applications", "description", "TEXT");
    ensureColumn("applications", "downloadUrl", "TEXT");
    ensureColumn("applications", "status", "TEXT DEFAULT 'ACTIVE'");
    ensureColumn("applications", "createdAt", "TEXT DEFAULT (datetime('now'))");
    ensureColumn("applications", "updatedAt", "TEXT DEFAULT (datetime('now'))");
    ensureColumn("pricingPlans", "planType", "TEXT DEFAULT 'CREDIT_RECHARGE'");
    ensureColumn("pricingPlans", "duration", "TEXT");
    ensureColumn("notifications", "type", "TEXT DEFAULT 'INFO'");
    ensureColumn("notifications", "title", "TEXT");
    ensureColumn("notifications", "message", "TEXT");
    ensureColumn("notifications", "link", "TEXT");
    ensureColumn("notifications", "read", "INTEGER DEFAULT 0");
    ensureColumn("notifications", "data", "TEXT");
    ensureColumn(
      "notifications",
      "createdAt",
      "TEXT DEFAULT (datetime('now'))",
    );
    ensureColumn("notifications", "readAt", "TEXT");
    ensureColumn("phoneVerificationCodes", "userId", "INTEGER");
    ensureColumn("phoneVerificationCodes", "purpose", "TEXT");
    ensureColumn("phoneVerificationCodes", "email", "TEXT");
    ensureColumn("phoneVerificationCodes", "phone", "TEXT");
    ensureColumn("phoneVerificationCodes", "codeHash", "TEXT");
    ensureColumn("phoneVerificationCodes", "attempts", "INTEGER DEFAULT 0");
    ensureColumn("phoneVerificationCodes", "expiresAt", "TEXT");
    ensureColumn("phoneVerificationCodes", "consumedAt", "TEXT");
    ensureColumn(
      "phoneVerificationCodes",
      "createdAt",
      "TEXT DEFAULT (datetime('now'))",
    );

    ensureIndex("users", "idx_users_resellerId", "resellerId");
    ensureIndex("users", "idx_users_role", "role");
    ensureIndex("resellers", "idx_resellers_parentId", "parentId");
    ensureIndex("resellers", "idx_resellers_status", "status");
    ensureIndex("devices", "idx_devices_ownerResellerId", "ownerResellerId");
    ensureIndex("devices", "idx_devices_status", "status");
    ensureIndex("devices", "idx_devices_createdAt", "createdAt");
    ensureIndex("activatedApps", "idx_activatedApps_deviceId", "deviceId");
    ensureIndex(
      "activatedApps",
      "idx_activatedApps_applicationId",
      "applicationId",
    );
    ensureIndex(
      "activatedApps",
      "idx_activatedApps_status_activatedAt",
      "status, activatedAt",
    );
    ensureIndex(
      "creditTransactions",
      "idx_creditTransactions_fromResellerId",
      "fromResellerId",
    );
    ensureIndex(
      "creditTransactions",
      "idx_creditTransactions_toResellerId",
      "toResellerId",
    );
    ensureIndex(
      "creditTransactions",
      "idx_creditTransactions_performedById",
      "performedById",
    );
    ensureIndex(
      "creditTransactions",
      "idx_creditTransactions_type_status",
      "type, status",
    );
    ensureIndex(
      "creditTransactions",
      "idx_creditTransactions_createdAt",
      "createdAt",
    );
    ensureIndex(
      "playlists",
      "idx_playlists_ownerResellerId",
      "ownerResellerId",
    );
    ensureIndex("devicePlaylists", "idx_devicePlaylists_deviceId", "deviceId");
    ensureIndex(
      "devicePlaylists",
      "idx_devicePlaylists_playlistId",
      "playlistId",
    );
    ensureIndex(
      "notifications",
      "idx_notifications_userId_read",
      "userId, read",
    );
    ensureIndex(
      "notifications",
      "idx_notifications_userId_createdAt",
      "userId, createdAt",
    );
    ensureIndex(
      "phoneVerificationCodes",
      "idx_phoneVerificationCodes_userId_purpose_createdAt",
      "userId, purpose, createdAt",
    );
    ensureIndex(
      "phoneVerificationCodes",
      "idx_phoneVerificationCodes_email_phone_purpose",
      "email, phone, purpose",
    );
    ensureIndex(
      "phoneVerificationCodes",
      "idx_phoneVerificationCodes_phone_purpose_consumedAt",
      "phone, purpose, consumedAt",
    );
    ensureIndex(
      "parentChangeRequests",
      "idx_parentChangeRequests_resellerId",
      "resellerId",
    );
    ensureIndex(
      "parentChangeRequests",
      "idx_parentChangeRequests_newParentId",
      "newParentId",
    );
    ensureIndex(
      "parentChangeRequests",
      "idx_parentChangeRequests_status",
      "status",
    );

    persist();
    return db;
  })();
  return initPromise;
}

function persist() {
  try {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  } catch (e) {
    console.error("Failed to persist DB:", e);
  }
}

function ensureColumn(tableName, columnName, definition) {
  if (!db) return;
  try {
    const result = db.exec(`PRAGMA table_info(${tableName})`);
    const columns = result?.[0]?.values?.map((row) => row[1]) || [];
    if (!columns.includes(columnName)) {
      db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  } catch (e) {
    console.error(`Failed ensuring ${tableName}.${columnName}:`, e);
  }
}

function ensureIndex(tableName, indexName, columns) {
  if (!db) return;
  try {
    db.run(
      `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns})`,
    );
  } catch (e) {
    console.error(`Failed ensuring index ${indexName} on ${tableName}:`, e);
  }
}

function mapRow(row) {
  if (!row) return null;
  const out = { ...row };
  // Only convert known boolean-like fields from 0/1 to boolean.
  const boolFields = new Set(["active", "emailEnabled", "smsEnabled", "read"]);
  for (const k of Object.keys(out)) {
    if (boolFields.has(k) && (out[k] === 0 || out[k] === 1)) {
      out[k] = out[k] === 1;
    }
    if (["config", "data"].includes(k) && typeof out[k] === "string") {
      try {
        out[k] = JSON.parse(out[k]);
      } catch (e) {}
    }
  }
  return out;
}

function applyOrderByAndPagination(rows, options = {}) {
  const { orderBy, skip, take } = options;
  let output = Array.isArray(rows) ? [...rows] : [];

  if (orderBy && typeof orderBy === "object") {
    const [field, direction] = Object.entries(orderBy)[0] || [];
    if (field) {
      const dir =
        (direction || "asc").toString().toLowerCase() === "desc" ? -1 : 1;
      output.sort((a, b) => {
        const left = a?.[field];
        const right = b?.[field];
        if (left === right) return 0;
        if (left === null || left === undefined) return -1 * dir;
        if (right === null || right === undefined) return 1 * dir;
        return left > right ? 1 * dir : -1 * dir;
      });
    }
  }

  const start = Number(skip || 0);
  const end = Number.isFinite(Number(take)) ? start + Number(take) : undefined;
  return output.slice(start, end);
}

function matchesFieldValue(actualValue, expectedValue) {
  if (expectedValue === undefined) return true;

  if (expectedValue && typeof expectedValue === "object") {
    if (Array.isArray(expectedValue)) {
      return expectedValue.includes(actualValue);
    }

    if (Object.prototype.hasOwnProperty.call(expectedValue, "equals")) {
      return matchesFieldValue(actualValue, expectedValue.equals);
    }

    if (Object.prototype.hasOwnProperty.call(expectedValue, "in")) {
      const list = Array.isArray(expectedValue.in) ? expectedValue.in : [];
      return list.includes(actualValue);
    }

    if (Object.prototype.hasOwnProperty.call(expectedValue, "not")) {
      return !matchesFieldValue(actualValue, expectedValue.not);
    }

    if (Object.prototype.hasOwnProperty.call(expectedValue, "contains")) {
      const left = (actualValue || "").toString();
      const right = (expectedValue.contains || "").toString();
      const mode = (expectedValue.mode || "default").toString().toLowerCase();
      return mode === "insensitive"
        ? left.toLowerCase().includes(right.toLowerCase())
        : left.includes(right);
    }
  }

  return actualValue === expectedValue;
}

function matchesWhereClause(row, where) {
  if (!where || typeof where !== "object") return true;

  if (Array.isArray(where.AND) && where.AND.length > 0) {
    if (!where.AND.every((clause) => matchesWhereClause(row, clause))) {
      return false;
    }
  }

  if (Array.isArray(where.OR) && where.OR.length > 0) {
    if (!where.OR.some((clause) => matchesWhereClause(row, clause))) {
      return false;
    }
  }

  for (const [key, value] of Object.entries(where)) {
    if (key === "AND" || key === "OR") continue;
    if (!matchesFieldValue(row?.[key], value)) return false;
  }

  return true;
}

function isMutationQuery(sql) {
  return /^(\s)*(UPDATE|DELETE|INSERT|REPLACE|CREATE|ALTER|DROP)\b/i.test(
    (sql || "").toString(),
  );
}

async function runQuery(sql, params = []) {
  await init();
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    if (isMutationQuery(sql)) {
      persist();
    }
    return rows;
  } finally {
    try {
      stmt.free();
    } catch (e) {}
  }
}

async function runInsert(sql, params = []) {
  await init();
  const stmt = db.prepare(sql);
  try {
    stmt.run(params);
    // get last insert id
    const last = await runQuery("SELECT last_insert_rowid() AS id");
    const id = last && last[0] ? last[0].id : null;
    persist();
    return id;
  } finally {
    try {
      stmt.free();
    } catch (e) {}
  }
}

const adapter = {
  $disconnect: async () => {
    // persist and free
    if (db) persist();
  },

  user: {
    findMany: async (args = {}) => {
      const { where, orderBy, select, skip, take } = args;
      const rows = await runQuery("SELECT * FROM users");
      const mapped = rows
        .map(mapRow)
        .filter((row) => matchesWhereClause(row, where));
      const paged = applyOrderByAndPagination(mapped, { orderBy, skip, take });

      if (select && typeof select === "object") {
        return paged.map((r) => {
          if (!r) return r;
          const out = {};
          for (const k of Object.keys(select)) {
            if (select[k] && r.hasOwnProperty(k)) out[k] = r[k];
          }
          return out;
        });
      }

      return paged;
    },
    findUnique: async ({ where } = {}) => {
      if (!where) return null;
      if (where.email) {
        const rows = await runQuery(
          "SELECT * FROM users WHERE email = ? LIMIT 1",
          [where.email],
        );
        return mapRow(rows[0]);
      }
      if (where.id) {
        const rows = await runQuery(
          "SELECT * FROM users WHERE id = ? LIMIT 1",
          [where.id],
        );
        return mapRow(rows[0]);
      }
      return null;
    },
    create: async ({ data }) => {
      const nowv = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO users (email, name, phone, password, role, resellerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          data.email,
          data.name || null,
          data.phone || null,
          data.password,
          data.role || "subreseller",
          data.resellerId || null,
          nowv,
          nowv,
        ],
      );
      const rows = await runQuery("SELECT * FROM users WHERE id = ? LIMIT 1", [
        id,
      ]);
      return mapRow(rows[0]);
    },
    update: async ({ where, data }) => {
      if (!where || !where.id) throw new Error("update requires where.id");
      const id = where.id;
      const fields = [];
      const params = [];
      if (data.password !== undefined) {
        fields.push("password = ?");
        params.push(data.password);
      }
      if (data.name !== undefined) {
        fields.push("name = ?");
        params.push(data.name);
      }
      if (data.email !== undefined) {
        fields.push("email = ?");
        params.push(data.email);
      }
      if (data.phone !== undefined) {
        fields.push("phone = ?");
        params.push(data.phone);
      }
      if (data.role !== undefined) {
        fields.push("role = ?");
        params.push(data.role);
      }
      if (data.resellerId !== undefined) {
        fields.push("resellerId = ?");
        params.push(data.resellerId);
      }
      if (fields.length === 0) {
        const rows = await runQuery(
          "SELECT * FROM users WHERE id = ? LIMIT 1",
          [id],
        );
        return mapRow(rows[0]);
      }
      fields.push("updatedAt = ?");
      params.push(new Date().toISOString());
      params.push(id);
      await runQuery(
        `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
        params,
      );
      const rows = await runQuery("SELECT * FROM users WHERE id = ? LIMIT 1", [
        id,
      ]);
      return mapRow(rows[0]);
    },
    delete: async ({ where }) => {
      if (!where || !where.id) throw new Error("delete requires where.id");
      await runQuery("DELETE FROM users WHERE id = ?", [where.id]);
      persist();
      return { success: true };
    },
    deleteMany: async ({ where } = {}) => {
      const existing = await adapter.user.findMany({ where });
      for (const item of existing) {
        await runQuery("DELETE FROM users WHERE id = ?", [item.id]);
      }
      if (existing.length > 0) {
        persist();
      }
      return { count: existing.length };
    },
  },

  reseller: {
    findUnique: async ({ where } = {}) => {
      if (!where) return null;
      if (where.id) {
        const rows = await runQuery(
          "SELECT * FROM resellers WHERE id = ? LIMIT 1",
          [where.id],
        );
        return mapRow(rows[0]);
      }
      if (where.email) {
        const rows = await runQuery(
          "SELECT * FROM resellers WHERE email = ? LIMIT 1",
          [where.email],
        );
        return mapRow(rows[0]);
      }
      if (where.code) {
        const rows = await runQuery(
          "SELECT * FROM resellers WHERE code = ? LIMIT 1",
          [where.code],
        );
        return mapRow(rows[0]);
      }
      return null;
    },
    findMany: async ({ where, orderBy, skip, take } = {}) => {
      const rows = await runQuery("SELECT * FROM resellers");
      const mapped = rows
        .map(mapRow)
        .filter((row) => matchesWhereClause(row, where));
      return applyOrderByAndPagination(mapped, { orderBy, skip, take });
    },
    findFirst: async ({ where } = {}) => {
      if (where && where.OR) {
        for (const clause of where.OR) {
          if (clause.email) {
            const rows = await runQuery(
              "SELECT * FROM resellers WHERE email = ? LIMIT 1",
              [clause.email],
            );
            if (rows && rows[0]) return mapRow(rows[0]);
          }
          if (clause.code) {
            const rows = await runQuery(
              "SELECT * FROM resellers WHERE code = ? LIMIT 1",
              [clause.code],
            );
            if (rows && rows[0]) return mapRow(rows[0]);
          }
        }
        return null;
      }
      if (where && where.email) {
        const rows = await runQuery(
          "SELECT * FROM resellers WHERE email = ? LIMIT 1",
          [where.email],
        );
        return mapRow(rows[0]);
      }
      return null;
    },
    create: async ({ data }) => {
      const nowv = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO resellers (code, name, email, phone, parentId, credits, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          data.code,
          data.name,
          data.email || null,
          data.phone || null,
          data.parentId || null,
          data.credits || 0,
          data.status || "ACTIVE",
          nowv,
          nowv,
        ],
      );
      const rows = await runQuery(
        "SELECT * FROM resellers WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    update: async ({ where, data }) => {
      if (!where || !where.id) throw new Error("update requires where.id");
      const id = where.id;
      if (data.credits && typeof data.credits === "object") {
        const currentRows = await runQuery(
          "SELECT * FROM resellers WHERE id = ? LIMIT 1",
          [id],
        );
        const current = mapRow(currentRows[0]);
        if (!current) return null;

        const incrementBy =
          data.credits.increment !== undefined
            ? Number(data.credits.increment)
            : 0;
        const decrementBy =
          data.credits.decrement !== undefined
            ? Number(data.credits.decrement)
            : 0;

        if (![incrementBy, decrementBy].every(Number.isFinite)) {
          throw new Error("Invalid reseller credit operation");
        }

        const nextCredits =
          Number(current.credits || 0) + incrementBy - decrementBy;
        if (nextCredits < 0) {
          throw new Error("Insufficient credits");
        }

        await runQuery(
          "UPDATE resellers SET credits = ?, updatedAt = ? WHERE id = ?",
          [nextCredits, new Date().toISOString(), id],
        );
        const rows = await runQuery(
          "SELECT * FROM resellers WHERE id = ? LIMIT 1",
          [id],
        );
        return mapRow(rows[0]);
      }
      const fields = [];
      const params = [];
      if (data.name !== undefined) {
        fields.push("name = ?");
        params.push(data.name);
      }
      if (data.email !== undefined) {
        fields.push("email = ?");
        params.push(data.email);
      }
      if (data.phone !== undefined) {
        fields.push("phone = ?");
        params.push(data.phone);
      }
      if (data.parentId !== undefined) {
        fields.push("parentId = ?");
        params.push(data.parentId);
      }
      if (data.credits !== undefined && typeof data.credits !== "object") {
        const nextCredits = Number(data.credits);
        if (!Number.isFinite(nextCredits) || nextCredits < 0) {
          throw new Error("Invalid reseller credit balance");
        }
        fields.push("credits = ?");
        params.push(nextCredits);
      }
      if (data.status !== undefined) {
        fields.push("status = ?");
        params.push(data.status);
      }
      if (fields.length > 0) {
        fields.push("updatedAt = ?");
        params.push(new Date().toISOString());
        params.push(id);
        await runQuery(
          `UPDATE resellers SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
      }
      const rows = await runQuery(
        "SELECT * FROM resellers WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    delete: async ({ where }) => {
      if (!where || !where.id) throw new Error("delete requires where.id");
      await runQuery("DELETE FROM resellers WHERE id = ?", [where.id]);
      persist();
      return { success: true };
    },
  },

  pricingPlan: {
    findMany: async ({ where, orderBy } = {}) => {
      let sql = "SELECT * FROM pricingPlans";
      const clauses = [];
      const params = [];

      if (where && where.planType !== undefined) {
        clauses.push("planType = ?");
        params.push(where.planType);
      }
      if (where && where.active !== undefined) {
        clauses.push("active = ?");
        params.push(where.active ? 1 : 0);
      }

      if (clauses.length > 0) {
        sql += ` WHERE ${clauses.join(" AND ")}`;
      }
      if (orderBy && orderBy.createdAt === "desc") {
        sql += " ORDER BY createdAt DESC";
      }
      const rows = await runQuery(sql, params);
      return rows.map(mapRow);
    },
    findUnique: async ({ where } = {}) => {
      if (!where) return null;
      if (where.id !== undefined) {
        const rows = await runQuery(
          "SELECT * FROM pricingPlans WHERE id = ? LIMIT 1",
          [where.id],
        );
        return mapRow(rows[0]);
      }
      if (where.name !== undefined) {
        const rows = await runQuery(
          "SELECT * FROM pricingPlans WHERE name = ? LIMIT 1",
          [where.name],
        );
        return mapRow(rows[0]);
      }
      return null;
    },
    findFirst: async ({ where } = {}) => {
      if (where && where.name) {
        const rows = await runQuery(
          "SELECT * FROM pricingPlans WHERE name = ? LIMIT 1",
          [where.name],
        );
        return mapRow(rows[0]);
      }
      return null;
    },
    create: async ({ data }) => {
      const nowv = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO pricingPlans (name, price, credits, currency, features, planType, duration, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          data.name,
          data.price || 0,
          data.credits || 0,
          data.currency || "USD",
          data.features || null,
          data.planType || "CREDIT_RECHARGE",
          data.duration || null,
          data.active === undefined ? 1 : data.active ? 1 : 0,
          nowv,
          nowv,
        ],
      );
      const rows = await runQuery(
        "SELECT * FROM pricingPlans WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    update: async ({ where, data }) => {
      if (!where || !where.id) throw new Error("update requires where.id");
      const id = where.id;
      const fields = [];
      const params = [];
      if (data.name !== undefined) {
        fields.push("name = ?");
        params.push(data.name);
      }
      if (data.price !== undefined) {
        fields.push("price = ?");
        params.push(data.price);
      }
      if (data.credits !== undefined) {
        fields.push("credits = ?");
        params.push(data.credits);
      }
      if (data.currency !== undefined) {
        fields.push("currency = ?");
        params.push(data.currency);
      }
      if (data.features !== undefined) {
        fields.push("features = ?");
        params.push(data.features);
      }
      if (data.planType !== undefined) {
        fields.push("planType = ?");
        params.push(data.planType);
      }
      if (data.duration !== undefined) {
        fields.push("duration = ?");
        params.push(data.duration);
      }
      if (data.active !== undefined) {
        fields.push("active = ?");
        params.push(data.active ? 1 : 0);
      }
      if (fields.length > 0) {
        fields.push("updatedAt = ?");
        params.push(new Date().toISOString());
        params.push(id);
        await runQuery(
          `UPDATE pricingPlans SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
      }
      const rows = await runQuery(
        "SELECT * FROM pricingPlans WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    delete: async ({ where }) => {
      if (!where || !where.id) throw new Error("delete requires where.id");
      await runQuery("DELETE FROM pricingPlans WHERE id = ?", [where.id]);
      persist();
      return { success: true };
    },
  },

  apiIntegration: {
    findMany: async ({ orderBy } = {}) => {
      let sql = "SELECT * FROM apiIntegrations";
      if (orderBy && orderBy.createdAt === "desc")
        sql += " ORDER BY createdAt DESC";
      const rows = await runQuery(sql);
      return rows.map(mapRow);
    },
    findFirst: async ({ where } = {}) => {
      if (where && where.name) {
        const rows = await runQuery(
          "SELECT * FROM apiIntegrations WHERE name = ? LIMIT 1",
          [where.name],
        );
        return mapRow(rows[0]);
      }
      return null;
    },
    create: async ({ data }) => {
      const nowv = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO apiIntegrations (name, provider, apiKey, webhookUrl, config, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          data.name,
          data.provider,
          data.apiKey || null,
          data.webhookUrl || null,
          data.config ? JSON.stringify(data.config) : null,
          data.active ? 1 : 0,
          nowv,
          nowv,
        ],
      );
      const rows = await runQuery(
        "SELECT * FROM apiIntegrations WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    update: async ({ where, data }) => {
      if (!where || !where.id) throw new Error("update requires where.id");
      const id = where.id;
      const fields = [];
      const params = [];
      if (data.name !== undefined) {
        fields.push("name = ?");
        params.push(data.name);
      }
      if (data.provider !== undefined) {
        fields.push("provider = ?");
        params.push(data.provider);
      }
      if (data.apiKey !== undefined) {
        fields.push("apiKey = ?");
        params.push(data.apiKey);
      }
      if (data.webhookUrl !== undefined) {
        fields.push("webhookUrl = ?");
        params.push(data.webhookUrl);
      }
      if (data.config !== undefined) {
        fields.push("config = ?");
        params.push(JSON.stringify(data.config));
      }
      if (data.active !== undefined) {
        fields.push("active = ?");
        params.push(data.active ? 1 : 0);
      }
      if (fields.length > 0) {
        fields.push("updatedAt = ?");
        params.push(new Date().toISOString());
        params.push(id);
        await runQuery(
          `UPDATE apiIntegrations SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
      }
      const rows = await runQuery(
        "SELECT * FROM apiIntegrations WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    delete: async ({ where }) => {
      if (!where || !where.id) throw new Error("delete requires where.id");
      await runQuery("DELETE FROM apiIntegrations WHERE id = ?", [where.id]);
      persist();
      return { success: true };
    },
  },

  systemSetting: {
    findMany: async () =>
      (await runQuery("SELECT * FROM systemSettings")).map(mapRow),
    findUnique: async ({ where }) => {
      if (!where || !where.key) return null;
      const rows = await runQuery(
        "SELECT * FROM systemSettings WHERE key = ? LIMIT 1",
        [where.key],
      );
      return mapRow(rows[0]);
    },
    upsert: async ({ where, create, update }) => {
      const existing = (
        await runQuery("SELECT * FROM systemSettings WHERE key = ? LIMIT 1", [
          where.key,
        ])
      )[0];
      if (!existing) {
        const nowv = new Date().toISOString();
        const id = await runInsert(
          "INSERT INTO systemSettings (key, value, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
          [create.key, create.value, nowv, nowv],
        );
        const rows = await runQuery(
          "SELECT * FROM systemSettings WHERE id = ? LIMIT 1",
          [id],
        );
        return mapRow(rows[0]);
      } else {
        await runQuery(
          "UPDATE systemSettings SET value = ?, updatedAt = ? WHERE key = ?",
          [update.value, new Date().toISOString(), where.key],
        );
        const rows = await runQuery(
          "SELECT * FROM systemSettings WHERE key = ? LIMIT 1",
          [where.key],
        );
        return mapRow(rows[0]);
      }
    },
  },

  playlist: {
    findMany: async ({ where, orderBy } = {}) => {
      let sql = "SELECT * FROM playlists";
      const params = [];
      if (where && where.ownerResellerId !== undefined) {
        sql += " WHERE ownerResellerId = ?";
        params.push(where.ownerResellerId);
      }
      if (orderBy && orderBy.createdAt === "desc")
        sql += " ORDER BY createdAt DESC";
      const rows = await runQuery(sql, params);
      return rows.map(mapRow);
    },
    create: async ({ data }) => {
      const nowv = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO playlists (ownerResellerId, name, url, content, type, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          data.ownerResellerId || null,
          data.name,
          data.url || null,
          data.content || null,
          data.type || null,
          nowv,
          nowv,
        ],
      );
      const rows = await runQuery(
        "SELECT * FROM playlists WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    findUnique: async ({ where }) => {
      if (!where) return null;
      if (where.id) {
        const rows = await runQuery(
          "SELECT * FROM playlists WHERE id = ? LIMIT 1",
          [where.id],
        );
        return mapRow(rows[0]);
      }
      return null;
    },
    update: async ({ where, data }) => {
      if (!where || !where.id) throw new Error("update requires where.id");
      const id = where.id;
      const fields = [];
      const params = [];
      if (data.name !== undefined) {
        fields.push("name = ?");
        params.push(data.name);
      }
      if (data.url !== undefined) {
        fields.push("url = ?");
        params.push(data.url);
      }
      if (data.content !== undefined) {
        fields.push("content = ?");
        params.push(data.content);
      }
      if (data.type !== undefined) {
        fields.push("type = ?");
        params.push(data.type);
      }
      if (fields.length > 0) {
        fields.push("updatedAt = ?");
        params.push(new Date().toISOString());
        params.push(id);
        await runQuery(
          `UPDATE playlists SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
      }
      const rows = await runQuery(
        "SELECT * FROM playlists WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    delete: async ({ where }) => {
      if (!where || !where.id) throw new Error("delete requires where.id");
      await runQuery("DELETE FROM playlists WHERE id = ?", [where.id]);
      persist();
      return { success: true };
    },
  },

  devicePlaylist: {
    findMany: async ({ where, include, orderBy, take } = {}) => {
      let sql = "SELECT * FROM devicePlaylists";
      const clauses = [];
      const params = [];

      if (where && where.id !== undefined) {
        clauses.push("id = ?");
        params.push(Number(where.id));
      }
      if (where && where.deviceId !== undefined) {
        clauses.push("deviceId = ?");
        params.push(Number(where.deviceId));
      }
      if (where && where.playlistId !== undefined) {
        clauses.push("playlistId = ?");
        params.push(Number(where.playlistId));
      }

      if (clauses.length > 0) sql += ` WHERE ${clauses.join(" AND ")}`;
      if (orderBy && orderBy.addedAt === "desc")
        sql += " ORDER BY addedAt DESC";
      else if (orderBy && orderBy.addedAt === "asc")
        sql += " ORDER BY addedAt ASC";
      if (take) sql += ` LIMIT ${Number(take)}`;

      const rows = (await runQuery(sql, params)).map(mapRow);

      if (include && (include.playlist || include.device)) {
        for (const row of rows) {
          if (include.playlist) {
            row.playlist = await adapter.playlist.findUnique({
              where: { id: row.playlistId },
            });
          }
          if (include.device) {
            row.device = await adapter.device.findUnique({
              where: { id: row.deviceId },
            });
          }
        }
      }

      return rows;
    },
    findFirst: async ({ where, include, orderBy } = {}) => {
      const rows = await adapter.devicePlaylist.findMany({
        where,
        include,
        orderBy,
        take: 1,
      });
      return rows[0] || null;
    },
    create: async ({ data }) => {
      const nowv = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO devicePlaylists (deviceId, playlistId, addedAt) VALUES (?, ?, ?)",
        [Number(data.deviceId), Number(data.playlistId), data.addedAt || nowv],
      );
      const rows = await runQuery(
        "SELECT * FROM devicePlaylists WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    deleteMany: async ({ where } = {}) => {
      const existing = await adapter.devicePlaylist.findMany({ where });
      let sql = "DELETE FROM devicePlaylists";
      const clauses = [];
      const params = [];

      if (where && where.id !== undefined) {
        clauses.push("id = ?");
        params.push(Number(where.id));
      }
      if (where && where.deviceId !== undefined) {
        clauses.push("deviceId = ?");
        params.push(Number(where.deviceId));
      }
      if (where && where.playlistId !== undefined) {
        clauses.push("playlistId = ?");
        params.push(Number(where.playlistId));
      }

      if (clauses.length > 0) {
        sql += ` WHERE ${clauses.join(" AND ")}`;
      }

      await runQuery(sql, params);
      persist();
      return { count: existing.length };
    },
  },

  device: {
    findMany: async ({ where, orderBy, skip, take } = {}) => {
      const rows = await runQuery("SELECT * FROM devices");
      const mapped = rows
        .map(mapRow)
        .filter((row) => matchesWhereClause(row, where));
      return applyOrderByAndPagination(mapped, { orderBy, skip, take });
    },
    create: async ({ data }) => {
      const nowv = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO devices (mac, deviceKey, ownerResellerId, domainUrl, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          data.mac,
          data.deviceKey || null,
          data.ownerResellerId || null,
          data.domainUrl || null,
          data.status || "ACTIVE",
          nowv,
          nowv,
        ],
      );
      const rows = await runQuery(
        "SELECT * FROM devices WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    findUnique: async ({ where, include } = {}) => {
      if (!where) return null;
      let rows = [];
      if (where.id) {
        rows = await runQuery("SELECT * FROM devices WHERE id = ? LIMIT 1", [
          where.id,
        ]);
      } else if (where.mac) {
        rows = await runQuery("SELECT * FROM devices WHERE mac = ? LIMIT 1", [
          where.mac,
        ]);
      } else if (where.deviceKey) {
        rows = await runQuery(
          "SELECT * FROM devices WHERE deviceKey = ? LIMIT 1",
          [where.deviceKey],
        );
      }
      const device = mapRow(rows[0]);
      if (device && include && include.activatedApps) {
        device.activatedApps = await adapter.activatedApp.findMany({
          where: { deviceId: device.id },
        });
      }
      return device;
    },
    update: async ({ where, data }) => {
      if (!where || !where.id) throw new Error("update requires where.id");
      const id = where.id;
      const fields = [];
      const params = [];
      if (data.mac !== undefined) {
        fields.push("mac = ?");
        params.push(data.mac);
      }
      if (data.deviceKey !== undefined) {
        fields.push("deviceKey = ?");
        params.push(data.deviceKey);
      }
      if (data.domainUrl !== undefined) {
        fields.push("domainUrl = ?");
        params.push(data.domainUrl);
      }
      if (data.status !== undefined) {
        fields.push("status = ?");
        params.push(data.status);
      }
      if (data.ownerResellerId !== undefined) {
        fields.push("ownerResellerId = ?");
        params.push(data.ownerResellerId);
      }
      if (fields.length > 0) {
        fields.push("updatedAt = ?");
        params.push(new Date().toISOString());
        params.push(id);
        await runQuery(
          `UPDATE devices SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
      }
      const rows = await runQuery(
        "SELECT * FROM devices WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    delete: async ({ where }) => {
      if (!where || !where.id) throw new Error("delete requires where.id");
      await runQuery("DELETE FROM devices WHERE id = ?", [where.id]);
      persist();
      return { success: true };
    },
  },

  application: {
    findMany: async ({ where, orderBy } = {}) => {
      let sql = "SELECT * FROM applications";
      const clauses = [];
      const params = [];
      if (where && where.id !== undefined) {
        clauses.push("id = ?");
        params.push(where.id);
      }
      if (where && where.name !== undefined) {
        clauses.push("name = ?");
        params.push(where.name);
      }
      if (where && where.status !== undefined) {
        clauses.push("status = ?");
        params.push(where.status);
      }
      if (clauses.length > 0) sql += ` WHERE ${clauses.join(" AND ")}`;
      if (orderBy && orderBy.name === "asc") sql += " ORDER BY name ASC";
      else if (orderBy && orderBy.createdAt === "desc")
        sql += " ORDER BY createdAt DESC";
      const rows = await runQuery(sql, params);
      return rows.map(mapRow);
    },
    findUnique: async ({ where } = {}) => {
      if (!where) return null;
      if (where.id !== undefined) {
        const rows = await runQuery(
          "SELECT * FROM applications WHERE id = ? LIMIT 1",
          [where.id],
        );
        return mapRow(rows[0]);
      }
      if (where.name !== undefined) {
        const rows = await runQuery(
          "SELECT * FROM applications WHERE name = ? LIMIT 1",
          [where.name],
        );
        return mapRow(rows[0]);
      }
      return null;
    },
    findFirst: async ({ where } = {}) => {
      const rows = await adapter.application.findMany({ where });
      return rows[0] || null;
    },
    create: async ({ data }) => {
      const nowv = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO applications (name, logoUrl, description, downloadUrl, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          data.name,
          data.logoUrl || null,
          data.description || null,
          data.downloadUrl || null,
          data.status || "ACTIVE",
          nowv,
          nowv,
        ],
      );
      const rows = await runQuery(
        "SELECT * FROM applications WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    update: async ({ where, data }) => {
      if (!where || !where.id) throw new Error("update requires where.id");
      const fields = [];
      const params = [];
      if (data.name !== undefined) {
        fields.push("name = ?");
        params.push(data.name);
      }
      if (data.logoUrl !== undefined) {
        fields.push("logoUrl = ?");
        params.push(data.logoUrl);
      }
      if (data.description !== undefined) {
        fields.push("description = ?");
        params.push(data.description);
      }
      if (data.downloadUrl !== undefined) {
        fields.push("downloadUrl = ?");
        params.push(data.downloadUrl);
      }
      if (data.status !== undefined) {
        fields.push("status = ?");
        params.push(data.status);
      }
      if (fields.length > 0) {
        fields.push("updatedAt = ?");
        params.push(new Date().toISOString());
        params.push(where.id);
        await runQuery(
          `UPDATE applications SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
      }
      const rows = await runQuery(
        "SELECT * FROM applications WHERE id = ? LIMIT 1",
        [where.id],
      );
      return mapRow(rows[0]);
    },
    delete: async ({ where }) => {
      if (!where || !where.id) throw new Error("delete requires where.id");
      await runQuery("DELETE FROM applications WHERE id = ?", [where.id]);
      persist();
      return { success: true };
    },
  },

  activatedApp: {
    create: async ({ data }) => {
      const nowv = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO activatedApps (deviceId, applicationId, appName, duration, expiresAt, status, activatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          data.deviceId,
          data.applicationId ?? null,
          data.appName,
          data.duration || "1_year",
          data.expiresAt || null,
          data.status || "ACTIVE",
          data.activatedAt || nowv,
        ],
      );
      const rows = await runQuery(
        "SELECT * FROM activatedApps WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    update: async ({ where, data }) => {
      if (!where || !where.id) throw new Error("update requires where.id");
      const fields = [];
      const params = [];
      if (data.deviceId !== undefined) {
        fields.push("deviceId = ?");
        params.push(data.deviceId);
      }
      if (data.applicationId !== undefined) {
        fields.push("applicationId = ?");
        params.push(data.applicationId);
      }
      if (data.appName !== undefined) {
        fields.push("appName = ?");
        params.push(data.appName);
      }
      if (data.duration !== undefined) {
        fields.push("duration = ?");
        params.push(data.duration);
      }
      if (data.expiresAt !== undefined) {
        fields.push("expiresAt = ?");
        params.push(data.expiresAt);
      }
      if (data.status !== undefined) {
        fields.push("status = ?");
        params.push(data.status);
      }
      if (data.activatedAt !== undefined) {
        fields.push("activatedAt = ?");
        params.push(data.activatedAt);
      }
      if (fields.length > 0) {
        params.push(where.id);
        await runQuery(
          `UPDATE activatedApps SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
        persist();
      }
      const rows = await runQuery(
        "SELECT * FROM activatedApps WHERE id = ? LIMIT 1",
        [where.id],
      );
      return mapRow(rows[0]);
    },
    updateMany: async ({ where, data }) => {
      const existing = await adapter.activatedApp.findMany({ where });
      for (const item of existing) {
        await adapter.activatedApp.update({ where: { id: item.id }, data });
      }
      return { count: existing.length };
    },
    findMany: async ({ where, orderBy, take } = {}) => {
      let sql = "SELECT * FROM activatedApps";
      const clauses = [];
      const params = [];
      if (where && where.deviceId !== undefined) {
        if (
          typeof where.deviceId === "object" &&
          Array.isArray(where.deviceId.in)
        ) {
          if (where.deviceId.in.length === 0) return [];
          clauses.push(
            `deviceId IN (${where.deviceId.in.map(() => "?").join(", ")})`,
          );
          params.push(...where.deviceId.in);
        } else {
          clauses.push("deviceId = ?");
          params.push(where.deviceId);
        }
      }
      if (where && where.applicationId !== undefined) {
        clauses.push("applicationId = ?");
        params.push(where.applicationId);
      }
      if (where && where.appName !== undefined) {
        clauses.push("appName = ?");
        params.push(where.appName);
      }
      if (where && where.status !== undefined) {
        clauses.push("status = ?");
        params.push(where.status);
      }
      if (clauses.length > 0) sql += ` WHERE ${clauses.join(" AND ")}`;
      if (orderBy && orderBy.activatedAt === "desc") {
        sql += " ORDER BY activatedAt DESC";
      }
      if (take) sql += ` LIMIT ${Number(take)}`;
      const rows = await runQuery(sql, params);
      return rows.map(mapRow);
    },
    findFirst: async ({ where } = {}) => {
      const rows = await adapter.activatedApp.findMany({ where, take: 1 });
      return rows[0] || null;
    },
    count: async ({ where } = {}) => {
      const rows = await adapter.activatedApp.findMany({ where });
      return rows.length;
    },
    deleteMany: async ({ where } = {}) => {
      const existing = await adapter.activatedApp.findMany({ where });
      if (!where) {
        await runQuery("DELETE FROM activatedApps");
      } else if (where.deviceId !== undefined) {
        await runQuery("DELETE FROM activatedApps WHERE deviceId = ?", [
          where.deviceId,
        ]);
      } else if (where.applicationId !== undefined) {
        await runQuery("DELETE FROM activatedApps WHERE applicationId = ?", [
          where.applicationId,
        ]);
      }
      persist();
      return { count: existing.length };
    },
  },

  parentChangeRequest: {
    findMany: async ({ orderBy } = {}) => {
      let sql = "SELECT * FROM parentChangeRequests";
      if (orderBy && orderBy.createdAt === "desc")
        sql += " ORDER BY createdAt DESC";
      const rows = await runQuery(sql);
      return rows.map(mapRow);
    },
    create: async ({ data }) => {
      const nowv = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO parentChangeRequests (resellerId, newParentId, status, reason, createdAt, processedAt) VALUES (?, ?, ?, ?, ?, ?)",
        [
          data.resellerId || null,
          data.newParentId || null,
          data.status || "PENDING",
          data.reason || null,
          nowv,
          data.processedAt || null,
        ],
      );
      const rows = await runQuery(
        "SELECT * FROM parentChangeRequests WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    findUnique: async ({ where } = {}) => {
      if (!where) return null;
      if (where.id) {
        const rows = await runQuery(
          "SELECT * FROM parentChangeRequests WHERE id = ? LIMIT 1",
          [where.id],
        );
        return mapRow(rows[0]);
      }
      return null;
    },
    update: async ({ where, data }) => {
      if (!where || !where.id) throw new Error("update requires where.id");
      const id = where.id;
      const fields = [];
      const params = [];
      if (data.status !== undefined) {
        fields.push("status = ?");
        params.push(data.status);
      }
      if (data.processedAt !== undefined) {
        fields.push("processedAt = ?");
        params.push(data.processedAt);
      }
      if (data.resellerId !== undefined) {
        fields.push("resellerId = ?");
        params.push(data.resellerId);
      }
      if (data.newParentId !== undefined) {
        fields.push("newParentId = ?");
        params.push(data.newParentId);
      }
      if (data.reason !== undefined) {
        fields.push("reason = ?");
        params.push(data.reason);
      }
      if (fields.length > 0) {
        params.push(id);
        await runQuery(
          `UPDATE parentChangeRequests SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
      }
      const rows = await runQuery(
        "SELECT * FROM parentChangeRequests WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
  },

  phoneVerificationCode: {
    findMany: async ({ where, orderBy, skip, take } = {}) => {
      const rows = await runQuery("SELECT * FROM phoneVerificationCodes");
      const mapped = rows
        .map(mapRow)
        .filter((row) => matchesWhereClause(row, where));
      return applyOrderByAndPagination(mapped, { orderBy, skip, take });
    },
    findFirst: async ({ where, orderBy } = {}) => {
      const rows = await adapter.phoneVerificationCode.findMany({
        where,
        orderBy,
        take: 1,
      });
      return rows[0] || null;
    },
    create: async ({ data }) => {
      const nowv = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO phoneVerificationCodes (userId, purpose, email, phone, codeHash, attempts, expiresAt, consumedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          data.userId || null,
          data.purpose,
          data.email || null,
          data.phone,
          data.codeHash,
          Number(data.attempts || 0),
          data.expiresAt instanceof Date
            ? data.expiresAt.toISOString()
            : data.expiresAt,
          data.consumedAt instanceof Date
            ? data.consumedAt.toISOString()
            : data.consumedAt || null,
          data.createdAt instanceof Date
            ? data.createdAt.toISOString()
            : data.createdAt || nowv,
        ],
      );
      const rows = await runQuery(
        "SELECT * FROM phoneVerificationCodes WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    update: async ({ where, data }) => {
      if (!where || !where.id) throw new Error("update requires where.id");
      const fields = [];
      const params = [];
      if (data.userId !== undefined) {
        fields.push("userId = ?");
        params.push(data.userId);
      }
      if (data.purpose !== undefined) {
        fields.push("purpose = ?");
        params.push(data.purpose);
      }
      if (data.email !== undefined) {
        fields.push("email = ?");
        params.push(data.email);
      }
      if (data.phone !== undefined) {
        fields.push("phone = ?");
        params.push(data.phone);
      }
      if (data.codeHash !== undefined) {
        fields.push("codeHash = ?");
        params.push(data.codeHash);
      }
      if (data.attempts !== undefined) {
        fields.push("attempts = ?");
        params.push(Number(data.attempts || 0));
      }
      if (data.expiresAt !== undefined) {
        fields.push("expiresAt = ?");
        params.push(
          data.expiresAt instanceof Date
            ? data.expiresAt.toISOString()
            : data.expiresAt,
        );
      }
      if (data.consumedAt !== undefined) {
        fields.push("consumedAt = ?");
        params.push(
          data.consumedAt instanceof Date
            ? data.consumedAt.toISOString()
            : data.consumedAt,
        );
      }
      if (data.createdAt !== undefined) {
        fields.push("createdAt = ?");
        params.push(
          data.createdAt instanceof Date
            ? data.createdAt.toISOString()
            : data.createdAt,
        );
      }
      if (fields.length === 0) {
        const rows = await runQuery(
          "SELECT * FROM phoneVerificationCodes WHERE id = ? LIMIT 1",
          [where.id],
        );
        return mapRow(rows[0]);
      }
      params.push(where.id);
      await runQuery(
        `UPDATE phoneVerificationCodes SET ${fields.join(", ")} WHERE id = ?`,
        params,
      );
      const rows = await runQuery(
        "SELECT * FROM phoneVerificationCodes WHERE id = ? LIMIT 1",
        [where.id],
      );
      return mapRow(rows[0]);
    },
    deleteMany: async ({ where } = {}) => {
      const existing = await adapter.phoneVerificationCode.findMany({ where });
      for (const item of existing) {
        await runQuery("DELETE FROM phoneVerificationCodes WHERE id = ?", [
          item.id,
        ]);
      }
      if (existing.length > 0) {
        persist();
      }
      return { count: existing.length };
    },
  },

  notification: {
    create: async ({ data }) => {
      const nowv = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO notifications (userId, type, title, message, link, read, data, createdAt, readAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          Number(data.userId),
          data.type || "INFO",
          data.title,
          data.message,
          data.link || null,
          data.read ? 1 : 0,
          data.data !== undefined && data.data !== null
            ? JSON.stringify(data.data)
            : null,
          data.createdAt || nowv,
          data.readAt instanceof Date
            ? data.readAt.toISOString()
            : data.readAt || null,
        ],
      );
      const rows = await runQuery(
        "SELECT * FROM notifications WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    findUnique: async ({ where } = {}) => {
      if (!where) return null;
      if (where.id !== undefined) {
        const rows = await runQuery(
          "SELECT * FROM notifications WHERE id = ? LIMIT 1",
          [where.id],
        );
        return mapRow(rows[0]);
      }
      return null;
    },
    findMany: async ({ where, orderBy, skip, take } = {}) => {
      const rows = await runQuery("SELECT * FROM notifications");
      const mapped = rows
        .map(mapRow)
        .filter((row) => matchesWhereClause(row, where));
      return applyOrderByAndPagination(mapped, { orderBy, skip, take });
    },
    update: async ({ where, data }) => {
      if (!where || !where.id) throw new Error("update requires where.id");
      const fields = [];
      const params = [];
      if (data.type !== undefined) {
        fields.push("type = ?");
        params.push(data.type);
      }
      if (data.title !== undefined) {
        fields.push("title = ?");
        params.push(data.title);
      }
      if (data.message !== undefined) {
        fields.push("message = ?");
        params.push(data.message);
      }
      if (data.link !== undefined) {
        fields.push("link = ?");
        params.push(data.link);
      }
      if (data.read !== undefined) {
        fields.push("read = ?");
        params.push(data.read ? 1 : 0);
      }
      if (data.data !== undefined) {
        fields.push("data = ?");
        params.push(data.data !== null ? JSON.stringify(data.data) : null);
      }
      if (data.readAt !== undefined) {
        fields.push("readAt = ?");
        params.push(
          data.readAt instanceof Date ? data.readAt.toISOString() : data.readAt,
        );
      }
      if (fields.length > 0) {
        params.push(where.id);
        await runQuery(
          `UPDATE notifications SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
        persist();
      }
      const rows = await runQuery(
        "SELECT * FROM notifications WHERE id = ? LIMIT 1",
        [where.id],
      );
      return mapRow(rows[0]);
    },
    updateMany: async ({ where, data } = {}) => {
      const existing = await adapter.notification.findMany({ where });
      for (const item of existing) {
        await adapter.notification.update({ where: { id: item.id }, data });
      }
      return { count: existing.length };
    },
    deleteMany: async ({ where } = {}) => {
      const existing = await adapter.notification.findMany({ where });
      for (const item of existing) {
        await runQuery("DELETE FROM notifications WHERE id = ?", [item.id]);
      }
      if (existing.length > 0) {
        persist();
      }
      return { count: existing.length };
    },
  },

  creditTransaction: {
    create: async ({ data }) => {
      const nowv = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO creditTransactions (type, status, amount, fromResellerId, fromBeforeBalance, fromAfterBalance, toResellerId, toBeforeBalance, toAfterBalance, performedById, notes, createdAt, processedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          data.type || null,
          data.status || null,
          data.amount || 0,
          data.fromResellerId || null,
          data.fromBeforeBalance !== undefined ? data.fromBeforeBalance : null,
          data.fromAfterBalance !== undefined ? data.fromAfterBalance : null,
          data.toResellerId || null,
          data.toBeforeBalance !== undefined ? data.toBeforeBalance : null,
          data.toAfterBalance !== undefined ? data.toAfterBalance : null,
          data.performedById || null,
          data.notes || null,
          nowv,
          data.processedAt || null,
        ],
      );
      const rows = await runQuery(
        "SELECT * FROM creditTransactions WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    findUnique: async ({ where } = {}) => {
      if (!where) return null;
      if (where.id !== undefined) {
        const rows = await runQuery(
          "SELECT * FROM creditTransactions WHERE id = ? LIMIT 1",
          [where.id],
        );
        return mapRow(rows[0]);
      }
      return null;
    },
    findMany: async ({ where, orderBy, skip, take } = {}) => {
      const rows = await runQuery("SELECT * FROM creditTransactions");
      const mapped = rows
        .map(mapRow)
        .filter((row) => matchesWhereClause(row, where));
      return applyOrderByAndPagination(mapped, { orderBy, skip, take });
    },
    update: async ({ where, data }) => {
      if (!where || !where.id) throw new Error("update requires where.id");
      const id = where.id;
      const fields = [];
      const params = [];

      if (data.type !== undefined) {
        fields.push("type = ?");
        params.push(data.type);
      }
      if (data.status !== undefined) {
        fields.push("status = ?");
        params.push(data.status);
      }
      if (data.amount !== undefined) {
        fields.push("amount = ?");
        params.push(data.amount);
      }
      if (data.fromResellerId !== undefined) {
        fields.push("fromResellerId = ?");
        params.push(data.fromResellerId);
      }
      if (data.fromBeforeBalance !== undefined) {
        fields.push("fromBeforeBalance = ?");
        params.push(data.fromBeforeBalance);
      }
      if (data.fromAfterBalance !== undefined) {
        fields.push("fromAfterBalance = ?");
        params.push(data.fromAfterBalance);
      }
      if (data.toResellerId !== undefined) {
        fields.push("toResellerId = ?");
        params.push(data.toResellerId);
      }
      if (data.toBeforeBalance !== undefined) {
        fields.push("toBeforeBalance = ?");
        params.push(data.toBeforeBalance);
      }
      if (data.toAfterBalance !== undefined) {
        fields.push("toAfterBalance = ?");
        params.push(data.toAfterBalance);
      }
      if (data.performedById !== undefined) {
        fields.push("performedById = ?");
        params.push(data.performedById);
      }
      if (data.notes !== undefined) {
        fields.push("notes = ?");
        params.push(data.notes);
      }
      if (data.processedAt !== undefined) {
        fields.push("processedAt = ?");
        params.push(
          data.processedAt instanceof Date
            ? data.processedAt.toISOString()
            : data.processedAt,
        );
      }

      if (fields.length > 0) {
        params.push(id);
        await runQuery(
          `UPDATE creditTransactions SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
        persist();
      }

      const rows = await runQuery(
        "SELECT * FROM creditTransactions WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },
    deleteMany: async ({ where } = {}) => {
      const existing = await adapter.creditTransaction.findMany({ where });
      for (const item of existing) {
        await runQuery("DELETE FROM creditTransactions WHERE id = ?", [
          item.id,
        ]);
      }
      if (existing.length > 0) {
        persist();
      }
      return { count: existing.length };
    },
  },
};

// Try to load the generated Prisma Client (multiple paths) and fall back.
function loadPrismaClient() {
  const attempts = [
    // normal package import
    () => require("@prisma/client"),
    // explicit generated client locations
    () =>
      require(
        path.join(
          process.cwd(),
          "node_modules",
          ".prisma",
          "client",
          "index.js",
        ),
      ),
    () =>
      require(
        path.join(
          __dirname,
          "..",
          "node_modules",
          ".prisma",
          "client",
          "index.js",
        ),
      ),
  ];

  for (const fn of attempts) {
    try {
      const mod = fn();
      if (mod && (mod.PrismaClient || mod.default)) {
        const PrismaClient =
          mod.PrismaClient || mod.default.PrismaClient || mod.default;
        if (typeof PrismaClient === "function") {
          const client = new PrismaClient();
          return client;
        }
      }
    } catch (err) {
      // ignore and try next
    }
  }
  return null;
}

const prismaClient = loadPrismaClient();
if (prismaClient) {
  console.log("Using generated Prisma Client for database operations.");
  module.exports = prismaClient;
} else {
  console.log("Falling back to lightweight SQLite adapter.");
  module.exports = adapter;
}
