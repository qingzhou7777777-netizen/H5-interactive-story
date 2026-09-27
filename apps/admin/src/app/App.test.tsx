import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type {
  AdminChapterDetailDto,
  AdminChapterSummaryDto,
  AdminVideoAssetDto,
  AnalyticsFunnelDto,
} from "@interactive-story/api-contracts";

import { App } from "./App";

const timestamp = "2026-09-20T08:00:00.000Z";

const asset: AdminVideoAssetDto = {
  id: "asset-db-id",
  code: "chapter01-node001",
  originalFilename: "Node001.mp4",
  objectKey: "test/chapter01/Node001.mp4",
  playbackUrl: "/media/chapter01/Node001.mp4",
  posterUrl: "/posters/node001.svg",
  mimeType: "video/mp4",
  fileSize: "76144",
  durationMs: 4000,
  width: 720,
  height: 1280,
  checksum: "checksum",
  videoCodec: "h264",
  audioCodec: "aac",
  pixelFormat: "yuv420p",
  frameRate: 30,
  processingError: null,
  posterObjectKey: null,
  posterMimeType: null,
  posterFileSize: null,
  status: "ready",
  relatedNodes: [
    { chapterCode: "chapter-01", nodeId: "Node001", nodeTitle: "第一次见面" },
  ],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const chapterSummary: AdminChapterSummaryDto = {
  id: "chapter-db-id",
  code: "chapter-01",
  title: "第一次见面",
  description: "入口视频连接三条分支。",
  status: "active",
  entryNodeId: "Node001",
  nodeCount: 2,
  story: { code: "ai-romance-demo", title: "互动剧情", status: "active" },
  character: { code: "lin-wan", name: "林晚", status: "active" },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const chapterDetail: AdminChapterDetailDto = {
  ...chapterSummary,
  nodes: [
    {
      id: "Node001",
      title: "第一次见面",
      message: null,
      type: "video",
      completionMode: "choices",
      status: "active",
      accessMode: "free",
      videoAssetId: "chapter01-node001",
      videoAssetStatus: "ready",
      nextNodeId: null,
      choices: [
        {
          id: "A",
          label: "接受邀请",
          sourceNodeId: "Node001",
          targetNodeId: "Ending002",
          sortOrder: 1,
          enabled: true,
        },
      ],
    },
    {
      id: "Ending002",
      title: "接受邀请",
      message: "测试结束。",
      type: "ending",
      completionMode: "end",
      status: "active",
      accessMode: "free",
      videoAssetId: null,
      videoAssetStatus: null,
      nextNodeId: null,
      choices: [],
    },
  ],
};

const funnel: AnalyticsFunnelDto = {
  filters: { chapterCode: "chapter-01", from: null, to: null, utmSource: null },
  sessions: 12,
  averageDurationMs: 75_000,
  summary: {
    landingViews: 12,
    landingCtaClicks: 10,
    landingCtaClickRate: 83.33,
    nodeEntered: 10,
    entryNodeCode: "Node001",
    entryVideoCompletionRate: 80,
    endingCompleted: 6,
    endingCompletionRate: 50,
    paymentClicked: 3,
    paymentClickRate: 50,
    paymentSessionRate: 25,
  },
  steps: [],
  nodes: [
    {
      nodeCode: "Node001",
      nodeTitle: "第一次见面",
      nodeType: "video",
      entered: 10,
      videoCompleted: 8,
      videoCompletionRate: 80,
      choiceSelected: 8,
      endingCompleted: 0,
    },
  ],
  choices: [
    {
      nodeCode: "Node001",
      choiceCode: "A",
      choiceLabel: "接受邀请",
      targetNodeCode: "Node002",
      uniqueSessions: 4,
      totalEvents: 4,
      selectionRate: 50,
    },
  ],
  sources: [
    {
      utmSource: "facebook",
      utmMedium: "paid_social",
      utmCampaign: "mvp_launch",
      sessions: 8,
      averageDurationMs: 80_000,
      nodeEntered: 7,
      endingCompleted: 5,
      paymentClicked: 2,
      endingCompletionRate: 62.5,
      paymentClickRate: 40,
    },
  ],
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Admin App", () => {
  it("shows commercial funnel metrics and applies a UTM source filter", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/v1/admin/analytics/funnel")) return jsonResponse(funnel);
      return jsonResponse({ error: { code: "NOT_FOUND", message: "未找到" } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/analytics"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "商业数据看板" })).toBeInTheDocument();
    expect(screen.getByText("1 分 15 秒")).toBeInTheDocument();
    expect(screen.getAllByText("80%").length).toBeGreaterThan(0);
    expect(screen.getByText("接受邀请")).toBeInTheDocument();
    expect(screen.getByText("facebook")).toBeInTheDocument();
    await user.type(screen.getByLabelText("UTM Source"), "tiktok");
    await user.click(screen.getByRole("button", { name: "查询" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) =>
        String(url).includes("utmSource=tiktok"),
      )).toBe(true),
    );
  });

  it("lists, views, and updates a video asset", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as {
          playbackUrl: string;
          posterUrl: string;
          status: AdminVideoAssetDto["status"];
        };
        return jsonResponse({
          ...asset,
          playbackUrl: body.playbackUrl,
          posterUrl: body.posterUrl,
          status: body.status,
        });
      }
      if (url.endsWith("/v1/admin/video-assets")) {
        return jsonResponse([asset]);
      }
      return jsonResponse({ error: { code: "NOT_FOUND", message: "未找到" } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/video-assets"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText("chapter01-node001")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看与编辑" }));
    const videoUrl = screen.getByLabelText("Video URL");
    await user.clear(videoUrl);
    await user.type(videoUrl, "https://cdn.example.com/node001.mp4");
    await user.selectOptions(screen.getByLabelText("状态"), "disabled");
    await user.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/admin/video-assets/chapter01-node001"),
        expect.objectContaining({ method: "PATCH" }),
      );
    });
    expect(await screen.findByDisplayValue("https://cdn.example.com/node001.mp4")).toBeInTheDocument();
  });

  it("shows the chapter graph and switches chapter status", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH" && url.endsWith("/status")) {
        return jsonResponse({ ...chapterDetail, status: "draft" });
      }
      if (url.endsWith("/v1/admin/chapters/chapter-01")) {
        return jsonResponse(chapterDetail);
      }
      if (url.endsWith("/v1/admin/chapters")) {
        return jsonResponse([chapterSummary]);
      }
      return jsonResponse({ error: { code: "NOT_FOUND", message: "未找到" } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/chapters"]}>
        <App />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("link", { name: "查看章节详情" }));
    expect(await screen.findByText("选项关系")).toBeInTheDocument();
    expect(screen.getAllByText("Ending002")).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText("章节状态"), "draft");
    await user.click(screen.getByRole("button", { name: "更新状态" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/admin/chapters/chapter-01/status"),
        expect.objectContaining({ method: "PATCH" }),
      );
    });
    expect(await screen.findByText("草稿")).toBeInTheDocument();
  });

  it("uploads an MP4 and a JPEG poster from the asset editor", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/video")) {
        return jsonResponse({ ...asset, objectKey: "videos/new.mp4", status: "ready" });
      }
      if (init?.method === "POST" && url.endsWith("/poster")) {
        return jsonResponse({
          ...asset,
          posterObjectKey: "posters/new.jpg",
          posterUrl: "https://media.example/posters/new.jpg",
          posterMimeType: "image/jpeg",
          posterFileSize: "100",
        });
      }
      if (url.endsWith("/v1/admin/video-assets")) return jsonResponse([asset]);
      return jsonResponse({ error: { code: "NOT_FOUND", message: "未找到" } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/video-assets"]}>
        <App />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "查看与编辑" }));
    await user.upload(
      screen.getByLabelText("选择 MP4 视频"),
      new File(["video"], "Node001.mp4", { type: "video/mp4" }),
    );
    await user.click(screen.getByRole("button", { name: "上传视频" }));
    await user.upload(
      screen.getByLabelText("选择 JPEG 封面"),
      new File(["jpeg"], "Node001.jpg", { type: "image/jpeg" }),
    );
    await user.click(screen.getByRole("button", { name: "上传封面" }));

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
      expect(postCalls).toHaveLength(2);
      expect(postCalls.every(([, init]) => init?.body instanceof FormData)).toBe(true);
    });
  });
});
