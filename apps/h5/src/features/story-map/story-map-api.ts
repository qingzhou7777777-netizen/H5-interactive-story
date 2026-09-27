import type {
  AccountStoryMapNodeDto,
  AccountStoryMapRegionDto,
  AccountStoryMapResponse,
  StoryMapNodeState,
} from "@interactive-story/api-contracts";

import { getApiBaseUrl } from "../../config/api-base-url";

export class StoryMapApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "StoryMapApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNodeState(value: unknown): value is StoryMapNodeState {
  return value === "discovered_locked" || value === "available" || value === "completed";
}

function parseNode(value: unknown): AccountStoryMapNodeDto | null {
  if (!isRecord(value) || !isRecord(value.position) || !isRecord(value.actions)) {
    return null;
  }

  if (
    !isText(value.nodeCode) ||
    !isText(value.title) ||
    !isNullableText(value.description) ||
    !isNullableText(value.coverUrl) ||
    typeof value.position.x !== "number" ||
    !Number.isFinite(value.position.x) ||
    typeof value.position.y !== "number" ||
    !Number.isFinite(value.position.y) ||
    !Number.isSafeInteger(value.sortOrder) ||
    !isNodeState(value.state) ||
    typeof value.actions.canExplore !== "boolean" ||
    typeof value.actions.canReplay !== "boolean"
  ) {
    return null;
  }

  return value as unknown as AccountStoryMapNodeDto;
}

function parseRegion(value: unknown): AccountStoryMapRegionDto | null {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return null;
  if (
    !isText(value.code) ||
    !isText(value.title) ||
    !isNullableText(value.description) ||
    !Number.isSafeInteger(value.sortOrder)
  ) {
    return null;
  }

  const nodes = value.nodes.map(parseNode);
  if (nodes.some((node) => node === null)) return null;

  return {
    code: value.code,
    title: value.title,
    description: value.description,
    sortOrder: value.sortOrder as number,
    layoutMetadata: value.layoutMetadata ?? null,
    nodes: nodes as AccountStoryMapNodeDto[],
  };
}

function parseStoryMap(value: unknown): AccountStoryMapResponse | null {
  if (
    !isRecord(value) ||
    !isRecord(value.release) ||
    !isRecord(value.progress) ||
    !Array.isArray(value.regions) ||
    !isText(value.release.id) ||
    !Number.isSafeInteger(value.release.version) ||
    (value.progress.status !== "in_progress" && value.progress.status !== "completed") ||
    !isText(value.progress.currentNodeCode)
  ) {
    return null;
  }

  const regions = value.regions.map(parseRegion);
  if (regions.some((region) => region === null)) return null;

  return {
    release: {
      id: value.release.id,
      version: value.release.version as number,
    },
    progress: {
      status: value.progress.status,
      currentNodeCode: value.progress.currentNodeCode,
    },
    regions: regions as AccountStoryMapRegionDto[],
  };
}

export async function fetchStoryMap(
  chapterCode: string,
  token: string,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `${getApiBaseUrl()}/v1/me/chapters/${encodeURIComponent(chapterCode)}/map`,
    {
      headers: { authorization: `Bearer ${token}` },
      ...(signal ? { signal } : {}),
    },
  );
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error)
      ? payload.error
      : null;
    throw new StoryMapApiError(
      typeof error?.message === "string"
        ? error.message
        : `剧情地图请求失败（${response.status}）。`,
      response.status,
      typeof error?.code === "string" ? error.code : "STORY_MAP_REQUEST_FAILED",
    );
  }

  const storyMap = parseStoryMap(payload);
  if (!storyMap) {
    throw new StoryMapApiError(
      "剧情地图返回格式无效。",
      response.status,
      "STORY_MAP_RESPONSE_INVALID",
    );
  }
  return storyMap;
}
