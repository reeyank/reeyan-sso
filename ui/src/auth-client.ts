import { createAuthClient } from "better-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";

// The rest of the UI talks to Better Auth over plain fetch, but WebAuthn is not
// a plain fetch: the ceremony hands ArrayBuffers to navigator.credentials and
// needs base64url encoding on the way back. This client does that part.
export const authClient = createAuthClient({
  plugins: [passkeyClient()],
});

export type Passkey = {
  id: string;
  name?: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
};

// Browsers without WebAuthn (or on plain http beyond localhost) should not be
// shown passkey affordances at all.
export const passkeysSupported = () =>
  typeof window !== "undefined" &&
  typeof window.PublicKeyCredential !== "undefined" &&
  window.isSecureContext;

export async function conditionalUiAvailable() {
  try {
    return (
      passkeysSupported() &&
      (await window.PublicKeyCredential.isConditionalMediationAvailable?.()) ===
        true
    );
  } catch {
    return false;
  }
}

// The ceremony surfaces browser-level failures (cancelled prompt, no matching
// credential) that read badly if shown raw.
export function passkeyErrorMessage(error: unknown, fallback: string) {
  const name = (error as { name?: string } | null)?.name;
  if (name === "NotAllowedError") return "passkey prompt was dismissed";
  if (name === "InvalidStateError") return "this device already has a passkey";
  const message = (error as { message?: string } | null)?.message;
  return message ? message.toLowerCase() : fallback;
}
