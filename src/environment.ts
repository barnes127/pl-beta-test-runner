import { readFile } from 'node:fs/promises';
import net from 'node:net';
export async function environmentReport() {
    const status = await readFile('/proc/self/status', 'utf8');
    const number = (key: string) => Number(status.match(new RegExp(`^${key}:\\s*(\\d+)`, 'm'))?.[1] ?? -1);
    const tcp = await new Promise<string>(resolve => {
        const server = net.createServer();
        server.once('error', (error: NodeJS.ErrnoException) => resolve(error.code === 'EPERM' ? 'DENIED_EPERM' : 'UNAVAILABLE'));
        server.listen(0, '127.0.0.1', () => server.close(() => resolve('BOUND_AND_CLOSED')));
    });
    return { status: 'DIAGNOSTIC_ONLY', tcp, seccompMode: number('Seccomp'), noNewPrivileges: number('NoNewPrivs'), attribution: 'HOST_COMPARISON_REQUIRED', targetLaunched: false };
}
