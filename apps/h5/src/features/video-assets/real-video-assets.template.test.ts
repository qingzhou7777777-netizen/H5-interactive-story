import { describe, expect, it } from "vitest";

import {
  realVideoAssetsTemplate,
  resolveRealVideoAsset,
} from "./real-video-assets.template";

describe("realVideoAssetsTemplate", () => {
  it.each([
    ["Node001", "chapter01-node001"],
    ["Node002", "chapter01-node002"],
    ["Node003", "chapter01-node003"],
    ["Node004", "chapter01-node004"],
  ] as const)(
    "maps %s to its MP4 and JPG delivery paths",
    (nodeId, assetId) => {
      const asset = realVideoAssetsTemplate[assetId];

      expect(asset).toEqual({
        id: assetId,
        poster: `/media/chapter01/${nodeId}.jpg`,
        sources: [
          {
            src: `/media/chapter01/${nodeId}.mp4`,
            type: "video/mp4",
          },
        ],
      });
    },
  );

  it("returns undefined for an asset outside the delivery template", () => {
    expect(resolveRealVideoAsset("chapter01-node999")).toBeUndefined();
  });
});
