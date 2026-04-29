# 公考记录系统

公考学习、刷题、资料、总结与统计记录系统。项目使用 Vite + React + TypeScript 构建，并通过 GitHub Pages 发布为静态站点。

## 线上地址

GitHub Pages 地址：

https://agent-ovo.github.io/Answer_Record_System/

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

## 环境变量

如需 Gemini API，请复制 `.env.example` 为 `.env.local` 并填写：

```text
GEMINI_API_KEY="..."
```

当前前端代码没有直接调用 Gemini API。正式接入时不要把私密 API Key 直接暴露在浏览器端，建议使用后端代理或服务端函数。
