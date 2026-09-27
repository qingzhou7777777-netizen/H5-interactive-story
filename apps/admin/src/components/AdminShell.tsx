import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/analytics", label: "商业数据", hint: "Session / Funnel / UTM" },
  { to: "/video-assets", label: "视频资源", hint: "VideoAsset" },
  { to: "/chapters", label: "剧情章节", hint: "Chapter / Node / Choice" },
] as const;

export function AdminShell() {
  return (
    <div className="min-h-dvh bg-slate-100 text-slate-950">
      <div className="mx-auto flex min-h-dvh max-w-[1600px] flex-col lg:flex-row">
        <aside className="border-b border-slate-800 bg-slate-950 px-5 py-5 text-white lg:w-72 lg:border-b-0 lg:border-r lg:px-6 lg:py-8">
          <div className="flex items-center justify-between gap-4 lg:block">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300">
                Interactive Story
              </p>
              <h1 className="mt-2 text-xl font-semibold">内容管理后台</h1>
            </div>
            <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[11px] font-medium text-amber-100 lg:mt-4 lg:inline-block">
              内部联调 · 无鉴权
            </span>
          </div>

          <nav className="mt-5 grid grid-cols-3 gap-2 lg:mt-10 lg:grid-cols-1" aria-label="后台导航">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-xl border px-4 py-3 transition ${
                    isActive
                      ? "border-indigo-400/40 bg-indigo-400/15 text-white"
                      : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-1 hidden text-xs text-slate-500 sm:block">{item.hint}</span>
              </NavLink>
            ))}
          </nav>

          <p className="mt-10 hidden text-xs leading-5 text-slate-500 lg:block">
            所有修改经由内容 API 写入 PostgreSQL。当前版本不提供登录、权限或发布快照。
          </p>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
