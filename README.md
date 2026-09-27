# 互动剧情 H5 技术框架

当前仓库已完成内容 API、轻量 CMS、视频上传、匿名 Analytics、Landing 和商业漏斗看板，并进入第十二阶段 Production Ready 修复。剧情状态机保持不变；`Story`、`Chapter`、`Node`、`Choice`、`VideoAsset` 仍由 PostgreSQL/Prisma 管理，H5 默认从 API 加载章节。API 不可用或数据非法时，H5 会明确提示并切换到本地测试剧情。

本阶段没有实现支付、用户体系、复杂 CMS 权限或 AI 功能。数据库种子中的视频地址和封面仍是联调占位资源，不代表真实素材已验收。

## 工作区

- `apps/h5`：React 移动端互动剧情 H5
- `apps/admin`：轻量内容管理和 Analytics Dashboard
- `apps/api`：Fastify 内容 API
- `packages/story-core`：剧情领域模型、运行状态机、本地 fallback 剧情和图校验
- `packages/api-contracts`：H5/API 共用数据合约
- `packages/shared`：通用基础类型
- `database`：Prisma Schema、迁移和示例剧情种子

## 内容链路

```text
PostgreSQL -> Prisma Repository -> Fastify API -> Chapter Adapter
           -> 既有 story-core 状态机 -> React H5

API 加载失败 -> local-test-story fallback -> 既有 story-core 状态机
```

示例章节流程为：

```text
Node001(video)
  A -> Node002(video) -> Ending002
  B -> Node003(video) -> Ending003
  C -> Node004(video) -> Ending004
```

## API

- `GET /health`、`GET /health/live`：进程健康检查
- `GET /health/ready`：数据库 readiness
- `GET /v1/chapters/:chapterCode`：获取可用章节及完整节点图
- `GET /v1/chapters/:chapterCode/nodes/:nodeId`：获取单个节点
- `GET /v1/video-assets/:assetId`：获取已就绪视频资源
- `POST /v1/chapters/:chapterCode/choices`：校验当前节点选项并返回目标节点

提交选择请求体：

```json
{
  "nodeId": "Node001",
  "choiceId": "choice-a"
}
```

该接口目前是无用户、无会话的无状态剧情校验，不承担权益或支付授权。

## 本地启动

1. 复制 `.env.example` 为 `.env`。
2. 执行 `npm install`。
3. 执行 `docker compose up -d postgres`。
4. 执行 `npm run db:generate`。
5. 执行 `npm run db:migrate`。
6. 执行 `npm run db:seed`。
7. 分别执行 `npm run dev:api`、`npm run dev:h5`；需要查看后台壳应用时再执行 `npm run dev:admin`。

默认地址：

- H5：`http://localhost:5173`
- Admin：`http://localhost:5174`
- API：`http://localhost:3000`

H5 默认请求 `http://localhost:3000`，可通过 `VITE_API_BASE_URL` 覆盖。API 不可用时页面会进入本地 fallback，便于离线开发；fallback 不是生产数据源。

生产构建会通过 `VITE_API_BASE_URL` 注入 HTTPS API 地址；未注入时只允许使用同源反向代理，不再回退到 localhost。生产容器、HTTPS、SPA rewrite、Admin CIDR 隔离和 S3 配置见 `docs/production-deployment.md`。

## 验证

```text
npm run db:validate
npm run typecheck
npm test
npm run build
```

正式视频规范和真机验收要求见 `docs/video-asset-acceptance.md`。正式资源映射模板仍位于 `apps/h5/src/features/video-assets/real-video-assets.template.ts`，在真实 MP4/JPEG 全部上传并通过验收前不要将占位资源标记为正式内容。
