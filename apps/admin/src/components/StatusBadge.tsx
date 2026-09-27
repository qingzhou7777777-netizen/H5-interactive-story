const labels: Record<string, string> = {
  active: "已发布",
  draft: "草稿",
  disabled: "已停用",
  ready: "可用",
  uploading: "处理中",
  processing: "校验中",
  failed: "失败",
};

const tones: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  draft: "border-amber-200 bg-amber-50 text-amber-700",
  uploading: "border-sky-200 bg-sky-50 text-sky-700",
  processing: "border-violet-200 bg-violet-50 text-violet-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
  disabled: "border-slate-200 bg-slate-100 text-slate-600",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        tones[status] ?? tones.disabled
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}
