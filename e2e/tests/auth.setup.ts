import { test as setup } from '@playwright/test';
import { signInAsAdmin } from '../support/api';

// One sign-in for the whole run: the login route counts failed attempts (LOGIN_RATE_LIMIT, 10 by
// default), and the journeys only sign in through the interface when that is what they check.
setup('sign in as the admin', async ({ request }) => {
  await signInAsAdmin(request);
});
