import type { AccountStoryRunResponse } from "@interactive-story/api-contracts";

export const STORY_RUN_SESSION_PREFIX = "interactive-story:story-run:v1";

interface StoredStoryRunSession {
  version: 1;
  chapterCode: string;
  response: AccountStoryRunResponse;
}

function storageKey(chapterCode: string, mode: "exploration" | "replay", runId: string) {
  return `${STORY_RUN_SESSION_PREFIX}:${chapterCode}:${mode}:${runId}`;
}

function isStoredSession(value: unknown): value is StoredStoryRunSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredStoryRunSession>;
  const response = candidate.response;
  return Boolean(
    candidate.version === 1 &&
      typeof candidate.chapterCode === "string" &&
      response &&
      typeof response === "object" &&
      response.run &&
      typeof response.run.id === "string" &&
      (response.run.mode === "exploration" || response.run.mode === "replay") &&
      Number.isSafeInteger(response.run.version) &&
      response.engineSnapshot?.version === 1,
  );
}

export function saveStoryRunSession(
  chapterCode: string,
  response: AccountStoryRunResponse,
) {
  if (typeof window === "undefined") return;
  const value: StoredStoryRunSession = { version: 1, chapterCode, response };
  window.sessionStorage.setItem(
    storageKey(chapterCode, response.run.mode, response.run.id),
    JSON.stringify(value),
  );
}

export function loadStoryRunSession(
  chapterCode: string,
  mode: "exploration" | "replay",
  runId: string,
) {
  if (typeof window === "undefined") return null;
  const key = storageKey(chapterCode, mode, runId);
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isStoredSession(value) ||
      value.chapterCode !== chapterCode ||
      value.response.run.mode !== mode ||
      value.response.run.id !== runId
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return value.response;
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

export function clearStoryRunSession(
  chapterCode: string,
  mode: "exploration" | "replay",
  runId: string,
) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(storageKey(chapterCode, mode, runId));
}
