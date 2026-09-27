import type { StoryChoice } from "@interactive-story/story-core";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

import type { VideoAsset } from "../../features/video-assets/video-asset";
import { VideoChoiceOverlay } from "./VideoChoiceOverlay";

type VideoStatus =
  | "loading"
  | "ready"
  | "playing"
  | "buffering"
  | "autoplay-blocked"
  | "error"
  | "timeout"
  | "ended";

type PlaybackOrigin = "autoplay" | "user";

export interface VideoPlayerError {
  code: "missing_source" | "load_error" | "load_timeout" | "playback_error";
  assetId?: string | undefined;
  retryCount: number;
}

export interface VideoPlayerProps {
  asset: VideoAsset | undefined;
  title: string;
  onEnded: () => void;
  choices?: readonly StoryChoice[];
  pendingChoiceId?: string | null;
  onChoice?: (choice: StoryChoice) => void;
  onPlaybackError?: (error: VideoPlayerError) => void;
  fullscreenTargetRef?: RefObject<HTMLElement | null>;
  autoPlay?: boolean;
  loadTimeoutMs?: number;
  maxRetries?: number;
}

interface PendingRelease {
  element: HTMLVideoElement;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_LOAD_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;

function releaseVideoResources(video: HTMLVideoElement) {
  try {
    video.pause();
    video.removeAttribute("src");
    video.querySelectorAll("source").forEach((source) => {
      source.removeAttribute("src");
    });
    video.load();
  } catch {
    // 部分浏览器在节点已从 DOM 移除后会拒绝媒体操作；此时等待浏览器回收即可。
  }
}

function isAutoplayBlocked(error: unknown) {
  return error instanceof DOMException
    ? error.name === "NotAllowedError"
    : error instanceof Error && error.name === "NotAllowedError";
}

export function VideoPlayer({
  asset,
  title: _title,
  onEnded,
  choices = [],
  pendingChoiceId = null,
  onChoice,
  onPlaybackError,
  fullscreenTargetRef,
  autoPlay = true,
  loadTimeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
}: VideoPlayerProps) {
  const hasSources = Boolean(asset?.sources.length);
  const sourceSignature = useMemo(
    () => asset?.sources.map(({ src, type }) => `${type}:${src}`).join("|") ?? "",
    [asset],
  );
  const [status, setStatus] = useState<VideoStatus>(hasSources ? "loading" : "error");
  const [attempt, setAttempt] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fullscreenIntentRef = useRef(false);
  const autoplayAttemptedRef = useRef(false);
  const endedRef = useRef(false);
  const playbackRequestRef = useRef(0);
  const pendingReleaseRef = useRef<PendingRelease | null>(null);
  const onPlaybackErrorRef = useRef(onPlaybackError);

  useEffect(() => {
    onPlaybackErrorRef.current = onPlaybackError;
  }, [onPlaybackError]);

  useEffect(() => {
    const syncFullscreenState = () => {
      const target = fullscreenTargetRef?.current ?? playerRef.current;
      const fullscreenElement = document.fullscreenElement;
      const isTargetFullscreen = Boolean(
        target &&
          (fullscreenElement === target || fullscreenElement?.contains(target)),
      );
      setIsFullscreen(isTargetFullscreen);

      if (!isTargetFullscreen && fullscreenIntentRef.current && target?.isConnected) {
        void target.requestFullscreen().catch(() => {
          fullscreenIntentRef.current = false;
          setIsFullscreen(false);
        });
      }
    };

    const cancelFullscreenIntent = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        fullscreenIntentRef.current = false;
      }
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("keydown", cancelFullscreenIntent, true);
    syncFullscreenState();
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("keydown", cancelFullscreenIntent, true);
    };
  }, [fullscreenTargetRef]);

  useEffect(() => {
    setStatus(hasSources ? "loading" : "error");
    setAttempt(0);
    autoplayAttemptedRef.current = false;
    endedRef.current = false;
    playbackRequestRef.current += 1;

    if (!hasSources) {
      onPlaybackErrorRef.current?.({
        code: "missing_source",
        assetId: asset?.id,
        retryCount: 0,
      });
    }
  }, [asset?.id, hasSources, sourceSignature]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasSources) {
      return;
    }

    video.pause();
    video.load();
  }, [asset?.id, attempt, hasSources, sourceSignature]);

  // StrictMode 会执行一次“挂载 -> 清理 -> 再挂载”。延迟释放可以避免开发环境
  // 的模拟清理误伤仍在使用的 video，同时在真实节点切换时立即释放旧元素。
  useEffect(() => {
    const currentVideo = videoRef.current;
    const pendingRelease = pendingReleaseRef.current;

    if (pendingRelease) {
      clearTimeout(pendingRelease.timer);
      pendingReleaseRef.current = null;

      if (pendingRelease.element !== currentVideo) {
        releaseVideoResources(pendingRelease.element);
      }
    }

    if (!currentVideo) {
      return;
    }

    return () => {
      const timer = setTimeout(() => {
        releaseVideoResources(currentVideo);
        if (pendingReleaseRef.current?.element === currentVideo) {
          pendingReleaseRef.current = null;
        }
      }, 0);

      pendingReleaseRef.current = { element: currentVideo, timer };
    };
  }, [asset?.id, attempt, sourceSignature]);

  useEffect(() => {
    if (!hasSources || (status !== "loading" && status !== "buffering")) {
      return;
    }

    const timer = setTimeout(() => {
      const video = videoRef.current;
      if (video) {
        video.pause();
      }
      setStatus("timeout");
      onPlaybackErrorRef.current?.({
        code: "load_timeout",
        assetId: asset?.id,
        retryCount: attempt,
      });
    }, loadTimeoutMs);

    return () => clearTimeout(timer);
  }, [asset?.id, attempt, hasSources, loadTimeoutMs, status]);

  const reportPlaybackFailure = () => {
    setStatus("error");
    onPlaybackErrorRef.current?.({
      code: "playback_error",
      assetId: asset?.id,
      retryCount: attempt,
    });
  };

  const requestPlayback = async (origin: PlaybackOrigin) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const requestId = ++playbackRequestRef.current;

    try {
      await video.play();
      if (requestId === playbackRequestRef.current) {
        setStatus("playing");
      }
    } catch (error) {
      if (requestId !== playbackRequestRef.current) {
        return;
      }

      if (origin === "autoplay" && isAutoplayBlocked(error)) {
        setStatus("autoplay-blocked");
        return;
      }

      reportPlaybackFailure();
    }
  };

  const handleCanPlay = () => {
    if (endedRef.current) {
      return;
    }

    setStatus("ready");
    if (autoPlay && !autoplayAttemptedRef.current) {
      autoplayAttemptedRef.current = true;
      void requestPlayback("autoplay");
    }
  };

  const handleLoadError = () => {
    setStatus("error");
    onPlaybackErrorRef.current?.({
      code: "load_error",
      assetId: asset?.id,
      retryCount: attempt,
    });
  };

  const handleEnded = () => {
    if (endedRef.current) {
      return;
    }

    endedRef.current = true;
    setStatus("ended");
    onEnded();
  };

  const retry = () => {
    if (!hasSources || attempt >= maxRetries) {
      return;
    }

    playbackRequestRef.current += 1;
    autoplayAttemptedRef.current = false;
    endedRef.current = false;
    setStatus("loading");
    setAttempt((current) => current + 1);
  };

  const toggleFullscreen = async () => {
    const target = fullscreenTargetRef?.current ?? playerRef.current;
    if (!target) return;

    try {
      if (document.fullscreenElement) {
        fullscreenIntentRef.current = false;
        await document.exitFullscreen();
      } else {
        fullscreenIntentRef.current = true;
        await target.requestFullscreen();
      }
    } catch {
      fullscreenIntentRef.current = false;
      // 浏览器可能因权限或策略拒绝全屏；保持播放器在当前布局继续可用。
    }
  };

  const isBusy = status === "loading" || status === "buffering";
  const retryExhausted = attempt >= maxRetries;

  return (
    <section
      ref={playerRef}
      aria-label="互动视频播放器"
      aria-busy={isBusy}
      className={`${isFullscreen ? "h-screen w-screen rounded-none" : "story-player-size mx-auto aspect-video rounded-[1.75rem]"} relative isolate overflow-hidden border border-white/20 bg-zinc-950 shadow-2xl shadow-indigo-950/30`}
    >
      {hasSources ? (
        <video
          ref={videoRef}
          aria-label="剧情视频"
          className="story-video h-full w-full bg-black object-contain"
          controls
          controlsList="nofullscreen"
          playsInline
          poster={asset?.poster}
          preload="metadata"
          onCanPlay={handleCanPlay}
          onEnded={handleEnded}
          onError={handleLoadError}
          onLoadStart={() => setStatus("loading")}
          onPlaying={() => setStatus("playing")}
          onStalled={() => setStatus("buffering")}
          onWaiting={() => setStatus("buffering")}
        >
          {asset?.sources.map((source) => (
            <source key={`${source.type}-${source.src}`} src={source.src} type={source.type} />
          ))}
          当前浏览器不支持 HTML5 视频播放。
        </video>
      ) : null}

      <button
        aria-label={isFullscreen ? "退出全屏" : "进入全屏"}
        className="absolute bottom-3 right-12 z-40 grid size-11 place-items-center rounded-full border border-white/25 bg-black/45 text-white shadow-lg shadow-black/25 backdrop-blur-md transition hover:scale-105 hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        type="button"
        onClick={() => void toggleFullscreen()}
      >
        <svg
          aria-hidden="true"
          className="size-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          {isFullscreen ? (
            <path d="M9 4v5H4m11-5v5h5M9 20v-5H4m11 5v-5h5" />
          ) : (
            <path d="M9 4H4v5m11-5h5v5M9 20H4v-5m11 5h5v-5" />
          )}
        </svg>
      </button>

      {onChoice ? (
        <VideoChoiceOverlay
          choices={choices}
          pendingChoiceId={pendingChoiceId}
          onChoice={onChoice}
        />
      ) : null}

      {isBusy ? (
        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-0 grid place-items-center bg-black/35"
        >
          <div className="flex items-center gap-3 rounded-full bg-black/65 px-4 py-2 text-sm text-white/90 backdrop-blur">
            <span className="size-2 animate-pulse rounded-full bg-fuchsia-400" />
            {status === "buffering" ? "网络较慢，正在缓冲" : "正在加载视频"}
          </div>
        </div>
      ) : null}

      {status === "autoplay-blocked" ? (
        <div className="absolute inset-0 grid place-items-center bg-black/55 px-8 text-center">
          <div>
            <p className="text-sm leading-6 text-white/85">
              浏览器已阻止自动播放，点击后继续剧情。
            </p>
            <button
              className="mt-4 rounded-full bg-fuchsia-300 px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-fuchsia-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              type="button"
              onClick={() => void requestPlayback("user")}
            >
              点击播放
            </button>
          </div>
        </div>
      ) : null}

      {status === "error" || status === "timeout" ? (
        <div
          role="alert"
          className="absolute inset-0 grid place-items-center bg-zinc-950/95 px-8 text-center"
        >
          <div>
            <div className="mx-auto grid size-12 place-items-center rounded-full border border-rose-400/25 bg-rose-400/10 text-xl text-rose-300">
              !
            </div>
            <h2 className="mt-4 text-lg font-semibold text-white">
              {status === "timeout" ? "视频加载超时" : "视频加载失败"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {!hasSources
                ? "当前节点没有配置可播放的视频资源。"
                : retryExhausted
                  ? `已达到重试上限（${maxRetries} 次），请检查网络后重新进入。`
                  : "视频暂时无法播放，请检查网络后重试。"}
            </p>
            {hasSources && !retryExhausted ? (
              <button
                className="mt-5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                type="button"
                onClick={retry}
              >
                重新加载（{attempt + 1}/{maxRetries}）
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
