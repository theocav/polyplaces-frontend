import http from 'http';

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Backend scaffold ready.' }));
});

server.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
