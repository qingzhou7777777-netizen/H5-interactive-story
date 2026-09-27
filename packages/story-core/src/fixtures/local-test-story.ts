import type { RuntimeStoryDefinition } from "../runtime/story-node.js";

export const localTestStory: RuntimeStoryDefinition = {
  id: "local-test-story",
  title: "第一次见面",
  entryNodeId: "Node001",
  nodes: {
    Node001: {
      id: "Node001",
      type: "video",
      title: "第一次见面",
      videoAssetId: "chapter01-node001",
      onComplete: {
        type: "choices",
        choices: [
          {
            id: "A",
            label: "去图书馆",
            targetNodeId: "Node002",
          },
          {
            id: "B",
            label: "一起去游泳",
            targetNodeId: "Node003",
          },
          {
            id: "C",
            label: "去水上乐园",
            targetNodeId: "Node004",
          },
        ],
      },
    },
    Node002: {
      id: "Node002",
      type: "video",
      title: "去图书馆",
      videoAssetId: "chapter01-node002",
      onComplete: {
        type: "next",
        targetNodeId: "Ending002",
      },
    },
    Node003: {
      id: "Node003",
      type: "video",
      title: "一起去游泳",
      videoAssetId: "chapter01-node003",
      onComplete: {
        type: "next",
        targetNodeId: "Ending003",
      },
    },
    Node004: {
      id: "Node004",
      type: "video",
      title: "去水上乐园",
      videoAssetId: "chapter01-node004",
      onComplete: {
        type: "next",
        targetNodeId: "Ending004",
      },
    },
    Ending002: {
      id: "Ending002",
      type: "ending",
      title: "解锁下一章",
      message: "解锁下一章，继续你的专属恋爱互动剧情。",
    },
    Ending003: {
      id: "Ending003",
      type: "ending",
      title: "解锁下一章",
      message: "解锁下一章，继续你的专属恋爱互动剧情。",
    },
    Ending004: {
      id: "Ending004",
      type: "ending",
      title: "解锁下一章",
      message: "解锁下一章，继续你的专属恋爱互动剧情。",
    },
  },
};
