import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AccountStoryMapResponse,
  AccountStoryRunResponse,
  StoryEngineSnapshotDto,
} from "@interactive-story/api-contracts";

import { ACCOUNT_ACCESS_TOKEN_KEY } from "../../features/account-progress/account-access-token";
import {
  loadStoryRunSession,
  saveStoryRunSession,
} from "../../features/story-run/story-run-session";
import { storyApiFixture } from "../../test/story-api-fixture";
import { StoryMapPage } from "../StoryMapPage/StoryMapPage";
import { StoryPage } from "./StoryPage";

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const release = { id: "6a0a0b8b-f0a2-47e2-9075-b175b635443f", version: 4 };

function runResponse(
  mode: "exploration" | "replay",
  runId: string,
  version: number,
  status: "active" | "completed" | "abandoned",
  entryNodeCode: string,
  snapshot: StoryEngineSnapshotDto,
): AccountStoryRunResponse {
  return {
    release,
    run: {
      id: runId,
      mode,
      status,
      version,
      entryNodeCode,
      currentNodeCode: snapshot.currentNodeId,
    },
    chapter: storyApiFixture,
    engineSnapshot: snapshot,
  };
}

const mapResponse: AccountStoryMapResponse = {
  release,
  progress: { status: "in_progress", currentNodeCode: "Node002" },
  regions: [
    {
      code: "opening",
      title: "初遇",
      description: null,
      sortOrder: 0,
      layoutMetadata: null,
      nodes: [
        {
          nodeCode: "Node001",
          title: "相遇",
          description: null,
          coverUrl: null,
          position: { x: 100, y: 100 },
          sortOrder: 0,
          state: "completed",
          actions: { canExplore: false, canReplay: true },
        },
        {
          nodeCode: "Node002",
          title: "图书馆",
          description: null,
          coverUrl: null,
          position: { x: 420, y: 100 },
          sortOrder: 1,
          state: "available",
          actions: { canExplore: true, canReplay: false },
        },
      ],
    },
  ],
};

