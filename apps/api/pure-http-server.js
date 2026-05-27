import http from 'http';

const server = http.createServer((req, res) => {
    if (req.url === '/test') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello from pure Node.js HTTP server\n');
    } else {
        res.writeHead(404);
        res.end('Not found\n');
    }
});

const PORT = 3007;
server.listen(PORT, 'localhost', () => {
    console.log(`Pure Node.js HTTP server listening on port ${PORT}`);
});

// Keep process alive
setInterval(() => {
    console.log('Server still running...');
}, 5000);
