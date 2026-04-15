function createParentChangeRequestRepository({ runQuery, runInsert, mapRow }) {
  return {
    findMany: async ({ orderBy } = {}) => {
      let sql = "SELECT * FROM parentChangeRequests";
      if (orderBy && orderBy.createdAt === "desc") {
        sql += " ORDER BY createdAt DESC";
      }
      const rows = await runQuery(sql);
      return rows.map(mapRow);
    },

    create: async ({ data }) => {
      const now = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO parentChangeRequests (resellerId, newParentId, status, reason, createdAt, processedAt) VALUES (?, ?, ?, ?, ?, ?)",
        [
          data.resellerId || null,
          data.newParentId || null,
          data.status || "PENDING",
          data.reason || null,
          now,
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
        params.push(where.id);
        await runQuery(
          `UPDATE parentChangeRequests SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
      }

      const rows = await runQuery(
        "SELECT * FROM parentChangeRequests WHERE id = ? LIMIT 1",
        [where.id],
      );
      return mapRow(rows[0]);
    },
  };
}

function createPhoneVerificationCodeRepository(
  {
    runQuery,
    runInsert,
    mapRow,
    matchesWhereClause,
    applyOrderByAndPagination,
    persist,
  },
  getAdapter,
) {
  return {
    findMany: async ({ where, orderBy, skip, take } = {}) => {
      const rows = await runQuery("SELECT * FROM phoneVerificationCodes");
      const mapped = rows
        .map(mapRow)
        .filter((row) => matchesWhereClause(row, where));
      return applyOrderByAndPagination(mapped, { orderBy, skip, take });
    },

    findFirst: async ({ where, orderBy } = {}) => {
      const rows = await getAdapter().phoneVerificationCode.findMany({
        where,
        orderBy,
        take: 1,
      });
      return rows[0] || null;
    },

    create: async ({ data }) => {
      const now = new Date().toISOString();
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
            : data.createdAt || now,
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
      const existing = await getAdapter().phoneVerificationCode.findMany({
        where,
      });
      for (const item of existing) {
        await runQuery("DELETE FROM phoneVerificationCodes WHERE id = ?", [
          item.id,
        ]);
      }
      if (existing.length > 0) persist();
      return { count: existing.length };
    },
  };
}

function createNotificationRepository(
  {
    runQuery,
    runInsert,
    mapRow,
    matchesWhereClause,
    applyOrderByAndPagination,
    persist,
  },
  getAdapter,
) {
  return {
    create: async ({ data }) => {
      const now = new Date().toISOString();
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
          data.createdAt || now,
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
      const existing = await getAdapter().notification.findMany({ where });
      for (const item of existing) {
        await getAdapter().notification.update({
          where: { id: item.id },
          data,
        });
      }
      return { count: existing.length };
    },

    deleteMany: async ({ where } = {}) => {
      const existing = await getAdapter().notification.findMany({ where });
      for (const item of existing) {
        await runQuery("DELETE FROM notifications WHERE id = ?", [item.id]);
      }
      if (existing.length > 0) persist();
      return { count: existing.length };
    },
  };
}

function createCreditTransactionRepository(
  {
    runQuery,
    runInsert,
    mapRow,
    matchesWhereClause,
    applyOrderByAndPagination,
    persist,
  },
  getAdapter,
) {
  return {
    create: async ({ data }) => {
      const now = new Date().toISOString();
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
          now,
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
        params.push(where.id);
        await runQuery(
          `UPDATE creditTransactions SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
        persist();
      }

      const rows = await runQuery(
        "SELECT * FROM creditTransactions WHERE id = ? LIMIT 1",
        [where.id],
      );
      return mapRow(rows[0]);
    },

    deleteMany: async ({ where } = {}) => {
      const existing = await getAdapter().creditTransaction.findMany({ where });
      for (const item of existing) {
        await runQuery("DELETE FROM creditTransactions WHERE id = ?", [
          item.id,
        ]);
      }
      if (existing.length > 0) persist();
      return { count: existing.length };
    },
  };
}

module.exports = {
  createParentChangeRequestRepository,
  createPhoneVerificationCodeRepository,
  createNotificationRepository,
  createCreditTransactionRepository,
};
