import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  WAMessage
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import AdmZip from 'adm-zip';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { toWhatsAppJid, fromWhatsAppJid } from './phone';
import {
  SendDocumentMessageOptions,
  SendImageMessageOptions,
  SendMessageResult,
  SendTextMessageOptions,
  WhatsAppClientStatus,
  WhatsAppConnectionStatus
} from './types';

export type IncomingMessageHandler = (data: {
  messageId: string;
  from: string;
  message: string;
  type: string;
  timestamp: number;
  rawMessage: WAMessage;
}) => Promise<void>;

export type StatusChangeHandler = (status: WhatsAppClientStatus) => void;

export class WhatsAppClient {
  private static instance: WhatsAppClient;
  private sock: WASocket | null = null;
  private authDir: string;
  private status: WhatsAppConnectionStatus = 'idle';
  private currentQr: string | null = null;
  private currentQrDataUrl: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private phone: string | undefined;
  private pushName: string | undefined;
  private lastConnectedAt: Date | undefined;
  private lastDisconnectedAt: Date | undefined;
  private disconnectReason: string | undefined;

  private messageHandlers: IncomingMessageHandler[] = [];
  private statusListeners: StatusChangeHandler[] = [];

  private constructor() {
    this.authDir = path.resolve(process.cwd(), env.AUTH_DIR);
    this.ensureAuthDir();
  }

  public static getInstance(): WhatsAppClient {
    if (!WhatsAppClient.instance) {
      WhatsAppClient.instance = new WhatsAppClient();
    }
    return WhatsAppClient.instance;
  }

