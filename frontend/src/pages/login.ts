// 管理员登录页
import { authApi, ApiError } from '../api';
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

export function renderLogin(container: HTMLElement): void {
  container.innerHTML = '';
  const root = el('div', { className: 'container container-narrow' });
  const card = el('div', { className: 'card' });
  card.appendChild(el('h1', { className: 'title text-center', text: '管理后台登录' }));

  const alertBox = el('div', { className: 'alert alert-error hidden' });
  card.appendChild(alertBox);

  const form = el('form');
  const group = el('div', { className: 'form-group' });
  group.appendChild(el('label', { className: 'label', text: '管理密码' }));
  const input = el('input', { className: 'input' });
  input.type = 'password';
  input.placeholder = '请输入管理密码';
  input.required = true;
  group.appendChild(input);
  form.appendChild(group);

  const submitBtn = el('button', { className: 'btn btn-primary btn-block', text: '登录' });
  submitBtn.type = 'submit';
  form.appendChild(submitBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = input.value.trim();
    if (!password) return;
    alertBox.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = '登录中...';
    try {
      const res = await authApi.login(password);
      localStorage.setItem('guidebook_token', res.token);
      navigate('#/admin');
    } catch (err) {
      const apiErr = err as ApiError;
      alertBox.textContent = apiErr.message || '登录失败，请检查密码';
      alertBox.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = '登录';
    }
  });

  card.appendChild(form);
  root.appendChild(card);
  container.appendChild(root);
  input.focus();
}
