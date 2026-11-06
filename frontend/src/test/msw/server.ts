import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** Fake backend shared by every test file, started in `src/test/setup.ts`. */
export const server = setupServer(...handlers);
