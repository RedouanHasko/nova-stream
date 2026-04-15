const fs = require("fs");
const path = require("path");
require("dotenv").config();
const initSqlJs = require("sql.js");

function getDbPath() {
  const dbFile = (process.env.DATABASE_URL || "file:./dev.db").replace(
    /^file:/,
    "",
  );

  return path.isAbsolute(dbFile)
    ? dbFile
    : path.join(__dirname, "..", "..", dbFile);
}

async function main() {
  const dbPath = getDbPath();
  const SQL = await initSqlJs({
    locateFile: (file) =>
      path.join(__dirname, "..", "node_modules", "sql.js", "dist", file),
  });

  const db = fs.existsSync(dbPath)
    ? new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)))
    : new SQL.Database();

  const keepSuperadmins = [];
  const stmt = db.prepare(
    "SELECT id, email, role, resellerId FROM users WHERE lower(role) = 'superadmin'",
  );

  while (stmt.step()) {
    keepSuperadmins.push(stmt.getAsObject());
  }
  stmt.free();

  if (!keepSuperadmins.length) {
    throw new Error("No superadmin user found; aborting reset.");
  }

  const sqlStatements = [
    "DELETE FROM notifications",
    "DELETE FROM notificationSettings",
    "DELETE FROM phoneVerificationCodes",
    "DELETE FROM parentChangeRequests",
    "DELETE FROM creditTransactions",
    "DELETE FROM activatedApps",
    "DELETE FROM devicePlaylists",
    "DELETE FROM devices",
    "DELETE FROM playlists",
    "DELETE FROM applications",
    "DELETE FROM pricingPlans",
    "DELETE FROM apiIntegrations",
    "DELETE FROM systemSettings",
    "DELETE FROM resellers",
    "DELETE FROM users WHERE lower(role) != 'superadmin'",
    "UPDATE users SET resellerId = NULL WHERE lower(role) = 'superadmin'",
  ];

  for (const sql of sqlStatements) {
    db.run(sql);
  }

  fs.writeFileSync(dbPath, Buffer.from(db.export()));

  const count = (tableName) =>
    db.exec(`SELECT COUNT(*) AS c FROM ${tableName}`)?.[0]?.values?.[0]?.[0] ??
    0;

  const keptRows =
    db
      .exec(
        "SELECT id, email, role, resellerId FROM users ORDER BY id ASC",
      )?.[0]
      ?.values?.map(([id, email, role, resellerId]) => ({
        id,
        email,
        role,
        resellerId,
      })) || [];

  console.log(
    JSON.stringify(
      {
        keptSuperadmins: keptRows,
        counts: {
          users: count("users"),
          resellers: count("resellers"),
          devices: count("devices"),
          activatedApps: count("activatedApps"),
          applications: count("applications"),
          playlists: count("playlists"),
          devicePlaylists: count("devicePlaylists"),
          pricingPlans: count("pricingPlans"),
          apiIntegrations: count("apiIntegrations"),
          systemSettings: count("systemSettings"),
          notifications: count("notifications"),
          notificationSettings: count("notificationSettings"),
          phoneVerificationCodes: count("phoneVerificationCodes"),
          creditTransactions: count("creditTransactions"),
          parentChangeRequests: count("parentChangeRequests"),
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
