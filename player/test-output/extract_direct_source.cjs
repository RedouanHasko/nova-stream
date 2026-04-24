const fs = require("fs");
try {
  const s = fs.readFileSync("test-output/live_streams.json", "utf8");
  const m = s.match(/"direct_source":"(https?:\\\/\\\/[^\"]+)"/);
  if (m && m[1]) {
    // m[1] contains an escaped JSON string fragment (eg. https:\/\/...),
    // so JSON.parse on a quoted value will unescape it correctly.
    try {
      console.log(JSON.parse('"' + m[1] + '"'));
    } catch (e) {
      console.log(m[1].replace(/\\\\\//g, "/"));
    }
  } else {
    console.log("");
  }
} catch (e) {
  console.error("err", e.message || e);
}
