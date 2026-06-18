// 管理后台 —— 设备 CRUD、附件管理、二维码
import { authApi, devicesApi, filesApi, ApiError } from '../api';
import type { Device, Attachment } from '../api';
import { navigate } from '../router';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: { className?: string; text?: string } = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;
  return node;
}

function showAlert(box: HTMLElement, msg: string): void {
  box.textContent = msg;
  box.classList.remove('hidden');
}

// ====== 入口 ======
export async function renderAdmin(container: HTMLElement): Promise<void> {
  container.innerHTML = '';
  const root = el('div', { className: 'container' });
  root.appendChild(el('div', { className: 'spinner', text: '验证中...' }));
  container.appendChild(root);

  try {
    await authApi.verify();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      navigate('#/login');
      return;
    }
    // 网络错误等非 401 错误，显示错误提示和重试按钮
    root.innerHTML = '';
    const errorCard = el('div', { className: 'card text-center' });
    errorCard.appendChild(
      el('div', { className: 'alert alert-error', text: (e as Error).message || '网络错误，无法连接到服务器' })
    );
    const retryBtn = el('button', { className: 'btn btn-cta mt-4', text: '重试' });
    retryBtn.addEventListener('click', () => renderAdmin(container));
    errorCard.appendChild(retryBtn);
    root.appendChild(errorCard);
    return;
  }
  await renderList(container);
}

// ====== 设备列表 ======
async function renderList(container: HTMLElement): Promise<void> {
  container.innerHTML = '';
  const root = el('div', { className: 'container' });

  // 头部
  const header = el('div', { className: 'flex items-center justify-between' });
  header.appendChild(el('h1', { className: 'title', text: '设备管理' }));
  const logoutBtn = el('button', { className: 'btn btn-outline btn-sm', text: '退出登录' });
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('guidebook_token');
    navigate('#/login');
  });
  header.appendChild(logoutBtn);
  root.appendChild(header);

  // 新建按钮
  const newBtn = el('button', { className: 'btn btn-cta mt-4', text: '+ 新建设备' });
  newBtn.addEventListener('click', () => renderForm(container));
  root.appendChild(newBtn);

  // 列表容器
  const listWrap = el('div', { className: 'mt-4' });
  listWrap.appendChild(el('div', { className: 'spinner', text: '加载设备列表...' }));
  root.appendChild(listWrap);
  container.appendChild(root);

  try {
    const { devices } = await devicesApi.list();
    listWrap.innerHTML = '';
    if (!devices.length) {
      listWrap.appendChild(
        el('div', { className: 'card text-center muted', text: '还没有设备，点击上方按钮新建。' })
      );
      return;
    }
    devices.forEach((d) => listWrap.appendChild(renderDeviceItem(container, d)));
  } catch (e) {
    const err = e as ApiError;
    listWrap.innerHTML = '';
    listWrap.appendChild(el('div', { className: 'alert alert-error', text: err.message || '加载设备失败' }));
  }
}

function renderDeviceItem(container: HTMLElement, device: Device): HTMLElement {
  const item = el('div', { className: 'list-item' });

  const info = el('div');
  const name = el('div', { text: device.name });
  name.style.fontWeight = '600';
  info.appendChild(name);
  const sub: string[] = [];
  if (device.model) sub.push(device.model);
  if (device.category) sub.push(device.category);
  if (device.location) sub.push(device.location);
  if (sub.length) info.appendChild(el('div', { className: 'muted text-sm', text: sub.join(' · ') }));
  item.appendChild(info);

  const actions = el('div', { className: 'flex gap-2' });
  const editBtn = el('button', { className: 'btn btn-primary btn-sm', text: '编辑' });
  editBtn.addEventListener('click', () => renderForm(container, device));
  const qrBtn = el('button', { className: 'btn btn-outline btn-sm', text: '二维码' });
  qrBtn.addEventListener('click', () => void renderQrCode(container, device));
  const delBtn = el('button', { className: 'btn btn-danger btn-sm', text: '删除' });
  delBtn.addEventListener('click', async () => {
    if (!confirm(`确定删除「${device.name}」吗？此操作不可恢复。`)) return;
    delBtn.disabled = true;
    try {
      await devicesApi.remove(device.id);
      await renderList(container);
    } catch (e) {
      const err = e as ApiError;
      delBtn.disabled = false;
      alert(err.message || '删除失败');
    }
  });
  actions.appendChild(editBtn);
  actions.appendChild(qrBtn);
  actions.appendChild(delBtn);
  item.appendChild(actions);
  return item;
}

