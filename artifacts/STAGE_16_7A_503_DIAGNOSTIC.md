# 第 16.7A 阶段 Story Run PostgreSQL 503 诊断记录

> 日期：2026-09-27（Asia/Shanghai）  
> 范围：本地 Story Run PostgreSQL 间歇性 503 稳定性排查  
> 数据库：`localhost:5432/interactive_story`，schema `public`（凭据不记录）

## 1. 数据库连接确认

- TCP `localhost:5432` 连接成功。
- Prisma 识别到 PostgreSQL 数据库 `interactive_story`、schema `public`。
- 9 条 migration 全部已应用，schema 为最新状态。
- 所有数据库集成测试均在当前进程显式设置 `DATABASE_URL` 后执行，没有跳过。

## 2. 修复前复现结果

- Story Run 集成文件连续运行 10 轮：7 轮通过、3 轮失败。
- 失败轮分别出现 1、4、3 个 503。
- 加入只在异常发生后输出的取证逻辑后，再运行 2 轮：第 1 轮通过，第 2 轮出现 3 个 503。
- 失败集中在把 ACTIVE Run 写为 COMPLETED 或 ABANDONED 的终态事务。

## 3. 原始异常证据

### 3.1 Replay completion

- API：`POST /v1/me/chapters/:chapterCode/replay-runs/:runId/video-completions`
- runId：`53a5694c-df4b-4255-9bd6-d8a5f2153384`
- expectedRunVersion：`0`
- requestKey：`067ed36b-8a3a-49b8-8008-354cfcfc6bf1`
- API响应：HTTP 503，`STORY_RUN_UNAVAILABLE`

原始异常类型：

```text
PrismaClientUnknownRequestError
clientVersion: 6.12.0
```

Prisma顶层异常没有 `code` 字段；其ConnectorError中保留了PostgreSQL错误：

```text
PostgresError {
  code: "23514",
  message: "关系 \"user_exploration_runs\" 的新列违反了检查约束 \"user_exploration_runs_completed_at_valid\""
}
```

关键失败行时间：

```text
started_at   = 2026-09-27 06:16:39.617
completed_at = 2026-09-27 06:16:39.615
```

关键stack：

```text
at updateRun (apps/api/src/story-run/prisma-story-run-repository.ts:107:19)
at apps/api/src/story-run/prisma-story-run-repository.ts:310:9
at PrismaStoryRunRepository.commitVideoTransition
at StoryRunService.completeVideo (apps/api/src/story-run/story-run-service.ts:366:23)
at execute (apps/api/src/story-run/story-run-routes.ts:149:12)
```

事务回滚后的数据库行：

```text
mode              = REPLAY
status            = ACTIVE
current_node_code = Node001
run_version       = 0
started_at        = 2026-09-27 06:16:39.617000
completed_at      = null
abandoned_at      = null
```

播放会话仍为：

```text
node_code              = Node001
sequence               = 1
completion_request_key = null
completed_at           = null
```

### 3.2 Exploration abandon

- API：`POST /v1/me/chapters/:chapterCode/exploration-runs/:runId/abandon`
- runId：`437d77a3-62ff-4509-9f27-91b720f245da`
- expectedRunVersion：`0`
- requestKey：不适用；当前abandon API契约没有requestKey。
- API响应：HTTP 503，`STORY_RUN_UNAVAILABLE`

ConnectorError中的PostgreSQL错误：

```text
PostgresError {
  code: "23514",
  message: "关系 \"user_exploration_runs\" 的新列违反了检查约束 \"user_exploration_runs_abandoned_at_valid\""
}
```

关键失败行时间：

```text
started_at   = 2026-09-27 06:16:39.707
abandoned_at = 2026-09-27 06:16:39.704
```

关键stack：

```text
at apps/api/src/story-run/prisma-story-run-repository.ts:389:23
at PrismaStoryRunRepository.abandonRun
at StoryRunService.abandonExplorationRun (apps/api/src/story-run/story-run-service.ts:261:30)
at execute (apps/api/src/story-run/story-run-routes.ts:149:12)
```

事务回滚后的数据库行保持：

```text
mode         = EXPLORATION
status       = ACTIVE
run_version  = 0
completed_at = null
abandoned_at = null
```

### 3.3 Exploration completion与requestKey

另一个失败样本：

```text
API                = POST .../exploration-runs/:runId/video-completions
runId              = 48dc34fd-3b24-4096-85ce-3b50ff055218
expectedRunVersion = 0
requestKey         = 82bca253-2344-4216-9d99-03c224423408
started_at         = 2026-09-27 06:16:39.742
attempted completed_at = 2026-09-27 06:16:39.740
```

事务回滚后Run仍为ACTIVE、runVersion仍为0，播放会话的`completion_request_key`仍为null。

## 4. 根因判断

根因属于：**Repository中的时间来源混用/毫秒级时钟偏差**。

- Run创建时没有显式写入`startedAt`和`lastPlayedAt`，因此数据库使用`CURRENT_TIMESTAMP`。
- completion和abandon使用Node.js `new Date()`。
- PostgreSQL与Node进程的当前时间在部分请求中相差数毫秒，使后续应用时间早于数据库生成的`started_at`。
- 数据库CHECK正确拒绝`completed_at < started_at`或`abandoned_at < started_at`。
- Prisma把该ConnectorError暴露为`PrismaClientUnknownRequestError`；API未识别异常按既有规则映射为503。

排除项：

- 不是测试清理或fixture交叉污染：失败Run属于各测试独立用户，事务回滚后状态一致。
- 不是唯一约束竞争：PostgreSQL code不是23505。
- 不是并发：失败可在单请求串行流程复现。
- 不是requestKey幂等：首次requestKey尚未写入即失败。
- 不是runVersion乐观锁：数据库行与请求均为version 0，且错误不是409。
- 不是Map或StoryEngine业务规则。

## 5. 最小修复

在`PrismaStoryRunRepository.createRun()`中使用已经创建的同一个应用侧`now`显式写入：

```text
startedAt: now
lastPlayedAt: now
```

这样创建、completion和abandon的受约束时间使用同一应用时钟来源。

- 修改层：Story Run Repository。
- 不涉及冻结模块。
- 不改变StoryEngine、主线事务、Map规则、API DTO、Analytics、runVersion或幂等语义。
- 风险：低；只改变Run创建时间的时钟来源，可能产生毫秒级时间差异。

## 6. 修复后验证

- Story Run集成文件连续20轮：20/20轮通过；每轮15项，共300/300项通过，无503。
- Account Progress集成：1/1通过。
- Story Map集成：1/1通过。
- chapter-01 Story Map Seed集成：4/4通过。
- 带`DATABASE_URL`的API全量：86/87通过；所有数据库集成测试通过。唯一失败仍为既有`video-inspector` codec/resolution断言，不属于16.7A。
- H5：56/56通过。
- Story Core：13/13通过。
- TypeScript：全仓通过。
- Build：全仓通过。

结论：修复后未再观察到Story Run间歇性503，可以进入16.7B完整用户路径验收；不能据此宣布16.7整体完成。
