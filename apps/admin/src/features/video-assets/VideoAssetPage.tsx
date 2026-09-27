import { useCallback, useEffect, useState } from "react";

import type {
  AdminVideoAssetDto,
  UpdateAdminVideoAssetRequest,
} from "@interactive-story/api-contracts";

import { ErrorState, LoadingState } from "../../components/RequestState";
import { StatusBadge } from "../../components/StatusBadge";
import {
  fetchAdminVideoAssets,
  updateAdminVideoAsset,
  uploadAdminPoster,
  uploadAdminVideo,
} from "../admin-api";
import { VideoAssetEditor } from "./VideoAssetEditor";

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function VideoAssetPage() {
  const [assets, setAssets] = useState<AdminVideoAssetDto[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingPoster, setUploadingPoster] = useState(false);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setAssets(await fetchAdminVideoAssets());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法加载视频资源。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const selectedAsset = assets.find((asset) => asset.code === selectedCode) ?? null;

  const handleSave = async (input: UpdateAdminVideoAssetRequest) => {
    if (!selectedAsset) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateAdminVideoAsset(selectedAsset.code, input);
      setAssets((current) =>
        current.map((asset) => (asset.code === updated.code ? updated : asset)),
      );
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "视频资源保存失败。");
    } finally {
      setSaving(false);
    }
  };

  const replaceAsset = (updated: AdminVideoAssetDto) => {
    setAssets((current) =>
      current.map((asset) => (asset.code === updated.code ? updated : asset)),
    );
  };

  const handleVideoUpload = async (file: File) => {
    if (!selectedAsset) return;
    setUploadingVideo(true);
    setSaveError(null);
    try {
      replaceAsset(await uploadAdminVideo(selectedAsset.code, file));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "视频上传失败。");
      await loadAssets();
    } finally {
      setUploadingVideo(false);
    }
  };

  const handlePosterUpload = async (file: File) => {
    if (!selectedAsset) return;
    setUploadingPoster(true);
    setSaveError(null);
    try {
      replaceAsset(await uploadAdminPoster(selectedAsset.code, file));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "封面上传失败。");
    } finally {
      setUploadingPoster(false);
    }
  };

  return (
    <div>
      <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-indigo-600">内容资源</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">视频资源管理</h1>
          <p className="mt-2 text-sm text-slate-500">
            查看 VideoAsset，并维护播放地址、封面地址和处理状态。
          </p>
        </div>
        <span className="text-sm text-slate-500">共 {assets.length} 个资源</span>
      </header>

      {loading ? <LoadingState label="正在读取 VideoAsset" /> : null}
      {!loading && loadError ? <ErrorState message={loadError} onRetry={() => void loadAssets()} /> : null}

      {!loading && !loadError ? (
        <div className={`grid gap-6 ${selectedAsset ? "xl:grid-cols-[minmax(0,1fr)_28rem]" : ""}`}>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold">资源</th>
                    <th className="px-5 py-3.5 font-semibold">状态</th>
                    <th className="px-5 py-3.5 font-semibold">Video URL</th>
                    <th className="px-5 py-3.5 font-semibold">关联节点</th>
                    <th className="px-5 py-3.5 font-semibold">更新时间</th>
                    <th className="px-5 py-3.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assets.map((asset) => (
                    <tr key={asset.code} className="align-top hover:bg-slate-50/70">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{asset.code}</p>
                        <p className="mt-1 text-xs text-slate-400">{asset.originalFilename}</p>
                      </td>
                      <td className="px-5 py-4"><StatusBadge status={asset.status} /></td>
                      <td className="max-w-xs px-5 py-4">
                        <p className="truncate font-mono text-xs text-slate-600" title={asset.playbackUrl ?? ""}>
                          {asset.playbackUrl ?? "未配置"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{asset.relatedNodes.length}</td>
                      <td className="px-5 py-4 text-xs text-slate-500">{formatUpdatedAt(asset.updatedAt)}</td>
                      <td className="px-5 py-4 text-right">
                        <button
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                          type="button"
                          onClick={() => {
                            setSelectedCode(asset.code);
                            setSaveError(null);
                          }}
                        >
                          查看与编辑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {assets.length === 0 ? (
              <p className="p-10 text-center text-sm text-slate-400">数据库中暂无视频资源。</p>
            ) : null}
          </section>

          {selectedAsset ? (
            <VideoAssetEditor
              asset={selectedAsset}
              error={saveError}
              saving={saving}
              uploadingVideo={uploadingVideo}
              uploadingPoster={uploadingPoster}
              onCancel={() => setSelectedCode(null)}
              onSave={handleSave}
              onUploadVideo={handleVideoUpload}
              onUploadPoster={handlePosterUpload}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
