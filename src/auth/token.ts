import { createHmac, timingSafeEqual } from "node:crypto";

interface TokenPayload {
  sub: "cli";
  iat: number;
  exp: number;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signInput(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function issueCliToken(secret: string, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: "cli",
    iat: now,
    exp: now + ttlSeconds
  };

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signedData = `${header}.${body}`;
  const signature = signInput(signedData, secret);
  return `${signedData}.${signature}`;
}

export function verifyCliToken(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [headerB64, payloadB64, signature] = parts;
  const signedData = `${headerB64}.${payloadB64}`;
  const expectedSignature = signInput(signedData, secret);

  try {
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      return false;
    }
  } catch {
    return false;
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64)) as TokenPayload;
  } catch {
    return false;
  }

  if (payload.sub !== "cli") {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  return payload.exp > now;
}
