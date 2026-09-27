import type { ChapterDto } from "@interactive-story/api-contracts";
import { describe, expect, it } from "vitest";

import type {
  AccountProgressRepository,
  CommitChoiceTransitionInput,
  CommitVideoTransitionInput,
  CreateChapterProgressInput,
  StoredChapterProgress,
  StoredChapterRelease,
} from "./account-progress-repository.js";
import { AccountProgressService } from "./account-progress-service.js";
import { adaptChapterToRuntime } from "./chapter-runtime-adapter.js";

const releaseId = "6a0a0b8b-f0a2-47e2-9075-b175b635443f";
const chapter: ChapterDto = {
  id: "chapter-database-id",
  code: "chapter-01",
  title: "测试章节",
  description: null,
  entryNodeId: "Node001",
  story: {
    id: "story-database-id",
    code: "test-story",
    title: "测试故事",
    description: null,
  },
  character: {
    code: "character-01",
    name: "角色",
    avatarUrl: null,
    coverUrl: null,
    description: null,
  },
  nodes: [
    {
      id: "Node001",
      title: "入口",
      type: "video",
      completionMode: "choices",
      message: null,
      videoAssetId: "video-001",
      nextNodeId: null,
      accessMode: "free",
      choices: [
        { id: "A", label: "选择 A", targetNodeId: "Node002", sortOrder: 1 },
      ],
    },
    {
      id: "Node002",
      title: "分支视频",
      type: "video",
      completionMode: "next",
      message: null,
      videoAssetId: "video-002",
      nextNodeId: "Ending002",
      accessMode: "free",
      choices: [],
    },
    {
      id: "Ending002",
      title: "结束",
      type: "ending",
      completionMode: "end",
      message: "结束",
      videoAssetId: null,
      nextNodeId: null,
      accessMode: "free",
      choices: [],
    },
  ],
  videoAssets: [],
};

class MemoryProgressRepository implements AccountProgressRepository {
  readonly release: StoredChapterRelease = {
    id: releaseId,
    version: 1,
    snapshot: {
      schemaVersion: 1,
      chapter,
      runtimeStory: adaptChapterToRuntime(chapter),
    },
  };
  readonly videoWrites: CommitVideoTransitionInput[] = [];
  readonly choiceWrites: CommitChoiceTransitionInput[] = [];
  private readonly progresses = new Map<string, StoredChapterProgress>();
  private readonly videoRequests = new Map<string, string>();
  private readonly choiceRequests = new Map<string, string>();

  async findByUserAndChapter(userId: string) {
    return this.progresses.get(userId) ?? null;
  }

  async findActiveRelease() {
    return this.release;
  }

  async createProgress(input: CreateChapterProgressInput) {
    const existing = this.progresses.get(input.userId);
    if (existing) return existing;
    const progress: StoredChapterProgress = {
      id: `progress-${input.userId}`,
      userId: input.userId,
      chapterReleaseId: input.release.id,
      status: input.status,
      currentNodeCode: input.currentNodeCode,
      canonicalSnapshot: input.canonicalSnapshot,
      progressVersion: 0,
      release: input.release,
    };
    this.progresses.set(input.userId, progress);
    return progress;
  }

  async findByVideoRequest(progressId: string, requestKey: string) {
    const userId = this.videoRequests.get(requestKey);
    const progress = userId ? this.progresses.get(userId) ?? null : null;
    return progress?.id === progressId ? progress : null;
  }

  async findByChoiceRequest(progressId: string, requestKey: string) {
    const userId = this.choiceRequests.get(requestKey);
    const progress = userId ? this.progresses.get(userId) ?? null : null;
    return progress?.id === progressId ? progress : null;
  }

  async commitVideoTransition(input: CommitVideoTransitionInput) {
    this.videoWrites.push(input);
    this.videoRequests.set(input.requestKey, input.progress.userId);
    return this.update(input);
  }

  async commitChoiceTransition(input: CommitChoiceTransitionInput) {
    this.choiceWrites.push(input);
    this.choiceRequests.set(input.requestKey, input.progress.userId);
    return this.update(input);
  }

