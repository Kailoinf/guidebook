import { Hono } from 'hono';
import type { Env, Device } from '../types';
import { adminAuth } from '../middleware/auth';

const devices = new Hono<{ Bindings: Env }>();

// 生成 UUID
function uuid(): string {
  return crypto.randomUUID();
}

// ============================================
//  公开接口：扫码查看（无需认证）
// ============================================

// GET /api/devices/:id —— 扫码查看设备详情
devices.get('/:id', async (c) => {
  const id = c.req.param('id');
  const device = await c.env.DB.prepare('SELECT * FROM devices WHERE id = ?')
    .bind(id)
    .first<Device>();

  if (!device) {
    return c.json({ error: '设备不存在' }, 404);
  }

  // 同时获取附件列表
  const attachments = await c.env.DB.prepare(
    'SELECT id, filename, mime_type, size FROM attachments WHERE device_id = ?'
  ).bind(id).all();

  return c.json({ device, attachments: attachments.results });
});

// ============================================
//  管理员接口（需要 JWT 认证）
// ============================================

// GET /api/devices —— 列表（管理员）
devices.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, model, category, location, created_at, updated_at FROM devices ORDER BY updated_at DESC'
  ).all();
  return c.json({ devices: results });
});

// POST /api/devices —— 新建设备
devices.post('/', adminAuth, async (c) => {
  const body = await c.req.json();
  const id = uuid();

  const { name, model, category, location, purchase_date, description, usage_guide, precautions, maintenance } = body;

  if (!name) {
    return c.json({ error: '设备名称不能为空' }, 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO devices (id, name, model, category, location, purchase_date, description, usage_guide, precautions, maintenance)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, name, model || '', category || '', location || '', purchase_date || '', description || '', usage_guide || '', precautions || '', maintenance || '')
    .run();

  return c.json({ id, message: '创建成功' }, 201);
});

// PUT /api/devices/:id —— 更新设备
devices.put('/:id', adminAuth, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const { name, model, category, location, purchase_date, description, usage_guide, precautions, maintenance } = body;

  const result = await c.env.DB.prepare(
    `UPDATE devices SET
       name = ?, model = ?, category = ?, location = ?,
       purchase_date = ?, description = ?, usage_guide = ?,
       precautions = ?, maintenance = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(name, model, category, location, purchase_date, description, usage_guide, precautions, maintenance, id)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: '设备不存在' }, 404);
  }

  return c.json({ message: '更新成功' });
});

// DELETE /api/devices/:id —— 删除设备（同时删附件）
devices.delete('/:id', adminAuth, async (c) => {
  const id = c.req.param('id');

  // 1. 查询附件列表
  const { results } = await c.env.DB.prepare(
    'SELECT r2_key FROM attachments WHERE device_id = ?'
  ).bind(id).all<{ r2_key: string }>();

  // 2. 事务性删除数据库记录（attachments + devices 原子执行）
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM attachments WHERE device_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(id),
  ]);

  // 3. 并发删除 R2 文件（best-effort，失败不阻塞，DB 一致性优先）
  await Promise.all(
    results.map(att => c.env.BUCKET.delete(att.r2_key).catch(() => {}))
  );

  return c.json({ message: '删除成功' });
});

// GET /api/devices/:id/qrcode —— 获取二维码（返回 URL，前端生成或后端生成 SVG）
devices.get('/:id/qrcode', adminAuth, async (c) => {
  const id = c.req.param('id');
  const url = `${c.env.FRONTEND_URL}/#/d/${id}`;
  return c.json({ id, url, qrcode_url: url });
});

export default devices;
