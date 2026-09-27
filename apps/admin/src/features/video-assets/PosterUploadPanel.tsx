import { useState, type FormEvent } from "react";

interface PosterUploadPanelProps {
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
}

export function PosterUploadPanel({ uploading, onUpload }: PosterUploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    void onUpload(file).then(() => setFile(null));
  };

  return (
    <form className="rounded-xl border border-slate-200 bg-slate-50 p-4" onSubmit={handleSubmit}>
      <p className="text-sm font-semibold text-slate-800">上传 JPEG 封面</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">要求 1920 × 1080，文件不超过 300 KB。</p>
      <label className="mt-3 block">
        <span className="sr-only">选择 JPEG 封面</span>
        <input
          accept="image/jpeg,.jpg,.jpeg"
          className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:font-semibold file:text-slate-700"
          disabled={uploading}
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <button
        className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!file || uploading}
        type="submit"
      >
        {uploading ? "正在上传封面" : "上传封面"}
      </button>
    </form>
  );
}
