# 公考记录系统

公考学习、刷题、资料、总结与统计记录系统。项目使用 Vite + React + TypeScript 构建，并通过 GitHub Pages 发布为静态站点。

## 线上地址

GitHub Pages 地址：

```text
https://agent-ovo.github.io/Answer_Record_System/
```

首次启用时，需要在 GitHub 仓库的 `Settings -> Pages` 中确认 `Build and deployment` 的 `Source` 为 `GitHub Actions`。之后推送到 `main` 分支会自动构建并部署。

## 本地运行

前置条件：Node.js 20+

```powershell
npm install
npm run dev
```

本地开发地址默认是：

```text
http://localhost:3000
```

## 本地构建

```powershell
npm run build
```

GitHub Pages 构建由 `.github/workflows/deploy.yml` 自动完成，工作流会使用 `GITHUB_PAGES=true` 将 Vite base 设置为 `/Answer_Record_System/`。

## Supabase 多端同步

项目支持两种模式：

- 未配置 Supabase：继续使用浏览器本地账号和本地数据。
- 配置 Supabase：使用 Supabase Auth 登录，并把题目练习、素材积累、每日总结同步到 Supabase Database。

配置步骤：

1. 在 Supabase 项目中打开 `SQL Editor`。
2. 执行 [supabase/schema.sql](supabase/schema.sql)。
3. 复制 `.env.example` 为 `.env.local`。
4. 填写 Supabase 项目的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。`VITE_SUPABASE_ANON_KEY` 可以使用 Supabase 的 publishable key，旧项目也可以使用 legacy anon key。
5. 重新运行或重新部署项目。

如果部署到 GitHub Pages，还需要在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 中添加两个 Repository secrets：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

本地 `.env.local` 示例：

```text
VITE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
```

如果你希望注册后立刻登录，可以在 Supabase 控制台的 `Authentication -> Providers -> Email` 中关闭邮箱确认；如果保持邮箱确认开启，用户需要先完成邮箱验证再登录。

## 环境变量

如需 Gemini API，请复制 `.env.example` 为 `.env.local` 并填写：

```text
GEMINI_API_KEY="..."
```

当前前端代码没有直接调用 Gemini API。正式接入时不要把私密 API Key 直接暴露在浏览器端，建议使用后端代理或服务端函数。

## 账号模式

本地模式使用浏览器本地账号做轻量访问控制。清理浏览器数据会删除本地账号和学习记录。

Supabase 模式使用云端账号和 Row Level Security，每个用户只能访问自己的学习记录。多端使用同一个邮箱和密码登录后，会同步同一份数据。
