import type { AnalyticsFunnelDto } from "@interactive-story/api-contracts";
import { useEffect, useMemo, useState } from "react";

import { ErrorState, LoadingState } from "../../components/RequestState";
import { fetchAnalyticsFunnel } from "../admin-api";

type DateRange = "7d" | "30d" | "all";

function percentage(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function duration(value: number) {
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${seconds % 60} 秒`;
}

function rangeQuery(range: DateRange) {
  if (range === "all") return {};
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (range === "7d" ? 7 : 30));
  return { from: from.toISOString(), to: to.toISOString() };
}

function MetricCard({
  label,
  value,
  detail,
  accent = "indigo",
}: {
  label: string;
  value: string;
  detail: string;
  accent?: "indigo" | "emerald" | "amber" | "rose";
}) {
  const colors = {
    indigo: "bg-indigo-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  };
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`h-1.5 w-9 rounded-full ${colors[accent]}`} />
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </article>
  );
}

export function AnalyticsDashboardPage() {
  const [range, setRange] = useState<DateRange>("7d");
  const [sourceInput, setSourceInput] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<AnalyticsFunnelDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const query = useMemo(
    () => ({
      chapterCode: "chapter-01",
      ...rangeQuery(range),
      ...(sourceFilter ? { utmSource: sourceFilter } : {}),
    }),
    [range, sourceFilter],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchAnalyticsFunnel(query)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "看板加载失败。" );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, reloadKey]);

  if (loading && !data) return <LoadingState label="正在汇总商业测试数据" />;
  if (error && !data) return <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />;

  const summary = data?.summary;
  const entryNode = data?.nodes.find((node) => node.nodeCode === summary?.entryNodeCode);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
            Commercial Analytics
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">商业数据看板</h1>
          <p className="mt-2 text-sm text-slate-500">
            匿名 Session 漏斗 · chapter-01 · 时间按 Asia/Shanghai 阅读
          </p>
        </div>

        <form
          className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            setSourceFilter(sourceInput.trim());
          }}
        >
          <div className="flex rounded-xl bg-slate-100 p-1" aria-label="时间范围">
            {(["7d", "30d", "all"] as const).map((value) => (
              <button
                key={value}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  range === value ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"
                }`}
                type="button"
                onClick={() => setRange(value)}
              >
                {value === "7d" ? "近 7 天" : value === "30d" ? "近 30 天" : "全部"}
              </button>
            ))}
          </div>
          <input
            aria-label="UTM Source"
            className="min-w-44 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            placeholder="筛选 UTM Source"
            value={sourceInput}
            onChange={(event) => setSourceInput(event.target.value)}
          />
          <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" type="submit">
            查询
          </button>
        </form>
      </header>

      {error ? (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          刷新失败，正在展示上一次结果：{error}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="核心指标">
        <MetricCard label="Session" value={String(data?.sessions ?? 0)} detail="筛选范围内匿名访问" />
        <MetricCard label="平均停留" value={duration(data?.averageDurationMs ?? 0)} detail="仅累计页面可见时间" accent="emerald" />
        <MetricCard label="入口 Node" value={String(summary?.nodeEntered ?? 0)} detail={`${summary?.entryNodeCode ?? "—"} 进入人数`} accent="amber" />
        <MetricCard label="视频完成率" value={percentage(summary?.entryVideoCompletionRate ?? 0)} detail={`${entryNode?.videoCompleted ?? 0} / ${entryNode?.entered ?? 0} 完成入口视频`} accent="indigo" />
        <MetricCard label="Ending 完成率" value={percentage(summary?.endingCompletionRate ?? 0)} detail={`${summary?.endingCompleted ?? 0} 个 Session 到达结局`} accent="emerald" />
        <MetricCard label="Payment Click率" value={percentage(summary?.paymentClickRate ?? 0)} detail={`${summary?.paymentClicked ?? 0} / ${summary?.endingCompleted ?? 0} 结局用户点击`} accent="rose" />
        <MetricCard label="Landing CTA" value={percentage(summary?.landingCtaClickRate ?? 0)} detail={`${summary?.landingCtaClicks ?? 0} / ${summary?.landingViews ?? 0} 点击`} accent="amber" />
        <MetricCard label="总体付费意向" value={percentage(summary?.paymentSessionRate ?? 0)} detail="Payment Click / 全部 Session" accent="rose" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Node 漏斗</h2>
            <p className="mt-1 text-xs text-slate-500">按独立 Session 去重</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr><th className="px-5 py-3">Node</th><th className="px-4 py-3">类型</th><th className="px-4 py-3">进入</th><th className="px-4 py-3">视频完成</th><th className="px-4 py-3">完成率</th><th className="px-4 py-3">Ending</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.nodes.map((node) => (
                  <tr key={node.nodeCode}>
                    <td className="px-5 py-4"><span className="font-semibold text-slate-900">{node.nodeCode}</span><span className="block text-xs text-slate-500">{node.nodeTitle}</span></td>
                    <td className="px-4 py-4 text-xs uppercase text-slate-500">{node.nodeType}</td>
                    <td className="px-4 py-4 font-medium">{node.entered}</td>
                    <td className="px-4 py-4">{node.videoCompleted}</td>
                    <td className="px-4 py-4">{node.nodeType === "video" ? percentage(node.videoCompletionRate) : "—"}</td>
                    <td className="px-4 py-4">{node.endingCompleted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Choice 选择比例</h2>
          <p className="mt-1 text-xs text-slate-500">同一来源节点内的独立 Session 分布</p>
          <div className="mt-5 space-y-5">
            {data?.choices.length ? data.choices.map((choice) => (
              <div key={`${choice.nodeCode}:${choice.choiceCode}`}>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <div><span className="font-bold text-indigo-700">{choice.choiceCode}</span><span className="ml-2 text-slate-700">{choice.choiceLabel}</span><span className="block text-xs text-slate-400">→ {choice.targetNodeCode}</span></div>
                  <div className="text-right"><span className="font-bold">{percentage(choice.selectionRate)}</span><span className="block text-xs text-slate-400">{choice.uniqueSessions} 人</span></div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(choice.selectionRate, 100)}%` }} /></div>
              </div>
            )) : <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">暂无 Choice 数据</p>}
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-950">UTM 来源</h2>
          <p className="mt-1 text-xs text-slate-500">Facebook / TikTok 广告归因明细</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">Source</th><th className="px-4 py-3">Medium</th><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Session</th><th className="px-4 py-3">平均停留</th><th className="px-4 py-3">Node进入</th><th className="px-4 py-3">Ending率</th><th className="px-4 py-3">Payment率</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data?.sources.map((source) => (
                <tr key={`${source.utmSource}:${source.utmMedium}:${source.utmCampaign}`}>
                  <td className="px-5 py-4 font-semibold text-slate-900">{source.utmSource}</td><td className="px-4 py-4 text-slate-600">{source.utmMedium}</td><td className="px-4 py-4 text-slate-600">{source.utmCampaign}</td><td className="px-4 py-4 font-medium">{source.sessions}</td><td className="px-4 py-4">{duration(source.averageDurationMs)}</td><td className="px-4 py-4">{source.nodeEntered}</td><td className="px-4 py-4">{percentage(source.endingCompletionRate)}</td><td className="px-4 py-4">{percentage(source.paymentClickRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
