import { describe, expect, it } from "vitest";

import { storyApiFixture } from "../../test/story-api-fixture";
import { adaptChapterDto } from "./chapter-adapter";

describe("adaptChapterDto", () => {
  it("converts API content into the existing story runtime model", () => {
    const content = adaptChapterDto(storyApiFixture);

    expect(content).toMatchObject({
      source: "api",
      chapterCode: "chapter-01",
      character: { name: "林晚 API" },
      story: {
        id: "ai-romance-demo:chapter-01",
        entryNodeId: "Node001",
      },
    });
    expect(content.story.nodes.Node001).toMatchObject({
      type: "video",
      onComplete: { type: "choices" },
    });
    expect(content.story.nodes.Node002).toMatchObject({
      type: "video",
      onComplete: { type: "next", targetNodeId: "Ending002" },
    });
    expect(content.story.nodes.Ending002).toMatchObject({ type: "ending" });
    expect(content.videoAssets["chapter01-node002"]).toMatchObject({
      poster: "/media/chapter01/Node002.jpg",
      sources: [{ src: "/media/chapter01/Node002.mp4", type: "video/mp4" }],
    });
  });

  it("rejects a graph containing a missing target", () => {
    const brokenChapter = {
      ...storyApiFixture,
      nodes: storyApiFixture.nodes.map((node) =>
        node.id === "Node002" ? { ...node, nextNodeId: "MissingEnding" } : node,
      ),
    };

    expect(() => adaptChapterDto(brokenChapter)).toThrow("MissingEnding");
  });
});
