# AI 互动剧情 H5 项目交接文档

> 用途：切换到新的 Codex 窗口后继续开发时的首要上下文。
>
> 最后核对日期：2026-09-27（Asia/Shanghai）。
>
> 事实来源优先级：当前代码与 Prisma migration > 当前本地数据库只读核对结果 > 本文。不得用本文替代实际代码检查。
>
> 安全要求：本文不记录任何 Key、Token、密码或真实连接串，只记录环境变量名称。

## 0. 接手时先看结论

- 项目已完成到**第 16.6 阶段：Exploration / Replay H5 完整运行接入**。
- 当前下一阶段是**第 16.7 阶段：本地完整用户路径最终验收**。
- 第 16.7 阶段只验证完整本地用户路径，不进入生产部署，也不新增产品功能。
- 本地代码、类型检查、构建和主要功能测试可运行；H5 56 项测试全部通过。
- 当前完整 API 测试不是全绿：存在既有 `video-inspector` 断言失败；Story Run PostgreSQL 集成测试还观察到时序型间歇 503，详见“已知问题”和“测试状态”。
- `https://bt-ik.top` 当前可以访问，但它是**旧的 Cloudflare Pages 纯静态版本**，公开构建不包含 Story Map、Exploration、Replay 或账号Token逻辑，也没有公网 API。
- 当前生产环境结论仍是 **NO-GO**。不得把本地验证通过写成生产上线完成。
- 工作区根目录当前不是 Git checkout（没有可用 `.git`），因此本文的“最近修改文件”来自第 16.6 阶段实际改动记录，而不是 `git diff`。

## 1. 项目当前目标

### 1.1 当前产品是什么

这是一个用于商业验证的 **AI 恋爱互动剧情 H5 MVP**。用户观看预制剧情视频，在视频结束节点做选择，进入对应分支；账号用户还可以查看剧情地图、进入独立 Exploration Run 或 Replay Run。

项目名称包含“AI”，但当前版本没有实时 AI 对话、实时生成剧情、AI 语音或真人 3D 扫描。当前内容全部由数据库/发布快照中的 Node、Choice 和预制视频驱动。它不是正式游戏，也不是完整内容平台。

### 1.2 当前 MVP 目标

形成一条可验证的最小体验链路：

```text
Landing
  -> 主线互动视频
  -> 视频内 Choice
  -> 分支视频 / Ending
  -> 剧情地图
  -> Exploration / Replay
  -> 返回地图
  -> 解锁下一章付费意向入口
```

当前支付按钮只记录付费意向，不扣款、不发放权益，也不等价于支付成功。

### 1.3 当前验证目标

- 验证用户是否愿意进入并完成互动剧情。
- 验证视频内 Choice 是否易于理解和操作。
- 验证用户是否会探索非当前主线节点、重新观看已完成节点。
- 验证剧情地图是否能表达发现、解锁、完成和可操作状态。
- 验证用户对“解锁下一章”是否表现出付费意愿。
- 验证主线、探索、回看三个运行上下文不会互相污染。

## 2. 当前阶段

### 2.1 已完成到第 16.6 阶段

第 16.5 阶段完成了账号剧情地图页面 `/story-map/:chapterCode`。第 16.6 阶段进一步把地图操作入口与 16.4B 已存在的服务端 Run 生命周期连接起来。

### 2.2 第 16.6 阶段实际完成内容

- 地图“开始探索/再次探索”真实调用 Exploration Run start API。
- 地图“重新观看”真实调用 Replay Run start API。
- 沿用现有 `/story` 页面和同一个 `VideoPlayer`，没有复制第二套播放器。
- 播放器明确支持 `mainline`、`exploration`、`replay` 三种运行模式。
- Exploration 保存服务端返回的 `runId`、`run.version`、`engineSnapshot` 和 `chapterCode`。
- Exploration 的视频完成、Choice、刷新恢复和主动 abandon 已接入对应服务端 API。
- Replay 只播放指定节点，不显示 Choice；完成后自动返回地图。
- Run结束后清理独立 sessionStorage 缓存，返回地图并重新请求 Map API。
- Run 模式不写主线 localStorage，不调用主线剧情 Analytics Hook。
- 没有修改 `story-core`、StoryEngine、`chapter-adapter`、公共 DTO、主线事务或 Map Service 规则。

