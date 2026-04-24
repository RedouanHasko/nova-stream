function createPricingPlanRepository({ runQuery, runInsert, mapRow, persist }) {
  return {
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
      const now = new Date().toISOString();
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
          now,
          now,
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
        params.push(where.id);
        await runQuery(
          `UPDATE pricingPlans SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
      }

      const rows = await runQuery(
        "SELECT * FROM pricingPlans WHERE id = ? LIMIT 1",
        [where.id],
      );
      return mapRow(rows[0]);
    },

    delete: async ({ where }) => {
      if (!where || !where.id) throw new Error("delete requires where.id");
      await runQuery("DELETE FROM pricingPlans WHERE id = ?", [where.id]);
      persist();
      return { success: true };
    },
  };
}

function createApiIntegrationRepository({
  runQuery,
  runInsert,
  mapRow,
  persist,
}) {
  return {
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
      const now = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO apiIntegrations (name, provider, apiKey, webhookUrl, config, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          data.name,
          data.provider,
          data.apiKey || null,
          data.webhookUrl || null,
          data.config ? JSON.stringify(data.config) : null,
          data.active ? 1 : 0,
          now,
          now,
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
        params.push(where.id);
        await runQuery(
          `UPDATE apiIntegrations SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
      }

      const rows = await runQuery(
        "SELECT * FROM apiIntegrations WHERE id = ? LIMIT 1",
        [where.id],
      );
      return mapRow(rows[0]);
    },

    delete: async ({ where }) => {
      if (!where || !where.id) throw new Error("delete requires where.id");
      await runQuery("DELETE FROM apiIntegrations WHERE id = ?", [where.id]);
      persist();
      return { success: true };
    },
  };
}

function createSystemSettingRepository({ runQuery, runInsert, mapRow }) {
  return {
    findMany: async () =>
      (await runQuery("SELECT * FROM systemSettings")).map(mapRow),

    findUnique: async ({ where } = {}) => {
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
        const now = new Date().toISOString();
        const id = await runInsert(
          "INSERT INTO systemSettings (key, value, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
          [create.key, create.value, now, now],
        );
        const rows = await runQuery(
          "SELECT * FROM systemSettings WHERE id = ? LIMIT 1",
          [id],
        );
        return mapRow(rows[0]);
      }

      await runQuery(
        "UPDATE systemSettings SET value = ?, updatedAt = ? WHERE key = ?",
        [update.value, new Date().toISOString(), where.key],
      );
      const rows = await runQuery(
        "SELECT * FROM systemSettings WHERE key = ? LIMIT 1",
        [where.key],
      );
      return mapRow(rows[0]);
    },
  };
}

function createApplicationRepository({ runQuery, runInsert, mapRow, persist }) {
  return {
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
      const rows = await createApplicationRepository({
        runQuery,
        runInsert,
        mapRow,
        persist,
      }).findMany({ where });
      return rows[0] || null;
    },

    create: async ({ data }) => {
      const now = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO applications (name, logoUrl, description, downloadUrl, trialEnabled, trialDurationDays, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          data.name,
          data.logoUrl || null,
          data.description || null,
          data.downloadUrl || null,
          data.trialEnabled === undefined ? 1 : data.trialEnabled ? 1 : 0,
          data.trialDurationDays ?? 7,
          data.status || "ACTIVE",
          now,
          now,
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
      if (data.trialEnabled !== undefined) {
        fields.push("trialEnabled = ?");
        params.push(data.trialEnabled ? 1 : 0);
      }
      if (data.trialDurationDays !== undefined) {
        fields.push("trialDurationDays = ?");
        params.push(data.trialDurationDays);
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
  };
}

module.exports = {
  createPricingPlanRepository,
  createApiIntegrationRepository,
  createSystemSettingRepository,
  createApplicationRepository,
};
