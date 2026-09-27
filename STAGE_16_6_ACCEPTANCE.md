# 第 16.6 阶段验收记录

> 阶段名称：Exploration / Replay H5 完整运行接入  
> 核对日期：2026-09-27（Asia/Shanghai）  
> 事实依据：当前仓库代码、当前测试用例以及本次重新执行的测试结果。  
> 本文只记录已经实现和已经验证的事实，不把后续计划写成完成项。

## 1. 16.6 目标

第 16.6 阶段的目标，是把第 16.5 阶段的剧情地图 UI 与第 16.4B 阶段已经存在的服务端 Exploration / Replay Run 生命周期连接起来，使账号用户能够：

1. 从剧情地图创建 Exploration Run，并进入现有互动播放器。
2. 在 Exploration 中使用服务端 Run snapshot、runId 和 runVersion 推进视频及 Choice。
3. 刷新后从服务端恢复同一个 ACTIVE Exploration Run。
4. 正常结束或主动 abandon 后返回剧情地图。
5. 从 completed 地图节点创建 Replay Run，只回看指定节点且不显示 Choice。
6. Replay 结束后自动返回剧情地图，并保证地图发现/解锁状态不发生改变。
7. 保持 mainline、exploration、replay 三种上下文隔离，不修改主线进度语义、StoryEngine、Map Service 或 Analytics 既有语义。

本阶段没有创建第二套播放器，也没有新增前端 Unlock、targetNode 或 snapshot 计算规则。

## 2. 实际修改文件

当前工作区没有可用 Git checkout，因此以下范围来自第 16.6 实际实施记录和当前文件内容复核。

### 2.1 新增

- `apps/h5/src/features/story-run/story-run-api.ts`
- `apps/h5/src/features/story-run/story-run-session.ts`
- `apps/h5/src/features/story-run/useStoryRunContent.ts`
- `apps/h5/src/pages/StoryPage/StoryRunPage.test.tsx`

### 2.2 修改

- `apps/h5/src/pages/StoryMapPage/StoryMapPage.tsx`
- `apps/h5/src/pages/StoryMapPage/StoryMapPage.test.tsx`
- `apps/h5/src/pages/StoryPage/StoryPage.tsx`
- `PROJECT_CONTEXT.md`

### 2.3 第 16.6 没有修改

- `packages/story-core/**`
- `apps/api/src/story-run/**`
- `apps/api/src/story-map/**`
- `apps/api/src/account-progress/**`
- `packages/api-contracts/**`
- Prisma Schema 和 migration
- Analytics 实现及事件定义

服务端 Exploration / Replay Run 生命周期属于第 16.4B 已完成能力；第 16.6 的实际代码工作是将其接入 H5 地图和播放器。

## 3. mainline / exploration / replay 三种运行模式实现情况

### 3.1 mainline

- `/story` 未携带 `mode=exploration|replay` 时继续进入原有 `MainlineStoryPage`。
- 账号主线继续以 `UserChapterProgress.canonicalSnapshot` 和 `progressVersion` 为权威状态，调用原有账号 progress、video completion 和 Choice API。
- 匿名主线继续使用公共内容 API、本地 fallback 和原有 localStorage 快照。
- 账号主线播放器保留返回 `/story-map/:chapterCode` 的入口。
- 第 16.6 没有修改主线事务、主线 Choice、StoryEngine 或匿名 fallback 规则。

### 3.2 exploration

- `/story?chapterCode=...&mode=exploration&runId=...` 进入 Exploration 模式。
- H5 使用 start/GET/transition API 返回的 `run.id`、`run.version` 和 `engineSnapshot`。
- `useStoryEngine` 仍为共用引擎 Hook，但 Run 模式设置 `persistLocally: false`，不写主线本地进度。
- 视频结束调用 Exploration video completion API。
- Choice 调用 Exploration Choice API；Choice 文案及目标来自服务端内容和 snapshot，不在页面硬编码。
- 每次请求使用最后一次服务端确认的 `run.version` 作为 `expectedRunVersion`，前端不自行递增版本。
- ACTIVE Run 可主动 abandon；Run完成后自动返回地图。

### 3.3 replay

