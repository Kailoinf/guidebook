import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  // 公开：扫码查看设备
  { path: '/d/:id', name: 'device-view', component: () => import('../views/DeviceView.vue') },

  // 管理员：登录
  { path: '/login', name: 'login', component: () => import('../views/Login.vue') },

  // 管理员：后台
  { path: '/', name: 'dashboard', component: () => import('../views/Dashboard.vue'), meta: { requiresAuth: true } },
  { path: '/edit/:id?', name: 'edit', component: () => import('../views/DeviceEdit.vue'), meta: { requiresAuth: true } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫
router.beforeEach((to) => {
  const token = localStorage.getItem('guidebook_token');
  if (to.meta.requiresAuth && !token) {
    return { name: 'login' };
  }
});

export default router;
