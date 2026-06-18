// 轻量 JWT 实现（CF Workers 无需外部依赖）
// 使用 Web Crypto API

const encoder = new TextEncoder();

async function base64UrlEncode(data: ArrayBuffer | string): Promise<string> {
  const buf = typeof data === 'string' ? encoder.encode(data) : data;
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function sign(payload: object, secret: string, expiresInHours = 24): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInHours * 3600 };

  const headerB64 = await base64UrlEncode(JSON.stringify(header));
  const payloadB64 = await base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${headerB64}.${payloadB64}`;

  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const sigB64 = await base64UrlEncode(sig);

  return `${data}.${sigB64}`;
}

export async function verify(token: string, secret: string): Promise<object | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const data = `${parts[0]}.${parts[1]}`;
  const key = await getKey(secret);
  const sigBuf = await base64UrlDecode(parts[2]);

  // 用 base64url 解码签名
  const sigStr = parts[2].replace(/-/g, '+').replace(/_/g, '/');
  const sigBinary = atob(sigStr);
  const sigBytes = new Uint8Array(sigBinary.length);
  for (let i = 0; i < sigBinary.length; i++) sigBytes[i] = sigBinary.charCodeAt(i);

  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data));
  if (!valid) return null;

  const payload = JSON.parse(base64UrlDecode(parts[1]));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return null;

  return payload;
}
