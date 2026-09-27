import { localTestStory } from "@interactive-story/story-core";

import { localVideoAssets } from "../video-assets/local-video-assets";
import type { StoryContent } from "./story-content";

export const fallbackStoryContent: StoryContent = {
  source: "fallback",
  chapterCode: "chapter-01",
  chapterTitle: "第一次见面",
  storyTitle: "AI 恋爱互动剧情",
  character: {
    code: "lin-wan",
    name: "林晚",
    avatarUrl: null,
    description: "本地测试角色",
  },
  story: localTestStory,
  videoAssets: localVideoAssets,
};
