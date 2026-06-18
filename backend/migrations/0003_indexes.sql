-- 为 devices.updated_at 添加索引，优化列表排序查询
CREATE INDEX IF NOT EXISTS idx_devices_updated_at ON devices(updated_at);