### 2.3 当前下一阶段

**第 16.7 阶段——本地完整用户路径最终验收。**

目标路径：

```text
账号
  -> 主线
  -> 剧情地图
  -> Exploration
  -> 地图状态更新
  -> Replay
  -> 返回地图
  -> 主线仍保持原进度
```

本阶段暂不进入生产部署，不新增剧情规则、支付、登录页面或其他功能。

## 3. 当前技术架构与已完成核心能力

### 3.1 技术架构

- Monorepo：npm workspaces。
- H5：React 19、TypeScript、Vite 7、Tailwind CSS 4、React Router。
- API：Fastify 5、TypeScript、Prisma 6。
- 数据库：PostgreSQL 16。
- 状态机：`packages/story-core` 中的纯 TypeScript StoryEngine。
- API/H5共享类型：`packages/api-contracts`。
- 内容链路：PostgreSQL -> Prisma Repository -> API DTO -> `chapter-adapter` -> StoryEngine -> React。
- 账号主线与Run均以 ChapterRelease snapshot 为内容基线，不直接依赖后来被编辑的活动内容表。

### 3.2 已完成核心能力

| 能力 | 当前真实状态 |
| --- | --- |
| StoryEngine | 已完成。支持 video、choice、ending，状态为 idle/playing/awaiting_choice/ended，并校验快照和跳转。 |
| 数据驱动 Node / Choice | 已完成。Node、Choice、VideoAsset来自PostgreSQL/API，不在页面硬编码跳转关系。 |
| 视频播放器 | 已完成基础稳定性：加载、错误、超时、有限重试、自动播放降级、资源释放、移动端内联播放。 |
| PC 16:9 / 全屏 / 视频内 Choice | 已实现并通过H5测试。Choice文字继续来自数据；全屏按钮位于播放器下方控制区并保持全屏容器。 |
| PostgreSQL | 本地 PostgreSQL 16 可用；当前有9条migration，已包含账号、地图和Run结构。 |
| ChapterRelease | 已完成模型、发布器和发布快照；本地 `chapter-01` 当前 ACTIVE Release 版本为1。 |
| OIDC/JWT认证基础 | 服务端已完成远程JWKS验证、issuer/audience/algorithm校验、Bearer认证和错误映射。 |
| User账号映射 | 已完成。以 `(authIssuer, authSubject)` 唯一映射外部身份，保存已验证email和lastLoginAt。 |
| UserChapterProgress | 已完成主线canonical snapshot、currentNode、progressVersion及乐观锁事务。 |
| UserNodeProgress | 已完成主线/地图使用的节点发现、可用、完成次数和时间事实。 |
| UserChoiceDecision | 已完成主线Choice持久化与requestKey幂等。 |
| StoryMap数据库结构 | 已完成 Region、Map Node、Prerequisite及对应migration。 |
| StoryMapService | 已完成服务端 Discovery/Unlock 投影；隐藏节点不会出现在Map响应。 |
| Map API | `GET /v1/me/chapters/:chapterCode/map` 已存在并接入H5。 |
| chapter-01地图Seed | 已完成；本地数据库当前为1个Region、4个Map Node、8条Prerequisite。 |
| Exploration Run | 已完成独立Run、独立snapshot、runVersion、play session、Choice decision、完成与abandon。 |
| Replay Run | 已完成指定单节点回看和completion；服务端Map事实明确排除Replay。 |
| H5剧情地图 | 已完成 `/story-map/:chapterCode`，只渲染API实际返回的Region/Node和动作。 |
| 三模式播放器接入 | mainline/exploration/replay共用同一StoryPage、StoryEngine Hook和VideoPlayer；状态源相互隔离。 |

## 4. 三种运行模式的真实实现方式

### 4.1 mainline

#### 账号主线

