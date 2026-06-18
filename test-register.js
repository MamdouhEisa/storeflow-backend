const http = require('http');
const data = JSON.stringify({ name: 'My Store', email: 'admin@test.com', phone: '01000000000', password: 'Password123!' });
const options = { hostname: 'localhost', port: 5001, path: '/api/auth/register-admin', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } };
const req = http.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log(res.statusCode, body));
});
req.on('error', e => console.error(e.message));
req.write(data);
req.end();
