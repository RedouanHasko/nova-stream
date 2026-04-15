const path = require("path");
const prisma = require(path.join(__dirname, "..", "prisma"));
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const SECRET = process.env.JWT_SECRET || "dev-secret";

(async () => {
  try {
    const u = await prisma.user.findUnique({
      where: { email: "admin@example.com" },
    });
    if (!u) return console.error("no admin");
    const ok = await bcrypt.compare("password", u.password);
    console.log("pw", ok);
    const token = jwt.sign({ id: u.id, email: u.email, role: u.role }, SECRET, {
      expiresIn: "7d",
    });
    console.log("token:", token);
    await prisma.$disconnect();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