- 状态来源：`UserChapterProgress`。
- 首次进入先调用 `GET /v1/me/chapters/:chapterCode/progress`；收到 `CHAPTER_PROGRESS_NOT_FOUND` 时调用 `POST /start`。
- snapshot来源：服务端 `UserChapterProgress.canonicalSnapshot`，通过 `AccountChapterProgressResponse.engineSnapshot` 返回。
- 当前版本来源：`progress.version`，即数据库 `progressVersion`。
- 视频完成：调用 `POST /v1/me/chapters/:chapterCode/video-completions`，传 `releaseId`、`nodeCode`、`expectedProgressVersion`、`requestKey`。
- Choice：调用 `POST /v1/me/chapters/:chapterCode/choices`，传 `releaseId`、`sourceNodeCode`、`choiceCode`、`expectedProgressVersion`、`requestKey`。
- H5不自行生成服务端snapshot；每次事务成功后恢复响应中的新snapshot。
- 返回地图：账号模式播放器顶部“返回剧情地图”进入 `/story-map/:chapterCode`。

#### 匿名/公共内容模式

- 无账号Token时使用公共Chapter API；API失败时明确提示并使用本地fallback剧情。
- 匿名状态仍使用既有localStorage快照。
- 公共Choice接口只校验Choice并返回目标，不保存账号进度。
- 第16.6没有改变匿名模式原行为。

### 4.2 exploration

- 创建方式：地图节点必须由API返回 `canExplore=true`，点击后调用 `POST /v1/me/chapters/:chapterCode/exploration-runs`。
- `runId`来源：start API响应中的 `run.id`。
- `runVersion`来源：每次服务端响应中的 `run.version`；H5不自行加一。
- snapshot来源：每次Run响应中的 `engineSnapshot`，对应数据库 `UserExplorationRun.canonicalSnapshot`。
- H5将Release中的Chapter DTO适配为运行时内容，并使用服务端snapshot的storyId和Run入口恢复独立StoryEngine；不会从主线snapshot恢复探索。
- 视频完成：`POST .../exploration-runs/:runId/video-completions`。
- Choice：`POST .../exploration-runs/:runId/choices`。
- 每次视频完成/Choice都传当前服务端确认的 `expectedRunVersion` 和新的 `requestKey`，并恢复响应中的新snapshot。
- 刷新恢复：调用 `GET .../exploration-runs/:runId`，以服务端canonical snapshot覆盖本地缓存。
- Run缓存：只放在独立sessionStorage key中，不写主线localStorage。
- 正常结束：清除Run缓存，返回 `/story-map/:chapterCode`，地图重新挂载并重新请求Map API。
- 主动退出：ACTIVE Run先调用 `POST .../abandon`，成功后清缓存并返回地图。
- 不修改主线的原因：服务端使用 `UserExplorationRun`、`UserNodePlaySession`、`UserExplorationChoiceDecision` 保存探索过程；不会写 `UserChapterProgress.canonicalSnapshot/progressVersion` 或主线 `UserChoiceDecision`。数据库集成测试包含“探索后主线完全不变”的断言。

### 4.3 replay

- 创建方式：Map响应必须为completed且 `canReplay=true`，点击后调用 `POST /v1/me/chapters/:chapterCode/replay-runs`。
- Replay同样使用服务端返回的 `run.id`、`run.version` 和 `engineSnapshot`。
- H5基于服务端指定入口构造单视频节点运行时视图，强制不展示Choice。
- 视频完成：调用 `POST .../replay-runs/:runId/video-completions`。
- 完成后：清除Replay缓存，自动返回剧情地图并重新请求Map API。
- 当前服务端没有Replay GET恢复接口，也没有Replay abandon接口；刷新依赖sessionStorage中的最后一次完整服务端响应。关闭浏览器会丢失该恢复缓存，这是当前已知限制。
- Replay不会产生Discovery/Unlock：Map Service只把 `mode=EXPLORATION` 的Run收集为探索事实，明确忽略Replay；数据库集成测试包含Replay前后Map完全相等的断言。

## 5. 当前关键 API

