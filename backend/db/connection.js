const path = require("path");
const fs = require("fs");
require("dotenv").config();

const initSqlJs = require("sql.js");
const { applySchema } = require("./schema");

const dbFile = (process.env.DATABASE_URL || "file:./dev.db").replace(
  /^file:/,
  "",
);
const dbPath = path.isAbsolute(dbFile)
  ? dbFile
  : path.join(__dirname, "..", "..", dbFile);

let SQL = null;
let db = null;
let initPromise = null;

function getDb() {
  return db;
}

function persist() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  } catch (error) {
    console.error("Failed to persist DB:", error);
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
  } catch (error) {
    console.error(`Failed ensuring ${tableName}.${columnName}:`, error);
  }
}

function ensureIndex(tableName, indexName, columns) {
  if (!db) return;
  try {
    db.run(
      `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns})`,
    );
  } catch (error) {
    console.error(`Failed ensuring index ${indexName} on ${tableName}:`, error);
  }
}

async function init() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    SQL = await initSqlJs({
      locateFile: () => {
        const candidates = [
          path.join(
            __dirname,
            "..",
            "node_modules",
            "sql.js",
            "dist",
            "sql-wasm.wasm",
          ),
          path.join(
            __dirname,
            "..",
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

        for (const candidate of candidates) {
          if (fs.existsSync(candidate)) return candidate;
        }

        return candidates[candidates.length - 1];
      },
    });

    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(new Uint8Array(buffer));
    } else {
      db = new SQL.Database();
    }

    applySchema(db, { ensureColumn, ensureIndex, persist });
    return db;
  })();

  return initPromise;
}

module.exports = {
  init,
  getDb,
  persist,
  ensureColumn,
  ensureIndex,
  dbPath,
};
