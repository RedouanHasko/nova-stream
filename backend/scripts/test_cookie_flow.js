const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  try {
    const loginData = JSON.stringify({
      email: process.env.ADMIN_EMAIL || 'admin@example.com',
      password: process.env.ADMIN_PASSWORD || 'password',
    });

    const loginOptions = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginData),
      },
    };

    const loginRes = await request(loginOptions, loginData);
    console.log('login status', loginRes.status);
    console.log('login body', loginRes.body);
    console.log('login headers', loginRes.headers['set-cookie']);

    const cookies = loginRes.headers['set-cookie'];
    if (!cookies) {
      console.error('no cookies set');
      process.exit(1);
    }
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');

    const meOptions = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/me',
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
      },
    };

    const meRes = await request(meOptions);
    console.log('me status', meRes.status);
    console.log('me body', meRes.body);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
