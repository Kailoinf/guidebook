const API = '/api';

function getToken(): string | null {
  return localStorage.getItem('guidebook_token');
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

// ===== 认证 =====
export const auth = {
  login: (password: string) => request('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  verify: () => request('/auth/verify'),
};

// ===== 设备 =====
export const devices = {
  // 公开：扫码查看
  get: (id: string) => request(`/devices/${id}`),

  // 管理员
  list: () => request('/devices'),
  create: (data: any) => request('/devices', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request(`/devices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: string) => request(`/devices/${id}`, { method: 'DELETE' }),
  qrcode: (id: string) => request(`/devices/${id}/qrcode`),
};

// ===== 附件 =====
export const files = {
  // 公开：下载
  get: (id: string) => `${API}/files/${id}`,

  // 管理员
  upload: (deviceId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API}/files/${deviceId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    }).then(res => res.json());
  },
  remove: (id: string) => request(`/files/${id}`, { method: 'DELETE' }),
};
