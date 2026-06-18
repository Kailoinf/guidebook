<template>
  <div class="container" style="padding-top: 48px; padding-bottom: 48px;">
    <div v-if="loading" class="status">加载中...</div>
    <div v-else-if="error" class="status error">{{ error }}</div>
    <div v-else-if="device" class="device-view">
      <!-- 标题 -->
      <header class="device-header">
        <h1>{{ device.name }}</h1>
        <div class="meta-row">
          <span v-if="device.model" class="tag">{{ device.model }}</span>
          <span v-if="device.category" class="tag">{{ device.category }}</span>
          <span v-if="device.location" class="tag">{{ device.location }}</span>
        </div>
        <p v-if="device.description" class="description">{{ device.description }}</p>
      </header>

      <!-- 使用方法 -->
      <section v-if="device.usage_guide" class="card section">
        <h2>使用方法</h2>
        <div class="markdown" v-html="renderMd(device.usage_guide)"></div>
      </section>

      <!-- 注意事项 -->
      <section v-if="device.precautions" class="card section">
        <h2>注意事项</h2>
        <div class="markdown" v-html="renderMd(device.precautions)"></div>
      </section>

      <!-- 维护保养 -->
      <section v-if="device.maintenance" class="card section">
        <h2>维护保养</h2>
        <div class="markdown" v-html="renderMd(device.maintenance)"></div>
      </section>

      <!-- 附件 -->
      <section v-if="attachments.length" class="card section">
        <h2>说明书文件</h2>
        <ul class="attach-list">
          <li v-for="att in attachments" :key="att.id">
            <a :href="fileUrl(att.id)" target="_blank">
              <span class="file-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </span>
              {{ att.filename }}
            </a>
          </li>
        </ul>
      </section>

      <!-- 基本信息 -->
      <section v-if="device.purchase_date" class="card section info">
        <p><strong>购买日期：</strong>{{ device.purchase_date }}</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { marked } from 'marked';
import { devices, files } from '../api';

const route = useRoute();
const loading = ref(true);
const error = ref('');
const device = ref<any>(null);
const attachments = ref<any[]>([]);

const renderMd = (text: string) => marked.parse(text);
const fileUrl = (id: string) => files.get(id);

onMounted(async () => {
  const id = route.params.id as string;
  try {
    const data = await devices.get(id);
    device.value = data.device;
    attachments.value = data.attachments || [];
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.status { text-align: center; padding: 80px 0; color: var(--color-text-muted); font-size: 18px; }
.status.error { color: var(--color-danger); }

.device-header h1 { font-size: 28px; margin-bottom: 12px; }
.meta-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.tag { background: #EFF6FF; color: var(--color-primary); padding: 4px 12px; border-radius: 20px; font-size: 13px; }
.description { color: var(--color-text-muted); }

.section { margin-top: 24px; }
.section h2 { font-size: 18px; margin-bottom: 16px; }

.markdown :deep(h1), .markdown :deep(h2), .markdown :deep(h3) { margin: 16px 0 8px; }
.markdown :deep(p) { margin-bottom: 8px; }
.markdown :deep(ul), .markdown :deep(ol) { padding-left: 20px; margin-bottom: 8px; }
.markdown :deep(code) { background: var(--color-bg); padding: 2px 6px; border-radius: 4px; font-size: 14px; }

.attach-list { list-style: none; }
.attach-list li a { display: flex; align-items: center; gap: 8px; padding: 10px 0; }
.attach-list li a:hover .file-icon { color: var(--color-primary); }
.file-icon { color: var(--color-text-muted); display: inline-flex; }

.info p { color: var(--color-text-muted); font-size: 14px; }
</style>
