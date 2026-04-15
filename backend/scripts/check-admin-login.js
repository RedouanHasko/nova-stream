const prisma = require("../db");
const bcrypt = require("bcryptjs");

(async () => {
  try {
    const u = await prisma.user.findUnique({
      where: { email: "admin@example.com" },
    });
    console.log("user:", u ? { id: u.id, email: u.email, role: u.role } : null);
    if (!u) {
      console.error("No admin user found");
      process.exit(1);
    }
    const ok = await bcrypt.compare("password", u.password);
    console.log("password matches:", ok);
    await prisma.$disconnect();
  } catch (e) {
    console.error("error:", e);
    process.exit(1);
  }
})();
