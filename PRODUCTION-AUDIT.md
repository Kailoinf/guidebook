# 生产可能性测试报告

**审查日期**：2026-06-19
**项目**：Guidebook — 家庭物品说明书管理系统
**整体评估**：⚠️ **需修复后上线** — 存在 1 个信息泄漏漏洞和 2 个数据一致性风险，修复成本低但影响大。

---

## 🔴 严重（Critical）— 上线前必须修复

> 不修绝对不能上生产的问题：安全漏洞、数据丢失风险、崩溃风险

### C1. 设备列表接口缺少认证中间件 —— 信息泄漏

- **文件**：`backend/src/routes/devices.ts:77`
- **问题**：`GET /api/devices` 路由声明时遗漏了 `adminAuth` 中间件，导致该接口对公网开放。任何人无需登录即可列出所有设备的名称、型号、分类、位置和 UUID。前端虽然通过 `verify()` 拦截了 /admin 页面的加载，但 API 层面可直接 curl 访问，绕过前端保护。该路由的注释明确标注为"管理员接口（需要 JWT 认证）"，显然是实现遗漏而非设计意图。

  对比：同文件中的 POST（L85）、PUT（L106）、DELETE（L134）均正确添加了 `adminAuth`。

- **风险等级**：严重 — 信息泄漏，用户资产清单可被任意爬取。

- **修复建议**：
  ```ts
  // backend/src/routes/devices.ts 第 77 行
  // 修改前：
  devices.get('/', async (c) => {
  // 修改后：
  devices.get('/', adminAuth, async (c) => {
  ```

- **验证方式**：部署后直接 `curl https://<worker>/api/devices` 应返回 401，携带有效 token 才能获取列表。

---

### C2. 管理员密码明文存储和比较 —— 无哈希保护

- **文件**：`backend/src/routes/auth.ts:68`
- **问题**：登录验证直接对比明文 `password !== c.env.ADMIN_PASSWORD`。环境变量虽然通过 Cloudflare Workers secrets 机制加密存储，但密码本身从未散列。如果 Workers 环境变量因配置错误被记录到日志，或未来引入审计日志时不小心打印了 `c.env`，密码将完全暴露。更重要的是，这是安全最佳实践的基本缺失。

- **风险等级**：严重 — 密码明文对比。虽然 Cloudflare Workers 的 secrets 是加密存储的，但缺乏纵深防御（defense in depth）。

