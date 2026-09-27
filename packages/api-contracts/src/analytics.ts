export type AnalyticsEventTypeDto =
  | "page_view"
  | "landing_cta_clicked"
  | "node_entered"
  | "video_completed"
  | "choice_selected"
  | "ending_completed"
  | "payment_clicked";

export interface CreateAnalyticsSessionRequest {
  sessionKey: string;
  landingPath: string;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
}

export interface AnalyticsSessionDto {
  sessionKey: string;
  firstEnteredAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  durationMs: number;
}

export interface UpdateAnalyticsActivityRequest {
  durationMs: number;
  ended?: boolean;
}

export interface CreateAnalyticsEventRequest {
  eventId: string;
  eventKey: string;
  sessionKey: string;
  eventType: AnalyticsEventTypeDto;
  occurredAt: string;
  chapterCode?: string | null;
  nodeCode?: string | null;
  choiceCode?: string | null;
  targetNodeCode?: string | null;
  endingCode?: string | null;
  offerCode?: string | null;
  priceMinor?: number | null;
  currency?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
}

export interface CreateAnalyticsEventResponse {
  accepted: true;
  eventId: string;
  deduplicated: boolean;
}

export interface AnalyticsFunnelQuery {
  chapterCode?: string;
  from?: string;
  to?: string;
  utmSource?: string;
}

export interface AnalyticsFunnelStepDto {
  eventType: AnalyticsEventTypeDto;
  uniqueSessions: number;
  totalEvents: number;
  conversionRate: number;
}

export interface AnalyticsFunnelSourceDto {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  sessions: number;
  averageDurationMs: number;
  nodeEntered: number;
  endingCompleted: number;
  paymentClicked: number;
  endingCompletionRate: number;
  paymentClickRate: number;
}

export interface AnalyticsFunnelNodeDto {
  nodeCode: string;
  nodeTitle: string;
  nodeType: "video" | "choice" | "ending";
  entered: number;
  videoCompleted: number;
  videoCompletionRate: number;
  choiceSelected: number;
  endingCompleted: number;
}

export interface AnalyticsFunnelChoiceDto {
  nodeCode: string;
  choiceCode: string;
  choiceLabel: string;
  targetNodeCode: string;
  uniqueSessions: number;
  totalEvents: number;
  selectionRate: number;
}

export interface AnalyticsFunnelSummaryDto {
  landingViews: number;
  landingCtaClicks: number;
  landingCtaClickRate: number;
  nodeEntered: number;
  entryNodeCode: string | null;
  entryVideoCompletionRate: number;
  endingCompleted: number;
  endingCompletionRate: number;
  paymentClicked: number;
  paymentClickRate: number;
  paymentSessionRate: number;
}

export interface AnalyticsFunnelDto {
  filters: {
    chapterCode: string | null;
    from: string | null;
    to: string | null;
    utmSource: string | null;
  };
  sessions: number;
  averageDurationMs: number;
  summary: AnalyticsFunnelSummaryDto;
  steps: AnalyticsFunnelStepDto[];
  sources: AnalyticsFunnelSourceDto[];
  nodes: AnalyticsFunnelNodeDto[];
  choices: AnalyticsFunnelChoiceDto[];
}

export interface TestPaymentOfferDto {
  code: string;
  chapterCode: string;
  triggerNodeCode: string;
  title: string;
  description: string | null;
  buttonLabel: string;
  priceMinor: number;
  currency: string;
}
