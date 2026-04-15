const http = require("http");

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  try {
    const loginData = JSON.stringify({
      email: process.env.ADMIN_EMAIL || "admin@example.com",
      password: process.env.ADMIN_PASSWORD || "password",
    });

    const loginOptions = {
      hostname: "localhost",
      port: 5000,
      path: "/api/auth/login",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(loginData),
      },
    };

    const loginRes = await request(loginOptions, loginData);
    console.log("login status", loginRes.status);
    console.log("login body", loginRes.body);

    const j = JSON.parse(loginRes.body || "{}");
    const token = j.token;
    if (!token) {
      console.error("no token received");
      process.exit(1);
    }

    const pricingOptions = {
      hostname: "localhost",
      port: 5000,
      path: "/api/pricing",
      method: "GET",
      headers: {
        Authorization: "Bearer " + token,
      },
    };

    const pricingRes = await request(pricingOptions);
    console.log("pricing status", pricingRes.status);
    console.log("pricing body", pricingRes.body);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
