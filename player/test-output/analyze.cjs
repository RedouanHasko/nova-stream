const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname);
const out = { timestamp: new Date().toISOString(), files: {} };

function tryParseJSON(buf) {
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch (e) {
    return null;
  }
}

for (const fname of fs.readdirSync(dir)) {
  try {
    const full = path.join(dir, fname);
    const stat = fs.statSync(full);
    if (!stat.isFile()) continue;
    const info = { size: stat.size };

    if (
      fname.endsWith(".body") ||
      fname.endsWith(".json") ||
      fname.endsWith(".xml")
    ) {
      const raw = fs.readFileSync(full);
      info.preview = raw.toString("utf8", 0, Math.min(8192, raw.length));
      if (fname.endsWith(".xml") || fname.endsWith(".xml.body")) {
        const txt = raw.toString("utf8");
        info.containsProgramme = txt.indexOf("<programme") !== -1;
        info.programmeCount = (txt.match(/<programme/gi) || []).length;
      } else {
        const parsed = tryParseJSON(raw);
        if (parsed !== null) {
          if (Array.isArray(parsed)) {
            info.type = "array";
            info.count = parsed.length;
            info.sample = parsed.slice(0, 10);
          } else if (typeof parsed === "object") {
            info.type = "object";
            // heuristics
            if (parsed.user_info) {
              info.xtream = true;
              info.user_info = parsed.user_info;
            }
            // if object seems like mapping of id->obj
            const values = Object.values(parsed).filter(
              (v) => v && typeof v === "object",
            );
            if (values.length > 0) {
              info.count = values.length;
              info.sample = values.slice(0, 10);
            }
          }
        } else {
          info.parseError = true;
        }
      }
    }
    out.files[fname] = info;
  } catch (err) {
    out.files[fname] = { error: String(err) };
  }
}

fs.writeFileSync(
  path.join(dir, "iptv_report.json"),
  JSON.stringify(out, null, 2),
);
console.log("Report written to iptv_report.json");
