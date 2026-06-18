import { Hono } from 'hono';
import type { Env } from '../types';
import { sign, verify } from '../utils/jwt';

const auth = new Hono<{ Bindings: Env }>();

// POST /api/auth/login —— 管理员登录
auth.post('/login', async (c) => {
  const { password } = await c.req.json();

  if (!password || password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: '密码错误' }, 401);
  }

  const token = await sign({ role: 'admin' }, c.env.JWT_SECRET, 24);
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
