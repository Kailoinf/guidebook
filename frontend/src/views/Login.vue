<template>
  <div class="login-page">
    <div class="card login-card">
      <div class="logo">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <h1>Guidebook</h1>
      </div>
      <p class="subtitle">管理后台登录</p>

      <form @submit.prevent="handleLogin">
        <div class="field">
          <label>密码</label>
          <input
            v-model="password"
            type="password"
            placeholder="请输入管理密码"
            :disabled="loading"
            autofocus
          />
        </div>

        <p v-if="error" class="error-msg">{{ error }}</p>

        <button type="submit" class="btn-primary login-btn" :disabled="loading">
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { auth } from '../api';

const router = useRouter();
const password = ref('');
const loading = ref(false);
const error = ref('');

async function handleLogin() {
  error.value = '';
  loading.value = true;
  try {
    const data = await auth.login(password.value);
    localStorage.setItem('guidebook_token', data.token);
    router.push('/');
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
}

.login-card {
  width: 100%;
  max-width: 380px;
  text-align: center;
}

.logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.logo h1 { font-size: 24px; }

.subtitle { color: var(--color-text-muted); margin-bottom: 28px; }

.field { text-align: left; margin-bottom: 20px; }
.field label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; }

.error-msg { color: var(--color-danger); font-size: 14px; margin-bottom: 16px; }

.login-btn { width: 100%; padding: 12px; }
</style>
