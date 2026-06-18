import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import auth from './routes/auth';
import devices from './routes/devices';
import files from './routes/files';

const app = new Hono<{ Bindings: Env }>();

// CORS —— 允许前端域名访问
app.use('/api/*', cors({
  origin: (_, c) => c.env.FRONTEND_URL,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// 路由挂载
app.route('/api/auth', auth);
app.route('/api/devices', devices);
app.route('/api/files', files);

// 健康检查
app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

// 404
app.notFound((c) => c.json({ error: '接口不存在' }, 404));

// 全局错误处理
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: '服务器内部错误' }, 500);
});

export default app;
