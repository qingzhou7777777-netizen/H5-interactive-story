import type {
  CreateAnalyticsEventRequest,
  CreateAnalyticsSessionRequest,
} from "@interactive-story/api-contracts";

import { getApiBaseUrl } from "../config/api-base-url";
import { isStaticDeployment } from "../config/deployment-mode";

const SESSION_KEY = "interactive-story:analytics-session:v1";
const DURATION_KEY = "interactive-story:analytics-duration:v1";
const TRACKED_KEYS = "interactive-story:analytics-tracked:v1";
const RETRY_QUEUE_KEY = "interactive-story:analytics-queue:v1";
const FLUSH_INTERVAL_MS = 15_000;
const MAX_QUEUE_SIZE = 100;

type TrackInput = Omit<
  CreateAnalyticsEventRequest,
  "eventId" | "sessionKey" | "occurredAt"
>;

function uuid() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (character) =>
    (Number(character) ^ (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (Number(character) / 4)))).toString(16),
  );
}

function readSessionValue(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionValue(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // 隐私模式或存储被禁用时仍允许继续剧情。
  }
}

function readQueue(): CreateAnalyticsEventRequest[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RETRY_QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as CreateAnalyticsEventRequest[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: CreateAnalyticsEventRequest[]) {
  try {
    window.localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_SIZE)));
  } catch {
    // 队列不可写时丢弃遥测，不影响业务流程。
  }
}

function limitedSearchValue(search: URLSearchParams, key: string) {
  const value = search.get(key)?.trim();
  return value ? value.slice(0, 255) : null;
}

function trackedKeys() {
  try {
    const parsed: unknown = JSON.parse(readSessionValue(TRACKED_KEYS) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

export class AnalyticsClient {
  private started = false;
  private sessionKey = "";
  private visibleSince: number | null = null;
  private visibleDurationMs = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sessionPromise: Promise<boolean> | null = null;
  private queuePromise: Promise<void> | null = null;

  start() {
    if (isStaticDeployment() || this.started || typeof window === "undefined") {
      return;
    }
    this.started = true;
    this.sessionKey = readSessionValue(SESSION_KEY) ?? uuid();
    writeSessionValue(SESSION_KEY, this.sessionKey);
    this.visibleDurationMs = Number(readSessionValue(DURATION_KEY) ?? 0) || 0;
    this.visibleSince = document.visibilityState === "visible" ? performance.now() : null;
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("pagehide", this.handlePageHide);
    this.timer = setInterval(() => void this.flushActivity(false), FLUSH_INTERVAL_MS);
    void this.ensureSession().then(() => this.flushQueue());
  }

  stop() {
    if (!this.started) {
      return;
    }
    this.accrueVisibleTime();
    void this.flushActivity(false);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener("pagehide", this.handlePageHide);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.started = false;
    this.visibleSince = null;
  }

  track(input: TrackInput) {
    if (isStaticDeployment()) {
      return;
    }
    try {
      if (!this.started) {
        this.start();
      }
      const sent = trackedKeys();
      if (sent.has(input.eventKey)) {
        return;
      }
      sent.add(input.eventKey);
      writeSessionValue(TRACKED_KEYS, JSON.stringify([...sent]));

      const event: CreateAnalyticsEventRequest = {
        ...input,
        eventId: uuid(),
        sessionKey: this.sessionKey,
        occurredAt: new Date().toISOString(),
      };
      const queue = readQueue().filter((item) => item.sessionKey === this.sessionKey);
      queue.push(event);
      writeQueue(queue);
      void this.flushQueue();
    } catch {
      // 埋点永远不能阻断视频、选项或节点跳转。
    }
  }

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      this.accrueVisibleTime();
      void this.flushActivity(false);
    } else if (this.visibleSince === null) {
      this.visibleSince = performance.now();
    }
  };

  private readonly handlePageHide = () => {
    this.accrueVisibleTime();
    void this.flushActivity(true);
  };

  private accrueVisibleTime() {
    if (this.visibleSince === null) {
      return;
    }
    this.visibleDurationMs += Math.max(0, performance.now() - this.visibleSince);
    this.visibleSince = null;
    writeSessionValue(DURATION_KEY, String(Math.round(this.visibleDurationMs)));
  }

  private buildSessionRequest(): CreateAnalyticsSessionRequest {
    const search = new URLSearchParams(window.location.search);
    return {
      sessionKey: this.sessionKey,
      landingPath: `${window.location.pathname}${window.location.search}`.slice(0, 2048),
      referrer: document.referrer ? document.referrer.slice(0, 2048) : null,
      utmSource: limitedSearchValue(search, "utm_source"),
      utmMedium: limitedSearchValue(search, "utm_medium"),
      utmCampaign: limitedSearchValue(search, "utm_campaign"),
      utmContent: limitedSearchValue(search, "utm_content"),
      utmTerm: limitedSearchValue(search, "utm_term"),
    };
  }

  private ensureSession() {
    if (this.sessionPromise) {
      return this.sessionPromise;
    }
    this.sessionPromise = fetch(`${getApiBaseUrl()}/v1/analytics/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(this.buildSessionRequest()),
      keepalive: true,
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        this.sessionPromise = null;
      });
    return this.sessionPromise;
  }

  private async flushQueue() {
    if (this.queuePromise) {
      return this.queuePromise;
    }
    this.queuePromise = (async () => {
      if (!(await this.ensureSession())) {
        return;
      }
      const queue = readQueue().filter((item) => item.sessionKey === this.sessionKey);
      const remaining: CreateAnalyticsEventRequest[] = [];
      for (const event of queue) {
        try {
          const response = await fetch(`${getApiBaseUrl()}/v1/analytics/events`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(event),
            keepalive: true,
          });
          if (!response.ok) {
            remaining.push(event);
          }
        } catch {
          remaining.push(event);
        }
      }
      writeQueue(remaining);
    })().finally(() => {
      this.queuePromise = null;
    });
    return this.queuePromise;
  }

  private async flushActivity(ended: boolean) {
    if (!this.sessionKey) {
      return;
    }
    if (this.visibleSince !== null) {
      const now = performance.now();
      this.visibleDurationMs += Math.max(0, now - this.visibleSince);
      this.visibleSince = now;
    }
    const body = JSON.stringify({
      durationMs: Math.round(this.visibleDurationMs),
      ended,
    });
    writeSessionValue(DURATION_KEY, String(Math.round(this.visibleDurationMs)));
    const url = `${getApiBaseUrl()}/v1/analytics/sessions/${encodeURIComponent(this.sessionKey)}/activity`;

    if (ended && typeof navigator.sendBeacon === "function") {
      try {
        if (navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))) {
          return;
        }
      } catch {
        // 继续使用 keepalive fetch。
      }
    }

    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      });
    } catch {
      // Activity 丢失不影响剧情；下一次上报会携带累计最大值。
    }
  }
}

export const analyticsClient = new AnalyticsClient();
