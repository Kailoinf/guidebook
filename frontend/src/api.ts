// API 客户端 —— 类型安全封装，对接后端 Hono API

// ====== 类型定义（与后端 backend/src/types.ts 对齐） ======
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
  filename: string;
  mime_type: string;
  size: number;
}

export interface DeviceDetail {
  device: Device;
  attachments: Attachment[];
}

// ====== HTTP 封装 ======
async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const { method = 'GET', body, auth = false } = options;

  const headers: Record<string, string> = {};
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth) {
    const token = localStorage.getItem('guidebook_token');
    if (!token) throw new ApiError('未登录', 401);
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const msg = await res.json().catch(() => ({ error: '请求失败' }));
    throw new ApiError(msg.error || '请求失败', res.status);
  }

  // 204 或空响应
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// ====== Auth API ======
export const authApi = {
  login(password: string): Promise<{ token: string; message: string }> {
    return request('/auth/login', { method: 'POST', body: { password } });
  },
  verify(): Promise<{ valid: boolean }> {
    return request('/auth/verify', { auth: true });
  },
};

// ====== Devices API ======
export const devicesApi = {
  // 公开：扫码查看
  detail(id: string): Promise<DeviceDetail> {
    return request(`/devices/${id}`);
  },
  // 管理员：列表
  list(): Promise<{ devices: Device[] }> {
    return request('/devices', { auth: true });
  },
  // 管理员：新建
  create(data: Partial<Device>): Promise<{ id: string; message: string }> {
    return request('/devices', { method: 'POST', body: data, auth: true });
  },
  // 管理员：更新
  update(id: string, data: Partial<Device>): Promise<{ message: string }> {
    return request(`/devices/${id}`, { method: 'PUT', body: data, auth: true });
  },
  // 管理员：删除
  remove(id: string): Promise<{ message: string }> {
    return request(`/devices/${id}`, { method: 'DELETE', auth: true });
  },
  // 管理员：获取二维码 URL
  qrcode(id: string): Promise<{ id: string; url: string; qrcode_url: string }> {
    return request(`/devices/${id}/qrcode`, { auth: true });
  },
};

// ====== Files API ======
export const filesApi = {
  // 管理员：上传附件
  upload(deviceId: string, file: File): Promise<{ id: string; filename: string; size: number; message: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/files/${deviceId}`, { method: 'POST', body: formData, auth: true });
  },
  // 公开：附件下载 URL
  url(id: string): string {
    return `/api/files/${id}`;
  },
  // 管理员：删除附件
  remove(id: string): Promise<{ message: string }> {
    return request(`/files/${id}`, { method: 'DELETE', auth: true });
  },
};
