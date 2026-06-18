import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { verify } from '../utils/jwt';

// 管理员认证中间件 — 校验 Authorization Bearer token
export const adminAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const authHeader = c.req.header('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return c.json({ error: '未登录' }, 401);
  }

  const payload = await verify(match[1], c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: 'Token 无效或已过期' }, 401);
  }

  c.set('admin', payload as never);
  await next();
};
