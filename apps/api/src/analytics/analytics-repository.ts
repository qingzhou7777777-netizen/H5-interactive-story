import type {
  AnalyticsFunnelDto,
  AnalyticsFunnelQuery,
  AnalyticsSessionDto,
  CreateAnalyticsEventRequest,
  CreateAnalyticsEventResponse,
  CreateAnalyticsSessionRequest,
  UpdateAnalyticsActivityRequest,
} from "@interactive-story/api-contracts";

export interface AnalyticsRepository {
  createSession(input: CreateAnalyticsSessionRequest): Promise<AnalyticsSessionDto>;
  updateActivity(
    sessionKey: string,
    input: UpdateAnalyticsActivityRequest,
  ): Promise<AnalyticsSessionDto | null>;
  recordEvent(
    input: CreateAnalyticsEventRequest,
  ): Promise<CreateAnalyticsEventResponse | null>;
  getFunnel(query: AnalyticsFunnelQuery): Promise<AnalyticsFunnelDto>;
}
