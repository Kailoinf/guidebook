-- guidebook D1 初始化
-- 设备表
CREATE TABLE IF NOT EXISTS devices (
    id          TEXT PRIMARY KEY,        -- UUID，扫码用
    name        TEXT NOT NULL,           -- 设备名称
    model       TEXT DEFAULT '',         -- 型号
    category    TEXT DEFAULT '',         -- 分类（家电/工具/数码...）
    location    TEXT DEFAULT '',         -- 存放位置
    purchase_date TEXT DEFAULT '',       -- 购买日期
    description TEXT DEFAULT '',         -- 简介
    usage_guide TEXT DEFAULT '',         -- 使用方法（Markdown）
    precautions TEXT DEFAULT '',         -- 注意事项（Markdown）
    maintenance TEXT DEFAULT '',         -- 维护保养（Markdown）
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

-- 附件表（说明书 PDF / 图片）
CREATE TABLE IF NOT EXISTS attachments (
    id          TEXT PRIMARY KEY,        -- UUID
    device_id   TEXT NOT NULL,           -- 关联设备
    filename    TEXT NOT NULL,           -- 原始文件名
    r2_key      TEXT NOT NULL,           -- R2 存储键
    mime_type   TEXT DEFAULT '',         -- MIME 类型
    size        INTEGER DEFAULT 0,       -- 文件大小（字节）
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_device ON attachments(device_id);