账号相关接口只有在 `ACCOUNT_PROGRESS_ENABLED=true` 且OIDC配置完整时才注册；均要求Bearer Token。

### 5.1 账号认证

- `GET /v1/me`：验证Bearer JWT、映射/更新User并返回当前账号。

当前没有登录、回调、刷新Token或登出API；外部OIDC登录页面/客户端流程尚未实现。

### 5.2 Account Progress

- `GET /v1/me/chapters/:chapterCode/progress`
- `POST /v1/me/chapters/:chapterCode/start`
- `POST /v1/me/chapters/:chapterCode/video-completions`
- `POST /v1/me/chapters/:chapterCode/choices`

### 5.3 Story Map

- `GET /v1/me/chapters/:chapterCode/map`

### 5.4 Exploration

- `POST /v1/me/chapters/:chapterCode/exploration-runs`
- `GET /v1/me/chapters/:chapterCode/exploration-runs/:runId`
- `POST /v1/me/chapters/:chapterCode/exploration-runs/:runId/video-completions`
- `POST /v1/me/chapters/:chapterCode/exploration-runs/:runId/choices`
- `POST /v1/me/chapters/:chapterCode/exploration-runs/:runId/abandon`

### 5.5 Replay

- `POST /v1/me/chapters/:chapterCode/replay-runs`
- `POST /v1/me/chapters/:chapterCode/replay-runs/:runId/video-completions`

当前实际不存在Replay GET、Replay Choice或Replay abandon接口。

### 5.6 公共内容 API

- `GET /v1/chapters/:chapterCode`
- `GET /v1/chapters/:chapterCode/nodes/:nodeId`
- `GET /v1/video-assets/:assetId`
- `POST /v1/chapters/:chapterCode/choices`

### 5.7 其他当前已存在接口

- 健康检查：`GET /health`、`GET /health/live`、`GET /health/ready`。
- 商业测试：`GET /v1/commercial-test/offers/:chapterCode/:nodeCode`。
- Analytics：session创建、activity、event写入和Admin funnel查询接口。
- Admin：视频资源列表/详情、上传、Chapter读取和Chapter状态更新接口。Admin尚无正式账号权限系统。

## 6. 当前数据库核心模型

### 6.1 账号与发布

- `User`：内部最终用户；以外部OIDC `authIssuer + authSubject`唯一映射，可保存验证后的email、状态和最后登录时间。
- `ChapterRelease`：章节版本化发布快照，保存Chapter DTO、RuntimeStory、contentHash、版本和ACTIVE/DRAFT/ARCHIVED状态。

### 6.2 主线进度

- `UserChapterProgress`：用户在一个ChapterRelease上的主线状态，保存currentNode、canonicalSnapshot、progressVersion和完成时间。
- `UserNodeProgress`：主线节点的发现、可用、首次开始、首次/最近完成、完成次数和最后播放事实。
- `UserChoiceDecision`：主线Choice决策，带requestKey幂等；同一主线源节点只允许一个决策。

### 6.3 剧情地图

- `StoryMapRegion`：绑定ChapterRelease的地图区域和布局元数据。
- `StoryMapNode`：区域中的可见地图节点配置，包含坐标、展示信息、allowExploration和allowReplay。
- `NodePrerequisite`：Discovery/Unlock前置条件；支持CHAPTER_STARTED、NODE_DISCOVERED、NODE_COMPLETED、CHOICE_SELECTED及MAINLINE/EXPLORATION/ANY来源范围。

### 6.4 Exploration / Replay Run

- `UserExplorationRun`：同时承载EXPLORATION和REPLAY模式，保存独立canonicalSnapshot、runVersion、入口、当前节点和ACTIVE/COMPLETED/ABANDONED状态。
- `UserNodePlaySession`：Run内每次进入节点的顺序、完成时间和completion requestKey。
- `UserExplorationChoiceDecision`：Run内独立Choice记录，不写入主线 `UserChoiceDecision`。

### 6.5 其他仍在使用的核心内容/商业模型