- `/story?chapterCode=...&mode=replay&runId=...` 进入 Replay 模式。
- Replay 使用服务端 start 响应中的 Run 和 snapshot，只构造所选单个视频节点的运行时视图。
- Replay 模式不渲染 Choice，也不会调用 Exploration Choice API。
- 视频结束调用 Replay video completion API。
- Run变为 completed 后清理本地Run缓存并自动返回剧情地图。
- 当前Replay没有服务端GET恢复接口或abandon接口；其恢复能力只依赖当前浏览器sessionStorage，这是已知限制，不是已完成的服务端能力。

## 4. Map → Exploration 完整链路

实际链路如下：

```text
/story-map/:chapterCode
  -> Map API返回节点 actions.canExplore=true
  -> 用户点击“开始探索”或“再次探索”
  -> POST /v1/me/chapters/:chapterCode/exploration-runs
     body: releaseId + entryNodeCode + requestKey
  -> 保存服务端完整Run响应到独立sessionStorage key
  -> 导航到 /story?chapterCode=...&mode=exploration&runId=...
  -> GET同一个Exploration Run
  -> 用服务端engineSnapshot恢复共用StoryEngine
  -> 视频结束调用Exploration video-completions
  -> 如进入awaiting_choice，显示服务端内容中的Choice
  -> Choice调用Exploration choices
  -> 使用新的服务端snapshot和run.version继续
  -> completed后清缓存并返回地图
```

地图页创建Run时使用Map响应中的 `release.id` 和被点击节点的 `nodeCode`。创建成功后才保存Run并导航；创建失败时留在地图页并显示错误。

H5测试已覆盖从地图创建Node003 Exploration、请求体中的Release/入口节点、Run响应缓存和导航行为。

## 5. Map → Replay 完整链路

实际链路如下：

```text
/story-map/:chapterCode
  -> completed节点且actions.canReplay=true
  -> 用户点击“重新观看”
  -> POST /v1/me/chapters/:chapterCode/replay-runs
     body: releaseId + nodeCode + requestKey
  -> 保存服务端完整Run响应到独立sessionStorage key
  -> 导航到 /story?chapterCode=...&mode=replay&runId=...
  -> 从sessionStorage恢复start API的服务端响应
  -> 只播放指定节点，不显示Choice
  -> POST .../replay-runs/:runId/video-completions
  -> completed后清缓存并返回地图
  -> 地图重新调用Map API
```

H5测试已覆盖completed节点创建Replay、Replay不显示Choice、只走Replay completion、结束后返回地图以及不调用主线progress或Exploration API。

## 6. Exploration 刷新恢复

Exploration页面挂载或刷新时，不把sessionStorage中的内容直接当作权威状态，而是：

1. 从URL取得 `chapterCode` 和 `runId`。
2. 读取当前账号Bearer Token。
3. 调用 `GET /v1/me/chapters/:chapterCode/exploration-runs/:runId`。
4. 校验响应的chapter、mode和runId与当前页面一致。
5. 用服务端 `engineSnapshot` 和 `run.version` 覆盖本地缓存并恢复StoryEngine。

测试已验证：即使sessionStorage中存在旧版本snapshot，页面也采用GET返回的canonical snapshot和较新的runVersion。

## 7. Exploration 退出 / abandon 行为

- Exploration模式显示“退出探索并返回地图”。
- 如果Run仍为active，先调用：
  `POST /v1/me/chapters/:chapterCode/exploration-runs/:runId/abandon`。
- 请求携带当前服务端确认的 `expectedRunVersion`。
- abandon成功后清除该Run的sessionStorage记录，再导航到剧情地图。
- 如果Run已不是active，前端不重复发起abandon，只清理本地Run缓存。
- abandon失败时不会先行清除缓存或假装退出成功。

H5测试已验证abandon请求携带正确runVersion、Run缓存被清除并返回地图。服务端集成测试还包含abandon后可以重新创建Run的断言。

## 8. Run 结束后 Map 重新加载行为

Run transition响应把状态改为completed后：

1. `StoryRunRuntimePage`检测到 `runStatus !== active`。
2. 清除对应Exploration或Replay sessionStorage记录。
3. 使用replace导航到 `/story-map/:chapterCode`。
4. StoryMapPage重新挂载。
5. `useStoryMap`重新调用Map API，而不是沿用Run开始前的Map对象。

H5测试明确断言Exploration和Replay结束后都出现地图页面并重新请求 `/map`。

