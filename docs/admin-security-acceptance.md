# Admin安全验收边界

## 本地自动检查

运行：

```text
npm run verify:production-security
```

该检查只能证明仓库配置包含以下约束：

- 公共API Host在反代前拒绝`/v1/admin`和`/v1/admin/*`。
- Admin Host缺少`Cf-Access-Jwt-Assertion`时拒绝请求。
- cloudflared模板要求Admin入口执行Access JWT验证。
- Tunnel存在最终`http_status:404`规则。
- Compose没有将API或Gateway端口发布到Host。
- 初始化Job和Tunnel都不会由默认Compose启动。

静态检查不能证明真实Cloudflare或Railway配置正确。

## Staging必须执行

| 验收项 | 预期 | 当前状态 |
| --- | --- | --- |
| `https://api-staging.bt-ik.top/v1/admin/video-assets` | `404`，请求不进入Admin API | `STAGING_REQUIRED` |
| Railway API/Gateway默认公网域名 | 不存在；公网DNS和HTTP均不可达 | `STAGING_REQUIRED` |
| 未登录访问`admin-staging.bt-ik.top` | Cloudflare Access拒绝或跳转登录，不能看到Admin HTML | `STAGING_REQUIRED` |
| 普通用户OIDC身份访问Admin | Access拒绝 | `STAGING_REQUIRED` |
| 管理员身份但未满足MFA | Access拒绝 | `STAGING_REQUIRED` |
| 管理员身份且满足MFA | 允许进入Admin和调用同源`/v1/admin/*` | `STAGING_REQUIRED` |
| 外部请求伪造`Cf-Access-Jwt-Assertion` | Edge或cloudflared JWT校验拒绝 | `STAGING_REQUIRED` |
| 直接访问Tunnel Catch-all/未知Host | `404` | `STAGING_REQUIRED` |

验收时必须保留Cloudflare Access事件、Gateway访问日志和API访问日志。伪造Header测试必须从公网客户端发起，不能用私有Railway网络内的请求替代。
