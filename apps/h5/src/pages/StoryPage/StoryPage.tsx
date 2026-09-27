import type { StoryEngineSnapshotDto } from "@interactive-story/api-contracts";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useStoryAnalytics } from "../../analytics/use-story-analytics";
import { PaymentIntentCard } from "../../components/commercial-test/PaymentIntentCard";
import { VideoPlayer } from "../../components/video/VideoPlayer";
import { usePaymentOffer } from "../../features/commercial-test/usePaymentOffer";
import type {
  ChoiceSubmissionResult,
  StoryContent,
  SubmitStoryChoice,
} from "../../features/story-content/story-content";
import { useStoryContent } from "../../features/story-content/useStoryContent";
import type { StoryRunMode } from "../../features/story-run/useStoryRunContent";
import { useStoryRunContent } from "../../features/story-run/useStoryRunContent";
import {
  getStoryProgressKey,
  LOCAL_STORY_PROGRESS_KEY,
  useStoryEngine,
} from "../../features/story-runtime/useStoryEngine";

type RuntimeMode = "mainline" | StoryRunMode;
type StoryEngineController = ReturnType<typeof useStoryEngine>;

interface ServerVideoTransition {
  engineSnapshot: StoryEngineSnapshotDto;
  completed: boolean;
}

interface ServerChoiceTransition extends ChoiceSubmissionResult {
  completed?: boolean;
}

interface PlayerAnalytics {
  trackVideoCompleted: () => void;
  trackChoiceSelected: (choiceCode: string, targetNodeCode: string) => void;
  trackPaymentClicked: (offer: {
    code: string;
    priceMinor: number;
    currency: string;
  }) => void;
}

const noRunAnalytics: PlayerAnalytics = {
  trackVideoCompleted: () => undefined,
  trackChoiceSelected: () => undefined,
  trackPaymentClicked: () => undefined,
};

function LoadingPage({ runMode }: { runMode?: StoryRunMode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_top,#3b103f_0%,#18181b_36%,#09090b_78%)] px-8 text-zinc-50">
      <section aria-busy="true" className="text-center">
        <span className="mx-auto block size-3 animate-pulse rounded-full bg-fuchsia-300" />
        <h1 className="mt-5 text-xl font-semibold">
          {runMode ? "正在恢复剧情运行" : "正在加载剧情内容"}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          {runMode === "exploration"
            ? "正在读取服务端探索快照。"
            : runMode === "replay"
              ? "正在恢复重新观看会话。"
              : "正在连接内容 API，请稍候。"}
        </p>
      </section>
    </main>
  );
}

function ErrorPage({ message, chapterCode }: { message: string | null; chapterCode: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-zinc-950 px-8 text-zinc-50">
      <section role="alert" className="max-w-lg text-center">
        <h1 className="text-xl font-semibold">剧情暂时无法加载</h1>
        <p className="mt-3 text-sm text-zinc-400">{message}</p>
        <a
          className="mt-6 inline-flex rounded-full border border-white/20 px-5 py-3 text-sm font-bold text-white"
          href={`/story-map/${encodeURIComponent(chapterCode)}`}
        >
          返回剧情地图
        </a>
      </section>
    </main>
  );
}

interface StoryPlayerViewProps {
  content: StoryContent;
  warning: string | null;
  runtimeMode: RuntimeMode;
  isAccountMode: boolean;
  engine: StoryEngineController;
  analytics: PlayerAnalytics;
  completeVideoOnServer: (
    nodeCode: string,
  ) => Promise<ServerVideoTransition | null>;
  submitChoice: (
    nodeCode: string,
    choiceCode: string,
  ) => Promise<ServerChoiceTransition>;
  onReturnToMap?: () => Promise<void>;
}

