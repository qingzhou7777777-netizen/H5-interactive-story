import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type {
  AdminChapterDetailDto,
  UpdateAdminChapterStatusRequest,
} from "@interactive-story/api-contracts";

import { ErrorState, LoadingState } from "../../components/RequestState";
import { StatusBadge } from "../../components/StatusBadge";
import { fetchAdminChapter, updateAdminChapterStatus } from "../admin-api";
import { ChapterStatusEditor } from "./ChapterStatusEditor";

export function ChapterDetailPage() {
  const { chapterCode = "" } = useParams();
  const [chapter, setChapter] = useState<AdminChapterDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  const loadChapter = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setChapter(await fetchAdminChapter(chapterCode));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法加载章节详情。");
    } finally {
      setLoading(false);
    }
  }, [chapterCode]);

  useEffect(() => {
    void loadChapter();
  }, [loadChapter]);

  const choices = useMemo(
    () => chapter?.nodes.flatMap((node) => node.choices) ?? [],
    [chapter],
  );

  const handleStatusSave = async (input: UpdateAdminChapterStatusRequest) => {
    if (!chapter) return;
    setSavingStatus(true);
    setStatusError(null);
    try {
      setChapter(await updateAdminChapterStatus(chapter.code, input));
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "章节状态更新失败。");
    } finally {
      setSavingStatus(false);
    }
  };

  if (loading) return <LoadingState label="正在加载章节图" />;
  if (loadError) return <ErrorState message={loadError} onRetry={() => void loadChapter()} />;
  if (!chapter) return null;

  return (
    <div>
      <Link className="text-sm font-semibold text-indigo-600 hover:text-indigo-800" to="/chapters">
        ← 返回章节列表
      </Link>

      <header className="mt-5 flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{chapter.title}</h1>
            <StatusBadge status={chapter.status} />
          </div>
          <p className="mt-2 font-mono text-xs text-slate-400">{chapter.code}</p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            {chapter.description ?? "暂无章节描述。"}
          </p>
        </div>
        <dl className="grid min-w-64 grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs">
          <div><dt className="text-slate-400">Story</dt><dd className="mt-1 font-semibold">{chapter.story.code}</dd></div>
          <div><dt className="text-slate-400">Character</dt><dd className="mt-1 font-semibold">{chapter.character.name}</dd></div>
          <div><dt className="text-slate-400">入口</dt><dd className="mt-1 font-semibold">{chapter.entryNodeId ?? "未配置"}</dd></div>
          <div><dt className="text-slate-400">节点数</dt><dd className="mt-1 font-semibold">{chapter.nodeCount}</dd></div>
        </dl>
      </header>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Nodes</p>
              <h2 className="mt-1 text-xl font-semibold">节点配置</h2>
            </div>
            <span className="text-sm text-slate-400">只读</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {chapter.nodes.map((node) => (
              <article key={node.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{node.title}</h3>
                    <p className="mt-1 font-mono text-xs text-slate-400">{node.id}</p>
                  </div>
                  <StatusBadge status={node.status} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-md bg-indigo-50 px-2 py-1 font-semibold text-indigo-700">{node.type}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">{node.completionMode}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">{node.accessMode}</span>
                </div>
                <dl className="mt-4 space-y-2 text-xs text-slate-600">
                  <div className="flex justify-between gap-4"><dt className="text-slate-400">VideoAsset</dt><dd className="break-all text-right font-mono">{node.videoAssetId ?? "—"}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-400">Next</dt><dd className="font-mono">{node.nextNodeId ?? "—"}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-400">Choices</dt><dd>{node.choices.length}</dd></div>
                </dl>
                {node.message ? <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500">{node.message}</p> : null}
              </article>
            ))}
          </div>

          <div className="mb-3 mt-8 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Choices</p>
              <h2 className="mt-1 text-xl font-semibold">选项关系</h2>
            </div>
            <span className="text-sm text-slate-400">{choices.length} 条</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <tr><th className="px-4 py-3">来源</th><th className="px-4 py-3">选项</th><th className="px-4 py-3">文案</th><th className="px-4 py-3">目标</th><th className="px-4 py-3">状态</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {choices.map((choice) => (
                    <tr key={`${choice.sourceNodeId}:${choice.id}`}>
                      <td className="px-4 py-3 font-mono text-xs">{choice.sourceNodeId}</td>
                      <td className="px-4 py-3 font-semibold text-indigo-700">{choice.id}</td>
                      <td className="px-4 py-3">{choice.label}</td>
                      <td className="px-4 py-3 font-mono text-xs">{choice.targetNodeId}</td>
                      <td className="px-4 py-3 text-xs">{choice.enabled ? "启用" : "停用"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {choices.length === 0 ? <p className="p-8 text-center text-sm text-slate-400">本章节没有 Choice 关系。</p> : null}
          </div>
        </section>

        <aside>
          <ChapterStatusEditor
            currentStatus={chapter.status}
            error={statusError}
            saving={savingStatus}
            onSave={handleStatusSave}
          />
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
            Chapter 非 ACTIVE 时，公共内容 API 不返回该章节。H5 会按现有机制显示 fallback 警告。
          </div>
        </aside>
      </div>
    </div>
  );
}

