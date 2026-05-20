const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const FILE_PATH = path.join(__dirname, 'JobMonitor_Optimized.zip');

const server = http.createServer((req, res) => {
    if (req.url === '/JobMonitor_Optimized.zip') {
        const stat = fs.statSync(FILE_PATH);
        res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Length': stat.size,
            'Content-Disposition': 'attachment; filename=JobMonitor_Optimized.zip'
        });
        const readStream = fs.createReadStream(FILE_PATH);
        readStream.pipe(res);
    } else {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log("Server is running on port " + PORT);
});
