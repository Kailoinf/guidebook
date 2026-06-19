// PBKDF2 密码哈希 / 验证（仅使用 Web Crypto API）
// 格式：salt:hash（均为 hex），100000 迭代，SHA-256，salt 16 字节，派生 256 位

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function getKeyMaterial(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
}

/**
 * 生成 PBKDF2 密码哈希
 * @returns `salt:hash` 格式（均为 hex）
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await getKeyMaterial(password);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );

  const hash = new Uint8Array(derivedBits);
  return `${bytesToHex(salt)}:${bytesToHex(hash)}`;
}

/**
 * 验证密码是否匹配存储的哈希
 * @param password 明文密码
 * @param stored 存储的 `salt:hash` 字符串
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const colonIndex = stored.indexOf(':');
  if (colonIndex === -1) return false;

  const saltHex = stored.substring(0, colonIndex);
  const hashHex = stored.substring(colonIndex + 1);

  if (!saltHex || !hashHex) return false;

  const salt = hexToBytes(saltHex);
  const storedHash = hexToBytes(hashHex);

  const keyMaterial = await getKeyMaterial(password);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );

  const derivedHash = new Uint8Array(derivedBits);

  // 时间恒定比较（避免 timing attack）
  if (derivedHash.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < derivedHash.length; i++) {
    diff |= derivedHash[i] ^ storedHash[i];
  }
  return diff === 0;
}
