import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountChapterProgressResponse } from "@interactive-story/api-contracts";

import { analyticsClient } from "../../analytics/analytics-client";
import { ACCOUNT_ACCESS_TOKEN_KEY } from "../../features/account-progress/account-access-token";
import { LOCAL_STORY_PROGRESS_KEY } from "../../features/story-runtime/useStoryEngine";
import { storyApiFixture } from "../../test/story-api-fixture";
import { StoryPage } from "./StoryPage";

function mockJsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

async function renderFallbackStory() {
  render(<StoryPage />);
  await screen.findByLabelText("剧情视频");
}

async function finishVideoAndChoose(choiceName: string, targetNodeId: string) {
  const video = screen.getByLabelText("剧情视频");
  fireEvent.ended(video);
  await userEvent.click(screen.getByRole("button", { name: choiceName }));
  await waitFor(() =>
    expect(video.querySelector("source")).toHaveAttribute(
      "src",
      `/media/chapter01/${targetNodeId}.mp4`,
    ),
  );
}

function finishBranchVideo() {
  fireEvent.ended(screen.getByLabelText("剧情视频"));
}

describe("StoryPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("API offline")));
  });

  afterEach(() => {
    analyticsClient.stop();
    vi.unstubAllGlobals();
  });

  it("falls back to the local story when the content API is unavailable", async () => {
    await renderFallbackStory();

    expect(screen.queryByText("本地 fallback")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已切换本地测试模式");
  });

  it("loads the story graph from the API and submits a choice", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          mockJsonResponse({
            accepted: true,
            sourceNodeId: "Node001",
            choiceId: "A",
            targetNodeId: "Node002",
          }),
        );
      }
      return Promise.resolve(mockJsonResponse(storyApiFixture));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StoryPage />);
    const video = await screen.findByLabelText("剧情视频");

    expect(screen.queryByText("林晚 API")).not.toBeInTheDocument();
    expect(screen.queryByText("API 内容")).not.toBeInTheDocument();

    fireEvent.ended(video);
    await userEvent.click(screen.getByRole("button", { name: "去图书馆" }));
    await waitFor(() =>
      expect(video.querySelector("source")).toHaveAttribute(
        "src",
        "/media/chapter01/Node002.mp4",
      ),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/v1/chapters/chapter-01/choices",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ nodeId: "Node001", choiceId: "A" }),
      }),
    );
  });

  it("shows choices only after Node001 video ends", async () => {
    await renderFallbackStory();

    expect(screen.queryByRole("button", { name: "去图书馆" })).not.toBeInTheDocument();
    fireEvent.ended(screen.getByLabelText("剧情视频"));

    const player = screen.getByLabelText("互动视频播放器");
    const choices = within(player).getByRole("group", { name: "剧情选择" });
    expect(within(choices).getByRole("button", { name: "去图书馆" })).toBeInTheDocument();
    expect(within(choices).getByRole("button", { name: "一起去游泳" })).toBeInTheDocument();
    expect(
      within(choices).getByRole("button", { name: "去水上乐园" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "去图书馆" })).toBe(
      within(player).getByRole("button", { name: "去图书馆" }),
    );
  });

  it("does not expose development or test copy in the player UI", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJsonResponse(storyApiFixture)));

    render(<StoryPage />);
    await screen.findByLabelText("剧情视频");

    expect(screen.queryByText(storyApiFixture.character.name)).not.toBeInTheDocument();
    expect(screen.queryByText("第一次见面")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/第一次见面/)).not.toBeInTheDocument();
    expect(screen.queryByText("等待选择")).not.toBeInTheDocument();
    expect(screen.queryByText("API内容")).not.toBeInTheDocument();
    expect(screen.queryByText("API 内容")).not.toBeInTheDocument();
    expect(screen.queryByText("YOUR CHOICE")).not.toBeInTheDocument();
    expect(screen.queryByText(/本地联调|占位视频/)).not.toBeInTheDocument();
  });

  it("keeps the fullscreen player container mounted when a choice changes the video", async () => {
    await renderFallbackStory();
    const playerBeforeChoice = screen.getByLabelText("互动视频播放器");

    await finishVideoAndChoose("去图书馆", "Node002");

    expect(screen.getByLabelText("互动视频播放器")).toBe(playerBeforeChoice);
    expect(screen.getByLabelText("剧情视频")).toBeInTheDocument();
  });

  it.each([
    ["去图书馆", "Node002"],
    ["一起去游泳", "Node003"],
    ["去水上乐园", "Node004"],
  ])(
    "routes choice %s through %s to the unlock screen",
    async (choiceName, targetNodeId) => {
      await renderFallbackStory();
      await finishVideoAndChoose(choiceName, targetNodeId);

      expect(screen.queryByRole("button", { name: "¥9.90 解锁下一章" })).not.toBeInTheDocument();
      finishBranchVideo();

      expect(await screen.findByRole("button", { name: "¥9.90 解锁下一章" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "返回主页" })).toHaveAttribute("href", "/");
      expect(screen.queryByText("接受邀请")).not.toBeInTheDocument();
      expect(screen.queryByText("拒绝邀请")).not.toBeInTheDocument();
      expect(screen.queryByText("提出特殊邀请")).not.toBeInTheDocument();
    },
  );

  it("restores the ending state after a page refresh", async () => {
    const firstRender = render(<StoryPage />);
    await screen.findByLabelText("剧情视频");
    await finishVideoAndChoose("一起去游泳", "Node003");
    finishBranchVideo();
    firstRender.unmount();

    render(<StoryPage />);

    expect(await screen.findByRole("button", { name: "¥9.90 解锁下一章" })).toBeInTheDocument();
    expect(screen.queryByLabelText("剧情视频")).not.toBeInTheDocument();
  });

  it("restores a branch video after refreshing before it completes", async () => {
    const firstRender = render(<StoryPage />);
    await screen.findByLabelText("剧情视频");
    await finishVideoAndChoose("去水上乐园", "Node004");
    firstRender.unmount();

    render(<StoryPage />);

    const restoredVideo = await screen.findByLabelText("剧情视频");
    expect(restoredVideo.querySelector("source")).toHaveAttribute(
      "src",
      "/media/chapter01/Node004.mp4",
    );
    expect(screen.queryByRole("group", { name: "剧情选择" })).not.toBeInTheDocument();
  });

  it("runs and restores the authenticated server progress flow", async () => {
    window.sessionStorage.setItem(ACCOUNT_ACCESS_TOKEN_KEY, "account-token");
    const releaseId = "6a0a0b8b-f0a2-47e2-9075-b175b635443f";
    let progressResponse: AccountChapterProgressResponse = {
      release: { id: releaseId, version: 1 },
      progress: {
        version: 0,
        status: "in_progress" as const,
        currentNodeCode: "Node001",
      },
      chapter: storyApiFixture,
      engineSnapshot: {
        version: 1 as const,
        storyId: "ai-romance-demo:chapter-01",
        phase: "playing" as const,
        currentNodeId: "Node001",
        history: ["Node001"],
      },
    };
    let started = false;
    const fetchMock = vi.fn().mockImplementation((input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/analytics/")) {
        return Promise.resolve(mockJsonResponse({ accepted: true }));
      }
      if (url.includes("/v1/commercial-test/offers/")) {
        return Promise.resolve(
          mockJsonResponse({
            code: "chapter01-ending002-unlock",
            chapterCode: "chapter-01",
            triggerNodeCode: "Ending002",
            title: "解锁下一章",
            description: "付费意向测试",
            buttonLabel: "¥9.90 解锁下一章",
            priceMinor: 990,
            currency: "CNY",
          }),
        );
      }
      if (url.endsWith("/progress")) {
        return Promise.resolve(
          started
            ? mockJsonResponse(progressResponse)
            : mockJsonResponse(
                {
                  error: {
                    code: "CHAPTER_PROGRESS_NOT_FOUND",
                    message: "尚未开始。",
                  },
                },
                404,
              ),
        );
      }
      if (url.endsWith("/start")) {
        started = true;
        return Promise.resolve(mockJsonResponse(progressResponse));
      }
      if (url.endsWith("/video-completions")) {
        const body = JSON.parse(init?.body as string) as { nodeCode: string };
        progressResponse =
          body.nodeCode === "Node001"
            ? {
                ...progressResponse,
                progress: {
                  version: 1,
                  status: "in_progress",
                  currentNodeCode: "Node001",
                },
                engineSnapshot: {
                  ...progressResponse.engineSnapshot,
                  phase: "awaiting_choice",
                },
              }
            : {
                ...progressResponse,
                progress: {
                  version: 3,
                  status: "completed" as const,
                  currentNodeCode: "Ending002",
                },
                engineSnapshot: {
                  ...progressResponse.engineSnapshot,
                  phase: "ended" as const,
                  currentNodeId: "Ending002",
                  history: ["Node001", "Node002", "Ending002"],
                },
              };
        return Promise.resolve(mockJsonResponse(progressResponse));
      }
      if (url.endsWith("/choices")) {
        progressResponse = {
          ...progressResponse,
          progress: {
            version: 2,
            status: "in_progress",
            currentNodeCode: "Node002",
          },
          engineSnapshot: {
            ...progressResponse.engineSnapshot,
            phase: "playing",
            currentNodeId: "Node002",
            history: ["Node001", "Node002"],
          },
        };
        return Promise.resolve(mockJsonResponse(progressResponse));
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const firstRender = render(<StoryPage />);
    const entryVideo = await screen.findByLabelText("剧情视频");
    expect(screen.getByRole("link", { name: "返回剧情地图" })).toHaveAttribute(
      "href",
      "/story-map/chapter-01",
    );
    fireEvent.ended(entryVideo);
    await userEvent.click(await screen.findByRole("button", { name: "去图书馆" }));
    await waitFor(() =>
      expect(entryVideo.querySelector("source")).toHaveAttribute(
        "src",
        "/media/chapter01/Node002.mp4",
      ),
    );

    firstRender.unmount();
    render(<StoryPage />);
    const restoredVideo = await screen.findByLabelText("剧情视频");
    expect(restoredVideo.querySelector("source")).toHaveAttribute(
      "src",
      "/media/chapter01/Node002.mp4",
    );
    fireEvent.ended(restoredVideo);
    expect(
      await screen.findByRole("button", { name: "¥9.90 解锁下一章" }),
    ).toBeInTheDocument();

    const accountRequests = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/v1/me/chapters/chapter-01/"),
    );
    expect(accountRequests.length).toBeGreaterThanOrEqual(6);
    expect(accountRequests.every(([, init]) => {
      const headers = init?.headers as Record<string, string> | undefined;
      return headers?.authorization === "Bearer account-token";
    })).toBe(true);
    expect(screen.queryByRole("button", { name: "重新体验" })).not.toBeInTheDocument();
    const accountEventTypes = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/v1/analytics/events"))
      .map(([, request]) => {
        const payload = JSON.parse((request as RequestInit).body as string) as {
          eventType: string;
        };
        return payload.eventType;
      });
    expect(accountEventTypes).toEqual(
      expect.arrayContaining([
        "node_entered",
        "video_completed",
        "choice_selected",
        "ending_completed",
      ]),
    );
  });

  it("restores visible choices after refreshing at Node001", async () => {
    const firstRender = render(<StoryPage />);
    await screen.findByLabelText("剧情视频");
    fireEvent.ended(screen.getByLabelText("剧情视频"));
    firstRender.unmount();

    await renderFallbackStory();

    expect(screen.getByRole("button", { name: "去图书馆" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "一起去游泳" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "去水上乐园" })).toBeInTheDocument();
  });

  it("reports an illegal saved node and restarts safely", async () => {
    window.localStorage.setItem(
      LOCAL_STORY_PROGRESS_KEY,
      JSON.stringify({
        version: 1,
        storyId: "local-test-story",
        phase: "ended",
        currentNodeId: "Node999",
        history: ["Node001", "Node999"],
      }),
    );

    await renderFallbackStory();

    expect(screen.getByRole("alert")).toHaveTextContent("本地剧情记录无效");
    expect(screen.getByLabelText("剧情视频")).toBeInTheDocument();
  });

  it("keeps the current node when the API rejects a choice", async () => {
    const fetchMock = vi.fn().mockImplementation((_input: string | URL, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "POST"
          ? mockJsonResponse({ error: { code: "CHOICE_NOT_FOUND", message: "选项已下线。" } }, 404)
          : mockJsonResponse(storyApiFixture),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<StoryPage />);
    await screen.findByLabelText("剧情视频");
    fireEvent.ended(screen.getByLabelText("剧情视频"));
    await userEvent.click(screen.getByRole("button", { name: "去图书馆" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("选项已下线"));
    expect(screen.getByRole("button", { name: "去图书馆" })).toBeInTheDocument();
  });

  it("shows the ending offer and records payment intent without changing the ending", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/analytics/")) {
        return Promise.resolve(mockJsonResponse({ accepted: true }));
      }
      if (url.includes("/v1/commercial-test/offers/")) {
        return Promise.resolve(
          mockJsonResponse({
            code: "chapter01-ending002-unlock",
            chapterCode: "chapter-01",
            triggerNodeCode: "Ending002",
            title: "解锁下一章",
            description: "付费意向测试",
            buttonLabel: "¥9.90 解锁下一章",
            priceMinor: 990,
            currency: "CNY",
          }),
        );
      }
      if (url.endsWith("/choices") && init?.method === "POST") {
        return Promise.resolve(
          mockJsonResponse({
            accepted: true,
            sourceNodeId: "Node001",
            choiceId: "A",
            targetNodeId: "Node002",
          }),
        );
      }
      return Promise.resolve(mockJsonResponse(storyApiFixture));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StoryPage />);
    const video = await screen.findByLabelText("剧情视频");
    fireEvent.ended(video);
    await userEvent.click(screen.getByRole("button", { name: "去图书馆" }));
    await waitFor(() =>
      expect(video.querySelector("source")).toHaveAttribute(
        "src",
        "/media/chapter01/Node002.mp4",
      ),
    );
    fireEvent.ended(video);

    const unlock = await screen.findByRole("button", { name: "¥9.90 解锁下一章" });
    await userEvent.click(unlock);

    expect(screen.queryByText("接受邀请")).not.toBeInTheDocument();
    await waitFor(() => {
      const paymentEvent = fetchMock.mock.calls.find(([url, request]) => {
        if (!String(url).endsWith("/v1/analytics/events")) return false;
        const payload = JSON.parse((request as RequestInit).body as string) as {
          eventType?: string;
        };
        return payload.eventType === "payment_clicked";
      });
      expect(paymentEvent).toBeDefined();
    });
    const eventTypes = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/v1/analytics/events"))
      .map(([, request]) => {
        const payload = JSON.parse((request as RequestInit).body as string) as {
          eventType: string;
        };
        return payload.eventType;
      });
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        "node_entered",
        "video_completed",
        "choice_selected",
        "ending_completed",
        "payment_clicked",
      ]),
    );
  });
});
