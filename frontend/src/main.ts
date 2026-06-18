// 应用入口 —— 注册路由并启动
import './style.css';
import { route, notFound, navigate, startRouter } from './router';
import { renderDeviceView } from './pages/device-view';
import { renderLogin } from './pages/login';
import { renderAdmin } from './pages/admin';

function appRoot(): HTMLElement {
  const node = document.getElementById('app');
  if (!node) throw new Error('找不到 #app 容器');
  return node;
}

// 首页：按登录状态重定向
route('/', () => {
  const token = localStorage.getItem('guidebook_token');
  navigate(token ? '#/admin' : '#/login');
});

// 扫码查看页（公开，无需登录）
route('/d/:id', (params) => {
  void renderDeviceView(appRoot(), params.id);
});

// 管理员登录
route('/login', () => {
  renderLogin(appRoot());
});

// 管理后台（未登录会被内部 verify 拦截并跳转 login）
route('/admin', () => {
  void renderAdmin(appRoot());
});

// 404
notFound(() => {
  const root = appRoot();
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'container container-narrow text-center';
  const card = document.createElement('div');
  card.className = 'card';
  const title = document.createElement('h1');
  title.className = 'title';
  title.textContent = '页面不存在';
  const tip = document.createElement('p');
  tip.className = 'muted mt-2';
  tip.textContent = '链接可能有误。';
  const home = document.createElement('a');
  home.className = 'btn btn-primary mt-4';
  home.textContent = '返回首页';
  home.href = '#/';
  card.appendChild(title);
  card.appendChild(tip);
  card.appendChild(home);
  wrap.appendChild(card);
  root.appendChild(wrap);
});

// 全局异常捕获：未处理的同步错误
window.addEventListener('error', (event) => {
  console.error('[全局异常] 未捕获的错误:', event.error || event.message, `(${event.filename}:${event.lineno})`);
});

// 全局异常捕获：未处理的 Promise rejection
window.addEventListener('unhandledrejection', (event) => {
  console.error('[全局异常] 未处理的 Promise rejection:', event.reason);
});

// 兜底：如果 #app 容器为空（路由未匹配或渲染失败），显示错误提示，避免白屏
function ensureAppFallback() {
  const app = document.getElementById('app');
  if (app && app.children.length === 0) {
    app.innerHTML = `
      <div class="container container-narrow text-center" style="margin-top: 4rem;">
        <div class="card" style="padding: 2rem;">
          <h1 class="title">出了点问题</h1>
          <p class="muted mt-2">应用加载失败，请刷新页面重试。</p>
          <button class="btn btn-primary mt-4" onclick="location.reload()">刷新页面</button>
        </div>
      </div>
    `;
  }
}

startRouter();

// 路由启动后检查是否白屏（requestAnimationFrame 确保在首次渲染之后检查）
requestAnimationFrame(() => {
  ensureAppFallback();
});
