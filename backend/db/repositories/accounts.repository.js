function createUserRepository(ctx) {
  const {
    runQuery,
    runInsert,
    mapRow,
    matchesWhereClause,
    applyOrderByAndPagination,
    applySelect,
    persist,
  } = ctx;

  return {
    findMany: async (args = {}) => {
      const { where, orderBy, select, skip, take } = args;
      const rows = await runQuery("SELECT * FROM users");
      const mapped = rows
        .map(mapRow)
        .filter((row) => matchesWhereClause(row, where));
      const paged = applyOrderByAndPagination(mapped, { orderBy, skip, take });
      return applySelect(paged, select);
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
      const now = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO users (email, name, phone, password, role, resellerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          data.email,
          data.name || null,
          data.phone || null,
          data.password,
          data.role || "subreseller",
          data.resellerId || null,
          now,
          now,
        ],
      );
      const rows = await runQuery("SELECT * FROM users WHERE id = ? LIMIT 1", [
        id,
      ]);
      return mapRow(rows[0]);
    },

    update: async ({ where, data }) => {
      if (!where || !where.id) throw new Error("update requires where.id");

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
          [where.id],
        );
        return mapRow(rows[0]);
      }

      fields.push("updatedAt = ?");
      params.push(new Date().toISOString());
      params.push(where.id);

      await runQuery(
        `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
        params,
      );
      const rows = await runQuery("SELECT * FROM users WHERE id = ? LIMIT 1", [
        where.id,
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
      const existing = await createUserRepository(ctx).findMany({ where });
      for (const item of existing) {
        await runQuery("DELETE FROM users WHERE id = ?", [item.id]);
      }
      if (existing.length > 0) persist();
      return { count: existing.length };
    },
  };
}

function createResellerRepository(ctx) {
  const {
    runQuery,
    runInsert,
    mapRow,
    matchesWhereClause,
    applyOrderByAndPagination,
    persist,
  } = ctx;

  return {
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
            if (rows?.[0]) return mapRow(rows[0]);
          }
          if (clause.code) {
            const rows = await runQuery(
              "SELECT * FROM resellers WHERE code = ? LIMIT 1",
              [clause.code],
            );
            if (rows?.[0]) return mapRow(rows[0]);
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
      const now = new Date().toISOString();
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
          now,
          now,
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
  };
}

module.exports = {
  createUserRepository,
  createResellerRepository,
};
