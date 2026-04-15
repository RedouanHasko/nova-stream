const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { auth, requireRole } = require("../middleware/auth");

const uploadDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
};

function hasValidImageSignature(buffer, mimeType) {
  if (!buffer || buffer.length < 12) return false;

  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }

  if (mimeType === "image/gif") {
    return (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38
    );
  }

  if (mimeType === "image/webp") {
    return (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    );
  }

  return false;
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const expectedExtensions = ALLOWED_TYPES[file.mimetype];
    if (
      Array.isArray(expectedExtensions) &&
      expectedExtensions.includes(extension)
    ) {
      return cb(null, true);
    }

    cb(new Error("Only JPG, PNG, GIF, and WEBP images are allowed"), false);
  },
  limits: {
    files: 1,
    fileSize: 2 * 1024 * 1024,
  },
});

router.post("/", auth, requireRole("superadmin"), (req, res) => {
  upload.single("image")(req, res, async (err) => {
    try {
      if (err) {
        const isSizeError = err?.code === "LIMIT_FILE_SIZE";
        return res.status(400).json({
          error: isSizeError
            ? "Image must be 2MB or smaller"
            : err.message || "Upload failed",
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (!hasValidImageSignature(req.file.buffer, req.file.mimetype)) {
        return res
          .status(400)
          .json({ error: "Uploaded file is not a valid image" });
      }

      const extension = ALLOWED_TYPES[req.file.mimetype]?.[0] || ".bin";
      const fileName = `image-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;
      const targetPath = path.join(uploadDir, fileName);

      await fs.promises.writeFile(targetPath, req.file.buffer, { flag: "wx" });

      return res.json({ url: `/uploads/${fileName}` });
    } catch (writeError) {
      console.error("upload error", writeError);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });
});

module.exports = router;
