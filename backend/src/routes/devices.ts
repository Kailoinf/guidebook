import { Hono } from 'hono';
import type { Env, Device } from '../types';
import { adminAuth } from '../middleware/auth';

const devices = new Hono<{ Bindings: Env }>();

// 生成 UUID
function uuid(): string {
  return crypto.randomUUID();
}

// 字段验证（POST 和 PUT 共用）
function validateDevice(body: Record<string, unknown>): string | null {
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  // name 非空
  if (!name) {
    return '设备名称不能为空';
  }

  // 短字段长度限制
  const shortFields = ['name', 'model', 'category', 'location'] as const;
  for (const field of shortFields) {
    const val = typeof body[field] === 'string' ? body[field] : '';
    if (val.length > 200) {
      return `${field} 不能超过 200 个字符`;
    }
  }

  // purchase_date 格式验证（非空时必须为 YYYY-MM-DD）
  const pd = typeof body.purchase_date === 'string' ? body.purchase_date.trim() : '';
  if (pd && !/^\d{4}-\d{2}-\d{2}$/.test(pd)) {
    return 'purchase_date 格式必须为 YYYY-MM-DD';
  }

  // 长文本字段长度限制
  const longFields = ['description', 'usage_guide', 'precautions', 'maintenance'] as const;
  for (const field of longFields) {
    const val = typeof body[field] === 'string' ? body[field] : '';
    if (val.length > 10000) {
      return `${field} 不能超过 10000 个字符`;
    }
  }

  return null;
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

  const err = validateDevice(body);
  if (err) {
    return c.json({ error: err }, 400);
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

  const err = validateDevice(body);
  if (err) {
    return c.json({ error: err }, 400);
  }

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
