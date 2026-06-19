#!/usr/bin/env node
// 生成 PBKDF2 密码哈希供 ADMIN_PASSWORD_HASH 环境变量使用
// 用法: node scripts/generate-hash.mjs <密码>
// 格式: salt:hash（均为 hex），100000 迭代，SHA-256

import { webcrypto } from 'node:crypto';

const crypto = webcrypto;

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

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

const password = process.argv[2];

if (!password) {
  console.error('用法: node scripts/generate-hash.mjs <密码>');
  process.exit(1);
}

const hash = await hashPassword(password);
console.log(hash);