  private ensureAuthDir(): void {
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
      logger.info({ authDir: this.authDir }, 'Created WhatsApp authentication directory');
    }
  }

  /**
   * Initializes the Baileys socket.
   */
  public async init(): Promise<void> {
    if (this.sock) {
      logger.warn('WhatsApp socket already initialized');
      return;
    }

    this.ensureAuthDir();
    this.setStatus('connecting');
    logger.info({ authDir: this.authDir }, 'Initializing WhatsApp socket...');

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      // Create a quiet logger for Baileys internal logs to avoid noisy credential dumps
      const baileysLogger = logger.child({ module: 'baileys' });
      baileysLogger.level = 'warn';

      this.sock = makeWASocket({
        auth: state,
        logger: baileysLogger as any,
        printQRInTerminal: false,
        browser: ['WhatsApp Gateway', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000
      });

      // Crucial: persist updated credentials & Signal keys
      this.sock.ev.on('creds.update', async () => {
        try {
          await saveCreds();
        } catch (err: any) {
          logger.error({ err: err.message }, 'Failed to save WhatsApp credentials');
        }
      });

      // Listen for connection status updates
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.currentQr = qr;
          try {
            this.currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
          } catch (err) {
            this.currentQrDataUrl = null;
          }
          this.setStatus('qr');
          logger.info('New WhatsApp QR code generated. Available on dashboard.');
        }

        if (connection === 'connecting') {
          this.setStatus('connecting');
        } else if (connection === 'open') {
          this.reconnectAttempts = 0;
          this.currentQr = null;
          this.currentQrDataUrl = null;
          this.lastConnectedAt = new Date();
          this.disconnectReason = undefined;

          if (this.sock?.user) {
            this.phone = fromWhatsAppJid(this.sock.user.id);
            this.pushName = this.sock.user.name || undefined;
          }

          this.setStatus('open');
          logger.info(
            { phone: this.phone, pushName: this.pushName },
            'WhatsApp connection opened successfully'
          );
        } else if (connection === 'close') {
          this.lastDisconnectedAt = new Date();
          const boomError = lastDisconnect?.error as Boom | undefined;
          const statusCode = boomError?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          const isRestartRequired = statusCode === DisconnectReason.restartRequired;

          this.disconnectReason = boomError?.message || `Disconnect statusCode: ${statusCode}`;
          logger.warn(
            { statusCode, isLoggedOut, isRestartRequired, reason: this.disconnectReason },
            'WhatsApp connection closed'
          );

          if (isLoggedOut) {
            this.setStatus('loggedOut');
            logger.warn('WhatsApp session logged out. Manual re-authentication required.');
            this.cleanupSocket();
          } else {
            this.setStatus('close');
            if (!this.isShuttingDown) {
              // If WhatsApp requests restart, reconnect immediately; otherwise use exponential backoff
              this.scheduleReconnect(isRestartRequired);
            }
          }
        }
      });

      // Start 24/7 background heartbeat monitor
      this.startHeartbeat();

      // Listen for incoming messages
      this.sock.ev.on('messages.upsert', async (upsert) => {
        // Only process new live incoming notifications
        if (upsert.type !== 'notify') {
          return;
        }

        for (const msg of upsert.messages) {
          // Ignore messages sent by our own connected account
          if (msg.key.fromMe) {
            continue;
          }

          // Ignore status broadcasts
          if (msg.key.remoteJid === 'status@broadcast') {
            continue;
          }

          try {
            await this.handleIncomingMessage(msg);
          } catch (err: any) {
            logger.error({ err: err.message, messageId: msg.key.id }, 'Error processing incoming message');
          }
        }
      });
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to initialize WhatsApp socket');
      this.setStatus('close');
      if (!this.isShuttingDown) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Exponential backoff reconnect logic with optional immediate reconnect.
   */
  private scheduleReconnect(immediate = false): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.reconnectAttempts++;
    // If immediate (e.g. restartRequired), wait only 500ms; otherwise exponential backoff: min 2s, max 60s
    const delay = immediate ? 500 : Math.min(2000 * Math.pow(1.5, this.reconnectAttempts - 1), 60000);

    logger.info(
      { attempt: this.reconnectAttempts, delayMs: Math.round(delay), immediate },
      'Scheduling WhatsApp reconnect...'
    );

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      this.cleanupSocket();
      await this.init();
    }, delay);
  }

  private heartbeatInterval: NodeJS.Timeout | null = null;

  /**
   * Periodically checks the WebSocket connection health (every 30s)
   * to automatically heal any silent connection drops or zombie sockets.
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      if (this.isShuttingDown) return;
      if (this.status === 'open' && this.sock) {
        try {
          const ws = (this.sock as any).ws;
          if (ws && ws.readyState !== 1) { // 1 = OPEN
            logger.warn({ readyState: ws?.readyState }, 'Heartbeat detected dead socket. Triggering reconnect...');
            this.scheduleReconnect(true);
          }
        } catch {
          // ignore heartbeat check error
        }
      }
    }, 30000);
  }

  private cleanupSocket(): void {
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        this.sock.end(undefined);
      } catch (err) {
        // ignore socket cleanup error
      }
      this.sock = null;
    }
  }

  /**
   * Processes an incoming message and invokes registered handlers.
   */
  private async handleIncomingMessage(msg: WAMessage): Promise<void> {
    if (!msg.message || !msg.key.remoteJid) {
      return;
    }

    const messageId = msg.key.id || '';
    const from = fromWhatsAppJid(msg.key.remoteJid);
    const timestamp = Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000);

    let messageText = '';
    let messageType = 'text';

    if (msg.message.conversation) {
      messageText = msg.message.conversation;
      messageType = 'text';
    } else if (msg.message.extendedTextMessage?.text) {
      messageText = msg.message.extendedTextMessage.text;
      messageType = 'text';
    } else if (msg.message.imageMessage) {
      messageType = 'image';
      messageText = msg.message.imageMessage.caption || '';
    } else if (msg.message.documentMessage) {
      messageType = 'document';
      messageText = msg.message.documentMessage.caption || '';
    } else if (msg.message.videoMessage) {
      messageType = 'video';
      messageText = msg.message.videoMessage.caption || '';
    } else if (msg.message.audioMessage) {
      messageType = 'audio';
    } else {
      messageType = 'other';
    }

    logger.info(
      { messageId, from, type: messageType },
      'Incoming WhatsApp message received'
    );

    const payload = {
      messageId,
      from,
      message: messageText,
      type: messageType,
      timestamp,
      rawMessage: msg
    };

    for (const handler of this.messageHandlers) {
      try {
        await handler(payload);
      } catch (handlerErr: any) {
        logger.error({ err: handlerErr.message }, 'Incoming message handler failed');
      }
    }
  }

  /**
   * Registers a handler for incoming WhatsApp messages.
   */
  public onMessage(handler: IncomingMessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Registers a listener for connection status changes.
   */
  public onStatusChange(listener: StatusChangeHandler): void {
    this.statusListeners.push(listener);
  }

  private setStatus(newStatus: WhatsAppConnectionStatus): void {
    this.status = newStatus;
    const currentStatus = this.getStatus();
    for (const listener of this.statusListeners) {
      try {
        listener(currentStatus);
      } catch (err) {
        // ignore listener errors
      }
    }
  }

  /**
   * Returns current status snapshot.
   */
  public getStatus(): WhatsAppClientStatus {
    return {
      connected: this.status === 'open',
      status: this.status,
      phone: this.phone,
      pushName: this.pushName,
      qrCode: this.currentQrDataUrl || undefined,
      reconnectAttempts: this.reconnectAttempts,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
      disconnectReason: this.disconnectReason
    };
  }

  /**
   * Sends a simple text message.
   */
  public async sendTextMessage(options: SendTextMessageOptions): Promise<SendMessageResult> {
    if (!this.sock || this.status !== 'open') {
      const err: any = new Error('WhatsApp is currently not connected.');
      err.code = 'WHATSAPP_NOT_CONNECTED';
      throw err;
    }

    const jid = toWhatsAppJid(options.to);
    const result = await this.sock.sendMessage(jid, {
      text: options.message
    });

    const messageId = result?.key?.id || '';
    logger.info({ messageId, to: options.to }, 'WhatsApp text message sent');

    return {
      success: true,
      messageId,
      to: options.to
    };
  }

  /**
   * Sends an image message with optional caption.
   */
  public async sendImageMessage(options: SendImageMessageOptions): Promise<SendMessageResult> {
    if (!this.sock || this.status !== 'open') {
      const err: any = new Error('WhatsApp is currently not connected.');
      err.code = 'WHATSAPP_NOT_CONNECTED';
      throw err;
    }

    const jid = toWhatsAppJid(options.to);
    const result = await this.sock.sendMessage(jid, {
      image: { url: options.url },
      caption: options.caption
    });

    const messageId = result?.key?.id || '';
    logger.info({ messageId, to: options.to }, 'WhatsApp image message sent');

    return {
      success: true,
      messageId,
      to: options.to
    };
  }

  /**
   * Sends a document message with optional caption.
   */
  public async sendDocumentMessage(options: SendDocumentMessageOptions): Promise<SendMessageResult> {
    if (!this.sock || this.status !== 'open') {
      const err: any = new Error('WhatsApp is currently not connected.');
      err.code = 'WHATSAPP_NOT_CONNECTED';
      throw err;
    }

    const jid = toWhatsAppJid(options.to);
    const result = await this.sock.sendMessage(jid, {
      document: { url: options.url },
      fileName: options.filename,
      caption: options.caption,
      mimetype: options.mimetype || 'application/octet-stream'
    });

    const messageId = result?.key?.id || '';
    logger.info({ messageId, to: options.to, filename: options.filename }, 'WhatsApp document message sent');

    return {
      success: true,
      messageId,
      to: options.to
    };
  }

  /**
   * Exports the entire auth directory as a ZIP buffer for backup/migration.
   */
  public exportSessionZip(): Buffer {
    if (!fs.existsSync(this.authDir)) {
      throw new Error('No authentication directory found to export');
    }
    const zip = new AdmZip();
    zip.addLocalFolder(this.authDir);
    return zip.toBuffer();
  }

  /**
   * Imports and restores an authentication session from a ZIP buffer.
   */
  public async importSessionZip(zipBuffer: Buffer): Promise<void> {
    logger.info('Importing WhatsApp authentication session from backup...');
    this.cleanupSocket();

    // Clear existing auth files
    if (fs.existsSync(this.authDir)) {
      fs.rmSync(this.authDir, { recursive: true, force: true });
    }
    this.ensureAuthDir();

    // Extract zip contents into authDir
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(this.authDir, true);

    logger.info({ authDir: this.authDir }, 'Session archive extracted successfully');

    // Re-initialize socket with imported credentials
    this.reconnectAttempts = 0;
    this.phone = undefined;
    this.pushName = undefined;
    this.currentQr = null;
    this.currentQrDataUrl = null;
    await this.init();
  }

  /**
   * Manually resets session (e.g. from Dashboard if user wishes to unlink or after loggedOut).
   */
  public async resetSession(): Promise<void> {
    logger.warn('Resetting WhatsApp session auth data...');
    this.cleanupSocket();

    if (fs.existsSync(this.authDir)) {
      try {
        fs.rmSync(this.authDir, { recursive: true, force: true });
        logger.info({ authDir: this.authDir }, 'Authentication directory cleared');
      } catch (err: any) {
        logger.error({ err: err.message }, 'Failed to clear auth directory');
      }
    }

    this.ensureAuthDir();
    this.reconnectAttempts = 0;
    this.phone = undefined;
    this.pushName = undefined;
    this.currentQr = null;
    this.currentQrDataUrl = null;
    await this.init();
  }

  /**
   * Gracefully shuts down the socket.
   */
  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.cleanupSocket();
    this.setStatus('close');
    logger.info('WhatsApp socket shut down cleanly');
  }
}

export const whatsAppClient = WhatsAppClient.getInstance();
