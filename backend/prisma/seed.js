const bcrypt = require("bcryptjs");
const { execSync } = require("child_process");
require("dotenv").config();

// Ensure Prisma client is generated before importing it (helps when switching providers)
try {
  execSync("npx prisma generate --schema=./prisma/schema.prisma", {
    stdio: "inherit",
  });
} catch (e) {
  // continue; generate may have already run
}

let PrismaImport;
try {
  PrismaImport = require("../prisma-client");
} catch (e) {
  // try direct generated client first
  try {
    const path = require("path");
    PrismaImport = require(
      path.join(process.cwd(), "node_modules", ".prisma", "client", "index.js"),
    );
  } catch (e2) {
    try {
      PrismaImport = require("@prisma/client");
    } catch (e3) {
      PrismaImport = null;
    }
  }
}
let prisma = null;
if (PrismaImport) {
  const { PrismaClient } = PrismaImport;
  prisma = new PrismaClient();
} else {
  // Fallback to lightweight adapter when Prisma client is not available
  try {
    prisma = require("../db");
    console.log("Using lightweight SQLite adapter for seeding.");
  } catch (err) {
    throw new Error(
      "Could not load Prisma client or adapter. Run `npx prisma generate` or install adapter.",
    );
  }
}

async function main() {
  // Admin user
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "password";
  const hashed = await bcrypt.hash(adminPassword, 10);

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashed,
        name: "Administrator",
        role: "superadmin",
      },
    });
    console.log("Created admin:", adminEmail);
  } else {
    console.log("Admin exists:", adminEmail);
  }

  // Sample reseller
  const resellerEmail = "reseller@example.com";
  const existingReseller = await prisma.reseller.findUnique({
    where: { email: resellerEmail },
  });
  if (!existingReseller) {
    const createdReseller = await prisma.reseller.create({
      data: {
        code: "RES-001",
        name: "Demo Reseller",
        email: resellerEmail,
        credits: 1000,
      },
    });
    console.log("Created reseller:", resellerEmail);

    // Create a linked user for this reseller
    const resellerUserEmail = resellerEmail;
    const existingResUser = await prisma.user.findUnique({
      where: { email: resellerUserEmail },
    });
    if (!existingResUser) {
      const resellerHashed = await bcrypt.hash(
        process.env.RESELLER_PASSWORD || "reseller123",
        10,
      );
      await prisma.user.create({
        data: {
          email: resellerUserEmail,
          password: resellerHashed,
          name: "Demo Reseller",
          role: "reseller",
          resellerId: createdReseller.id,
        },
      });
      console.log("Created reseller user:", resellerUserEmail);
    }
  } else {
    console.log("Reseller exists:", resellerEmail);
  }

  // Ensure a sub-reseller and a couple of sample users exist for testing
  try {
    const mainReseller = await prisma.reseller.findUnique({
      where: { email: resellerEmail },
    });
    if (mainReseller) {
      const subEmail = process.env.SUBRESELLER_EMAIL || "sub@example.com";
      const subPassword = process.env.SUBRESELLER_PASSWORD || "sub123";
      const existingSub = await prisma.user.findUnique({
        where: { email: subEmail },
      });
      if (!existingSub) {
        const subHashed = await bcrypt.hash(subPassword, 10);
        await prisma.user.create({
          data: {
            email: subEmail,
            password: subHashed,
            name: "Sub Reseller",
            role: "subreseller",
            resellerId: mainReseller.id,
          },
        });
        console.log("Created sub-reseller user:", subEmail);
      } else {
        console.log("Sub-reseller exists:", subEmail);
      }

      // Create a couple of sample users under the same reseller for UI lists
      const sampleUsers = [
        {
          email: "alice@example.com",
          name: "Alice Tester",
          password: process.env.SAMPLE_PASSWORD || "user123",
        },
        {
          email: "bob@example.com",
          name: "Bob Tester",
          password: process.env.SAMPLE_PASSWORD || "user123",
        },
      ];

      for (const u of sampleUsers) {
        const exists = await prisma.user.findUnique({
          where: { email: u.email },
        });
        if (!exists) {
          const h = await bcrypt.hash(u.password, 10);
          await prisma.user.create({
            data: {
              email: u.email,
              password: h,
              name: u.name,
              role: "subreseller",
              resellerId: mainReseller.id,
            },
          });
          console.log("Created sample user:", u.email);
        } else {
          console.log("Sample user exists:", u.email);
        }
      }
    } else {
      console.log("Main reseller not found; skipping sample user creation.");
    }
  } catch (e) {
    console.warn("Error creating sample users:", e.message || e);
  }

  // Pricing plan
  const planName = "Starter";
  const existingPlan = await prisma.pricingPlan.findFirst({
    where: { name: planName },
  });
  if (!existingPlan) {
    await prisma.pricingPlan.create({
      data: {
        name: planName,
        price: 9.99,
        currency: "USD",
        features: "Basic plan",
        credits: 100,
      },
    });
    console.log("Created pricing plan:", planName);
  } else {
    console.log("Pricing plan exists:", planName);
  }

  // Sample API integration (keys + webhook)
  const integrationName = "Default API";
  const existingIntegration = await prisma.apiIntegration.findFirst({
    where: { name: integrationName },
  });
  if (!existingIntegration) {
    await prisma.apiIntegration.create({
      data: {
        name: integrationName,
        provider: "local",
        apiKey: process.env.DEFAULT_API_KEY || "sk_live_demo_12345",
        webhookUrl:
          process.env.DEFAULT_WEBHOOK_URL || "https://example.com/webhooks",
      },
    });
    console.log("Created api integration:", integrationName);
  } else {
    console.log("Api integration exists:", integrationName);
  }

  // Default system settings (app catalog, app name, support email)
  const defaultSettings = [
    {
      key: "app_catalog",
      value: JSON.stringify([
        { id: "ibo_pro", name: "IboPlayer Pro", price: 1 },
        { id: "mac_player", name: "MacPlayer", price: 1 },
        { id: "smart_one", name: "SmartOne IPTV", price: 1 },
        { id: "flix_iptv", name: "Flix IPTV", price: 1 },
        { id: "set_iptv", name: "SET IPTV", price: 1 },
        { id: "net_iptv", name: "Net IPTV", price: 1 },
      ]),
    },
    { key: "app_name", value: "StreamPanel" },
    { key: "support_email", value: "support@example.com" },
  ];

  for (const setting of defaultSettings) {
    try {
      await prisma.systemSetting.upsert({
        where: { key: setting.key },
        create: { key: setting.key, value: setting.value },
        update: {},
      });
      console.log("Ensured setting:", setting.key);
    } catch (e) {
      console.warn("Setting upsert failed for", setting.key, e.message || e);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
