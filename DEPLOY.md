# 部署指南

本文档描述如何通过 **Cloudflare Git 集成**部署 Guidebook（无需 GitHub Actions / CI 部署）。

---

## 前置条件

- **Node.js** >= 22（本地开发用）
- **pnpm** >= 11.8
- **Cloudflare 账号**
- GitHub 仓库已推送

---

## 首次部署（全在 Cloudflare 控制台操作）

### 1. 创建 Cloudflare 资源

```bash
# 创建 D1 数据库（记下输出的 database_id）
npx wrangler d1 create guidebook-db

# 创建 R2 桶
npx wrangler r2 bucket create guidebook-files
```

### 2. 创建 Workers 项目并连接 Git

1. 进入 **Cloudflare Dashboard → Workers & Pages → Create → Workers**
2. 选择 **Connect to Git**，连接你的 GitHub 仓库
3. 选择 `guidebook` 仓库
4. 构建设置：
   - **Root directory**: `backend`
   - **Build command**: `pnpm install`
   - **Deploy command**: `npx wrangler deploy`
5. 保存

### 3. 在 Workers 项目设置环境变量

进入 **Workers → guidebook → Settings → Variables and Secrets**，添加：

| 变量名 | 类型 | 值 |
|--------|------|-----|
| `D1_DATABASE_ID` | Plain text | 步骤 1 创建数据库返回的 ID |
| `FRONTEND_URL` | Plain text | 前端域名（如 `https://guidebook.pages.dev`）|
| `JWT_SECRET` | Secret（加密）| `openssl rand -base64 32` 生成的随机密钥 |
| `ADMIN_PASSWORD_HASH` | Secret（加密）| `node scripts/generate-hash.mjs <密码>` 生成的哈希 |

> ⚠️ `wrangler.toml` 中 `database_id = "${D1_DATABASE_ID}"` 会自动从环境变量读取，**无需修改任何文件**。

### 4. 应用数据库迁移

首次部署前，手动执行一次迁移：

```bash
cd backend
npx wrangler d1 migrations apply guidebook-db --remote
```

### 5. 部署前端到 Pages

1. 进入 **Cloudflare Dashboard → Workers & Pages → Create → Pages**
2. **Connect to Git**，选择同一仓库
3. 构建设置：
   - **Root directory**: `frontend`
   - **Build command**: `pnpm install && pnpm build`
   - **Output directory**: `dist`
4. 保存并部署

5. 部署成功后，把 Pages 域名（如 `https://guidebook.pages.dev`）填回步骤 3 的 `FRONTEND_URL`

---

## 后续部署

**完全自动**——push 到 main 分支后，Cloudflare 会自动检测、构建并部署前后端。无需任何手动操作。

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
npx wrangler dev                 # http://localhost:8787

# 前端（另开终端）
cd frontend
pnpm install
pnpm dev                         # http://localhost:5173，自动代理到后端
```

### 生成本地密码哈希

```bash
node ../scripts/generate-hash.mjs <密码>
# 把输出写入 backend/.dev.vars 的 ADMIN_PASSWORD_HASH
```