// ====== 新建 / 编辑表单 ======
function renderForm(container: HTMLElement, existing?: Device): void {
  const isEdit = !!existing;
  container.innerHTML = '';
  const root = el('div', { className: 'container' });
  root.appendChild(el('h1', { className: 'title', text: isEdit ? '编辑设备' : '新建设备' }));

  const alertBox = el('div', { className: 'alert alert-error hidden' });
  root.appendChild(alertBox);

  const card = el('div', { className: 'card' });
  const form = el('form');

  const nameInput = addField(form, '设备名称', existing?.name, true);
  const modelInput = addField(form, '型号', existing?.model);
  const categoryInput = addField(form, '分类', existing?.category);
  const locationInput = addField(form, '位置', existing?.location);
  const dateInput = addField(form, '购买日期', existing?.purchase_date, false, 'date');
  const descInput = addTextarea(form, '描述', existing?.description);
  const usageInput = addTextarea(form, '使用指南', existing?.usage_guide);
  const precautionsInput = addTextarea(form, '注意事项', existing?.precautions);
  const maintenanceInput = addTextarea(form, '维护信息', existing?.maintenance);

  const actions = el('div', { className: 'flex gap-2 mt-4' });
  const saveBtn = el('button', { className: 'btn btn-primary', text: isEdit ? '保存修改' : '创建设备' });
  saveBtn.type = 'submit';
  const cancelBtn = el('button', { className: 'btn btn-outline', text: '取消' });
  cancelBtn.type = 'button';
  cancelBtn.addEventListener('click', () => renderList(container));
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  form.appendChild(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      showAlert(alertBox, '请填写设备名称');
      return;
    }
    const data: Partial<Device> = {
      name,
      model: modelInput.value.trim(),
      category: categoryInput.value.trim(),
      location: locationInput.value.trim(),
      purchase_date: dateInput.value.trim(),
      description: descInput.value,
      usage_guide: usageInput.value,
      precautions: precautionsInput.value,
      maintenance: maintenanceInput.value,
    };
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    try {
      if (isEdit && existing) {
        await devicesApi.update(existing.id, data);
      } else {
        await devicesApi.create(data);
      }
      await renderList(container);
    } catch (e) {
      const err = e as ApiError;
      showAlert(alertBox, err.message || '保存失败');
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? '保存修改' : '创建设备';
    }
  });

  card.appendChild(form);
  root.appendChild(card);

  // 编辑模式：附件管理
  if (isEdit && existing) {
    const attSection = el('div', { className: 'section' });
    attSection.appendChild(el('h2', { className: 'section-title', text: '附件管理' }));
    const attBody = el('div');
    attBody.appendChild(el('div', { className: 'spinner', text: '加载附件...' }));
    attSection.appendChild(attBody);
    root.appendChild(attSection);
    void loadAttachments(attBody, existing);
  }

  container.appendChild(root);
  window.scrollTo(0, 0);
}

function addField(
  form: HTMLFormElement,
  label: string,
  value: string | undefined,
  required = false,
  type = 'text'
): HTMLInputElement {
  const group = el('div', { className: 'form-group' });
  group.appendChild(el('label', { className: 'label', text: required ? `${label} *` : label }));
  const input = el('input', { className: 'input' });
  input.type = type;
  input.value = value || '';
  if (required) input.required = true;
  group.appendChild(input);
  form.appendChild(group);
  return input;
}

