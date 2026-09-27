import { useEffect, useState } from "react";

import type {
  AdminContentStatusDto,
  UpdateAdminChapterStatusRequest,
} from "@interactive-story/api-contracts";

interface ChapterStatusEditorProps {
  currentStatus: AdminContentStatusDto;
  error: string | null;
  saving: boolean;
  onSave: (input: UpdateAdminChapterStatusRequest) => Promise<void>;
}

export function ChapterStatusEditor({
  currentStatus,
  error,
  saving,
  onSave,
}: ChapterStatusEditorProps) {
  const [status, setStatus] = useState(currentStatus);

  useEffect(() => setStatus(currentStatus), [currentStatus]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold">发布状态</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        切换为 ACTIVE 前，API 会检查入口节点、跳转关系以及 READY 视频资源。
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <select
          aria-label="章节状态"
          className="min-w-44 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          value={status}
          onChange={(event) => setStatus(event.target.value as AdminContentStatusDto)}
        >
          <option value="draft">DRAFT · 草稿</option>
          <option value="active">ACTIVE · 已发布</option>
          <option value="disabled">DISABLED · 已停用</option>
        </select>
        <button
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={saving || status === currentStatus}
          type="button"
          onClick={() => void onSave({ status })}
        >
          {saving ? "正在更新" : "更新状态"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}

