const jwt = require("jsonwebtoken");
const prisma = require("../db");
require("dotenv").config();
const { COOKIE_NAME, getJwtSecret } = require("../lib/auth-config");

const SECRET = getJwtSecret();

async function auth(req, res, next) {
  // Support token in Authorization header or httpOnly cookie named 'token'
  let token = null;
  const header = req.headers && req.headers.authorization;
  if (header) {
    const parts = header.split(" ");
    if (parts.length === 2) token = parts[1];
  }
  if (!token && req.cookies && req.cookies[COOKIE_NAME]) {
    token = req.cookies[COOKIE_NAME];
  }

  if (!token)
    return res.status(401).json({ error: "Authorization token missing" });

  try {
    const payload = jwt.verify(token, SECRET);
    // fetch fresh user from DB to ensure up-to-date role/reseller mapping
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        resellerId: true,
      },
    });
    if (!user) return res.status(401).json({ error: "Invalid token" });
    req.user = user;
    next();
  } catch (err) {
    console.error("auth verify error", err && err.message);
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const allowed = allowedRoles.map((r) => r.toString().toLowerCase());
    const role = (req.user.role || "").toString().toLowerCase();
    if (!allowed.includes(role))
      return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

module.exports = { auth, requireRole };
