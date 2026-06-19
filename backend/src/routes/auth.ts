import { Hono } from 'hono';
import type { Env } from '../types';
import { sign, verify } from '../utils/jwt';
import { verifyPassword } from '../utils/password';

const auth = new Hono<{ Bindings: Env }>();

// 速率限制参数
const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 300; // 5 分钟

// 检查是否被速率限制（D1）
async function checkRateLimit(db: D1Database, ip: string, now: number) {
  const row = await db
    .prepare('SELECT attempts, last_attempt FROM login_attempts WHERE ip = ?')
    .bind(ip)
    .first<{ attempts: number; last_attempt: number }>();

  if (!row) {
    // 首次失败，插入记录
    await db
      .prepare('INSERT INTO login_attempts (ip, attempts, last_attempt) VALUES (?, 1, ?)')
      .bind(ip, now)
      .run();
    return { blocked: false };
  }

  const elapsed = now - row.last_attempt;

  if (elapsed > WINDOW_SECONDS) {
    // 时间窗口已过，重置计数
    await db
      .prepare('UPDATE login_attempts SET attempts = 1, last_attempt = ? WHERE ip = ?')
      .bind(now, ip)
      .run();
    return { blocked: false };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    return { blocked: true, retryAfter: WINDOW_SECONDS - elapsed };
  }

  // 递增失败次数
  await db
    .prepare('UPDATE login_attempts SET attempts = attempts + 1, last_attempt = ? WHERE ip = ?')
    .bind(now, ip)
    .run();
  return { blocked: false };
}

// 清除失败记录（登录成功后调用）
async function clearRateLimit(db: D1Database, ip: string) {
  await db
    .prepare('DELETE FROM login_attempts WHERE ip = ?')
    .bind(ip)
    .run();
}

// POST /api/auth/login —— 管理员登录
auth.post('/login', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ||
             c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
             c.req.header('X-Real-IP') ||
             '0.0.0.0';
  const now = Math.floor(Date.now() / 1000);

  const { password } = await c.req.json();

  if (!c.env.ADMIN_PASSWORD_HASH) {
    return c.json({ error: '服务器未配置管理员密码哈希，请联系管理员' }, 500);
  }

  if (!password || !(await verifyPassword(password, c.env.ADMIN_PASSWORD_HASH))) {
    // 登录失败 —— 检查并更新速率限制
    const { blocked, retryAfter } = await checkRateLimit(c.env.DB, ip, now);

    if (blocked) {
      return c.json({
        error: '登录尝试过多，请稍后再试',
        retryAfter,
      }, 429);
    }

    return c.json({ error: '密码错误' }, 401);
  }

  // 登录成功 —— 清除失败记录
  await clearRateLimit(c.env.DB, ip);

  const token = await sign({ sub: 'admin', role: 'admin' }, c.env.JWT_SECRET, 24);
  return c.json({ token, message: '登录成功' });
});

// GET /api/auth/verify —— 验证 token 是否有效
auth.get('/verify', async (c) => {
  const authHeader = c.req.header('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return c.json({ valid: false });
  }

  const payload = await verify(match[1], c.env.JWT_SECRET);
  return c.json({ valid: !!payload });
});

export default auth;
