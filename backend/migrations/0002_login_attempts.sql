-- 登录失败尝试记录表（速率限制用）
CREATE TABLE IF NOT EXISTS login_attempts (
    ip          TEXT PRIMARY KEY,            -- 客户端 IP
    attempts    INTEGER NOT NULL DEFAULT 1,  -- 失败次数
    last_attempt INTEGER NOT NULL           -- 最后一次尝试时间戳（秒）
);
