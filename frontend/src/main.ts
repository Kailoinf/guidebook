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

startRouter();
