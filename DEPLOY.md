# 部署指南

本文档描述如何将 Guidebook 部署到 Cloudflare Workers + D1 + R2 + Pages。

---

## 前置条件

- **Node.js** >= 22（推荐 v24）
- **pnpm** >= 11.8（`corepack enable && corepack prepare pnpm@latest --activate`）
- **Cloudflare 账号** + API Token（需 Workers、D1、R2、Pages 权限）
- **wrangler CLI**（`npm i -g wrangler` 或用 `npx wrangler`）
- 已登录 wrangler：`npx wrangler login`

---

## 首次部署

### 1. 创建 Cloudflare 资源

```bash
# 创建 D1 数据库
npx wrangler d1 create guidebook-db
# 记下输出的 database_id，下一步要用

# 创建 R2 桶
npx wrangler r2 bucket create guidebook-files
```

### 2. 更新 wrangler.toml（仅 database_id）

打开 `backend/wrangler.toml`，只需改一处——把 database_id 占位符换成真实值：

```toml
[[d1_databases]]
database_id = "<步骤1返回的真实 database_id>"
```

> ⚠️ wrangler.toml 不包含任何密钥或环境变量，全部在 CF 控制台设置。

### 3. 在 Cloudflare 控制台设置环境变量

进入 **Cloudflare Dashboard → Workers & Pages → guidebook → Settings → Variables and Secrets**，添加以下 3 个变量（全部选 **Secret** / Encrypt）：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `FRONTEND_URL` | `https://你的前端域名` | 前端地址（如 `https://guidebook.pages.dev`）|
| `JWT_SECRET` | 随机字符串 | `openssl rand -base64 32` 生成 |
| `ADMIN_PASSWORD_HASH` | `salt:hash` | `node scripts/generate-hash.mjs <密码>` 生成 |

也可以用命令行设置（效果相同）：

```bash
cd backend
npx wrangler secret put FRONTEND_URL
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_PASSWORD_HASH
```

> ⚠️ 所有 key 只在 CF 控制台或 `wrangler secret put` 中设置，绝不写进 wrangler.toml。

### 4. 应用数据库迁移

```bash
cd backend

# 应用所有迁移到远程 D1
npx wrangler d1 migrations apply guidebook-db --remote
```

或手动逐个执行：

```bash
npx wrangler d1 execute guidebook-db --remote --file=migrations/0001_init.sql
npx wrangler d1 execute guidebook-db --remote --file=migrations/0002_login_attempts.sql
npx wrangler d1 execute guidebook-db --remote --file=migrations/0003_indexes.sql
```

### 5. 部署后端到 Workers

```bash
cd backend
pnpm install
npx wrangler deploy
# 记下输出的 Worker URL，如 https://guidebook.<subdomain>.workers.dev
```

### 6. 部署前端到 Pages

```bash
cd frontend

# 设置生产环境 API 地址（指向后端 Worker URL）
echo 'VITE_API_BASE=https://guidebook.<subdomain>.workers.dev' > .env.production

pnpm install
pnpm build

# 部署到 Cloudflare Pages
npx wrangler pages deploy dist --project-name=guidebook
```

---

## CI/CD 自动部署

仓库已配置 GitHub Actions（`.github/workflows/ci.yml`）：

- **push 到 main** → 自动构建 + 部署到 Cloudflare
- **其他分支** → 仅运行 typecheck + build 检查

### 配置 GitHub Secrets

在仓库 **Settings → Secrets and variables → Actions** 添加：

| Secret | 说明 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（Workers/Pages 权限）|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| `FRONTEND_URL` | 前端生产域名（如 `https://guidebook.pages.dev`）|
| `JWT_SECRET` | JWT 签名密钥（强随机字符串）|
| `ADMIN_PASSWORD_HASH` | 管理员密码的 PBKDF2 哈希 |

配置后，push 到 main 即自动部署。

---

## 验证部署

```bash
# 1. 健康检查
curl https://<worker-url>/api/health
# 应返回 {"status":"ok","time":"..."}

# 2. 未认证访问设备列表应被拒绝
curl https://<worker-url>/api/devices
# 应返回 401 Unauthorized

# 3. 登录获取 token
curl -X POST https://<worker-url>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"<你的密码>"}'
# 应返回 {"token":"eyJ..."}

# 4. 检查安全响应头
curl -I https://<worker-url>/api/health
# 应包含 X-Content-Type-Options、X-Frame-Options、Strict-Transport-Security
```

---

## 本地开发

```bash
# 后端
cd backend
cp .dev.vars.example .dev.vars   # 填入本地密钥
pnpm install
npx wrangler dev                 # 默认 http://localhost:8787

# 前端（另开终端）
cd frontend
pnpm install
pnpm dev                         # 默认 http://localhost:5173，自动代理到后端
```

### 生成本地密码哈希

```bash
node ../scripts/generate-hash.mjs <密码>
# 把输出写入 backend/.dev.vars 的 ADMIN_PASSWORD_HASH
```
