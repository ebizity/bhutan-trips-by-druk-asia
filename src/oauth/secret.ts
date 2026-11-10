/** Minimum length (in bytes) of the HS256 signing secret. */
export const MIN_JWT_SECRET_BYTES = 32;

/** Placeholder values that must never be accepted as a real signing secret. */
const KNOWN_WEAK_SECRETS = new Set(["dev-secret-change-me", "changeme", "secret"]);

/**
 * Validate and encode the OAuth access-token signing secret.
 *
 * Fails closed: there is deliberately no fallback value, because anyone who
 * knows the secret can mint access tokens for any user.
 */
export function loadJwtSecret(value: string | undefined): Uint8Array {
  const secret = (value ?? "").trim();
  const bytes = new TextEncoder().encode(secret);
  if (bytes.length < MIN_JWT_SECRET_BYTES || KNOWN_WEAK_SECRETS.has(secret)) {
    throw new Error(
      `JWT_SECRET must be set to a random value of at least ${MIN_JWT_SECRET_BYTES} bytes ` +
        "(e.g. `openssl rand -base64 48`).",
    );
  }
  return bytes;
}
