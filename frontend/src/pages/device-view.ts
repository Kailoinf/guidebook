// 扫码查看页 —— 公开，无需登录
import { devicesApi, filesApi, ApiError } from '../api';
import type { DeviceDetail, Attachment } from '../api';

// 轻量 DOM 构造辅助
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: { className?: string; text?: string } = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;
  return node;
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function renderDeviceView(container: HTMLElement, id: string): Promise<void> {
  container.innerHTML = '';
  const root = el('div', { className: 'container' });
  root.appendChild(el('div', { className: 'spinner', text: '加载中...' }));
  container.appendChild(root);

  try {
    const detail = await devicesApi.detail(id);
    container.innerHTML = '';
    container.appendChild(renderDetail(detail));
  } catch (e) {
    const err = e as ApiError;
    container.innerHTML = '';
    container.appendChild(renderError(err));
  }
}

function renderDetail(detail: DeviceDetail): HTMLElement {
  const { device, attachments } = detail;
  const root = el('div', { className: 'container' });

  // 标题
  root.appendChild(el('h1', { className: 'title', text: device.name }));

  // 标签：分类 / 位置
  const tags = el('div', { className: 'flex gap-2 mt-2 flex-wrap' });
  if (device.category) tags.appendChild(el('span', { className: 'tag', text: device.category }));
  if (device.location) tags.appendChild(el('span', { className: 'tag', text: device.location }));
  if (tags.childElementCount) root.appendChild(tags);

  // 基本信息卡
  const infoCard = el('div', { className: 'card mt-4' });
  appendInfo(infoCard, '型号', device.model);
  appendInfo(infoCard, '购买日期', device.purchase_date);
  if (infoCard.childElementCount) root.appendChild(infoCard);

  // 分区正文
  appendSection(root, '设备描述', device.description);
  appendSection(root, '使用指南', device.usage_guide);
  appendSection(root, '注意事项', device.precautions);
  appendSection(root, '维护信息', device.maintenance);

  // 附件
  if (attachments.length) {
    const section = el('div', { className: 'section' });
    section.appendChild(el('h2', { className: 'section-title', text: '相关文档' }));
    attachments.forEach((att) => section.appendChild(renderAttachmentItem(att)));
    root.appendChild(section);
  }

  return root;
}

function appendInfo(parent: HTMLElement, label: string, value: string): void {
  if (!value) return;
  const group = el('div', { className: 'form-group' });
  group.appendChild(el('div', { className: 'label', text: label }));
  group.appendChild(el('div', { text: value }));
  parent.appendChild(group);
}

function appendSection(root: HTMLElement, title: string, content: string): void {
  if (!content) return;
  const section = el('div', { className: 'section' });
  section.appendChild(el('h2', { className: 'section-title', text: title }));
  const body = el('div', { text: content });
  body.style.whiteSpace = 'pre-wrap';
  section.appendChild(body);
  root.appendChild(section);
}

function renderAttachmentItem(att: Attachment): HTMLElement {
  const item = el('div', { className: 'list-item' });
  const info = el('div');
  info.appendChild(el('div', { text: att.filename }));
  const meta = formatSize(att.size);
  if (meta) info.appendChild(el('div', { className: 'muted text-sm', text: meta }));
  item.appendChild(info);
  const link = el('a', { className: 'btn btn-outline btn-sm', text: '下载' });
  link.href = filesApi.url(att.id);
  link.download = att.filename;
  item.appendChild(link);
  return item;
}

function renderError(err: ApiError): HTMLElement {
  const root = el('div', { className: 'container container-narrow text-center' });
  const card = el('div', { className: 'card' });
  if (err.status === 404) {
    card.appendChild(el('h1', { className: 'title', text: '未找到设备' }));
    card.appendChild(el('p', { className: 'muted mt-2', text: '该设备不存在或链接已失效。' }));
  } else {
    card.appendChild(el('h1', { className: 'title', text: '加载失败' }));
    card.appendChild(el('p', { className: 'muted mt-2', text: err.message || '请稍后重试。' }));
  }
  root.appendChild(card);
  return root;
}
