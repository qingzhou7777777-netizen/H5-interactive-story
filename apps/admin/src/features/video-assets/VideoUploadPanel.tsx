import { useState, type FormEvent } from "react";

interface VideoUploadPanelProps {
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
}

export function VideoUploadPanel({ uploading, onUpload }: VideoUploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    void onUpload(file).then(() => setFile(null));
  };

  return (
    <form className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4" onSubmit={handleSubmit}>
      <p className="text-sm font-semibold text-slate-800">上传 MP4</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        要求 H.264 + AAC、1920 × 1080、25/30 fps、Fast Start。上传后自动校验，不执行转码。
      </p>
      <label className="mt-3 block">
        <span className="sr-only">选择 MP4 视频</span>
        <input
          accept="video/mp4,.mp4"
          className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:font-semibold file:text-indigo-700"
          disabled={uploading}
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <button
        className="mt-3 w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!file || uploading}
        type="submit"
      >
        {uploading ? "正在上传与校验" : "上传视频"}
      </button>
    </form>
  );
}