function StoryPlayerView({
  content,
  warning,
  runtimeMode,
  isAccountMode,
  engine,
  analytics,
  completeVideoOnServer,
  submitChoice,
  onReturnToMap,
}: StoryPlayerViewProps) {
  const {
    state,
    error,
    completeVideo,
    selectChoice,
    restoreSnapshot,
    restart,
    clearError,
  } = engine;
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [pendingChoiceId, setPendingChoiceId] = useState<string | null>(null);
  const [returningToMap, setReturningToMap] = useState(false);
  const playerStageRef = useRef<HTMLElement>(null);
  const currentNode = state.currentNode;
  const videoNode = currentNode?.type === "video" ? currentNode : null;
  const endingNode = currentNode?.type === "ending" ? currentNode : null;
  const videoAsset = videoNode?.videoAssetId
    ? content.videoAssets[videoNode.videoAssetId]
    : undefined;
  const paymentOffer = usePaymentOffer(
    content.chapterCode,
    runtimeMode === "mainline" ? endingNode?.id ?? null : null,
    runtimeMode === "mainline" && state.phase === "ended",
    content.source === "fallback",
  );

  const handleVideoEnded = async () => {
    analytics.trackVideoCompleted();
    if (runtimeMode === "mainline" && !isAccountMode) {
      completeVideo();
      return;
    }

    if (!videoNode) return;
    setChoiceError(null);
    try {
      const transition = await completeVideoOnServer(videoNode.id);
      if (!transition) throw new Error("服务端未返回剧情运行快照。");
      restoreSnapshot(transition.engineSnapshot);
    } catch (submissionError) {
      setChoiceError(
        submissionError instanceof Error
          ? submissionError.message
          : "视频完成状态保存失败。",
      );
    }
  };

  const handleChoice = async (choiceId: string, configuredTargetNodeId: string) => {
    if (!currentNode || pendingChoiceId || runtimeMode === "replay") return;

    setPendingChoiceId(choiceId);
    setChoiceError(null);
    try {
      const result = await submitChoice(currentNode.id, choiceId);
      if (
        runtimeMode === "mainline" &&
        result.targetNodeId !== configuredTargetNodeId
      ) {
        throw new Error("服务端返回的目标节点与当前剧情配置不一致。");
      }
      analytics.trackChoiceSelected(choiceId, result.targetNodeId);
      if (result.engineSnapshot) {
        restoreSnapshot(result.engineSnapshot);
      } else if (runtimeMode === "mainline") {
        selectChoice(choiceId);
      }
    } catch (submissionError) {
      setChoiceError(
        submissionError instanceof Error ? submissionError.message : "选项提交失败。",
      );
    } finally {
      setPendingChoiceId(null);
    }
  };

  const handleReturnToMap = async () => {
    if (!onReturnToMap || returningToMap) return;
    setReturningToMap(true);
    setChoiceError(null);
    try {
      await onReturnToMap();
    } catch (returnError) {
      setChoiceError(
        returnError instanceof Error ? returnError.message : "退出探索失败。",
      );
      setReturningToMap(false);
    }
  };

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_0%_100%,rgba(248,178,202,0.5)_0%,transparent_42%),radial-gradient(circle_at_100%_0%,rgba(117,165,227,0.48)_0%,transparent_44%),linear-gradient(135deg,#1c1228_0%,#111827_48%,#09090b_100%)] text-zinc-50">
      <div className="mx-auto flex min-h-dvh w-full flex-col justify-center px-4 py-6 sm:px-8 lg:px-12">
        <nav aria-label="剧情导航" className="mx-auto mb-4 flex w-full max-w-[min(80vw,calc(80vh*16/9))] items-center justify-between gap-3">
          {runtimeMode !== "mainline" ? (
            <span className="rounded-full border border-fuchsia-200/20 bg-fuchsia-200/10 px-4 py-2 text-xs font-bold text-fuchsia-50">
              {runtimeMode === "exploration" ? "探索模式" : "重新观看模式"}
            </span>
          ) : <span />}
          {runtimeMode === "mainline" && isAccountMode ? (
            <a
              className="rounded-full border border-white/20 bg-black/25 px-4 py-2 text-xs font-semibold text-white/80 backdrop-blur transition hover:bg-black/40 hover:text-white"
              href={`/story-map/${encodeURIComponent(content.chapterCode)}`}
            >
              返回剧情地图
            </a>
          ) : null}
          {runtimeMode === "exploration" ? (
            <button
              className="rounded-full border border-white/20 bg-black/25 px-4 py-2 text-xs font-semibold text-white/80 backdrop-blur transition hover:bg-black/40 hover:text-white disabled:opacity-50"
              disabled={returningToMap}
              type="button"
              onClick={() => void handleReturnToMap()}
            >
              {returningToMap ? "正在退出…" : "退出探索并返回地图"}
            </button>
          ) : null}
        </nav>

        {warning ? (
          <section role="status" className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-xs leading-5 text-amber-100 backdrop-blur">
            {warning}
          </section>
        ) : null}

        {error || choiceError ? (
          <section role="alert" className="mb-4 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm leading-6 text-rose-100">
            <div className="flex items-start justify-between gap-4">
              <p>{choiceError ?? error}</p>
              <button
                className="shrink-0 text-xs font-semibold text-rose-200 underline underline-offset-4"
                type="button"
                onClick={() => {
                  setChoiceError(null);
                  clearError();
                }}
              >
                关闭
              </button>
            </div>
          </section>
        ) : null}

        <section ref={playerStageRef} className="w-full bg-transparent">
          {videoNode ? (
            <VideoPlayer
              asset={videoAsset}
              autoPlay={state.phase === "playing"}
              choices={
                runtimeMode !== "replay" && state.phase === "awaiting_choice"
                  ? state.availableChoices
                  : []
              }
              fullscreenTargetRef={playerStageRef}
              pendingChoiceId={pendingChoiceId}
              title={videoNode.title}
              {...(runtimeMode !== "replay"
                ? {
                    onChoice: (choice: { id: string; targetNodeId: string }) =>
                      void handleChoice(choice.id, choice.targetNodeId),
                  }
                : {})}
              onEnded={() => void handleVideoEnded()}
            />
          ) : null}

          {endingNode && runtimeMode === "mainline" ? (
            <section aria-label="解锁下一章" className="story-player-size mx-auto grid aspect-video place-items-center rounded-[1.75rem] border border-white/20 bg-[radial-gradient(circle_at_top,rgba(217,70,239,0.24),transparent_46%),linear-gradient(145deg,rgba(30,18,46,0.98),rgba(9,9,11,0.98))] px-5 py-8 shadow-2xl shadow-indigo-950/30 sm:px-10">
              <div className="w-full max-w-xl">
                {paymentOffer ? (
                  <PaymentIntentCard offer={paymentOffer} onClick={() => analytics.trackPaymentClicked(paymentOffer)} />
                ) : (
                  <p className="text-center text-sm text-zinc-300">正在加载解锁信息…</p>
                )}
                {!isAccountMode ? (
                  <button className="w-full rounded-full border border-white/15 bg-white/[0.07] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10" type="button" onClick={restart}>
                    重新体验
                  </button>
                ) : null}
                <a className="mt-3 block w-full rounded-full border border-white/15 bg-white/[0.04] px-5 py-3 text-center text-sm font-semibold text-white/85 transition hover:bg-white/10" href="/">
                  返回主页
                </a>
              </div>
            </section>
          ) : null}

          {!currentNode ? (
            <section className="grid min-h-[28rem] place-items-center rounded-[1.75rem] border border-rose-400/20 bg-zinc-950/80 px-8 text-center">
              <div>
                <h1 className="text-xl font-semibold">无法加载剧情节点</h1>
                <p className="mt-2 text-sm text-zinc-400">当前剧情配置无效，请返回剧情地图。</p>
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}

interface MainlineRuntimePageProps {
  content: StoryContent;
  warning: string | null;
  isAccountMode: boolean;
  initialSnapshot: StoryEngineSnapshotDto | null;
  completeVideoOnServer: (nodeCode: string) => Promise<StoryEngineSnapshotDto | null>;
  submitChoice: SubmitStoryChoice;
}

function MainlineRuntimePage({
  content,
  warning,
  isAccountMode,
  initialSnapshot,
  completeVideoOnServer,
  submitChoice,
}: MainlineRuntimePageProps) {
  const engine = useStoryEngine(content.story, {
    storageKey:
      content.source === "fallback"
        ? LOCAL_STORY_PROGRESS_KEY
        : getStoryProgressKey(content.story.id),
    ...(initialSnapshot ? { initialSnapshot } : {}),
    persistLocally: !isAccountMode,
  });
  const analytics = useStoryAnalytics(content.chapterCode, engine.state);

  return (
    <StoryPlayerView
      analytics={analytics}
      completeVideoOnServer={async (nodeCode) => {
        const snapshot = await completeVideoOnServer(nodeCode);
        return snapshot ? { engineSnapshot: snapshot, completed: false } : null;
      }}
      content={content}
      engine={engine}
      isAccountMode={isAccountMode}
      runtimeMode="mainline"
      submitChoice={submitChoice}
      warning={warning}
    />
  );
}

function MainlineStoryPage({ chapterCode }: { chapterCode: string }) {
  const {
    status,
    content,
    warning,
    error,
    isAccountMode,
    initialSnapshot,
    completeVideo,
    submitChoice,
  } = useStoryContent(chapterCode);

  if (status === "loading") return <LoadingPage />;
  if (status === "error" || !content) {
    return <ErrorPage chapterCode={chapterCode} message={error} />;
  }

  return (
    <MainlineRuntimePage
      key={`${isAccountMode ? "account" : content.source}:${content.story.id}`}
      completeVideoOnServer={completeVideo}
      content={content}
      initialSnapshot={initialSnapshot}
      isAccountMode={isAccountMode}
      submitChoice={submitChoice}
      warning={warning}
    />
  );
}

function StoryRunRuntimePage({
  chapterCode,
  mode,
  content,
  initialSnapshot,
  runStatus,
  completeVideo,
  submitChoice,
  abandon,
  clearSession,
}: {
  chapterCode: string;
  mode: StoryRunMode;
  content: StoryContent;
  initialSnapshot: StoryEngineSnapshotDto;
  runStatus: "active" | "completed" | "abandoned";
  completeVideo: ReturnType<typeof useStoryRunContent>["completeVideo"];
  submitChoice: ReturnType<typeof useStoryRunContent>["submitChoice"];
  abandon: ReturnType<typeof useStoryRunContent>["abandon"];
  clearSession: ReturnType<typeof useStoryRunContent>["clearSession"];
}) {
  const navigate = useNavigate();
  const engine = useStoryEngine(content.story, {
    initialSnapshot,
    persistLocally: false,
  });

  useEffect(() => {
    if (runStatus === "active") return;
    clearSession();
    navigate(`/story-map/${encodeURIComponent(chapterCode)}`, { replace: true });
  }, [chapterCode, clearSession, navigate, runStatus]);

  return (
    <StoryPlayerView
      analytics={noRunAnalytics}
      completeVideoOnServer={async (nodeCode) => {
        const response = await completeVideo(nodeCode);
        return {
          engineSnapshot: response.engineSnapshot,
          completed: response.run.status === "completed",
        };
      }}
      content={content}
      engine={engine}
      isAccountMode
      {...(mode === "exploration"
        ? {
            onReturnToMap: async () => {
              await abandon();
              navigate(`/story-map/${encodeURIComponent(chapterCode)}`, { replace: true });
            },
          }
        : {})}
      runtimeMode={mode}
      submitChoice={async (nodeCode, choiceCode) => {
        const response = await submitChoice(nodeCode, choiceCode);
        return {
          targetNodeId: response.engineSnapshot.currentNodeId,
          engineSnapshot: response.engineSnapshot,
          completed: response.run.status === "completed",
        };
      }}
      warning={null}
    />
  );
}

function StoryRunPage({
  chapterCode,
  mode,
  runId,
}: {
  chapterCode: string;
  mode: StoryRunMode;
  runId: string;
}) {
  const run = useStoryRunContent(chapterCode, mode, runId);
  if (run.status === "loading") return <LoadingPage runMode={mode} />;
  if (
    run.status === "error" ||
    !run.content ||
    !run.initialSnapshot ||
    !run.runStatus
  ) {
    return <ErrorPage chapterCode={chapterCode} message={run.error} />;
  }

  return (
    <StoryRunRuntimePage
      key={`${mode}:${runId}`}
      abandon={run.abandon}
      chapterCode={chapterCode}
      clearSession={run.clearSession}
      completeVideo={run.completeVideo}
      content={run.content}
      initialSnapshot={run.initialSnapshot}
      mode={mode}
      runStatus={run.runStatus}
      submitChoice={run.submitChoice}
    />
  );
}

export function StoryPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const chapterCode = searchParams.get("chapterCode")?.trim() || "chapter-01";
  const mode = searchParams.get("mode");
  const runId = searchParams.get("runId")?.trim() ?? "";

  if (mode === "exploration" || mode === "replay") {
    if (!runId) {
      return <ErrorPage chapterCode={chapterCode} message="剧情运行缺少runId，请从剧情地图重新进入。" />;
    }
    return <StoryRunPage chapterCode={chapterCode} mode={mode} runId={runId} />;
  }

  return <MainlineStoryPage chapterCode={chapterCode} />;
}
