export type WhatsAppConnectionStatus = 
  | 'idle'
  | 'connecting'
  | 'qr'
  | 'open'
  | 'close'
  | 'loggedOut';

export interface WhatsAppClientStatus {
  connected: boolean;
  status: WhatsAppConnectionStatus;
  phone?: string;
  pushName?: string;
  qrCode?: string; // Raw QR string or base64 data URL
  reconnectAttempts: number;
  lastConnectedAt?: Date;
  lastDisconnectedAt?: Date;
  disconnectReason?: string;
}

export interface SendTextMessageOptions {
  to: string;
  message: string;
}

export interface SendImageMessageOptions {
  to: string;
  url: string;
  caption?: string;
}

export interface SendDocumentMessageOptions {
  to: string;
  url: string;
  filename: string;
  caption?: string;
  mimetype?: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId: string;
  to: string;
}
