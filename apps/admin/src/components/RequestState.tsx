export function LoadingState({ label = "正在加载内容" }: { label?: string }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-slate-200 bg-white">
      <div className="text-center">
        <span className="mx-auto block size-2.5 animate-pulse rounded-full bg-indigo-500" />
        <p className="mt-3 text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
      <h2 className="font-semibold text-rose-900">内容加载失败</h2>
      <p className="mt-2 text-sm leading-6 text-rose-700">{message}</p>
      <button
        className="mt-4 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800"
        type="button"
        onClick={onRetry}
      >
        重新加载
      </button>
    </div>
  );
}

