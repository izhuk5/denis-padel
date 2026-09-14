/* Brute-force brake for the login form.

   A single shared password with unlimited guesses is a password that gets
   guessed, so failures are counted per client address and the form locks for
   a while once there are too many.

   The counter lives in memory. On a serverless host each cold start begins
   with an empty map and concurrent instances count separately, so this slows
   an attacker down rather than stopping one outright — the real defence is
   the length of the generated password. Moving the counter to the database
   alongside the content is the upgrade path. */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 8;

const attempts = new Map();

function prune(now) {
  for (const [key, entry] of attempts) {
    if (now - entry.first > WINDOW_MS) attempts.delete(key);
  }
}

export function throttle(clientAddress) {
  const key = clientAddress ?? "unknown";
  const now = Date.now();

  prune(now);

  const entry = attempts.get(key);
  const active = entry && now - entry.first <= WINDOW_MS ? entry : null;
  const failures = active ? active.count : 0;

  return {
    allowed: failures < MAX_FAILURES,
    retryInMinutes: active ? Math.max(1, Math.ceil((WINDOW_MS - (now - active.first)) / 60000)) : 0,

    fail() {
      if (active) active.count += 1;
      else attempts.set(key, { first: now, count: 1 });
    },

    reset() {
      attempts.delete(key);
    },
  };
}