- `Story`、`Chapter`、`Character`、`Node`、`Choice`、`VideoAsset`。
- `AnalyticsSession`、`AnalyticsEvent`。
- `TestPaymentOffer`。
- `AdminUser`和旧的`StoryRelease`仍存在，但当前账号进度使用的是`ChapterRelease`。

## 7. 当前 chapter-01 真实剧情结构与地图配置

本节同时核对了Seed代码和本地PostgreSQL实际数据。当前本地数据库结果：

- `chapter-01`：ACTIVE。
- ACTIVE ChapterRelease：版本1。
- ACTIVE Node：7个。
- 启用Choice：3个。
- 地图Region：1个。
- 地图Node：4个。
- Prerequisite：8条（每个地图节点各一条DISCOVERY和UNLOCK）。

### 7.1 剧情图

```text
Node001（video，入口，CHOICES）
  A「去图书馆」   -> Node002（video，NEXT） -> Ending002
  B「一起去游泳」 -> Node003（video，NEXT） -> Ending003
  C「去水上乐园」 -> Node004（video，NEXT） -> Ending004
```

因此当前7个节点为：Node001–Node004四个视频节点，加Ending002–Ending004三个Ending节点。

**Node001–004只是当前chapter-01内容配置，不是系统节点数量上限。** StoryEngine、数据库和API没有把系统限制为4个节点。

### 7.2 地图配置

- Region code：`chapter-01-opening`。
- Region title：`初遇`。
- 地图只包含Node001、Node002、Node003、Node004；Ending当前不在地图Seed中。
- Node001：章节已开始即可Discovery和Unlock；`allowExploration=false`，`allowReplay=true`。
- Node002–004：Discovery和Unlock都要求Node001已由**主线**完成；`allowExploration=true`，`allowReplay=true`。
- 所有当前Prerequisite的 `sourceScope` 都是 `MAINLINE_ONLY`。
- Map Service最终动作规则：
  - `canExplore = (available或completed) && allowExploration`
  - `canReplay = completed && allowReplay`
- 因此Node002–004在available/completed时可Explore；Node001–004只有在completed后才开放Replay。
- Discovery/Unlock由服务端Map Service计算，H5只展示API投影，不在前端重复计算。

## 8. 冻结模块与不可随意修改边界

以下边界当前已确认冻结。若后续任务确实必须修改，应先停下并说明必要性、兼容风险和迁移方案：

- StoryEngine状态机逻辑。
- `packages/story-core`业务语义和快照校验规则。
- `chapter-adapter`的公共Chapter DTO -> RuntimeStory转换边界。
- 公共Chapter/Node/Choice DTO。
- 主线 `UserChapterProgress` 的事务、canonical snapshot和progressVersion语义。
- `UserNodeProgress`主线事实语义。
- `UserChoiceDecision`主线Choice语义与幂等规则。
- Map Service的Discovery/Unlock业务规则。
- Analytics现有事件类型、触发语义、幂等和主线漏斗口径。

H5 UI可以改，但不得在前端自行创建snapshot、计算targetNode、计算unlock、修改主线版本，或把Exploration/Replay状态写入主线localStorage。

## 9. 当前仍未完成

- 正式公网完整部署尚未完成。
- 没有已验证的生产API域名。
- 没有生产PostgreSQL、备份、监控、高可用或恢复演练。
- 没有完成生产对象存储/CDN/媒体域名部署；仓库只有S3-compatible适配和本地MinIO Compose基线。
- 正式OIDC提供商配置、H5登录页面、授权回调、Token刷新和登出流程未完成。当前H5只会从sessionStorage读取已有Access Token，不会自行登录。
- `.env.example`和生产env模板当前没有列出账号认证所需的全部环境变量，这是文档/模板缺口。
- Admin公网环境未部署；Admin API没有正式登录、角色权限或审计，不能直接公开。
- 正式横屏剧情MP4/JPEG尚未完成替换与真机验收；当前Seed仍声明720×1280联调素材，且实际文件存在codec检测问题。
- Admin只能读取Chapter/Node/Choice关系并修改Chapter状态，没有Node/Choice可视化图编辑器。
- 正式支付、订单、退款、权益发放未实现；当前只有付费意向测试。
- 正式商业测试尚未开始；Analytics仍需在真实部署、真实流量和隐私合规条件下验收。
- Exploration/Replay没有单独的新Analytics事件语义；当前Run模式有意不复用主线剧情事件。
- Replay没有GET恢复接口或abandon接口，跨浏览器会话无法恢复。
- 正式浏览器/真机矩阵、弱网、自动播放、Range、CORS及全屏交互仍需用最终素材和最终域名验收。
- 生产告警、集中日志、全局限流和运维值守未完成。