- **修复建议**：
  ```ts
  // backend/src/routes/auth.ts 第 68 行附近
  // 方案 A：在生产环境使用 wrangler secret put ADMIN_PASSWORD_HASH 存储 bcrypt 哈希
  // 登录时使用 Web Crypto API 进行 PBKDF2 验证（CF Workers 不支持 bcrypt native）

  // 新增工具函数 backend/src/utils/crypto.ts
  export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    // hash 格式: "salt:derivedKey" (均为 hex)
    const [saltHex, keyHex] = hash.split(':');
    if (!saltHex || !keyHex) return false;

    const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const expectedKey = new Uint8Array(keyHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      key,
      256
    );

    return new Uint8Array(derived).every((b, i) => b === expectedKey[i]);
  }

  export async function hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      key,
      256
    );
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    const keyHex = Array.from(new Uint8Array(derived)).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${saltHex}:${keyHex}`;
  }
  ```

  ```ts
  // 修改 auth.ts 的登录对比逻辑（L68）
  // 将 ADMIN_PASSWORD 改为 ADMIN_PASSWORD_HASH
  // 前置生成: npx wrangler secret put ADMIN_PASSWORD_HASH
  const isValid = await verifyPassword(password, c.env.ADMIN_PASSWORD_HASH);
  if (!password || !isValid) {
  ```

- **验证方式**：部署后确认 `ADMIN_PASSWORD` 不再存在于 secrets 中，只有 `ADMIN_PASSWORD_HASH`。

---

### C3. 文件上传缺少事务性保证 —— 孤儿文件风险

- **文件**：`backend/src/routes/files.ts:50-58`
- **问题**：先上传 R2（L51-53），后写入数据库（L56-58），两个操作不是原子的。如果 R2 上传成功但数据库写入失败（例如 D1 瞬时不可用），R2 中将留下孤儿文件，无法通过应用层追踪或清理。反之如果 R2 上传失败，`BUCKET.put()` 会抛出异常，后续 DB 写入不会执行，但异常未被捕获，会导致 500 错误。

  同样的问题在 `backend/src/routes/files.ts:96-103`（删除附件）中已正确修复（先 DB 后 R2），但上传路径的修复方向相反：应该先写 DB 再上传 R2，或者添加清理逻辑。

- **风险等级**：严重 — 数据一致性风险，可能导致存储泄漏（孤儿文件占用 R2 空间）。

- **修复建议**：
  ```ts
  // backend/src/routes/files.ts POST handler 修改（L50-61）
  // 方案 A：先写 DB，再上传 R2（与删除逻辑对称）
  const r2Key = `attachments/${deviceId}/${id}.${ext}`;

  // 1. 先记录到数据库（预留记录）
  await c.env.DB.prepare(
    'INSERT INTO attachments (id, device_id, filename, r2_key, mime_type, size) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, deviceId, file.name, r2Key, file.type, file.size).run();

  // 2. 上传到 R2（失败时由 delete 接口清理 DB 记录，或依赖前端重试）
  try {
    await c.env.BUCKET.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
  } catch (e) {
    // R2 上传失败，清理 DB 中的占位记录
    await c.env.DB.prepare('DELETE FROM attachments WHERE id = ?').bind(id).run();
    throw e; // 让 Hono 全局错误处理返回 500
  }
  ```

- **验证方式**：在 R2 上传过程中模拟故障（例如删除 bucket 权限），确认 DB 中没有孤儿记录。

---

## 🟠 中等（Major）— 建议尽快修复

> 不会立即崩溃，但在生产中会出问题

### M1. wrangler.toml 存在占位符 database_id

- **文件**：`backend/wrangler.toml:34`
- **问题**：`database_id = "00000000-0000-0000-0000-000000000000"` 是占位符。部署到生产前必须替换为 `npx wrangler d1 create guidebook-db` 返回的真实 ID。文件中已有注释提示，但占位符本身可能导致新手直接部署失败。

- **风险等级**：中等 — 部署中断，但注释已说明。

- **修复建议**：部署前运行 `npx wrangler d1 create guidebook-db`，将返回的 ID 填入。

- **验证方式**：`wrangler deploy` 后确认 D1 绑定正常。

---

### M2. 缺少 Content-Security-Policy 和其他安全响应头

- **文件**：`backend/src/index.ts`（全局中间件）
- **问题**：应用没有设置任何安全 HTTP 头：
  - 无 `Content-Security-Policy` —— XSS 最后一道防线缺失
  - 无 `X-Content-Type-Options: nosniff` —— MIME 嗅探攻击风险
  - 无 `X-Frame-Options: DENY` —— 点击劫持风险
  - 无 `Strict-Transport-Security` —— 降级攻击风险（HTTPS → HTTP）

- **风险等级**：中等 — 纵深防御缺失。XSS 已通过正确的 DOM API 使用（`textContent`）做了前端防护，但缺少服务端安全头降低了整体安全性。

- **修复建议**：
  ```ts
  // backend/src/index.ts，在 CORS 之后添加安全头中间件
  app.use('/api/*', async (c, next) => {
    await next();
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('X-Frame-Options', 'DENY');
    c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.res.headers.set('X-XSS-Protection', '0'); // 已废弃但无害
  });
  ```

- **验证方式**：`curl -I https://<worker>/api/health` 确认响应头存在。

---

### M3. 前端 vite 版本存在已知漏洞

- **文件**：`frontend/package.json:14` (`"vite": "^5.4.0"`)
- **问题**：`pnpm audit` 报告 vite 5.4.0 存在 2 个高危和 1 个中危漏洞：
  - `GHSA-c27g-q93r-2cwf` — launch-editor 命令注入（Windows）
  - `GHSA-fx2h-pf6j-xcff` — `server.fs.deny` 绕过（Windows）
  - 中危 — DOM Clobbering
  
  这些漏洞仅在开发服务器中可利用，不影响生产构建产物。但 CI 中 `vite build` 仍会加载这些依赖。

- **风险等级**：中等 — 仅影响开发环境，且主要是 Windows 平台。

- **修复建议**：
  ```json
  // frontend/package.json
  "devDependencies": {
    "vite": "^5.4.9"  // 从 ^5.4.0 升级到 >=5.4.9
  }
  ```
  然后运行 `pnpm install`。

- **验证方式**：`pnpm audit --registry https://registry.npmjs.org` 确认 vite 漏洞消除。

---

### M4. QR 码接口只返回 URL，未生成实际二维码

- **文件**：`backend/src/routes/devices.ts:157-161` + `frontend/src/pages/admin.ts:343`
- **问题**：`GET /api/devices/:id/qrcode` 返回的 `qrcode_url` 字段与 `url` 字段值相同（均为 `https://frontend/#/d/:id`）。前端将此值赋给 `<img src>`（admin.ts L344），导致显示为破损图片，而非二维码图片。整个 QR 码功能形同虚设。

- **风险等级**：中等 — 功能不可用。用户点击"二维码"按钮只能看到破损图片。

- **修复建议**：两个方案选一。

  **方案 A（推荐 —— 后端生成 QR SVG）**：
  ```ts
  // backend/src/routes/devices.ts QR 码端点
  // 使用 QR 码生成库，或调用外部 API
  // 由于 CF Workers 环境限制，推荐在响应中直接返回 SVG data URI
  function generateQrSvg(text: string): string {
    // 使用 qrcode 库或纯 JS 实现
    // 简化版：返回 Google Chart API 的 QR 码 URL
    const encoded = encodeURIComponent(text);
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}`;
  }

  devices.get('/:id/qrcode', adminAuth, async (c) => {
    const id = c.req.param('id');
    const url = `${c.env.FRONTEND_URL}/#/d/${id}`;
    const qrImageUrl = generateQrSvg(url);
    return c.json({ id, url, qrcode_url: qrImageUrl });
  });
  ```

  **方案 B（前端生成 QR）**：
  ```html
  <!-- 在 index.html 引入 qrcodejs 或使用 canvas API 生成 -->
  ```

- **验证方式**：管理后台 → 设备 → 二维码 → 确认显示可扫描的二维码图片。

---

### M5. 缺少 DEPLOY.md 部署文档

- **文件**：`README.md:34`
- **问题**：README 引用 `详见 [DEPLOY.md](./DEPLOY.md)`，但该文件不存在。部署步骤散落在 `wrangler.toml` 的注释中（L6-13），不够完整。

- **风险等级**：中等 — 文档缺失导致部署流程不可复现。

- **修复建议**：创建 `DEPLOY.md`，至少包含：
  ```markdown
  # 部署指南

  ## 前置条件
  - Node.js >= 22, pnpm >= 11.8
  - Cloudflare 账号 + API Token（Workers、D1、R2、Pages 权限）
  - 已安装 wrangler CLI

  ## 首次部署

  ### 1. 创建 Cloudflare 资源
  npx wrangler d1 create guidebook-db
  npx wrangler r2 bucket create guidebook-files

  ### 2. 设置密钥
  npx wrangler secret put JWT_SECRET
  npx wrangler secret put ADMIN_PASSWORD_HASH

  ### 3. 更新 wrangler.toml
  - 将 `database_id` 替换为步骤 1 返回的真实 ID
  - 将 `FRONTEND_URL` 改为生产域名

  ### 4. 部署后端
  cd backend
  pnpm install
  npx wrangler d1 execute guidebook-db --remote --file=migrations/0001_init.sql
  npx wrangler d1 execute guidebook-db --remote --file=migrations/0002_login_attempts.sql
  npx wrangler d1 execute guidebook-db --remote --file=migrations/0003_indexes.sql
  npx wrangler deploy

  ### 5. 部署前端
  cd frontend
  pnpm install
  pnpm build
  npx wrangler pages deploy dist --project-name=guidebook
  ```

- **验证方式**：按文档步骤能在新环境复现部署。

---

### M6. JWT_SECRET 缺少初始化校验

- **文件**：`backend/src/middleware/auth.ts:24`（调用 `verify` 处）
- **问题**：如果 `JWT_SECRET` 未通过 `wrangler secret put` 设置，`c.env.JWT_SECRET` 为空字符串或 undefined。此时 JWT `sign` 会使用空密钥签名，`verify` 会用空密钥验证。结果是：任何用空密钥签名的 token 都能通过验证（因为 `verify` 函数不检查密钥是否为空）。

- **风险等级**：中等 — 配置错误时的静默安全降级。

- **修复建议**：
  ```ts
  // backend/src/utils/jwt.ts 的 sign 和 verify 函数开头添加
  export async function sign(payload: object, secret: string, expiresInHours = 24): Promise<string> {
    if (!secret) throw new Error('JWT_SECRET is not configured');
    // ... 原有逻辑
  }

  export async function verify(token: string, secret: string): Promise<object | null> {
    if (!secret) throw new Error('JWT_SECRET is not configured');
    // ... 原有逻辑
  }
  ```
  或者，在应用启动时（`index.ts`）添加启动校验。

- **验证方式**：暂时删除 JWT_SECRET secret，部署后确认 API 返回明确错误而非静默接受任意 token。

---

### M7. 前端 serve.cjs 存在路径遍历风险

- **文件**：`frontend/serve.cjs:35`
- **问题**：`filePath = path.join(ROOT, urlPath)` 未对 `urlPath` 做路径清理。攻击者可以通过 `curl http://localhost:5173/../../../etc/passwd` 读取 dist/ 目录外的文件。虽然该文件仅用于本地测试（非生产使用），但习惯性保留可能被误用。

- **风险等级**：中等 — 仅影响本地测试环境，但路径遍历是经典漏洞模式。

- **修复建议**：
  ```js
  // frontend/serve.cjs L34-36
  let urlPath = req.url.split('?')[0];
  // 路径清理：防止目录遍历
  urlPath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = path.join(ROOT, urlPath === '/' || urlPath === '' ? 'index.html' : urlPath);
  // 二次确认文件在 ROOT 目录内
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  ```

- **验证方式**：`curl http://localhost:5173/../../../etc/passwd` 应返回 403。

---

### M8. 缺少 favicon.svg 文件

- **文件**：`frontend/index.html:7`
- **问题**：`<link rel="icon" href="/favicon.svg" type="image/svg+xml" />` 引用了不存在的文件（`glob **/favicon*` 无结果）。部署后浏览器每个页面都会触发 404 请求。

- **风险等级**：低——仅影响用户体验（404 错误），无安全风险。

- **修复建议**：创建 `frontend/public/favicon.svg`（一个简单的 SVG 图标），或在 index.html 中内联 SVG favicon：
  ```html
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📖</text></svg>">
  ```

- **验证方式**：部署后在浏览器中确认标签页图标正常显示。

---

## 🟡 建议（Minor）— 锦上添花

> 最佳实践、性能优化、可维护性

### S1. README 技术栈描述不准确

- **文件**：`README.md:23` + `README.md:27`
- **问题**：README 声称前端为 "Vue 3 SPA"，但实际项目已重写为 "TypeScript + Vite (vanilla)"。项目结构注释显示 `frontend/` 内为 "Vue 3 SPA"，实际是纯 TypeScript。

- **修复建议**：
  ```markdown
  # README.md 修改
  | 前端 | TypeScript + Vite（vanilla，无框架） |
  ├── frontend/         # TypeScript SPA
  ```

---

### S2. 文件下载缺少 Cache-Control 头

- **文件**：`backend/src/routes/files.ts:78-82`
- **问题**：附件下载响应未设置 `Cache-Control` 头。对于不变更的附件，应添加 `Cache-Control: public, max-age=31536000, immutable`（因为 R2 key 包含 UUID，文件内容不可变）。

- **修复建议**：
  ```ts
  // backend/src/routes/files.ts L78
  const headers = new Headers();
  headers.set('Content-Type', att.mime_type || 'application/octet-stream');
  headers.set('Content-Disposition', `inline; filename="${att.filename}"`);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable'); // 添加这行
  ```

---

### S3. TypeScript 编译目标可升级

- **文件**：`frontend/tsconfig.json:3` (`"target": "ES2021"`) + `backend/tsconfig.json:3` (`"target": "ES2022"`)
- **问题**：前端目标 ES2021 已经在所有现代浏览器中被完全支持，可以安全升级到 ES2022 以匹配后端。同时 Cloudflare Workers 运行时支持 ES2022。

- **修复建议**：统一使用 `"target": "ES2022"`。

---

### S4. 日志中缺少请求追踪

- **文件**：`backend/src/index.ts:30`
- **问题**：全局错误处理 `console.error(err)` 仅打印错误对象。在生产调试时无法关联到具体请求。CF Workers 不支持 request ID 注入，但可以通过 middleware 添加。

- **修复建议**：
  ```ts
  // 添加请求日志中间件
  app.use('/api/*', async (c, next) => {
    const start = Date.now();
    await next();
    console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`);
  });
  ```

---

### S5. 迁移脚本 `db:migrate:remote` 只执行了 init 脚本

- **文件**：`backend/package.json:7`
- **问题**：`"db:migrate:remote": "wrangler d1 execute guidebook-db --remote --file=./migrations/0001_init.sql"` 只运行了第一个迁移文件，`0002_login_attempts.sql` 和 `0003_indexes.sql` 被遗漏。本地开发不影响（wrangler dev 会自动应用所有迁移），但远程部署时需手动运行后续迁移。

- **修复建议**：使用 `wrangler d1 migrations apply guidebook-db --remote` 自动应用所有迁移，或更新文档明确列出所有迁移命令。

---

### S6. Content-Disposition 对所有文件使用 `inline`

- **文件**：`backend/src/routes/files.ts:80`
- **问题**：`Content-Disposition: inline; filename="..."` 对所有文件类型生效。对于 `.doc/.docx` 等浏览器无法内联预览的文件，应使用 `attachment` 强制下载。

- **修复建议**：
  ```ts
  const inlineTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  const disposition = inlineTypes.includes(att.mime_type) ? 'inline' : 'attachment';
  headers.set('Content-Disposition', `${disposition}; filename="${att.filename}"`);
  ```

---

### S7. `db:migrate` 脚本只引用单个文件

- **文件**：`backend/package.json:6`
- **问题**：`"db:migrate": "wrangler d1 execute guidebook-db --file=./migrations/0001_init.sql"` 与远程迁移有相同问题。建议改为 `wrangler d1 migrations apply guidebook-db` 自动执行所有待应用的迁移。

---

## ✅ 已做得好的地方

> 项目中已经正确处理的安全/可靠性项，值得肯定

1. **CORS 配置正确**（`backend/src/index.ts:11-15`）— 使用 `c.env.FRONTEND_URL` 动态读取，限定到具体域名，不使用 `*` 通配。

2. **登录速率限制实现良好**（`backend/src/routes/auth.ts:12-56`）— 基于 D1 的 per-IP 计数器 + 时间窗口滚动，参数化（5 次/5 分钟），支持 `retryAfter` 提示。登录成功自动清除记录。

3. **文件上传安全校验完善**（`backend/src/routes/files.ts:5-14` + `frontend/src/pages/admin.ts:271-280`）— 后端 MIME 白名单 + 10MB 大小限制 + 前端扩展名校验 + `accept` 属性，双层防护。

4. **JWT 实现自包含、无外部依赖**（`backend/src/utils/jwt.ts`）— 使用 Web Crypto API 的 HMAC-SHA256，算法选择合理（HS256），过期时间校验正确。

5. **设备字段验证完整**（`backend/src/routes/devices.ts:13-46`）— 名称非空、长度限制（200/10000）、日期格式（YYYY-MM-DD）一应俱全。

6. **前端全局异常捕获 + 白屏兜底**（`frontend/src/main.ts:61-91`）— `window.onerror` + `unhandledrejection` 双重监听 + `requestAnimationFrame` 检测白屏并显示刷新按钮。

7. **管理后台正确区分 401 和网络错误**（`frontend/src/pages/admin.ts:30-46`）— 401 跳转登录页，网络错误显示重试按钮，用户体验良好。

8. **前端 XSS 防护正确**（全前端）— 所有用户数据通过 `textContent` 赋值，不使用 `innerHTML` 拼接用户输入。唯一使用 `innerHTML` 的地方（白屏兜底 HTML）为硬编码。

9. **删除设备使用事务性 batch**（`backend/src/routes/devices.ts:143-146`）— D1 batch API 保证 `attachments` + `devices` 删除的原子性。R2 删除采用 best-effort + catch 静默失败。

10. **附件删除顺序已修复为 DB 先于 R2**（`backend/src/routes/files.ts:95-104`）— 防止 DB 记录删除失败时 R2 文件已被误删的问题。

11. **CI/CD 流水线设计合理**（`.github/workflows/ci.yml`）— backend typecheck + frontend typecheck & build 并行执行，仅 main 分支部署，非 main 分支自动取消旧 run。Secrets 缺失时优雅跳过（bash 内部判断而非 step if 直接引用）。

12. **健康检查端点存在**（`backend/src/index.ts:23`）— `/api/health` 返回状态和时间戳。

13. **迁移文件组织清晰**（`backend/migrations/`）— 按编号命名，`CREATE IF NOT EXISTS` 保证幂等，索引和外键约束齐全。

14. **前端构建设计规范**（`frontend/vite.config.ts`）— 开发时 API proxy 到 wrangler dev，生产构建目标 ES2020，配置简洁。

15. **Design 文档完整**（`DESIGN.md`）— 色彩 token、字体、间距、效果都有明确定义，CSS 变量与设计文档一致。

---

## 📋 修复优先级建议

推荐的修复顺序：

### 第一优先级（上线前）
1. **C1** — 设备列表添加 `adminAuth`（1 行修改）
2. **C2** — 密码哈希化（新增工具函数 + 修改登录逻辑）
3. **C3** — 文件上传事务性保证（调整 R2 上传与 DB 写入顺序）

### 第二优先级（上线后尽快）
4. **M1** — 替换 `database_id` 占位符
5. **M6** — JWT_SECRET 空值校验
6. **M3** — 升级 vite 到 5.4.9+
7. **M4** — 实现 QR 码生成

### 第三优先级（持续改进）
8. **M5** — 编写 DEPLOY.md
9. **M2** — 添加安全响应头
10. **M7** — serve.cjs 路径遍历修复
11. **M8** — 添加 favicon.svg
12. **S1-S7** — 各建议项

---

**审查总结**：该项目代码质量整体良好，架构清晰（CF Workers + D1 + R2 + Vite vanilla SPA），安全意识和防御措施较为到位。三个严重问题均为"遗漏型"缺陷（漏加中间件、漏做哈希、事务顺序），修复成本极低。修复后即可安全上线生产环境。
