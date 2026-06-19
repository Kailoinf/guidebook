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

只需 **2 步**，无需修改任何代码文件：

### 1. 创建 Cloudflare 资源

```bash
# 创建 D1 数据库（记下输出的 database_id）
npx wrangler d1 create guidebook-db

# 创建 R2 桶
npx wrangler r2 bucket create guidebook-files
```

### 2. 配置 GitHub Secrets

在仓库 **Settings → Secrets and variables → Actions** 添加 6 个 Secret：

| Secret | 值 |
|--------|-----|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（Workers/Pages/D1 权限）|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| `D1_DATABASE_ID` | 步骤 1 创建数据库返回的 ID |
| `FRONTEND_URL` | 前端域名（如 `https://guidebook.pages.dev`）|
| `JWT_SECRET` | `openssl rand -base64 32` 生成的随机密钥 |
| `ADMIN_PASSWORD_HASH` | `node scripts/generate-hash.mjs <密码>` 生成的哈希 |

> ✅ 配置完成后，**push 到 main 即自动部署**。CI 会自动：
> 1. 替换 database_id 占位符
> 2. 应用 D1 数据库迁移
> 3. 部署后端到 Workers
> 4. 部署前端到 Pages
```

---

## 手动部署（可选）

如不使用 CI，也可手动部署：

```bash
# 后端
cd backend
sed -i "s/00000000-0000-0000-0000-000000000000/<你的database_id>/" wrangler.toml
npx wrangler d1 migrations apply guidebook-db --remote
npx wrangler deploy --var FRONTEND_URL:"https://你的域名" --var JWT_SECRET:"你的密钥" --var ADMIN_PASSWORD_HASH:"你的哈希"

# 前端
cd ../frontend
echo 'VITE_API_BASE=https://guidebook.<subdomain>.workers.dev' > .env.production
pnpm install && pnpm build
npx wrangler pages deploy dist --project-name=guidebook
```

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
