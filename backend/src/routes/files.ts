import { Hono } from 'hono';
import type { Env, Attachment } from '../types';
import { adminAuth } from '../middleware/auth';

const files = new Hono<{ Bindings: Env }>();

// POST /api/files/:deviceId —— 上传附件（管理员）
files.post('/:deviceId', adminAuth, async (c) => {
  const deviceId = c.req.param('deviceId');
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return c.json({ error: '未提供文件' }, 400);
  }

  // 检查设备是否存在
  const device = await c.env.DB.prepare('SELECT id FROM devices WHERE id = ?')
    .bind(deviceId).first();
  if (!device) {
    return c.json({ error: '设备不存在' }, 404);
  }

  const id = crypto.randomUUID();
  const ext = file.name.split('.').pop() || 'bin';
  const r2Key = `attachments/${deviceId}/${id}.${ext}`;

  // 上传到 R2
  await c.env.BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // 记录到数据库
  await c.env.DB.prepare(
    'INSERT INTO attachments (id, device_id, filename, r2_key, mime_type, size) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, deviceId, file.name, r2Key, file.type, file.size).run();

  return c.json({ id, filename: file.name, size: file.size, message: '上传成功' }, 201);
});

// GET /api/files/:id —— 下载/预览附件（公开，扫码用户可用）
files.get('/:id', async (c) => {
  const id = c.req.param('id');
  const att = await c.env.DB.prepare('SELECT * FROM attachments WHERE id = ?')
    .bind(id).first<Attachment>();

  if (!att) {
    return c.json({ error: '附件不存在' }, 404);
  }

  const object = await c.env.BUCKET.get(att.r2_key);
  if (!object) {
    return c.json({ error: '文件不存在' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', att.mime_type || 'application/octet-stream');
  headers.set('Content-Disposition', `inline; filename="${att.filename}"`);

  return new Response(object.body, { headers });
});

// DELETE /api/files/:id —— 删除附件（管理员）
files.delete('/:id', adminAuth, async (c) => {
  const id = c.req.param('id');
  const att = await c.env.DB.prepare('SELECT * FROM attachments WHERE id = ?')
    .bind(id).first<Attachment>();

  if (!att) {
    return c.json({ error: '附件不存在' }, 404);
  }

  await c.env.BUCKET.delete(att.r2_key);
  await c.env.DB.prepare('DELETE FROM attachments WHERE id = ?').bind(id).run();

  return c.json({ message: '删除成功' });
});

export default files;
