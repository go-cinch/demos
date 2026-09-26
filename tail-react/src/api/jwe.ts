type CredentialPurpose =
  | "login"
  | "register"
  | "password_change"
  | "password_reset";

export interface CredentialChallenge {
  challenge_id: string;
  expired_at: number;
  key_id: string;
  public_key: JsonWebKey;
}

const credentialTypes: Record<CredentialPurpose, string> = {
  login: "login+jwe",
  register: "register+jwe",
  password_change: "password+jwe",
  password_reset: "password-reset+jwe",
};

function base64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function utf8(value: string) {
  return new TextEncoder().encode(value);
}

export async function compactEncrypt(
  challenge: CredentialChallenge,
  purpose: CredentialPurpose,
  payload: Record<string, unknown>,
) {
  const protectedHeader = base64Url(
    utf8(
      JSON.stringify({
        alg: "RSA-OAEP-256",
        enc: "A256GCM",
        kid: challenge.key_id,
        typ: credentialTypes[purpose],
      }),
    ),
  );
  const rsaKey = await crypto.subtle.importKey(
    "jwk",
    challenge.public_key,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const contentKey = crypto.getRandomValues(new Uint8Array(32));
  const encryptedKey = new Uint8Array(
    await crypto.subtle.encrypt({ name: "RSA-OAEP" }, rsaKey, contentKey),
  );
  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = utf8(
    JSON.stringify({ challenge_id: challenge.challenge_id, ...payload }),
  );
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: utf8(protectedHeader),
        tagLength: 128,
      },
      aesKey,
      plaintext,
    ),
  );
  const tag = encrypted.slice(-16);
  const ciphertext = encrypted.slice(0, -16);
  return [
    protectedHeader,
    base64Url(encryptedKey),
    base64Url(iv),
    base64Url(ciphertext),
    base64Url(tag),
  ].join(".");
}