function renderRun(url: string, withRealMap = false) {
  window.history.pushState({}, "", url);
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/story" element={<StoryPage />} />
        <Route
          path="/story-map/:chapterCode"
          element={withRealMap ? <StoryMapPage /> : <p>已返回剧情地图</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StoryPage Run modes", () => {
  beforeEach(() => {
    window.sessionStorage.setItem(ACCOUNT_ACCESS_TOKEN_KEY, "account-token");
    window.localStorage.setItem("mainline-sentinel", "unchanged");
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
    vi.unstubAllGlobals();
  });

  it("plays exploration, submits Choice with the confirmed runVersion, and never calls mainline APIs", async () => {
    const initial = runResponse("exploration", "run-explore", 0, "active", "Node001", {
      version: 1,
      storyId: "ai-romance-demo:chapter-01:exploration:Node001",
      phase: "playing",
      currentNodeId: "Node001",
      history: ["Node001"],
    });
    const awaitingChoice = runResponse("exploration", "run-explore", 1, "active", "Node001", {
      ...initial.engineSnapshot,
      phase: "awaiting_choice",
    });
    const branch = runResponse("exploration", "run-explore", 2, "active", "Node001", {
      ...initial.engineSnapshot,
      phase: "playing",
      currentNodeId: "Node002",
      history: ["Node001", "Node002"],
    });
    let current = initial;
    const fetchMock = vi.fn().mockImplementation((input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/video-completions")) {
        current = awaitingChoice;
        return Promise.resolve(jsonResponse(current));
      }
      if (url.endsWith("/choices")) {
        current = branch;
        return Promise.resolve(jsonResponse(current));
      }
      if (url.endsWith("/exploration-runs/run-explore") && !init?.method) {
        return Promise.resolve(jsonResponse(current));
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRun("/story?chapterCode=chapter-01&mode=exploration&runId=run-explore");
    const video = await screen.findByLabelText("剧情视频");
    expect(video.querySelector("source")).toHaveAttribute(
      "src",
      "/media/chapter01/Node001.mp4",
    );

    fireEvent.ended(video);
    await userEvent.click(await screen.findByRole("button", { name: "去图书馆" }));
    await waitFor(() =>
      expect(video.querySelector("source")).toHaveAttribute(
        "src",
        "/media/chapter01/Node002.mp4",
      ),
    );

    const completionBody = JSON.parse(
      (fetchMock.mock.calls.find(([url]) => String(url).endsWith("/video-completions"))?.[1] as RequestInit).body as string,
    ) as { expectedRunVersion: number };
    const choiceBody = JSON.parse(
      (fetchMock.mock.calls.find(([url]) => String(url).endsWith("/choices"))?.[1] as RequestInit).body as string,
    ) as { expectedRunVersion: number; sourceNodeCode: string; choiceCode: string };
    expect(completionBody.expectedRunVersion).toBe(0);
    expect(choiceBody).toMatchObject({
      expectedRunVersion: 1,
      sourceNodeCode: "Node001",
      choiceCode: "A",
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/progress"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/analytics/"))).toBe(false);
    expect(window.localStorage.getItem("mainline-sentinel")).toBe("unchanged");
  });

  it("refreshes exploration from the canonical GET snapshot instead of stale session data", async () => {
    const stale = runResponse("exploration", "run-refresh", 0, "active", "Node001", {
      version: 1,
      storyId: "ai-romance-demo:chapter-01:exploration:Node001",
      phase: "playing",
      currentNodeId: "Node001",
      history: ["Node001"],
    });
    const canonical = runResponse("exploration", "run-refresh", 4, "active", "Node001", {
      ...stale.engineSnapshot,
      currentNodeId: "Node002",
      history: ["Node001", "Node002"],
    });
    saveStoryRunSession("chapter-01", stale);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(canonical));
    vi.stubGlobal("fetch", fetchMock);

    renderRun("/story?chapterCode=chapter-01&mode=exploration&runId=run-refresh");
    const video = await screen.findByLabelText("剧情视频");
    expect(video.querySelector("source")).toHaveAttribute(
      "src",
      "/media/chapter01/Node002.mp4",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/v1/me/chapters/chapter-01/exploration-runs/run-refresh",
      expect.objectContaining({ headers: { authorization: "Bearer account-token" } }),
    );
    expect(loadStoryRunSession("chapter-01", "exploration", "run-refresh")?.run.version).toBe(4);
  });

  it("abandons an active exploration before returning to the map", async () => {
    const initial = runResponse("exploration", "run-abandon", 3, "active", "Node003", {
      version: 1,
      storyId: "ai-romance-demo:chapter-01:exploration:Node003",
      phase: "playing",
      currentNodeId: "Node003",
      history: ["Node003"],
    });
    const abandoned = { ...initial, run: { ...initial.run, status: "abandoned" as const, version: 4 } };
    const fetchMock = vi.fn().mockImplementation((input: string | URL) =>
      Promise.resolve(
        String(input).endsWith("/abandon")
          ? jsonResponse(abandoned)
          : jsonResponse(initial),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderRun("/story?chapterCode=chapter-01&mode=exploration&runId=run-abandon");
    await screen.findByLabelText("剧情视频");
    await userEvent.click(screen.getByRole("button", { name: "退出探索并返回地图" }));
    expect(await screen.findByText("已返回剧情地图")).toBeInTheDocument();

    const abandonCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/abandon"));
    expect(JSON.parse((abandonCall?.[1] as RequestInit).body as string)).toEqual({
      expectedRunVersion: 3,
    });
    expect(loadStoryRunSession("chapter-01", "exploration", "run-abandon")).toBeNull();
  });

  it("refreshes the map after exploration completes without touching mainline progress", async () => {
    const initial = runResponse("exploration", "run-complete", 0, "active", "Node003", {
      version: 1,
      storyId: "ai-romance-demo:chapter-01:exploration:Node003",
      phase: "playing",
      currentNodeId: "Node003",
      history: ["Node003"],
    });
    const completed = runResponse("exploration", "run-complete", 1, "completed", "Node003", {
      ...initial.engineSnapshot,
      phase: "ended",
      currentNodeId: "Ending003",
      history: ["Node003", "Ending003"],
    });
    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/video-completions")) return Promise.resolve(jsonResponse(completed));
      if (url.endsWith("/map")) return Promise.resolve(jsonResponse(mapResponse));
      return Promise.resolve(jsonResponse(initial));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRun(
      "/story?chapterCode=chapter-01&mode=exploration&runId=run-complete",
      true,
    );
    fireEvent.ended(await screen.findByLabelText("剧情视频"));
    expect(await screen.findByRole("heading", { name: "我的剧情地图" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/map"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/progress"))).toBe(false);
  });

  it("replays only the selected node, hides Choice, and returns to an unchanged map", async () => {
    const initial = runResponse("replay", "run-replay", 0, "active", "Node001", {
      version: 1,
      storyId: "ai-romance-demo:chapter-01:replay:Node001",
      phase: "playing",
      currentNodeId: "Node001",
      history: ["Node001"],
    });
    const completed = runResponse("replay", "run-replay", 1, "completed", "Node001", {
      ...initial.engineSnapshot,
      phase: "ended",
    });
    saveStoryRunSession("chapter-01", initial);
    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/video-completions")) return Promise.resolve(jsonResponse(completed));
      if (url.endsWith("/map")) return Promise.resolve(jsonResponse(mapResponse));
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRun("/story?chapterCode=chapter-01&mode=replay&runId=run-replay", true);
    const video = await screen.findByLabelText("剧情视频");
    expect(screen.getByText("重新观看模式")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "剧情选择" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "退出探索并返回地图" })).not.toBeInTheDocument();

    fireEvent.ended(video);
    expect(await screen.findByRole("heading", { name: "我的剧情地图" })).toBeInTheDocument();
    expect(screen.getByText("图书馆")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/exploration-runs"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/progress"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/analytics/"))).toBe(false);
    expect(loadStoryRunSession("chapter-01", "replay", "run-replay")).toBeNull();
  });
});
