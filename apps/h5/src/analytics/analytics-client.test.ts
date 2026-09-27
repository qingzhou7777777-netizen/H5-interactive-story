import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

import { AnalyticsClient } from "./analytics-client";

function okResponse() {
  return { ok: true, status: 200 } as Response;
}

describe("AnalyticsClient", () => {
  const clients: AnalyticsClient[] = [];

  afterEach(() => {
    clients.forEach((client) => client.stop());
    clients.length = 0;
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  it("captures UTM values and queues a funnel event", async () => {
    window.history.replaceState(
      {},
      "",
      "/story?utm_source=meta&utm_medium=cpc&utm_campaign=launch",
    );
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const client = new AnalyticsClient();
    clients.push(client);

    client.start();
    client.track({
      eventKey: "chapter-01:1:Node001:node-entered",
      eventType: "node_entered",
      chapterCode: "chapter-01",
      nodeCode: "Node001",
    });

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).endsWith("/v1/analytics/events")),
      ).toBe(true),
    );
    const sessionCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/v1/analytics/sessions"),
    );
    const eventCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/v1/analytics/events"),
    );
    expect(JSON.parse((sessionCall?.[1] as RequestInit).body as string)).toMatchObject({
      landingPath: "/story?utm_source=meta&utm_medium=cpc&utm_campaign=launch",
      utmSource: "meta",
      utmMedium: "cpc",
      utmCampaign: "launch",
    });
    expect(JSON.parse((eventCall?.[1] as RequestInit).body as string)).toMatchObject({
      eventType: "node_entered",
      chapterCode: "chapter-01",
      nodeCode: "Node001",
    });
  });

  it("swallows transport failures and keeps semantic events deduplicated", () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const client = new AnalyticsClient();
    clients.push(client);
    client.start();

    expect(() => {
      client.track({
        eventKey: "chapter-01:1:Node001:video-completed",
        eventType: "video_completed",
        chapterCode: "chapter-01",
        nodeCode: "Node001",
      });
      client.track({
        eventKey: "chapter-01:1:Node001:video-completed",
        eventType: "video_completed",
        chapterCode: "chapter-01",
        nodeCode: "Node001",
      });
    }).not.toThrow();

    const queue = JSON.parse(
      window.localStorage.getItem("interactive-story:analytics-queue:v1") ?? "[]",
    ) as unknown[];
    expect(queue).toHaveLength(1);
  });
});
