import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

// index.ts starts the server and registers process handlers as soon as it is
// imported, so these tests run it in a child process, as `npm run dev` does.

const BACKEND_DIR = path.resolve(__dirname, '..');
const TSX = path.join(BACKEND_DIR, 'node_modules', '.bin', 'tsx');

interface ServerProcess {
  child: ChildProcess;
  output: () => string;
  exitCode: Promise<number | null>;
}

let tmpDir: string;

function startServer(port: number): ServerProcess {
  const child = spawn(TSX, ['src/index.ts'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: `file:${path.join(tmpDir, 'server.db')}`,
      JWT_SECRET: '0123456789abcdef0123456789abcdef',
    },
  });
  let output = '';
  child.stdout?.on('data', (chunk) => { output += chunk; });
  child.stderr?.on('data', (chunk) => { output += chunk; });
  const exitCode = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  return { child, output: () => output, exitCode };
}

async function waitForOutput(server: ServerProcess, text: string): Promise<void> {
  while (!server.output().includes(text)) {
    if (server.child.exitCode !== null) {
      throw new Error(`Server exited before printing "${text}":\n${server.output()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function occupyPort(): Promise<net.Server> {
  const blocker = net.createServer();
  await new Promise<void>((resolve) => blocker.listen(0, resolve));
  return blocker;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-server-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('server process', () => {
  it('should close the server and exit with code 0 on SIGTERM', async () => {
    const server = startServer(0);
    await waitForOutput(server, 'API running on port');

    server.child.kill('SIGTERM');

    expect(await server.exitCode).toBe(0);
    expect(server.output()).toContain('SIGTERM received, shutting down');
    // The last connection closed cleanly, so SQLite removed the WAL files
    expect(fs.readdirSync(tmpDir)).toEqual(['server.db']);
  });

  it('should exit with code 1 when the port is already in use', async () => {
    const blocker = await occupyPort();
    const port = (blocker.address() as net.AddressInfo).port;
    try {
      const server = startServer(port);

      expect(await server.exitCode).toBe(1);
      expect(server.output()).toContain(`Cannot listen on port ${port}`);
      expect(server.output()).not.toContain('API running on port');
    } finally {
      blocker.close();
    }
  });
});
