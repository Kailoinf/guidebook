# Guidebook 📖

家庭物品说明书管理系统 —— 给家里的每件物品建立说明书知识库。

## 特性

- 📱 **扫码即查** —— 每件物品一个 UUID + 二维码，贴在物品上，扫码直达说明书
- 🔒 **防爬虫** —— 无搜索功能，只能通过 UUID 链接访问
- 🛠️ **管理后台** —— 授权用户可增删改查设备信息
- 📎 **附件存储** —— 支持上传 PDF / 图片说明书
- 📝 **Markdown** —— 使用方法、注意事项、维护保养均支持 Markdown

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Cloudflare Workers + Hono |
| 前端 | TypeScript + Vite |
| 数据库 | Cloudflare D1 (SQLite) |
| 存储 | Cloudflare R2 |
| 认证 | JWT + PBKDF2 密码哈希 |

## 本地开发

在 `backend/` 目录下创建 `.dev.vars` 文件：

```
JWT_SECRET=your-secret-here
ADMIN_PASSWORD_HASH=<hash>
```

其中 `ADMIN_PASSWORD_HASH` 使用脚本生成：

```bash
node scripts/generate-hash.mjs <你的管理员密码>
```

## 项目结构

```
guidebook/
├── backend/          # CF Workers API
│   ├── src/
│   ├── migrations/   # D1 SQL
│   └── wrangler.toml
├── frontend/         # Vue 3 SPA
│   └── src/
└── README.md
```

## 部署

详见 [DEPLOY.md](./DEPLOY.md)