  private update(
    input: CommitVideoTransitionInput | CommitChoiceTransitionInput,
  ) {
    const progress: StoredChapterProgress = {
      ...input.progress,
      status: input.status,
      currentNodeCode: input.currentNodeCode,
      canonicalSnapshot: input.canonicalSnapshot,
      progressVersion: input.expectedVersion + 1,
    };
    this.progresses.set(progress.userId, progress);
    return progress;
  }
}

const videoRequest1 = "838bb0f9-a7c9-4583-97b8-010ef759a7d4";
const choiceRequest = "79baae8c-c2e0-473b-a451-b410961c98fb";
const videoRequest2 = "f61c552c-330e-4fb7-a6bf-3c77c2dfed6c";

describe("Account progress service", () => {
  it("runs start, video, choice, ending, refresh, and cross-client restore", async () => {
    const repository = new MemoryProgressRepository();
    const firstClient = new AccountProgressService(repository);

    const started = await firstClient.startChapter("user-1", "chapter-01");
    expect(started).toMatchObject({
      release: { id: releaseId, version: 1 },
      progress: { version: 0, status: "in_progress", currentNodeCode: "Node001" },
      engineSnapshot: { phase: "playing", currentNodeId: "Node001" },
    });
    await expect(firstClient.startChapter("user-1", "chapter-01")).resolves.toEqual(
      started,
    );

    const awaitingChoice = await firstClient.completeVideo("user-1", "chapter-01", {
      releaseId,
      nodeCode: "Node001",
      expectedProgressVersion: 0,
      requestKey: videoRequest1,
    });
    expect(awaitingChoice).toMatchObject({
      progress: { version: 1, currentNodeCode: "Node001" },
      engineSnapshot: { phase: "awaiting_choice" },
    });

    const duplicate = await firstClient.completeVideo("user-1", "chapter-01", {
      releaseId,
      nodeCode: "Node001",
      expectedProgressVersion: 0,
      requestKey: videoRequest1,
    });
    expect(duplicate.progress.version).toBe(1);
    expect(repository.videoWrites).toHaveLength(1);

    const branch = await firstClient.selectChoice("user-1", "chapter-01", {
      releaseId,
      sourceNodeCode: "Node001",
      choiceCode: "A",
      expectedProgressVersion: 1,
      requestKey: choiceRequest,
    });
    expect(branch).toMatchObject({
      progress: { version: 2, currentNodeCode: "Node002" },
      engineSnapshot: { phase: "playing", currentNodeId: "Node002" },
    });
    expect(repository.choiceWrites[0]).toMatchObject({
      choiceCode: "A",
      targetNodeCode: "Node002",
    });

    const secondClient = new AccountProgressService(repository);
    await expect(secondClient.getProgress("user-1", "chapter-01")).resolves.toEqual(
      branch,
    );

    const ended = await secondClient.completeVideo("user-1", "chapter-01", {
      releaseId,
      nodeCode: "Node002",
      expectedProgressVersion: 2,
      requestKey: videoRequest2,
    });
    expect(ended).toMatchObject({
      progress: { version: 3, status: "completed", currentNodeCode: "Ending002" },
      engineSnapshot: { phase: "ended", currentNodeId: "Ending002" },
    });
    await expect(firstClient.getProgress("user-1", "chapter-01")).resolves.toEqual(
      ended,
    );
  });

  it("rejects stale versions and keeps users isolated", async () => {
    const repository = new MemoryProgressRepository();
    const service = new AccountProgressService(repository);
    await service.startChapter("user-1", "chapter-01");
    await service.startChapter("user-2", "chapter-01");
    await service.completeVideo("user-1", "chapter-01", {
      releaseId,
      nodeCode: "Node001",
      expectedProgressVersion: 0,
      requestKey: videoRequest1,
    });

    await expect(
      service.selectChoice("user-1", "chapter-01", {
        releaseId,
        sourceNodeCode: "Node001",
        choiceCode: "A",
        expectedProgressVersion: 0,
        requestKey: choiceRequest,
      }),
    ).rejects.toMatchObject({ code: "PROGRESS_VERSION_CONFLICT", statusCode: 409 });
    await expect(service.getProgress("user-2", "chapter-01")).resolves.toMatchObject({
      progress: { version: 0, currentNodeCode: "Node001" },
    });
  });
});