function addTextarea(form: HTMLFormElement, label: string, value: string | undefined): HTMLTextAreaElement {
  const group = el('div', { className: 'form-group' });
  group.appendChild(el('label', { className: 'label', text: label }));
  const ta = el('textarea', { className: 'textarea' });
  ta.value = value || '';
  group.appendChild(ta);
  form.appendChild(group);
  return ta;
}

// ====== 附件管理 ======
async function loadAttachments(body: HTMLElement, device: Device): Promise<void> {
  try {
    const detail = await devicesApi.detail(device.id);
    body.innerHTML = '';
    renderAttachmentManager(body, device, detail.attachments);
  } catch {
    body.innerHTML = '';
    body.appendChild(el('div', { className: 'muted', text: '加载附件失败' }));
  }
}

function renderAttachmentManager(body: HTMLElement, device: Device, attachments: Attachment[]): void {
  const uploadRow = el('div', { className: 'form-group flex gap-2 items-center' });
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx';
  const uploadBtn = el('button', { className: 'btn btn-outline btn-sm', text: '上传附件' });
  uploadBtn.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      alert('请先选择文件');
      return;
    }
    const MAX_SIZE = 10 * 1024 * 1024;
    const ALLOWED = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'doc', 'docx'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (file.size > MAX_SIZE || file.size === 0) {
      alert('文件大小不能超过 10MB');
      return;
    }
    if (!ALLOWED.includes(ext)) {
      alert('不支持的文件类型');
      return;
    }
    uploadBtn.disabled = true;
    uploadBtn.textContent = '上传中...';
    try {
      await filesApi.upload(device.id, file);
      await loadAttachments(body, device);
    } catch (e) {
      const err = e as ApiError;
      uploadBtn.disabled = false;
      uploadBtn.textContent = '上传附件';
      alert(err.message || '上传失败');
    }
  });
  uploadRow.appendChild(fileInput);
  uploadRow.appendChild(uploadBtn);
  body.appendChild(uploadRow);

  if (!attachments.length) {
    body.appendChild(el('div', { className: 'muted', text: '暂无附件' }));
    return;
  }
  attachments.forEach((att) => {
    const item = el('div', { className: 'list-item' });
    item.appendChild(el('div', { text: att.filename }));
    const delBtn = el('button', { className: 'btn btn-danger btn-sm', text: '删除' });
    delBtn.addEventListener('click', async () => {
      if (!confirm(`删除附件「${att.filename}」？`)) return;
      delBtn.disabled = true;
      try {
        await filesApi.remove(att.id);
        await loadAttachments(body, device);
      } catch (e) {
        const err = e as ApiError;
        delBtn.disabled = false;
        alert(err.message || '删除失败');
      }
    });
    item.appendChild(delBtn);
    body.appendChild(item);
  });
}

// ====== 二维码 ======
async function renderQrCode(container: HTMLElement, device: Device): Promise<void> {
  container.innerHTML = '';
  const root = el('div', { className: 'container' });
  root.appendChild(el('h1', { className: 'title', text: '设备二维码' }));
  root.appendChild(el('div', { className: 'muted mt-2', text: device.name }));

  const card = el('div', { className: 'card text-center mt-4' });
  card.appendChild(el('div', { className: 'spinner', text: '生成二维码...' }));
  root.appendChild(card);

  const backBtn = el('button', { className: 'btn btn-outline mt-4', text: '返回列表' });
  backBtn.addEventListener('click', () => renderList(container));
  root.appendChild(backBtn);

  container.appendChild(root);

  try {
    const res = await devicesApi.qrcode(device.id);
    card.innerHTML = '';
    const img = el('img');
    img.src = res.qrcode_url;
    img.alt = `${device.name} 二维码`;
    card.appendChild(img);
    const link = el('a', { className: 'btn btn-outline btn-sm mt-4', text: '打开查看页' });
    link.href = res.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    card.appendChild(link);
  } catch (e) {
    const err = e as ApiError;
    card.innerHTML = '';
    card.appendChild(el('div', { className: 'alert alert-error', text: err.message || '生成二维码失败' }));
  }
}
