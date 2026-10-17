import http from 'node:http';
import path from 'node:path';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isWithin } from './scratch';
// Fixed built assets only; URL queries (including rpcToken) are never logged.
export async function startRenderer(root: string, port = 5173) {
    root = await realpath(root);
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
    const server = http.createServer(async (req, res) => {
        try {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                res.writeHead(405);
                res.end();
                return;
            }
            const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
            const filename = await realpath(path.join(root, pathname === '/' ? 'index.html' : pathname));
            if (!isWithin(root, filename) || !(await stat(filename)).isFile())
                throw new Error();
            const data = await readFile(filename);
            res.writeHead(200, { 'Content-Type': types[path.extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
            res.end(req.method === 'HEAD' ? undefined : data);
        }
        catch {
            res.writeHead(404);
            res.end();
        }
    });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    return server;
}
if (require.main === module)
    startRenderer('/target/apps/renderer/dist').catch(() => { process.exitCode = 3; });
