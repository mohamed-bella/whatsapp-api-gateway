export interface WebhookMessageData {
  messageId: string;
  from: string;
  message: string;
  type: string;
  [key: string]: any;
}

export interface WebhookEventPayload {
  event: string;
  timestamp: number;
  data: WebhookMessageData;
}
