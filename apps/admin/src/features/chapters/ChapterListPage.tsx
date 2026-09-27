import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { AdminChapterSummaryDto } from "@interactive-story/api-contracts";

import { ErrorState, LoadingState } from "../../components/RequestState";
import { StatusBadge } from "../../components/StatusBadge";
import { fetchAdminChapters } from "../admin-api";

export function ChapterListPage() {
  const [chapters, setChapters] = useState<AdminChapterSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadChapters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setChapters(await fetchAdminChapters());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "无法加载章节。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChapters();
  }, [loadChapters]);

  return (
    <div>
      <header className="mb-7">
        <p className="text-sm font-semibold text-indigo-600">剧情配置</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">剧情章节</h1>
        <p className="mt-2 text-sm text-slate-500">
          查看 Chapter、Node 和 Choice 关系，并控制章节发布状态。
        </p>
      </header>

      {loading ? <LoadingState label="正在读取 Chapter" /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => void loadChapters()} /> : null}

      {!loading && !error ? (
        <div className="grid gap-4">
          {chapters.map((chapter) => (
            <article
              key={chapter.code}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
            >
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{chapter.title}</h2>
                    <StatusBadge status={chapter.status} />
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-400">{chapter.code}</p>
                  <p className="mt-3 text-sm text-slate-600">
                    {chapter.story.title} · 角色 {chapter.character.name} · {chapter.nodeCount} 个节点
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    入口节点：{chapter.entryNodeId ?? "未配置"}
                  </p>
                </div>
                <Link
                  className="shrink-0 rounded-xl bg-slate-950 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-indigo-700"
                  to={`/chapters/${encodeURIComponent(chapter.code)}`}
                >
                  查看章节详情
                </Link>
              </div>
            </article>
          ))}
          {chapters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-400">
              数据库中暂无章节。
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

