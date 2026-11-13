import { describe, it, expect } from 'vitest';
import http from 'http';
import net from 'net';
import app from './app';
import { configureServerTimeouts } from './serverTimeouts';
import { listenWithShortTimeouts } from './test/helpers';

const SHORT_TIMEOUT_MS = 200;

/** Sends the start of a request without ending its headers, and resolves to the first line of the answer. */
function sendIncompleteHeaders(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let answer = '';
    socket.on('data', (chunk) => { answer += chunk; });
    socket.on('close', () => resolve(answer.split('\r\n')[0]));
    socket.on('error', reject);
    socket.write('GET /api/health HTTP/1.1\r\nHost: localhost\r\n');
  });
}

describe('server timeouts', () => {
  it('should set no limit on the time to receive a request, and keep 60 s for its headers', () => {
    const server = http.createServer(app);

    configureServerTimeouts(server);

    expect(server.requestTimeout).toBe(0);
    expect(server.headersTimeout).toBe(60_000);
  });

  it('should still answer 408 to a client that does not finish its headers in time', async () => {
    const server = await listenWithShortTimeouts(SHORT_TIMEOUT_MS);
    try {
      const startedAt = Date.now();

      const statusLine = await sendIncompleteHeaders(server.port);

      expect(statusLine).toBe('HTTP/1.1 408 Request Timeout');
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(SHORT_TIMEOUT_MS);
    } finally {
      server.close();
    }
  });
});