## 10. 当前部署状态

### 10.1 本地开发环境

- 本地H5、API和PostgreSQL开发链路可运行。
- 本地PostgreSQL已包含9条migration；本次只读核对确认`chapter-01`、ACTIVE Release v1和地图Seed存在。
- 账号相关API只有启用 `ACCOUNT_PROGRESS_ENABLED` 并提供OIDC配置后才会注册。
- 本地对象存储是否持续运行没有在本次交接中确认；不能把Compose配置存在当作生产对象存储已上线。

### 10.2 当前H5公开域名

- 域名：`https://bt-ik.top`。
- 2026-09-27实测 `/`、`/story`、`/story-map/chapter-01` 均由Cloudflare返回HTTP 200和HTML。
- 该结果只证明Cloudflare Pages及SPA fallback可访问，不证明功能已连接服务端。

### 10.3 旧静态版本

- 当前公开JS为旧静态构建；实测构建中不包含 `/exploration-runs`、`/replay-runs`、`/story-map/` 或账号Access Token标识。
- 因此公开域名尚未部署第16.5/16.6账号地图和Run接入代码。
- 线上版本继续使用静态fallback内容/本地视频资源。

### 10.4 是否已连接公网API

- **没有。** `https://bt-ik.top/v1/me` 当前返回Cloudflare Pages的HTML（`Content-Type: text/html`），不是账号API JSON。
- 仓库中也没有可验证的生产API域名配置或生产OIDC配置。

### 10.5 当前临时链接是否可靠

- `localhost:5173`、`localhost:3000`、`127.0.0.1:4173`都依赖本机进程，只能用于本地开发/预览，不是可靠公网地址。
- 当前没有经过验证的公网完整栈临时链接。
- `bt-ik.top`作为旧静态页面当前可访问，但不能用于验收账号、地图、Exploration或Replay服务端链路。

### 10.6 生产GO状态

**NO-GO。** 生产API、生产数据库、OIDC登录、对象存储、正式素材、Admin保护、监控备份和真实用户环境均未完成。

## 11. 当前已知问题

### 11.1 video-inspector既有失败

- 文件：`apps/api/src/media/video-inspector.test.ts`。
- 旧断言期待：`INVALID_VIDEO_RESOLUTION`。
- 当前实际结果：`INVALID_VIDEO_CODEC`。
- 原因是检入的 `Node001.mp4` 先触发codec校验；本阶段没有修改媒体检测顺序、测试或素材。

### 11.2 Story Run PostgreSQL集成测试存在间歇503

- 一次完整API测试（启用 `DATABASE_URL`）结果为87项中86通过，仅video-inspector失败，说明当次所有数据库集成用例通过。
- 随后聚合运行4个PostgreSQL集成文件时，21项中17通过、4项Story Run返回503。
- 再单独运行Story Run文件时，15项中12通过、3项返回503；单独筛选Replay用例又可以通过。
- 当前表现具有执行顺序/时序敏感性，不能写成“PostgreSQL集成测试稳定全绿”。
- 从代码可见Run表对terminal时间有数据库CHECK，而插入使用数据库默认时间、后续更新使用JavaScript `Date`；这可能造成亚毫秒精度竞争，但目前只是推测，尚未用底层Prisma错误日志最终确认。
- 第16.7阶段应先稳定复现并确认根因；当前用户要求只更新文档，因此没有修改业务代码或测试。

### 11.3 Replay刷新恢复限制

