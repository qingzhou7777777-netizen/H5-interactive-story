import { describe, expect, it } from "vitest";

import type { StoryGraph } from "./types.js";
import { validateStoryGraph } from "./validate-story-graph.js";

const validGraph: StoryGraph = {
  chapter: {
    code: "chapter-01",
    title: "第一次见面",
    characterCode: "lin-wan",
    entryNodeCode: "first-meeting",
  },
  nodes: [
    {
      code: "first-meeting",
      title: "第一次见面",
      type: "video",
      completionMode: "choices",
      accessMode: "free",
    },
    {
      code: "accept-video",
      title: "接受邀请",
      type: "video",
      completionMode: "next",
      nextNodeCode: "accept-ending",
      accessMode: "free",
    },
    {
      code: "accept-ending",
      title: "接受邀请结局",
      type: "ending",
      completionMode: "end",
      accessMode: "free",
    },
  ],
  choices: [
    {
      code: "accept",
      sourceNodeCode: "first-meeting",
      label: "接受邀请",
      targetNodeCode: "accept-video",
      sortOrder: 1,
      enabled: true,
    },
  ],
};

describe("validateStoryGraph", () => {
  it("accepts a valid branching graph", () => {
    expect(validateStoryGraph(validGraph)).toEqual([]);
  });

  it("reports a missing choice target", () => {
    const graph: StoryGraph = {
      ...validGraph,
      choices: [
        {
          ...validGraph.choices[0]!,
          targetNodeCode: "missing-node",
        },
      ],
    };

    expect(validateStoryGraph(graph)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "choice_target_missing" }),
      ]),
    );
  });

  it("requires an access key for a payment-reserved node", () => {
    const graph: StoryGraph = {
      ...validGraph,
      nodes: validGraph.nodes.map((node) =>
        node.code === "accept-ending"
          ? { ...node, accessMode: "payment" }
          : node,
      ),
    };

    expect(validateStoryGraph(graph)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "payment_access_key_required" }),
      ]),
    );
  });
});