## 9. 主线隔离验证

实现层面的隔离：

- Run使用 `UserExplorationRun.canonicalSnapshot` 和 `runVersion`，不使用主线snapshot恢复播放器。
- Run状态保存在独立sessionStorage key，且 `persistLocally: false`；不会写原有主线localStorage。
- Run模式不调用账号主线 `/progress`、主线video completion或主线Choice API。
- Exploration Choice写入 `UserExplorationChoiceDecision`，不是主线 `UserChoiceDecision`。
- Run节点播放事实写入 `UserNodePlaySession`，不是主线StoryEngine状态。
- 前端只提交服务端确认的snapshot/version，不修改主线 `progressVersion`。

验证证据：

- H5测试断言Run过程中没有请求 `/progress`，主线localStorage哨兵值保持不变。
- 服务端Story Run集成测试包含“Exploration前后主线状态完全相等”的断言。
- mainline、exploration、replay共用视图和播放器，但使用不同状态提供者，没有复制或混写运行状态。

需要注意：服务端Story Run PostgreSQL集成测试当前存在间歇503，因此上述数据库断言已经存在并曾通过，但尚不能描述为每次聚合执行都稳定全绿。

## 10. Replay 是否完全不影响地图发现 / 解锁

从当前业务规则和测试断言看，Replay不会产生Discovery或Unlock变化：

- Replay只建立mode为REPLAY的独立Run和播放session。
- Map Service只将Exploration Run纳入探索事实，明确不把Replay完成当作发现、解锁或主线完成。
- Replay不写主线 `UserNodeProgress`、`UserChapterProgress` 或 `UserChoiceDecision`。
- 服务端集成测试在Replay前后读取Map并断言两个响应完全相等。
- H5 Replay测试使用同一Map响应验证自动返回，不调用主线progress或Exploration接口。

结论：按当前实现语义，Replay完全不影响地图发现/解锁。该结论已有单元/集成测试覆盖；但相关PostgreSQL聚合执行仍受已知间歇503影响，不能宣称数据库测试在所有运行中稳定通过。

## 11. 匿名模式是否回归正常

结论：匿名模式的自动化回归正常。

- URL没有 `mode=exploration|replay` 时仍进入原有mainline页面。
- 没有账号Token时仍使用公共内容API、本地fallback和匿名localStorage快照。
- Run逻辑只有明确提供合法mode及runId时才启用。
- 原有StoryPage、LandingPage、本地进度和视频播放器测试与新增Run测试一起执行，H5全量56项全部通过。

本次没有进行正式公网环境或完整真机矩阵的匿名回归，因此“正常”仅指当前代码和自动化测试基线，不代表生产环境已经验收。

## 12. Analytics 是否保持原语义

结论：现有Analytics语义保持不变。

- mainline仍使用原有 `useStoryAnalytics`，现有video、Choice和payment事件触发点没有改为Run语义。
- exploration和replay显式使用 `noRunAnalytics`，不会把Run completion或Run Choice误记为主线剧情事件。
- H5测试断言Exploration和Replay流程没有发起Analytics请求。
- 第16.6没有修改Analytics事件类型、payload、去重、漏斗查询或服务端接口。

当前没有新增Exploration/Replay专用Analytics事件。这是当前真实范围，不能把“未污染主线语义”理解为“Run分析能力已经完成”。

## 13. 实际测试结果

以下结果来自2026-09-27重新执行的实际命令：

| 范围 | 实际结果 |
| --- | --- |
| H5全量测试 | 10个测试文件，56/56通过。 |
| Story Core测试 | 2个测试文件，13/13通过。 |
| API全量测试（设置DATABASE_URL） | 23个测试文件；87项中86通过、1失败。 |
| PostgreSQL集成聚合复跑 | 21项中17通过、4个Story Run请求返回503。 |
| Story Run集成文件单独复跑 | 15项中12通过、3个请求返回503；单独筛选Replay用例可通过。 |
| TypeScript | `npm run typecheck`全部通过。 |
| Build | `npm run build`通过api-contracts、shared、story-core、admin、api和h5全部构建。 |

第16.6新增/重点H5测试实际覆盖：

