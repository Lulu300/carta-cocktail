import { z } from 'zod';

// Responses of routes/system.ts and routes/health.ts.

export const RequiredAction = z.strictObject({
  version: z.string(),
  /** Before or after the upgrade, as the release notes say: "before" ones can only be checked now. */
  when: z.enum(['before', 'after']),
  /** Text of the release notes, in English. */
  action: z.string(),
});

/** Required actions of the versions between `from` and `to`, until the admin confirms them. */
export const UpgradeNotice = z.strictObject({
  from: z.string(),
  to: z.string(),
  actions: z.array(RequiredAction),
});

/** The Docker healthcheck's answer: 200 with the version, or 503 when the database fails. */
export const HealthResponse = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ok'), version: z.string() }),
  z.strictObject({ status: z.literal('unavailable') }),
]);
