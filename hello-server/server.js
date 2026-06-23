// Phase 1: minimal HelloWorld HTTP service for IPv6 link verification.
// Uses only Node.js built-in http module. Listens on :: (all IPv6, usually IPv4 too).

const http = require('http');

const PORT = 3000;
const HOST = '::';

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>JPLearn</title>
</head>
<body>
  <h1>Hello JPLearn</h1>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PAGE);
});

server.listen(PORT, HOST, () => {
  console.log(`Hello JPLearn server listening on [${HOST}]:${PORT}`);
});
