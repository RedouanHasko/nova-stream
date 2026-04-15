(async () => {
  try {
    const prisma = require("../db");
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });
    console.log(JSON.stringify(users, null, 2));
    if (prisma && typeof prisma.$disconnect === "function")
      await prisma.$disconnect();
  } catch (e) {
    console.error("Error listing users:", e);
    process.exit(1);
  }
})();
