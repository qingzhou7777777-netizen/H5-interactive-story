import type {
  AccountStoryMapNodeDto,
  AccountStoryMapRegionDto,
} from "@interactive-story/api-contracts";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { getAccountAccessToken } from "../../features/account-progress/account-access-token";
import { useStoryMap } from "../../features/story-map/useStoryMap";
import {
  startExplorationRun,
  startReplayRun,
} from "../../features/story-run/story-run-api";
import { saveStoryRunSession } from "../../features/story-run/story-run-session";

interface StoryMapConnection {
  fromNodeCode: string;
  toNodeCode: string;
}

type MapIntent = "exploration" | "replay";

function readConnections(region: AccountStoryMapRegionDto): StoryMapConnection[] {
  const metadata = region.layoutMetadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const connections = (metadata as Record<string, unknown>).connections;
  if (!Array.isArray(connections)) return [];

  const visibleNodeCodes = new Set(region.nodes.map((node) => node.nodeCode));
  return connections.flatMap((connection) => {
    if (!connection || typeof connection !== "object" || Array.isArray(connection)) {
      return [];
    }
    const candidate = connection as Record<string, unknown>;
    if (
      typeof candidate.fromNodeCode !== "string" ||
      typeof candidate.toNodeCode !== "string" ||
      !visibleNodeCodes.has(candidate.fromNodeCode) ||
      !visibleNodeCodes.has(candidate.toNodeCode)
    ) {
      return [];
    }
    return [{
      fromNodeCode: candidate.fromNodeCode,
      toNodeCode: candidate.toNodeCode,
    }];
  });
}

function nodeStateLabel(node: AccountStoryMapNodeDto) {
  if (node.state === "discovered_locked") return "尚未解锁";
  if (node.state === "available") return "可以进入";
  return "已完成";
}

