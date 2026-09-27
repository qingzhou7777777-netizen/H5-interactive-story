import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { VideoAsset } from "../../features/video-assets/video-asset";
import { VideoPlayer } from "./VideoPlayer";

const firstAsset: VideoAsset = {
  id: "video-001",
  poster: "/posters/node001.svg",
  sources: [
    { src: "https://example.invalid/one.mp4", type: "video/mp4" },
    { src: "https://example.invalid/one.webm", type: "video/webm" },
  ],
};

const secondAsset: VideoAsset = {
  id: "video-002",
  poster: "/posters/node002.svg",
  sources: [{ src: "https://example.invalid/two.mp4", type: "video/mp4" }],
};

const choices = [
  { id: "A", label: "去图书馆", targetNodeId: "Node002" },
  { id: "B", label: "一起去游泳", targetNodeId: "Node003" },
];

afterEach(() => {
  vi.useRealTimers();
});

describe("VideoPlayer", () => {
  it("renders a poster and multiple fallback sources", () => {
    render(
      <VideoPlayer asset={firstAsset} autoPlay={false} title="测试节点" onEnded={vi.fn()} />,
    );

    const video = screen.getByLabelText("剧情视频");
    expect(video).toHaveAttribute("poster", "/posters/node001.svg");
    expect(video.querySelectorAll("source")).toHaveLength(2);
    expect(video.querySelector("source[type='video/mp4']")).toHaveAttribute(
      "src",
      "https://example.invalid/one.mp4",
    );
    expect(screen.getByLabelText("互动视频播放器")).toHaveClass("aspect-video");
    expect(screen.getByLabelText("互动视频播放器")).toHaveClass("story-player-size");
  });

  it("does not expose development labels or the configured test title", () => {
    render(
      <VideoPlayer asset={firstAsset} autoPlay={false} title="第一次见面" onEnded={vi.fn()} />,
    );

    expect(screen.getByLabelText("剧情视频")).toBeInTheDocument();
    expect(screen.queryByLabelText(/第一次见面/)).not.toBeInTheDocument();
    expect(screen.queryByText(/本地联调|占位视频/)).not.toBeInTheDocument();
  });

  it("renders database-driven choices inside the video player", async () => {
    const onChoice = vi.fn();
    render(
      <VideoPlayer
        asset={firstAsset}
        autoPlay={false}
        choices={choices}
        title="测试节点"
        onChoice={onChoice}
        onEnded={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "一起去游泳" }));

    expect(screen.getByRole("group", { name: "剧情选择" })).toBeInTheDocument();
    expect(onChoice).toHaveBeenCalledWith(choices[1]);
  });

  it("requests fullscreen for the player container so overlays stay visible", async () => {
    render(
      <VideoPlayer asset={firstAsset} autoPlay={false} title="测试节点" onEnded={vi.fn()} />,
    );
    const player = screen.getByLabelText("互动视频播放器");
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(player, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });

    await userEvent.click(screen.getByRole("button", { name: "进入全屏" }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "进入全屏" })).toHaveClass("bottom-3");
    expect(screen.getByRole("button", { name: "进入全屏" })).toHaveClass("right-12");
    expect(screen.getByRole("button", { name: "进入全屏" })).not.toHaveClass("top-4");
  });

  it("uses a persistent external stage as the fullscreen target", async () => {
    const stage = document.createElement("section");
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(stage, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    document.body.append(stage);

    render(
      <VideoPlayer
        asset={firstAsset}
        autoPlay={false}
        fullscreenTargetRef={{ current: stage }}
        title="测试节点"
        onEnded={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "进入全屏" }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    stage.remove();
  });

  it("recognizes an already-fullscreen app ancestor after entering the story", () => {
    const originalFullscreenElement = Object.getOwnPropertyDescriptor(
      document,
      "fullscreenElement",
    );
    const appRoot = document.createElement("div");
    const stage = document.createElement("section");
    appRoot.append(stage);
    document.body.append(appRoot);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => appRoot,
    });

    render(
      <VideoPlayer
        asset={firstAsset}
        autoPlay={false}
        fullscreenTargetRef={{ current: stage }}
        title="测试节点"
        onEnded={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "退出全屏" })).toBeInTheDocument();
    expect(screen.getByLabelText("互动视频播放器")).toHaveClass("h-screen");

    appRoot.remove();
    if (originalFullscreenElement) {
      Object.defineProperty(document, "fullscreenElement", originalFullscreenElement);
    } else {
      Reflect.deleteProperty(document, "fullscreenElement");
    }
  });

  it("restores fullscreen when a media switch causes an unexpected exit", async () => {
    const originalFullscreenElement = Object.getOwnPropertyDescriptor(
      document,
      "fullscreenElement",
    );
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
    const stage = document.createElement("section");
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(stage, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    document.body.append(stage);

    render(
      <VideoPlayer
        asset={firstAsset}
        autoPlay={false}
        fullscreenTargetRef={{ current: stage }}
        title="测试节点"
        onEnded={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "进入全屏" }));
    fireEvent(document, new Event("fullscreenchange"));

    await waitFor(() => expect(requestFullscreen).toHaveBeenCalledTimes(2));
    stage.remove();
    if (originalFullscreenElement) {
      Object.defineProperty(document, "fullscreenElement", originalFullscreenElement);
    } else {
      Reflect.deleteProperty(document, "fullscreenElement");
    }
  });

  it("shows a retry action when video loading fails", () => {
    render(<VideoPlayer asset={firstAsset} title="测试节点" onEnded={vi.fn()} />);

    fireEvent.error(screen.getByLabelText("剧情视频"));

    expect(screen.getByRole("alert")).toHaveTextContent("视频加载失败");
    fireEvent.click(screen.getByRole("button", { name: "重新加载（1/2）" }));
    expect(screen.getByText("正在加载视频")).toBeInTheDocument();
  });

  it("stops offering retries after reaching the configured limit", () => {
    render(
      <VideoPlayer
        asset={firstAsset}
        title="测试节点"
        maxRetries={1}
        onEnded={vi.fn()}
      />,
    );

    fireEvent.error(screen.getByLabelText("剧情视频"));
    fireEvent.click(screen.getByRole("button", { name: "重新加载（1/1）" }));
    fireEvent.error(screen.getByLabelText("剧情视频"));

    expect(screen.getByRole("alert")).toHaveTextContent("已达到重试上限（1 次）");
    expect(screen.queryByRole("button", { name: /重新加载/ })).not.toBeInTheDocument();
  });

  it("shows a manual play action when mobile autoplay is blocked", async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const blockedError = new DOMException("Autoplay is blocked", "NotAllowedError");
    play.mockRejectedValueOnce(blockedError).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(<VideoPlayer asset={firstAsset} title="测试节点" onEnded={vi.fn()} />);
    fireEvent.canPlay(screen.getByLabelText("剧情视频"));

    const manualPlay = await screen.findByRole("button", { name: "点击播放" });
    expect(screen.getByText(/浏览器已阻止自动播放/)).toBeInTheDocument();
    await user.click(manualPlay);

    expect(play).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "点击播放" })).not.toBeInTheDocument();
    });
  });

  it("times out while loading on a weak connection", async () => {
    vi.useFakeTimers();
    const onPlaybackError = vi.fn();

    render(
      <VideoPlayer
        asset={firstAsset}
        autoPlay={false}
        title="测试节点"
        loadTimeoutMs={1_000}
        onEnded={vi.fn()}
        onPlaybackError={onPlaybackError}
      />,
    );

    fireEvent.waiting(screen.getByLabelText("剧情视频"));
    expect(screen.getByText("网络较慢，正在缓冲")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(screen.getByRole("alert")).toHaveTextContent("视频加载超时");
    expect(onPlaybackError).toHaveBeenCalledWith({
      code: "load_timeout",
      assetId: "video-001",
      retryCount: 0,
    });
  });

  it("cancels the weak-network timeout after the video becomes playable", async () => {
    vi.useFakeTimers();
    render(
      <VideoPlayer
        asset={firstAsset}
        autoPlay={false}
        title="测试节点"
        loadTimeoutMs={1_000}
        onEnded={vi.fn()}
      />,
    );

    const video = screen.getByLabelText("剧情视频");
    fireEvent.waiting(video);
    fireEvent.canPlay(video);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("releases the old media element when switching video assets", () => {
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    const load = vi.mocked(HTMLMediaElement.prototype.load);
    const { rerender } = render(
      <VideoPlayer asset={firstAsset} autoPlay={false} title="节点一" onEnded={vi.fn()} />,
    );
    const videoBeforeSwitch = screen.getByLabelText("剧情视频");

    rerender(
      <VideoPlayer asset={secondAsset} autoPlay={false} title="节点二" onEnded={vi.fn()} />,
    );

    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
    expect(screen.getByLabelText("剧情视频")).toHaveAttribute(
      "poster",
      "/posters/node002.svg",
    );
    expect(screen.getByLabelText("剧情视频")).toBe(videoBeforeSwitch);
  });

  it("emits video completion only once", () => {
    const onEnded = vi.fn();
    render(
      <VideoPlayer asset={firstAsset} autoPlay={false} title="测试节点" onEnded={onEnded} />,
    );

    const video = screen.getByLabelText("剧情视频");
    fireEvent.ended(video);
    fireEvent.ended(video);

    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("explains when a story node has no configured source", () => {
    render(<VideoPlayer asset={undefined} title="缺失节点" onEnded={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "当前节点没有配置可播放的视频资源",
    );
  });
});
