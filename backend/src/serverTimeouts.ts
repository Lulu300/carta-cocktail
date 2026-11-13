import type { Server } from 'http';

/**
 * Lifts Node's limit on the time to receive a whole request (requestTimeout, 300 s by
 * default). A backup restore of up to 200 MB is streamed by nginx as it arrives
 * (frontend/nginx.conf.template), and on a slow uplink takes longer than 300 s: Node
 * answered 408 halfway. nginx only bounds the gap between two reads or writes, so the
 * backend sets no total limit either. Node has no per-route setting, so this applies to every route:
 * behind nginx nothing else changes, as nginx buffers the other request bodies and sends
 * them at once. headersTimeout (60 s by default) still cuts a client that sends its
 * headers too slowly.
 */
export function configureServerTimeouts(server: Server): void {
  server.requestTimeout = 0;
}