function NodeCard({
  node,
  isCurrentMainline,
  chapterCode,
  onIntent,
  intentPending,
}: {
  node: AccountStoryMapNodeDto;
  isCurrentMainline: boolean;
  chapterCode: string;
  onIntent: (intent: MapIntent, node: AccountStoryMapNodeDto) => Promise<void>;
  intentPending: boolean;
}) {
  const locked = node.state === "discovered_locked";
  const completed = node.state === "completed";

  return (
    <article
      data-node-code={node.nodeCode}
      className={`absolute w-56 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border p-4 shadow-2xl backdrop-blur-xl ${
        locked
          ? "border-white/10 bg-slate-950/75 text-slate-400 grayscale"
          : completed
            ? "border-emerald-300/35 bg-emerald-950/55 text-white shadow-emerald-950/25"
            : "border-fuchsia-300/40 bg-fuchsia-950/55 text-white shadow-fuchsia-950/30"
      }`}
      style={{ left: node.position.x + 120, top: node.position.y + 100 }}
    >
      {node.coverUrl ? (
        <img
          alt=""
          aria-hidden="true"
          className="mb-3 h-24 w-full rounded-2xl object-cover"
          src={node.coverUrl}
        />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-current/65">
            {node.nodeCode}
          </p>
          <h3 className="mt-1 text-lg font-bold">{node.title}</h3>
        </div>
        <span
          aria-label={nodeStateLabel(node)}
          className={`grid size-9 shrink-0 place-items-center rounded-full border text-sm ${
            locked
              ? "border-white/10 bg-white/5"
              : completed
                ? "border-emerald-300/30 bg-emerald-300/15 text-emerald-200"
                : "border-fuchsia-300/30 bg-fuchsia-300/15 text-fuchsia-100"
          }`}
        >
          {locked ? "🔒" : completed ? "✓" : "▶"}
        </span>
      </div>
      {node.description ? (
        <p className="mt-2 min-h-10 text-xs leading-5 text-current/70">{node.description}</p>
      ) : null}

      <div className="mt-4 grid gap-2">
        {node.state === "available" && isCurrentMainline ? (
          <Link
            className="rounded-full bg-gradient-to-r from-rose-300 via-fuchsia-300 to-violet-300 px-4 py-2.5 text-center text-sm font-bold text-slate-950 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            to={`/story?chapterCode=${encodeURIComponent(chapterCode)}`}
          >
            继续剧情
          </Link>
        ) : null}
        {node.state === "available" && !isCurrentMainline && node.actions.canExplore ? (
          <button
            className="rounded-full bg-gradient-to-r from-rose-300 via-fuchsia-300 to-violet-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            disabled={intentPending}
            type="button"
            onClick={() => void onIntent("exploration", node)}
          >
            {intentPending ? "正在进入…" : "开始探索"}
          </button>
        ) : null}
        {completed && node.actions.canReplay ? (
          <button
            className="rounded-full border border-emerald-200/35 bg-emerald-200/15 px-4 py-2.5 text-sm font-bold text-emerald-50 transition hover:bg-emerald-200/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            disabled={intentPending}
            type="button"
            onClick={() => void onIntent("replay", node)}
          >
            {intentPending ? "正在进入…" : "重新观看"}
          </button>
        ) : null}
        {completed && node.actions.canExplore ? (
          <button
            className="rounded-full border border-fuchsia-200/35 bg-fuchsia-200/10 px-4 py-2.5 text-sm font-bold text-fuchsia-50 transition hover:bg-fuchsia-200/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            disabled={intentPending}
            type="button"
            onClick={() => void onIntent("exploration", node)}
          >
            {intentPending ? "正在进入…" : "再次探索"}
          </button>
        ) : null}
        {locked ? (
          <button
            className="cursor-not-allowed rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-500"
            disabled
            type="button"
          >
            未解锁
          </button>
        ) : null}
      </div>
    </article>
  );
}

function RegionMap({
  region,
  currentNodeCode,
  chapterCode,
  onIntent,
  pendingIntentKey,
}: {
  region: AccountStoryMapRegionDto;
  currentNodeCode: string;
  chapterCode: string;
  onIntent: (intent: MapIntent, node: AccountStoryMapNodeDto) => Promise<void>;
  pendingIntentKey: string | null;
}) {
  const nodeByCode = new Map(region.nodes.map((node) => [node.nodeCode, node]));
  const connections = readConnections(region);
  const maxX = Math.max(760, ...region.nodes.map((node) => node.position.x));
  const maxY = Math.max(460, ...region.nodes.map((node) => node.position.y));
  const width = maxX + 240;
  const height = maxY + 200;

  return (
    <section className="rounded-[2rem] border border-white/15 bg-white/[0.06] p-4 shadow-2xl shadow-indigo-950/25 backdrop-blur-xl sm:p-6">
      <header className="mb-5 px-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-200/75">Region</p>
        <h2 className="mt-1 text-2xl font-bold text-white">{region.title}</h2>
        {region.description ? <p className="mt-2 text-sm text-slate-300">{region.description}</p> : null}
      </header>
      <div className="overflow-x-auto rounded-[1.5rem] border border-white/10 bg-slate-950/45">
        <div className="relative" style={{ width, height }}>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full"
            viewBox={`0 0 ${width} ${height}`}
          >
            {connections.map((connection) => {
              const from = nodeByCode.get(connection.fromNodeCode);
              const to = nodeByCode.get(connection.toNodeCode);
              if (!from || !to) return null;
              return (
                <line
                  key={`${connection.fromNodeCode}-${connection.toNodeCode}`}
                  data-testid="story-map-connection"
                  stroke="rgba(244, 114, 182, 0.5)"
                  strokeDasharray="8 8"
                  strokeLinecap="round"
                  strokeWidth="4"
                  x1={from.position.x + 120}
                  x2={to.position.x + 120}
                  y1={from.position.y + 100}
                  y2={to.position.y + 100}
                />
              );
            })}
          </svg>
          {region.nodes.map((node) => (
            <NodeCard
              key={node.nodeCode}
              chapterCode={chapterCode}
              isCurrentMainline={node.nodeCode === currentNodeCode}
              intentPending={pendingIntentKey !== null}
              node={node}
              onIntent={onIntent}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function StoryMapPage() {
  const params = useParams<{ chapterCode: string }>();
  const navigate = useNavigate();
  const chapterCode = params.chapterCode?.trim() || "chapter-01";
  const { status, data, error, retry } = useStoryMap(chapterCode);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [pendingIntentKey, setPendingIntentKey] = useState<string | null>(null);
  const intentPendingRef = useRef(false);

  const handleIntent = async (intent: MapIntent, node: AccountStoryMapNodeDto) => {
    if (!data || intentPendingRef.current) return;
    const token = getAccountAccessToken();
    if (!token) {
      setIntentError("当前浏览器没有账号登录凭证，请重新登录后再试。");
      return;
    }

    setIntentError(null);
    intentPendingRef.current = true;
    setPendingIntentKey(`${intent}:${node.nodeCode}`);
    try {
      const requestKey = crypto.randomUUID();
      const response =
        intent === "exploration"
          ? await startExplorationRun(chapterCode, token, {
              releaseId: data.release.id,
              entryNodeCode: node.nodeCode,
              requestKey,
            })
          : await startReplayRun(chapterCode, token, {
              releaseId: data.release.id,
              nodeCode: node.nodeCode,
              requestKey,
            });
      saveStoryRunSession(chapterCode, response);
      navigate(
        `/story?chapterCode=${encodeURIComponent(chapterCode)}&mode=${intent}&runId=${encodeURIComponent(response.run.id)}`,
      );
    } catch (runError) {
      intentPendingRef.current = false;
      setIntentError(
        runError instanceof Error ? runError.message : "剧情运行创建失败。",
      );
      setPendingIntentKey(null);
    }
  };

  if (status === "loading") {
    return (
      <main className="grid min-h-dvh place-items-center bg-slate-950 px-6 text-white">
        <section aria-busy="true" className="text-center">
          <span className="mx-auto block size-3 animate-pulse rounded-full bg-fuchsia-300" />
          <h1 className="mt-5 text-xl font-bold">正在展开剧情地图</h1>
          <p className="mt-2 text-sm text-slate-400">正在读取账号已发现的区域和节点。</p>
        </section>
      </main>
    );
  }

  if (status === "error" || !data) {
    return (
      <main className="grid min-h-dvh place-items-center bg-slate-950 px-6 text-white">
        <section role="alert" className="w-full max-w-lg rounded-3xl border border-rose-300/20 bg-rose-300/10 p-8 text-center">
          <h1 className="text-xl font-bold">剧情地图暂时无法加载</h1>
          <p className="mt-3 text-sm leading-6 text-rose-100/75">{error}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button className="rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950" type="button" onClick={retry}>重新加载</button>
            <Link className="rounded-full border border-white/20 px-5 py-3 text-sm font-bold text-white" to="/">返回主页</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_0%_100%,rgba(248,178,202,0.32),transparent_42%),radial-gradient(circle_at_100%_0%,rgba(117,165,227,0.36),transparent_45%),linear-gradient(145deg,#20112c,#111827_52%,#080b12)] px-4 py-6 text-white sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-fuchsia-200">Story Map</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">我的剧情地图</h1>
            <p className="mt-3 text-sm text-slate-300">
              仅展示账号已发现的区域与节点 · 发布版本 {data.release.version}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-full border border-white/20 bg-white/[0.07] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/12"
              to={`/story?chapterCode=${encodeURIComponent(chapterCode)}`}
            >
              返回互动播放器
            </Link>
            <Link className="rounded-full border border-white/15 px-5 py-3 text-sm font-bold text-white/75 transition hover:text-white" to="/">返回主页</Link>
          </div>
        </header>

        {intentError ? (
          <section role="alert" className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-rose-200/20 bg-rose-200/10 px-5 py-4 text-sm text-rose-50">
            <p>{intentError}</p>
            <button className="shrink-0 font-bold" type="button" onClick={() => setIntentError(null)}>关闭</button>
          </section>
        ) : null}

        <div className="grid gap-6">
          {data.regions.map((region) => (
            <RegionMap
              key={region.code}
              chapterCode={chapterCode}
              currentNodeCode={data.progress.currentNodeCode}
              pendingIntentKey={pendingIntentKey}
              region={region}
              onIntent={handleIntent}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
