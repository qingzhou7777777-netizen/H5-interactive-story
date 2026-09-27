import { localTestStory } from "@interactive-story/story-core";
import { describe, expect, it } from "vitest";

import { localVideoAssets, resolveLocalVideoAsset } from "./local-video-assets";

describe("localVideoAssets", () => {
  it("keeps every story-node video independently addressable", () => {
    expect(Object.keys(localVideoAssets)).toEqual([
      "chapter01-node001",
      "chapter01-node002",
      "chapter01-node003",
      "chapter01-node004",
    ]);

    expect(resolveLocalVideoAsset("chapter01-node003")).toMatchObject({
      id: "chapter01-node003",
      poster: "/posters/node003.svg",
    });
  });

  it("returns undefined for an unconfigured asset", () => {
    expect(resolveLocalVideoAsset("missing-video")).toBeUndefined();
  });

  it("resolves an asset for every video node in the local story", () => {
    const videoAssetIds = Object.values(localTestStory.nodes)
      .filter((node) => node.type === "video")
      .map((node) => node.videoAssetId);

    expect(videoAssetIds).toEqual([
      "chapter01-node001",
      "chapter01-node002",
      "chapter01-node003",
      "chapter01-node004",
    ]);
    expect(videoAssetIds.every((assetId) => resolveLocalVideoAsset(assetId))).toBe(true);
  });
});
