# Production部署边界

> 第17.2B阶段只准备代码和配置。本文不授权创建云资源、切换 `bt-ik.top` 或开放Admin。

## 冻结拓扑

```text
Cloudflare Pages H5
  -> api.bt-ik.top
  -> Cloudflare Tunnel
  -> Railway private gateway
  -> Railway private API
  -> Railway PostgreSQL

admin.bt-ik.top
  -> Cloudflare Access
  -> the same Tunnel
  -> private Admin gateway
  -> /v1/admin/* on the private API

media.bt-ik.top
  -> Cloudflare R2 custom domain
```

Railway的API、Gateway和cloudflared服务不得生成公共Domain，不得发布Host Port。H5只部署到Cloudflare Pages；第17.1阶段旧Linux整机方案的`Dockerfile.web`和`Caddyfile`已移除，避免误部署。

## 构建单元

- API：`deploy/production/Dockerfile.api`
- 一次性初始化Job：`deploy/production/Dockerfile.init`
- Admin私有Gateway：`deploy/production/Dockerfile.gateway`
- Gateway规则：`deploy/production/Caddyfile.gateway`
- Tunnel入口模板：`deploy/production/cloudflared-config.example.yml`
- H5：Cloudflare Pages执行`npm ci`后运行`npm run build --workspace @interactive-story/h5`

`compose.production.yaml`只用于本地解析和生产形态审查。它默认读取不可用的`.env.production.example`；真实环境必须通过`RUNTIME_ENV_FILE`指向Secret Store生成的临时文件。`cloudflared`与初始化服务均通过Profile显式启用；它不是授权部署脚本。

## 配置校验

```text
npm run verify:repository-hygiene
npm run verify:production-security
docker compose --env-file deploy/production/.env.production.example -f deploy/production/compose.production.yaml config
```

示例环境文件故意保留不可用占位值，不可直接连接Production。

## 初始化

API启动不会自动执行Migration或Seed。初始化镜像每次只接受一个步骤：

```text
node scripts/production-init.mjs migrate
node scripts/production-init.mjs seed
node scripts/production-init.mjs release chapter-01
node scripts/production-init.mjs story-map
```

正式执行顺序和停止条件以`docs/staging-initialization-runbook.md`为准。

## 媒体

正式Node001–004必须满足：

- MP4、H.264、AAC、1920×1080、Fast Start。
- 1920×1080 JPEG Poster，最大300 KiB。
- 每个视频不超过99,614,720字节。
- 不使用分片上传或Browser直传R2。

当前仓库MP4和SVG Poster只用于本地联调，不是正式素材。

## 生产阻断项

- Auth0正式Login/Callback/Refresh/Logout尚未实现。
- 正式PaymentOffer激活规则仍需用户确认。
- Tunnel、Access、MFA、R2、Railway PostgreSQL均未创建或实测。
- 只有`docs/admin-security-acceptance.md`的全部Staging项通过后，Admin边界才能验收。
- 正式素材、真机和广告内置浏览器验收未完成。

因此当前仍为`PRODUCTION NO-GO`。
