function applySchema(db, { ensureColumn, ensureIndex, persist }) {
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
      ipAddress TEXT,
      metadata TEXT,
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
      activationKind TEXT DEFAULT 'PAID',
      duration TEXT DEFAULT '1_year',
      expiresAt TEXT,
      trialStartedAt TEXT,
      trialEndsAt TEXT,
      trialConsumedAt TEXT,
      status TEXT DEFAULT 'ACTIVE',
      activatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      logoUrl TEXT,
      description TEXT,
      downloadUrl TEXT,
      trialEnabled INTEGER DEFAULT 1,
      trialDurationDays INTEGER DEFAULT 7,
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
  ensureColumn("activatedApps", "activationKind", "TEXT DEFAULT 'PAID'");
  ensureColumn("activatedApps", "duration", "TEXT DEFAULT '1_year'");
  ensureColumn("activatedApps", "expiresAt", "TEXT");
  ensureColumn("activatedApps", "trialStartedAt", "TEXT");
  ensureColumn("activatedApps", "trialEndsAt", "TEXT");
  ensureColumn("activatedApps", "trialConsumedAt", "TEXT");
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
  ensureColumn("creditTransactions", "ipAddress", "TEXT");
  ensureColumn("creditTransactions", "metadata", "TEXT");
  ensureColumn("users", "phone", "TEXT");
  ensureColumn("resellers", "phone", "TEXT");
  ensureColumn("applications", "logoUrl", "TEXT");
  ensureColumn("applications", "description", "TEXT");
  ensureColumn("applications", "downloadUrl", "TEXT");
  ensureColumn("applications", "trialEnabled", "INTEGER DEFAULT 1");
  ensureColumn("applications", "trialDurationDays", "INTEGER DEFAULT 7");
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
  ensureColumn("notifications", "createdAt", "TEXT DEFAULT (datetime('now'))");
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
  ensureIndex("playlists", "idx_playlists_ownerResellerId", "ownerResellerId");
  ensureIndex("devicePlaylists", "idx_devicePlaylists_deviceId", "deviceId");
  ensureIndex(
    "devicePlaylists",
    "idx_devicePlaylists_playlistId",
    "playlistId",
  );
  ensureIndex("notifications", "idx_notifications_userId_read", "userId, read");
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
}

module.exports = {
  applySchema,
};
