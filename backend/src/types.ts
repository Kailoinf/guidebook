// CF Workers 绑定类型定义
export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  JWT_SECRET: string;
  ADMIN_PASSWORD: string;
  FRONTEND_URL: string;
}

export interface Device {
  id: string;
  name: string;
  model: string;
  category: string;
  location: string;
  purchase_date: string;
  description: string;
  usage_guide: string;
  precautions: string;
  maintenance: string;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  device_id: string;
  filename: string;
  r2_key: string;
  mime_type: string;
  size: number;
  created_at: string;
}
