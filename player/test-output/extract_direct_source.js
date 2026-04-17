const fs = require("fs");
try {
  const s = fs.readFileSync("test-output/live_streams.json", "utf8");
  const m = s.match(/"direct_source":"(https?:\\\/\\\/[^\"]+)"/);
  if (m && m[1]) {
    console.log(m[1].replace(/\\\\\//g, "/"));
  } else {
    console.log("");
  }
} catch (e) {
  console.error("err", e.message || e);
}