- 服务端没有Replay GET接口。
- H5刷新只能使用sessionStorage中最后一次服务端响应；关闭浏览器或清理sessionStorage后必须从地图重新创建Replay。

### 11.4 账号入口不完整

- 后端OIDC/JWT和User映射已存在，但H5没有正式登录页面或回调流程。
- 当前账号功能测试通过测试Token/测试Authenticator或预先写入sessionStorage完成，不能等同真实登录验收。

### 11.5 文档与模板滞后

- 根README仍描述“没有用户体系”，已落后于当前User/Progress/Map/Run实现。
- 环境变量示例未包含全部OIDC变量。以本文和当前代码为准，后续可单独修正文档/模板，但不属于本次交接任务。

## 12. 当前测试与构建状态

以下数字来自2026-09-27重新执行的实际命令，不沿用旧阶段数字。

| 范围 | 最新结果 |
| --- | --- |
| H5测试 | 10个测试文件，56/56通过。 |
| Story Core测试 | 2个测试文件，13/13通过。 |
| API完整测试（设置DATABASE_URL） | 23个测试文件；87项中86通过、1失败。唯一稳定失败是video-inspector codec/resolution断言。 |
| PostgreSQL集成测试 | 完整API运行时曾全部通过；随后聚合重跑为21项中17通过、4个Story Run 503。当前结论是“功能覆盖存在，但稳定性未通过”。 |
| Story Run单文件复跑 | 15项中12通过、3个间歇503；单独筛选Replay用例通过。 |
| TypeScript | `npm run typecheck`通过全部workspaces及database TypeScript。 |
| Build | `npm run build`通过api-contracts、shared、story-core、admin、api和h5全部构建。 |

H5第16.6测试覆盖：地图创建Exploration/Replay、服务端runVersion透传、Exploration视频/Choice、canonical GET刷新恢复、abandon、结束后Map重新请求、Replay无Choice和自动返回、Run不请求主线progress、不写主线localStorage、不触发主线剧情Analytics。

服务端Story Run集成测试覆盖Node003探索、合法Choice、主线不变、Map更新、Replay单节点、Replay前后Map不变、乐观锁、幂等、所有权和单ACTIVE Run；但如上所述，当前数据库执行存在间歇503，需在16.7处理为稳定可重复结果。

## 13. 下一阶段：第 16.7 阶段

阶段名称：**本地完整用户路径最终验收**。

只验证以下路径，不进入生产部署或新功能开发：

1. 获得有效本地账号身份并确认 `GET /v1/me`。
2. 启动/恢复chapter-01主线，记录主线currentNode和progressVersion。
3. 完成必要主线步骤并进入剧情地图。
4. 从地图进入Node003 Exploration。
5. 完成探索视频/Choice，刷新时仍恢复同一Run。
6. 探索完成后回地图，验证Discovery/Completion投影更新。
7. 从completed节点进入Replay，确认无Choice并自动回地图。
8. 比较Replay前后Map完全一致。
9. 再次读取主线progress，确认currentNode、canonicalSnapshot和progressVersion没有被Exploration/Replay污染。
10. 复现并解决/确认Story Run PostgreSQL间歇503，使相关集成测试稳定重复通过。

第16.7完成前不要开始正式部署、支付、登录UI、CMS编辑器或新剧情规则开发。

## 14. 第 16.6 阶段最近修改文件

由于当前目录不是Git checkout，以下范围来自第16.6实际实施记录：

### 新增

- `apps/h5/src/features/story-run/story-run-api.ts`
- `apps/h5/src/features/story-run/story-run-session.ts`
- `apps/h5/src/features/story-run/useStoryRunContent.ts`
- `apps/h5/src/pages/StoryPage/StoryRunPage.test.tsx`

### 修改

- `apps/h5/src/pages/StoryMapPage/StoryMapPage.tsx`
- `apps/h5/src/pages/StoryMapPage/StoryMapPage.test.tsx`
- `apps/h5/src/pages/StoryPage/StoryPage.tsx`
- `PROJECT_CONTEXT.md`

第16.6没有修改：

