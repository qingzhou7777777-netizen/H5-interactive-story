# STAGING_INITIALIZATION_RUNBOOK

> 本Runbook对应当前仓库已实现的命令。它不创建资源，也不能用于Production。

## 0. 前置条件

- Staging资源已经得到单独授权并完成创建。
- Staging拥有独立Pages项目、Railway环境/PostgreSQL、R2 Bucket、Tunnel、Access应用和Auth0 Tenant。
- API、Gateway和初始化镜像由同一个Commit构建。
- Railway API和Gateway没有公共Domain。
- 已确认`SEED_ACTIVE_PAYMENT_OFFER_CODES`的业务规则。
- 正式候选MP4均不超过99,614,720字节。
- 已创建可恢复的Staging数据库备份点。

## 1. Commit与Tag

```text
git status --short
git rev-parse HEAD
git tag --list "v*-rc.*"
```

要求工作树干净，记录Commit SHA，并为候选版本创建经批准的RC Tag，例如`v0.17.2-rc.1`。所有后续镜像使用同一SHA和Image Digest，不重新从不同源码构建。

## 2. 构建初始化镜像

```text
docker build -f deploy/production/Dockerfile.init -t interactive-story-init:<COMMIT_SHA> .
```

初始化镜像入口为`scripts/production-init.mjs`，一次只允许一个步骤。

## 3. Migration

```text
docker run --rm --env-file <STAGING_ENV_FILE> interactive-story-init:<COMMIT_SHA> migrate
```

实际执行：

```text
npx prisma migrate deploy --schema database/schema.prisma
```

非零退出码立即停止。记录Migration名称和日志。

## 4. 基础Seed

先在一次性Job中显式设置：

```text
BASE_SEED_CONFIRMATION=INITIALIZE_EMPTY_DATABASE
SEED_ACTIVE_PAYMENT_OFFER_CODES=<USER_CONFIRMED_COMMA_SEPARATED_CODES>
```

然后执行：

```text
docker run --rm --env-file <STAGING_ENV_FILE> interactive-story-init:<COMMIT_SHA> seed
```

初始化镜像预先编译Seed，步骤实际运行`node database/dist/seed.js`并强制`SEED_EXECUTION_MODE=initialize`。仓库中的`npm run db:seed`也会先编译再执行同一产物。历史Migration会写入一个字段完全固定的DRAFT占位Story，首次Seed只允许这一行存在；任何被修改的Story、Character、Chapter、目标VideoAsset或PaymentOffer都会让命令失败且不覆盖数据。完成后立即从长期环境变量中移除`BASE_SEED_CONFIRMATION`。

## 5. 上传正式候选媒体

使用同一Commit的私有API和Admin Gateway，通过已启用的Staging Access进行初始化上传；此时不得开放H5真实用户流量。

依次上传Node001–004：

- 1920×1080 MP4
- H.264 + AAC
- Fast Start
- 小于等于99,614,720字节
- 1920×1080 JPEG Poster，小于等于300 KiB

## 6. 检查VideoAsset

对四个VideoAsset逐项确认：

- `status=READY`
- `playbackPath`属于`https://media-staging.bt-ik.top/`
- `posterPath`属于`https://media-staging.bt-ik.top/`
- 不再包含本地`/media/chapter01/`或SVG Poster路径
- 数据库对象Key和R2实际对象一致
- 视频`GET/HEAD/Range`、CORS和`206 Content-Range`通过

任何一项失败都停止，不发布ChapterRelease。

## 7. PaymentOffer检查

读取三个Offer的`code/status`，与经过用户确认的`SEED_ACTIVE_PAYMENT_OFFER_CODES`逐项比对。当前仓库不替用户决定激活1个还是3个；未取得确认时必须停止。

## 8. ChapterRelease

```text
docker run --rm --env-file <STAGING_ENV_FILE> interactive-story-init:<COMMIT_SHA> release chapter-01
```

实际运行已编译脚本：

```text
node apps/api/dist/scripts/publish-initial-chapter-release.js chapter-01
```

确认ACTIVE Release v1、Release ID、`contentHash`，并检查Snapshot只包含Staging正式候选媒体URL。已存在ACTIVE Release时当前发布器会复用，因此若媒体不正确必须停止，不能假装重新发布。

## 9. Story Map Seed

```text
docker run --rm --env-file <STAGING_ENV_FILE> interactive-story-init:<COMMIT_SHA> story-map
```

确认地图绑定步骤8的Release ID；配置不一致时Seed会失败而不是覆盖。

## 10. 部署同一不可变版本

- API：步骤1的Commit/Image Digest。
- Gateway/Admin：步骤1的Commit/Image Digest。
- H5 Pages：步骤1的Commit。
- 不重新构建其他Commit。
- 不为API或Gateway生成Railway公网Domain。

## 11. 完整冒烟

- Auth0 Login/Callback/Refresh/Logout。
- 账号开始chapter-01、Node001选择A、主线Node002。
- Map、Node003 Exploration、Replay Node001和主线隔离。
- 主线/Exploration/Map刷新恢复。
- 匿名模式。
- Analytics主线语义和Exploration/Replay隔离。
- `docs/admin-security-acceptance.md`全部Staging项。
- R2 CORS、Range、Cache。

正式OIDC UI尚未实现，因此当前无法完成这一节，不能把Runbook标记为通过。

## 12. 留档

记录：Commit SHA、RC Tag、API/Init/Gateway Image Digest、Pages Deployment ID、Migration日志、Seed日志、媒体Checksum和Object Key、PaymentOffer状态、Release ID/version/contentHash、Story Map ID、数据库备份ID、Access测试日志及冒烟结果。
