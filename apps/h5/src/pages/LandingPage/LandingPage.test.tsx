import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { analyticsClient } from "../../analytics/analytics-client";
import { App } from "../../app/App";
import {
  getStoryProgressKey,
  LOCAL_STORY_PROGRESS_KEY,
} from "../../features/story-runtime/useStoryEngine";
import { storyApiFixture } from "../../test/story-api-fixture";

const originalRequestFullscreen = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "requestFullscreen",
);

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("LandingPage", () => {
  afterEach(() => {
    analyticsClient.stop();
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
    if (originalRequestFullscreen) {
      Object.defineProperty(
        Element.prototype,
        "requestFullscreen",
        originalRequestFullscreen,
      );
    } else {
      Reflect.deleteProperty(Element.prototype, "requestFullscreen");
    }
  });

  it("captures Facebook UTM and keeps the session when CTA enters /story", async () => {
    window.history.replaceState(
      {},
      "",
      "/?utm_source=facebook&utm_medium=paid_social&utm_campaign=mvp_launch&utm_content=creative_a",
    );
    const fetchMock = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/analytics/sessions")) {
        return Promise.resolve(jsonResponse({ sessionKey: "test" }));
      }
      if (url.endsWith("/v1/analytics/events")) {
        return Promise.resolve(jsonResponse({ accepted: true }));
      }
      if (url.endsWith("/v1/chapters/chapter-01")) {
        return Promise.resolve(jsonResponse(storyApiFixture));
      }
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter
        initialEntries={[
          "/?utm_source=facebook&utm_medium=paid_social&utm_campaign=mvp_launch&utm_content=creative_a",
        ]}
      >
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "开启专属的恋爱互动" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "心动手记" })).toBeInTheDocument();
    expect(screen.queryByText(/第一次见面 · 林晚/)).not.toBeInTheDocument();
    expect(screen.queryByText("互动短剧")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /进入剧情/ })).toHaveLength(4);
    await waitFor(() => {
      const sessionCall = fetchMock.mock.calls.find(([url]) =>
        String(url).endsWith("/v1/analytics/sessions"),
      );
      expect(sessionCall).toBeDefined();
      expect(JSON.parse(String((sessionCall?.[1] as RequestInit).body))).toMatchObject({
        utmSource: "facebook",
        utmMedium: "paid_social",
        utmCampaign: "mvp_launch",
        utmContent: "creative_a",
      });
    });
    const sessionBefore = window.sessionStorage.getItem(
      "interactive-story:analytics-session:v1",
    );

    await userEvent.click(screen.getByRole("button", { name: /开始体验/ }));

    expect(await screen.findByLabelText("互动视频播放器")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("interactive-story:analytics-session:v1")).toBe(
      sessionBefore,
    );
    await waitFor(() => {
      const eventTypes = fetchMock.mock.calls
        .filter(([url]) => String(url).endsWith("/v1/analytics/events"))
        .map(([, request]) =>
          JSON.parse(String((request as RequestInit).body)).eventType as string,
        );
      expect(eventTypes).toEqual(
        expect.arrayContaining(["page_view", "landing_cta_clicked"]),
      );
    });
  });

  it("still enters the story when analytics is unavailable", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(Element.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/v1/chapters/chapter-01")) {
          return Promise.resolve(jsonResponse(storyApiFixture));
        }
        return Promise.reject(new Error("offline"));
      }),
    );
    render(
      <MemoryRouter initialEntries={["/?utm_source=tiktok&utm_medium=paid_social"]}>
        <App />
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByRole("button", { name: /开始体验/ }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText("互动视频播放器")).toBeInTheDocument();
  });

  it("starts a fresh story instead of restoring stale choices from the landing CTA", async () => {
    const storyProgressKey = getStoryProgressKey(
      `${storyApiFixture.story.code}:${storyApiFixture.code}`,
    );
    window.localStorage.setItem(
      storyProgressKey,
      JSON.stringify({
        version: 1,
        storyId: `${storyApiFixture.story.code}:${storyApiFixture.code}`,
        phase: "awaiting_choice",
        currentNodeId: "Node001",
        history: ["Node001"],
      }),
    );
    window.localStorage.setItem(LOCAL_STORY_PROGRESS_KEY, "stale-fallback-progress");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/v1/chapters/chapter-01")) {
          return Promise.resolve(jsonResponse(storyApiFixture));
        }
        return Promise.reject(new Error("offline"));
      }),
    );

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByRole("button", { name: /开始体验/ }));

    expect(window.localStorage.getItem(storyProgressKey)).not.toContain(
      '"phase":"awaiting_choice"',
    );
    expect(window.localStorage.getItem(LOCAL_STORY_PROGRESS_KEY)).toBeNull();
    expect(await screen.findByLabelText("剧情视频")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "去图书馆" })).not.toBeInTheDocument();
  });
});