- `packages/story-core/**`
- `apps/api/src/story-run/**`
- `apps/api/src/story-map/**`
- `apps/api/src/account-progress/**`
- `packages/api-contracts/**`
- Prisma Schema/migration
- Analytics实现

## 15. 当前启动与验证方式

### 15.1 必要环境变量名称

本地基础：

- `DATABASE_URL`
- `VITE_API_BASE_URL`

启用账号进度/地图/Run：

- `ACCOUNT_PROGRESS_ENABLED`
- `AUTH_ISSUER`
- `AUTH_AUDIENCE`
- `AUTH_JWKS_URL`
- `AUTH_JWT_ALGORITHMS`（可选，默认RS256）

API运行：

- `NODE_ENV`
- `API_HOST`
- `API_PORT`
- `CORS_ORIGIN`
- `TRUST_PROXY`
- `LOG_LEVEL`
- `API_BODY_LIMIT_BYTES`
- `API_REQUEST_TIMEOUT_MS`
- `API_SHUTDOWN_TIMEOUT_MS`
- `ANALYTICS_RATE_LIMIT_MAX`
- `ANALYTICS_RATE_LIMIT_WINDOW_MS`

对象存储/上传：

- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`
- `OBJECT_STORAGE_FORCE_PATH_STYLE`
- `OBJECT_STORAGE_PUBLIC_BASE_URL`
- `VIDEO_UPLOAD_MAX_BYTES`
- `FFPROBE_TIMEOUT_MS`

静态H5构建：

- `VITE_STATIC_MODE`

不得把变量值、Token或凭据写入仓库或本文。

### 15.2 本地数据库和Seed顺序

```powershell
npm install
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run db:seed
npm run release:chapter --workspace @interactive-story/api -- chapter-01
npm run db:seed:story-map
```

要求：

- PostgreSQL可访问且 `DATABASE_URL` 已在当前环境配置。
- 先执行内容Seed，再发布ChapterRelease，最后执行地图Seed。
- 地图Seed要求已经存在 `chapter-01` 的ACTIVE ChapterRelease；发现不同的既有地图配置时会停止，不会覆盖。
- 已有相同内容哈希的ACTIVE Release时，发布器会复用现有Release。

### 15.3 启动命令

分别打开终端：

```powershell
npm run dev:api
npm run dev:h5
npm run dev:admin
```

默认地址：

- H5：`http://localhost:5173`
- API：`http://localhost:3000`
- Admin：`http://localhost:5174`

注意：没有正式H5登录流程。账号链路验收需要由受控测试流程获得有效Bearer Token，并写入H5当前读取的sessionStorage位置；不要在文档或源码中保存真实Token。

### 15.4 验证命令

```powershell
npm run db:validate
npm run typecheck
npm test --workspace @interactive-story/h5
npm test --workspace @interactive-story/story-core
npm test --workspace @interactive-story/api
npm run build
```

运行PostgreSQL集成测试前，必须在当前终端设置 `DATABASE_URL`，但不要把值写入命令记录或本文。可单独执行：

```powershell
npx vitest run apps/api/src/account-progress/account-progress-integration.test.ts
npx vitest run apps/api/src/story-map/story-map-integration.test.ts
npx vitest run apps/api/src/story-map/chapter-01-story-map-seed.integration.test.ts
npx vitest run apps/api/src/story-run/story-run-integration.test.ts
```

静态构建与生产产物检查：

```powershell
npm run build:static --workspace @interactive-story/h5
npm run verify:production-build
```

## 16. 新 Codex 窗口接手规则

1. 先阅读根目录 `AGENTS.md` 和本文。
2. 再读取当前任务涉及的代码、Schema、migration和测试；本文不是代码替代品。
3. 第16.7只做本地完整用户路径最终验收，不开始生产部署或新功能。
4. 首先稳定复现Story Run PostgreSQL间歇503并保留底层错误证据，再决定是否需要修改；若需触碰冻结边界，先向用户说明。
5. 不得把 `bt-ik.top` 当前旧静态版本描述为16.6生产版本。
6. 不得把本地测试通过描述为生产GO。
