import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AccountStoryMapResponse,
  AccountStoryRunResponse,
} from "@interactive-story/api-contracts";

import { ACCOUNT_ACCESS_TOKEN_KEY } from "../../features/account-progress/account-access-token";
import { loadStoryRunSession } from "../../features/story-run/story-run-session";
import { storyApiFixture } from "../../test/story-api-fixture";
import { StoryMapPage } from "./StoryMapPage";

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const mapResponse: AccountStoryMapResponse = {
  release: { id: "release-1", version: 4 },
  progress: { status: "in_progress", currentNodeCode: "Node002" },
  regions: [
    {
      code: "opening",
      title: "初遇",
      description: "API 返回的第一个区域。",
      sortOrder: 0,
      layoutMetadata: {
        connections: [
          { fromNodeCode: "Node001", toNodeCode: "Node002" },
          { fromNodeCode: "Node001", toNodeCode: "Node003" },
          { fromNodeCode: "Node001", toNodeCode: "Hidden999" },
        ],
      },
      nodes: [
        {
          nodeCode: "Node001",
          title: "相遇",
          description: "已经完成。",
          coverUrl: null,
          position: { x: 100, y: 260 },
          sortOrder: 0,
          state: "completed",
          actions: { canExplore: false, canReplay: true },
        },
        {
          nodeCode: "Node002",
          title: "图书馆",
          description: "当前主线。",
          coverUrl: null,
          position: { x: 520, y: 100 },
          sortOrder: 1,
          state: "available",
          actions: { canExplore: true, canReplay: false },
        },
        {
          nodeCode: "Node003",
          title: "泳池",
          description: "可以探索。",
          coverUrl: null,
          position: { x: 520, y: 300 },
          sortOrder: 2,
          state: "available",
          actions: { canExplore: true, canReplay: false },
        },
        {
          nodeCode: "Node004",
          title: "水上乐园",
          description: "已发现但未解锁。",
          coverUrl: null,
          position: { x: 520, y: 500 },
          sortOrder: 3,
          state: "discovered_locked",
          actions: { canExplore: false, canReplay: false },
        },
        {
          nodeCode: "Node005",
          title: "夜晚散步",
          description: "可以重看或再次探索。",
          coverUrl: null,
          position: { x: 850, y: 300 },
          sortOrder: 4,
          state: "completed",
          actions: { canExplore: true, canReplay: true },
        },
      ],
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/story-map/chapter-01"]}>
      <Routes>
        <Route path="/story-map/:chapterCode" element={<StoryMapPage />} />
        <Route path="/story" element={<p>Run播放器已打开</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StoryMapPage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem(ACCOUNT_ACCESS_TOKEN_KEY, "account-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders only API regions and nodes with server-provided states and connections", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mapResponse));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    expect(await screen.findByRole("heading", { name: "初遇" })).toBeInTheDocument();
    expect(screen.getByText("图书馆")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "继续剧情" })).toHaveAttribute(
      "href",
      "/story?chapterCode=chapter-01",
    );
    expect(screen.getByRole("button", { name: "开始探索" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "未解锁" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "重新观看" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "再次探索" })).toBeEnabled();
    expect(screen.getAllByTestId("story-map-connection")).toHaveLength(2);
    expect(screen.queryByText("Hidden999")).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/v1/me/chapters/chapter-01/map",
      expect.objectContaining({
        headers: { authorization: "Bearer account-token" },
      }),
    );
  });

  it("starts Node003 exploration with the map release and stores the server run", async () => {
    const runResponse: AccountStoryRunResponse = {
      release: mapResponse.release,
      run: {
        id: "exploration-run-1",
        mode: "exploration",
        status: "active",
        version: 0,
        entryNodeCode: "Node003",
        currentNodeCode: "Node003",
      },
      chapter: storyApiFixture,
      engineSnapshot: {
        version: 1,
        storyId: "ai-romance-demo:chapter-01:exploration:Node003",
        phase: "playing",
        currentNodeId: "Node003",
        history: ["Node003"],
      },
    };
    const fetchMock = vi.fn().mockImplementation((input: string | URL) =>
      Promise.resolve(
        String(input).endsWith("/exploration-runs")
          ? jsonResponse(runResponse)
          : jsonResponse(mapResponse),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("泳池");

    await userEvent.click(screen.getByRole("button", { name: "开始探索" }));
    expect(await screen.findByText("Run播放器已打开")).toBeInTheDocument();
    const startCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/exploration-runs"),
    );
    expect(startCall).toBeDefined();
    expect(JSON.parse((startCall?.[1] as RequestInit).body as string)).toMatchObject({
      releaseId: "release-1",
      entryNodeCode: "Node003",
    });
    expect(
      loadStoryRunSession("chapter-01", "exploration", "exploration-run-1"),
    ).toEqual(runResponse);
  });

  it("starts replay for a completed node", async () => {
    const runResponse: AccountStoryRunResponse = {
      release: mapResponse.release,
      run: {
        id: "replay-run-1",
        mode: "replay",
        status: "active",
        version: 0,
        entryNodeCode: "Node001",
        currentNodeCode: "Node001",
      },
      chapter: storyApiFixture,
      engineSnapshot: {
        version: 1,
        storyId: "ai-romance-demo:chapter-01:replay:Node001",
        phase: "playing",
        currentNodeId: "Node001",
        history: ["Node001"],
      },
    };
    const fetchMock = vi.fn().mockImplementation((input: string | URL) =>
      Promise.resolve(
        String(input).endsWith("/replay-runs")
          ? jsonResponse(runResponse)
          : jsonResponse(mapResponse),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("相遇");

    await userEvent.click(screen.getAllByRole("button", { name: "重新观看" })[0]!);
    expect(await screen.findByText("Run播放器已打开")).toBeInTheDocument();
    const startCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/replay-runs"),
    );
    expect(JSON.parse((startCall?.[1] as RequestInit).body as string)).toMatchObject({
      releaseId: "release-1",
      nodeCode: "Node001",
    });
  });

  it("never renders a hidden state returned by an invalid response", async () => {
    const invalidResponse = structuredClone(mapResponse) as unknown as {
      regions: Array<{ nodes: Array<Record<string, unknown>> }>;
    };
    invalidResponse.regions[0]!.nodes[0]!.state = "hidden";
    invalidResponse.regions[0]!.nodes[0]!.title = "不应显示的隐藏节点";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(invalidResponse)));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("剧情地图返回格式无效");
    expect(screen.queryByText("不应显示的隐藏节点")).not.toBeInTheDocument();
  });

  it("shows a login-safe error without requesting the map when no token exists", async () => {
    window.sessionStorage.removeItem(ACCOUNT_ACCESS_TOKEN_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("请先登录");
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
