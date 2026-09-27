import { useEffect, useState, type FormEvent } from "react";

import type {
  AdminVideoAssetDto,
  AdminVideoStatusDto,
  UpdateAdminVideoAssetRequest,
} from "@interactive-story/api-contracts";

import { StatusBadge } from "../../components/StatusBadge";
import { PosterUploadPanel } from "./PosterUploadPanel";
import { VideoUploadPanel } from "./VideoUploadPanel";

interface VideoAssetEditorProps {
  asset: AdminVideoAssetDto;
  error: string | null;
  saving: boolean;
  uploadingVideo: boolean;
  uploadingPoster: boolean;
  onCancel: () => void;
  onSave: (input: UpdateAdminVideoAssetRequest) => Promise<void>;
  onUploadVideo: (file: File) => Promise<void>;
  onUploadPoster: (file: File) => Promise<void>;
}

export function VideoAssetEditor({
  asset,
  error,
  saving,
  uploadingVideo,
  uploadingPoster,
  onCancel,
  onSave,
  onUploadVideo,
  onUploadPoster,
}: VideoAssetEditorProps) {
  const [playbackUrl, setPlaybackUrl] = useState(asset.playbackUrl ?? "");
  const [posterUrl, setPosterUrl] = useState(asset.posterUrl ?? "");
  const [status, setStatus] = useState<AdminVideoStatusDto>(asset.status);

  useEffect(() => {
    setPlaybackUrl(asset.playbackUrl ?? "");
    setPosterUrl(asset.posterUrl ?? "");
    setStatus(asset.status);
  }, [asset]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void onSave({
      playbackUrl: playbackUrl.trim() || null,
      posterUrl: posterUrl.trim() || null,
      status,
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
            VideoAsset 详情
          </p>
          <h2 className="mt-2 break-all text-lg font-semibold">{asset.code}</h2>
        </div>
        <StatusBadge status={asset.status} />
      </header>

      <form className="space-y-5 p-5" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <VideoUploadPanel uploading={uploadingVideo} onUpload={onUploadVideo} />
          <PosterUploadPanel uploading={uploadingPoster} onUpload={onUploadPoster} />
        </div>

        {asset.playbackUrl ? (
          <video
            className="aspect-video max-h-80 w-full rounded-xl bg-slate-950 object-contain"
            controls
            playsInline
            poster={asset.posterUrl ?? undefined}
            preload="metadata"
            src={asset.playbackUrl}
          />
        ) : null}
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Video URL</span>
          <input
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            value={playbackUrl}
            onChange={(event) => setPlaybackUrl(event.target.value)}
            placeholder="/media/... 或 https://..."
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Poster URL</span>
          <input
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            value={posterUrl}
            onChange={(event) => setPosterUrl(event.target.value)}
            placeholder="/posters/... 或 https://..."
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-700">状态</span>
          <select
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            value={status}
            onChange={(event) => setStatus(event.target.value as AdminVideoStatusDto)}
          >
            <option value="uploading">UPLOADING · 处理中</option>
            <option value="processing">PROCESSING · 校验中</option>
            <option value="ready">READY · 可用</option>
            <option value="failed">FAILED · 失败</option>
            <option value="disabled">DISABLED · 已停用</option>
          </select>
        </label>

        <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 text-xs text-slate-600 sm:grid-cols-2">
          <div>
            <dt className="text-slate-400">原始文件</dt>
            <dd className="mt-1 break-all font-medium">{asset.originalFilename}</dd>
          </div>
          <div>
            <dt className="text-slate-400">尺寸 / 时长</dt>
            <dd className="mt-1 font-medium">
              {asset.width ?? "?"} × {asset.height ?? "?"} · {asset.durationMs ?? "?"}ms
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-400">Object Key</dt>
            <dd className="mt-1 break-all font-mono">{asset.objectKey}</dd>
          </div>
          <div>
            <dt className="text-slate-400">视频编码</dt>
            <dd className="mt-1 font-medium">
              {asset.videoCodec ?? "?"} + {asset.audioCodec ?? "?"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">像素格式 / 帧率</dt>
            <dd className="mt-1 font-medium">
              {asset.pixelFormat ?? "?"} · {asset.frameRate ?? "?"} fps
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-400">封面 Object Key</dt>
            <dd className="mt-1 break-all font-mono">{asset.posterObjectKey ?? "未上传"}</dd>
          </div>
        </dl>

        {asset.processingError ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            校验失败：{asset.processingError}
          </p>
        ) : asset.status === "ready" ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            视频格式、编码和分辨率校验通过，可以供 H5 播放。
          </p>
        ) : null}

        <div>
          <p className="text-xs font-semibold text-slate-500">关联节点</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {asset.relatedNodes.length > 0 ? (
              asset.relatedNodes.map((node) => (
                <span
                  key={`${node.chapterCode}:${node.nodeId}`}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600"
                >
                  {node.chapterCode} / {node.nodeId}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400">暂无节点引用</span>
            )}
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="flex gap-3">
          <button
            className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            {saving ? "正在保存" : "保存修改"}
          </button>
          <button
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            type="button"
            onClick={onCancel}
          >
            关闭
          </button>
        </div>
      </form>
    </section>
  );
}
