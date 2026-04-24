function createPlaylistRepository({ runQuery, runInsert, mapRow, persist }) {
  return {
    findMany: async ({ where, orderBy } = {}) => {
      let sql = "SELECT * FROM playlists";
      const params = [];
      if (where && where.ownerResellerId !== undefined) {
        sql += " WHERE ownerResellerId = ?";
        params.push(where.ownerResellerId);
      }
      if (orderBy && orderBy.createdAt === "desc") {
        sql += " ORDER BY createdAt DESC";
      }
      const rows = await runQuery(sql, params);
      return rows.map(mapRow);
    },

    create: async ({ data }) => {
      const now = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO playlists (ownerResellerId, name, url, content, type, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          data.ownerResellerId || null,
          data.name,
          data.url || null,
          data.content || null,
          data.type || null,
          now,
          now,
        ],
      );
      const rows = await runQuery(
        "SELECT * FROM playlists WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },

    findUnique: async ({ where } = {}) => {
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
        params.push(where.id);
        await runQuery(
          `UPDATE playlists SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
      }

      const rows = await runQuery(
        "SELECT * FROM playlists WHERE id = ? LIMIT 1",
        [where.id],
      );
      return mapRow(rows[0]);
    },

    delete: async ({ where }) => {
      if (!where || !where.id) throw new Error("delete requires where.id");
      await runQuery("DELETE FROM playlists WHERE id = ?", [where.id]);
      persist();
      return { success: true };
    },
  };
}

function createDevicePlaylistRepository(
  { runQuery, runInsert, mapRow, persist },
  getAdapter,
) {
  return {
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
      const adapter = getAdapter();

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
      const rows = await getAdapter().devicePlaylist.findMany({
        where,
        include,
        orderBy,
        take: 1,
      });
      return rows[0] || null;
    },

    create: async ({ data }) => {
      const now = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO devicePlaylists (deviceId, playlistId, addedAt) VALUES (?, ?, ?)",
        [Number(data.deviceId), Number(data.playlistId), data.addedAt || now],
      );
      const rows = await runQuery(
        "SELECT * FROM devicePlaylists WHERE id = ? LIMIT 1",
        [id],
      );
      return mapRow(rows[0]);
    },

    deleteMany: async ({ where } = {}) => {
      const existing = await getAdapter().devicePlaylist.findMany({ where });
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

      if (clauses.length > 0) sql += ` WHERE ${clauses.join(" AND ")}`;
      await runQuery(sql, params);
      persist();
      return { count: existing.length };
    },
  };
}

function createDeviceRepository(
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
      const rows = await runQuery("SELECT * FROM devices");
      const mapped = rows
        .map(mapRow)
        .filter((row) => matchesWhereClause(row, where));
      return applyOrderByAndPagination(mapped, { orderBy, skip, take });
    },

    create: async ({ data }) => {
      const now = new Date().toISOString();
      const id = await runInsert(
        "INSERT INTO devices (mac, deviceKey, ownerResellerId, domainUrl, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          data.mac,
          data.deviceKey || null,
          data.ownerResellerId || null,
          data.domainUrl || null,
          data.status || "ACTIVE",
          now,
          now,
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
        device.activatedApps = await getAdapter().activatedApp.findMany({
          where: { deviceId: device.id },
        });
      }
      return device;
    },

    update: async ({ where, data }) => {
      if (!where || !where.id) throw new Error("update requires where.id");
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
        params.push(where.id);
        await runQuery(
          `UPDATE devices SET ${fields.join(", ")} WHERE id = ?`,
          params,
        );
      }

      const rows = await runQuery(
        "SELECT * FROM devices WHERE id = ? LIMIT 1",
        [where.id],
      );
      return mapRow(rows[0]);
    },

    delete: async ({ where }) => {
      if (!where || !where.id) throw new Error("delete requires where.id");
      await runQuery("DELETE FROM devices WHERE id = ?", [where.id]);
      persist();
      return { success: true };
    },
  };
}

function createActivatedAppRepository(
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
        "INSERT INTO activatedApps (deviceId, applicationId, appName, activationKind, duration, expiresAt, trialStartedAt, trialEndsAt, trialConsumedAt, status, activatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          data.deviceId,
          data.applicationId ?? null,
          data.appName,
          data.activationKind || "PAID",
          data.duration || "1_year",
          data.expiresAt || null,
          data.trialStartedAt || null,
          data.trialEndsAt || null,
          data.trialConsumedAt || null,
          data.status || "ACTIVE",
          data.activatedAt || now,
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
      if (data.activationKind !== undefined) {
        fields.push("activationKind = ?");
        params.push(data.activationKind);
      }
      if (data.duration !== undefined) {
        fields.push("duration = ?");
        params.push(data.duration);
      }
      if (data.expiresAt !== undefined) {
        fields.push("expiresAt = ?");
        params.push(data.expiresAt);
      }
      if (data.trialStartedAt !== undefined) {
        fields.push("trialStartedAt = ?");
        params.push(data.trialStartedAt);
      }
      if (data.trialEndsAt !== undefined) {
        fields.push("trialEndsAt = ?");
        params.push(data.trialEndsAt);
      }
      if (data.trialConsumedAt !== undefined) {
        fields.push("trialConsumedAt = ?");
        params.push(data.trialConsumedAt);
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
      const existing = await getAdapter().activatedApp.findMany({ where });
      for (const item of existing) {
        await getAdapter().activatedApp.update({
          where: { id: item.id },
          data,
        });
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
      if (orderBy && orderBy.activatedAt === "desc")
        sql += " ORDER BY activatedAt DESC";
      if (take) sql += ` LIMIT ${Number(take)}`;

      const rows = await runQuery(sql, params);
      return rows.map(mapRow);
    },

    findFirst: async ({ where } = {}) => {
      const rows = await getAdapter().activatedApp.findMany({ where, take: 1 });
      return rows[0] || null;
    },

    count: async ({ where } = {}) => {
      const rows = await getAdapter().activatedApp.findMany({ where });
      return rows.length;
    },

    deleteMany: async ({ where } = {}) => {
      const existing = await getAdapter().activatedApp.findMany({ where });
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
  };
}

module.exports = {
  createPlaylistRepository,
  createDevicePlaylistRepository,
  createDeviceRepository,
  createActivatedAppRepository,
};