1. Node003从地图创建Exploration。
2. Exploration视频播放和Choice推进。
3. completion/Choice使用服务端确认的runVersion。
4. Exploration GET canonical snapshot刷新恢复。
5. ACTIVE Exploration abandon。
6. Exploration结束后Map重新请求。
7. Replay创建、无Choice、单节点完成和自动返回Map。
8. Run不请求主线progress。
9. Run不写主线localStorage。
10. Run不触发主线Analytics。

服务端Story Run集成测试包含主线隔离、Map更新、Replay前后Map相等、乐观锁、幂等、Run所有权和单ACTIVE Run等场景；其测试覆盖存在，但当前执行稳定性未完全通过。

## 14. 已知失败 / 残留问题

### 14.1 video-inspector既有失败

- 失败文件：`apps/api/src/media/video-inspector.test.ts`。
- 测试期待：`INVALID_VIDEO_RESOLUTION`。
- 当前实际：`INVALID_VIDEO_CODEC`。
- 当前素材先触发codec校验。本阶段没有修改媒体检查顺序、测试或视频素材。

### 14.2 Story Run PostgreSQL集成测试间歇503

- API全量执行中曾仅剩video-inspector失败，即当次数据库集成用例通过。
- 随后聚合和单文件重跑又出现Story Run 503，表现具有顺序或时序敏感性。
- terminal时间CHECK与数据库/JavaScript时间精度竞争是当前代码审阅得到的可能原因，但尚未获得底层Prisma错误证据，不能写成已确认根因。
- 因此不能把API或PostgreSQL测试描述为稳定全绿。

### 14.3 Replay恢复能力有限

- 服务端没有Replay GET和Replay abandon接口。
- Replay刷新只依赖当前浏览器sessionStorage中的start响应。
- 关闭浏览器、清除sessionStorage或换设备后不能恢复原Replay Run，只能从地图重新创建。

### 14.4 正式账号入口和生产环境不属于已完成事实

- 服务端OIDC/JWT基础存在，但H5没有正式登录/回调/Token刷新页面。
- 当前公网 `bt-ik.top` 是旧静态构建，不包含16.5/16.6功能，也没有连接公网API。
- 16.6验证结论是本地功能结论，不是生产上线结论。

## 15. 是否达到 16.6 验收标准

### 15.1 验收项结论

| 验收项 | 结论 | 证据 |
| --- | --- | --- |
| Map创建Node003 Exploration | 达到 | Map H5测试及start API接入。 |
| Exploration视频与Choice推进 | 达到 | 共用播放器、Run transition API及H5测试。 |
| Exploration刷新恢复同一Run | 达到 | GET canonical snapshot覆盖旧缓存测试。 |
| Exploration完成后刷新Map | 达到 | completed自动导航及Map重新请求测试。 |
| Exploration不修改主线 | 达到实现要求 | H5隔离断言和服务端主线前后相等断言；数据库复跑有间歇503。 |
| ACTIVE Exploration退出先abandon | 达到 | abandon请求版本和缓存清理测试。 |
| completed节点Replay | 达到 | Map创建Replay和播放器测试。 |
| Replay不显示Choice | 达到 | UI测试和代码强制限制。 |
| Replay结束自动返回Map | 达到 | completion后导航及Map请求测试。 |
| Replay前后Map不变 | 达到业务语义 | Map Service规则和数据库相等断言；数据库复跑有间歇503。 |
| 三模式互不污染 | 达到 | 独立状态源、API、缓存和测试断言。 |
| 匿名模式不受影响 | 达到自动化回归要求 | H5全量56/56通过。 |
| Analytics保持原语义 | 达到 | mainline Hook未变；Run使用no-op Analytics并有断言。 |
| H5全测、TypeScript、Build | 达到 | 56/56、typecheck通过、全workspace build通过。 |

### 15.2 最终结论

**第16.6阶段达到功能验收标准，结论为“功能验收通过，带已知工程测试残留”。**

该结论表示：地图到Exploration/Replay的H5完整链路、三模式隔离、刷新/abandon/返回Map行为以及Analytics边界均已按要求实现并有自动化测试覆盖。

该结论不表示：

- API与PostgreSQL测试已经稳定全绿；
- Replay具备服务端刷新恢复；
- 正式OIDC登录已经完成；
- 16.6已经部署到公网生产环境；
- 项目已经达到生产GO标准。

