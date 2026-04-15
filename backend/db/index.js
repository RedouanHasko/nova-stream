const path = require("path");
const { createFallbackAdapter } = require("./fallback-adapter");

function loadPrismaClient() {
  const attempts = [
    () => require("@prisma/client"),
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

  for (const attempt of attempts) {
    try {
      const mod = attempt();
      if (mod && (mod.PrismaClient || mod.default)) {
        const PrismaClient =
          mod.PrismaClient || mod.default.PrismaClient || mod.default;
        if (typeof PrismaClient === "function") {
          return new PrismaClient();
        }
      }
    } catch {
      // ignore and try the next load path
    }
  }

  return null;
}

const prismaClient = loadPrismaClient();

if (prismaClient) {
  console.log("Using generated Prisma Client from backend/db/index.js.");
  module.exports = prismaClient;
} else {
  console.log("Using refactored fallback adapter from backend/db/index.js.");
  module.exports = createFallbackAdapter();
}
