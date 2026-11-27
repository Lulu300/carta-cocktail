import { parentPort } from 'node:worker_threads';
import { type FromWorker, GuestRun, type HostLink, type ToWorker } from './sandboxGuest';

/*
 * Entry point of the worker thread of one Code Mode run (sandbox.ts starts it): it hands the
 * messages of the main thread to GuestRun and posts back what the guest does. Its logic is in
 * sandboxGuest.ts, tested in the test process.
 */

const port = parentPort;
if (!port) throw new Error('sandboxWorker runs as a worker thread only');

const post = (message: FromWorker) => port.postMessage(message);
const link: HostLink = {
  call: (id, name, argumentJson) => post({ type: 'call', id, name, argumentJson }),
  idle: (answered) => post({ type: 'idle', answered }),
  done: (outcome, memoryBytes) => post({ type: 'done', outcome, memoryBytes }),
};

let run: GuestRun | undefined;
port.on('message', (message: ToWorker) => {
  if (message.type === 'run') {
    // A failure here ends the worker, which the main thread reports
    void GuestRun.start(message.options, link).then((started) => (run = started));
  } else {
    run?.answer(message.id, message.outcomeJson);
  }
});
post({ type: 'ready' });
