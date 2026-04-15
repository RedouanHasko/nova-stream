const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const prisma = require("../db");
const { auth, requireRole } = require("../middleware/auth");

const uploadsDir = path.resolve(__dirname, "..", "uploads");

function resolveManagedUploadPath(fileUrl) {
  if (!fileUrl || typeof fileUrl !== "string") return null;

  let pathname = fileUrl.trim();
  try {
    pathname = new URL(fileUrl, "http://localhost").pathname;
  } catch {
    return null;
  }

  if (!pathname.startsWith("/uploads/")) return null;

  const relativePath = pathname.replace(/^\/uploads\//, "");
  if (!relativePath) return null;

  const absolutePath = path.resolve(uploadsDir, relativePath);
  const uploadsPrefix = `${uploadsDir}${path.sep}`;

  if (absolutePath !== uploadsDir && !absolutePath.startsWith(uploadsPrefix)) {
    return null;
  }

  return absolutePath;
}

async function deleteManagedUploadIfUnused(fileUrl, excludedApplicationId) {
  const filePath = resolveManagedUploadPath(fileUrl);
  if (!filePath) return false;

  const apps = await prisma.application.findMany();
  const isStillReferenced = apps.some((app) => {
    if (Number(app.id) === Number(excludedApplicationId)) return false;
    return resolveManagedUploadPath(app.logoUrl) === filePath;
  });

  if (isStillReferenced) return false;

  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

// Public app catalog for the client landing page
router.get("/public", async (req, res) => {
  try {
    const apps = await prisma.application.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
    });
    res.json(apps);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// List applications
router.get("/", auth, async (req, res) => {
  try {
    const apps = await prisma.application.findMany({
      orderBy: { name: "asc" },
    });
    res.json(apps);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Create application (superadmin only)
router.post("/", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const { name, logoUrl, description, downloadUrl } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const app = await prisma.application.create({
      data: { name, logoUrl, description, downloadUrl },
    });
    res.json(app);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Update application (superadmin only)
router.put("/:id", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, logoUrl, description, downloadUrl, status } = req.body;

    const existing = await prisma.application.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Application not found" });
    }

    const previousLogoUrl = existing.logoUrl;
    const updated = await prisma.application.update({
      where: { id },
      data: { name, logoUrl, description, downloadUrl, status },
    });

    if (previousLogoUrl && previousLogoUrl !== updated.logoUrl) {
      try {
        await deleteManagedUploadIfUnused(previousLogoUrl, id);
      } catch (cleanupError) {
        console.warn(
          `Failed to clean up old application logo for app ${id}:`,
          cleanupError,
        );
      }
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete application (superadmin only)
router.delete("/:id", auth, requireRole("superadmin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const app = await prisma.application.findUnique({ where: { id } });
    if (!app) {
      return res.status(404).json({ error: "Application not found" });
    }

    // Be careful with foreign keys if we have activations referencing this app
    // We'll allow deletion for now if no activations exist, or prompt them.
    const activations = await prisma.activatedApp.count({
      where: { applicationId: id },
    });
    if (activations > 0) {
      return res.status(400).json({
        error:
          "Cannot delete app with existing activations. Deactivate it instead.",
      });
    }

    await prisma.application.delete({ where: { id } });

    if (app.logoUrl) {
      try {
        await deleteManagedUploadIfUnused(app.logoUrl, id);
      } catch (cleanupError) {
        console.warn(
          `Failed to remove logo file for deleted app ${id}:`,
          cleanupError,
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
