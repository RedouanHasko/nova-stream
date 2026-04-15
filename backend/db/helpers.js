const { init, getDb, persist } = require("./connection");

function mapRow(row) {
  if (!row) return null;

  const output = { ...row };
  const boolFields = new Set(["active", "emailEnabled", "smsEnabled", "read"]);

  for (const key of Object.keys(output)) {
    if (boolFields.has(key) && (output[key] === 0 || output[key] === 1)) {
      output[key] = output[key] === 1;
    }

    if (["config", "data"].includes(key) && typeof output[key] === "string") {
      try {
        output[key] = JSON.parse(output[key]);
      } catch {
        // ignore malformed JSON strings and return the raw value
      }
    }
  }

  return output;
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
  const db = getDb();
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
    } catch {
      // ignore free errors during cleanup
    }
  }
}

async function runInsert(sql, params = []) {
  await init();
  const db = getDb();
  const stmt = db.prepare(sql);

  try {
    stmt.run(params);
    const last = await runQuery("SELECT last_insert_rowid() AS id");
    const id = last && last[0] ? last[0].id : null;
    persist();
    return id;
  } finally {
    try {
      stmt.free();
    } catch {
      // ignore free errors during cleanup
    }
  }
}

function applySelect(rows, select) {
  if (!select || typeof select !== "object") {
    return rows;
  }

  return rows.map((row) => {
    if (!row) return row;
    const output = {};
    for (const key of Object.keys(select)) {
      if (select[key] && Object.prototype.hasOwnProperty.call(row, key)) {
        output[key] = row[key];
      }
    }
    return output;
  });
}

module.exports = {
  mapRow,
  applyOrderByAndPagination,
  matchesFieldValue,
  matchesWhereClause,
  runQuery,
  runInsert,
  persist,
  applySelect,
};
