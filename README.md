# Production WhatsApp API Gateway

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-LTS-green.svg)](https://nodejs.org/)
[![Baileys](https://img.shields.io/badge/Baileys-6.7-purple.svg)](https://github.com/WhiskeySockets/Baileys)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)
[![Coolify](https://img.shields.io/badge/Deploy-Coolify-6B21A8.svg)](https://coolify.io/)

A high-performance, production-ready **single-account WhatsApp API Gateway** built with Node.js, TypeScript, and [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys).

Designed to run 24/7 on a Linux VPS via **Coolify + Docker**. Connect **ONE WhatsApp number** by scanning the QR code once, and allow all your websites, internal tools, and microservices (e.g. Morocco Travel Experts, RentIQ, eSIM, etc.) to dispatch and receive WhatsApp messages through a unified REST API.

---

## 🏛 Architecture

```text
Other Applications (RentIQ, eSIM, MTE, etc.)
                   │
                   ▼  Authorization: Bearer <API_TOKEN>
         ┌───────────────────┐
         │   REST API / v1   │
         └─────────┬─────────┘
                   │
         ┌─────────▼─────────┐
         │   Message Queue   │ ◄── Rate limiting & Throttling
         └─────────┬─────────┘
                   │
         ┌─────────▼─────────┐
         │  Baileys Client   │ ◄── Single long-lived socket
         └─────────┬─────────┘
                   │
    WebSocket (End-to-End Encrypted)
                   │
         ┌─────────▼─────────┐
         │ WhatsApp Account  │ (Single Phone Number)
         └───────────────────┘
                   │
         Incoming Customer Messages
                   │
         ┌─────────▼─────────┐
         │ Webhook Dispatch  │ ──► HMAC-SHA256 Signed HTTP POST
         └───────────────────┘
```

* **No Browser Overhead**: Uses Baileys direct WebSocket protocol—NO Puppeteer, Chromium, Selenium, or headless browsers.
* **Persistent Session**: Signal keys and credentials are stored in `/data/baileys-auth` and survive Docker recreations, Coolify redeployments, and VPS reboots.
* **Single Long-Lived Socket**: One persistent connection is kept alive; HTTP requests simply route messages through the active socket.
* **Continuous Credential Sync**: Listens to `sock.ev.on('creds.update', saveCreds)` continuously to ensure encryption keys are always up to date.

---

## 🚀 Coolify Deployment Guide

### 1. Add Application in Coolify
1. In your Coolify dashboard, select **Create Service** or **Application** > **Git Repository**.
2. Connect your Git repository containing this codebase.
3. Select **Docker Compose** or **Dockerfile** build pack (Coolify will detect the `Dockerfile`).

### 2. Configure Persistent Volume (CRITICAL)
In Coolify application settings:
1. Go to the **Storages** tab.
2. Add a persistent volume:
   * **Destination Path**: `/data`
   * **Host Path**: (auto-generated or e.g. `/data/whatsapp_gateway`)
   > ⚠️ **IMPORTANT**: If you do not attach a persistent volume to `/data`, your WhatsApp session will be lost when Coolify recreates the container!

### 3. Add PostgreSQL Database
1. Under your Coolify project, create a **PostgreSQL** database service.
2. Copy the Internal Connection String and set it as `DATABASE_URL` in your application environment.

### 4. Set Environment Variables
In Coolify's **Environment Variables** tab, define:

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgresql://postgres:password@postgres:5432/whatsapp_gateway?schema=public
AUTH_DIR=/data/baileys-auth
WEBHOOK_URL=https://your-business-domain.com/api/webhooks/whatsapp
WEBHOOK_SECRET=your_32_character_random_hmac_secret
DASHBOARD_PASSWORD=your_secure_admin_password
LOG_LEVEL=info
MESSAGE_RATE_LIMIT_PER_SEC=5
RATE_LIMIT_MAX=100
```

### 5. Deploy & Scan QR
1. Click **Deploy**.
2. Once deployment completes, visit `https://your-gateway-domain.com/dashboard`.
3. Scan the displayed QR code with your WhatsApp phone:
   * Open WhatsApp on phone > **Settings** (or 3 dots) > **Linked Devices** > **Link a Device**.
4. The dashboard will automatically update to **CONNECTED** displaying your phone number.

---

## 💻 Local Development Setup

### Prerequisites
* Node.js >= 20 LTS
* PostgreSQL (or use `docker compose up postgres -d`)

### Setup Instructions
```bash
# 1. Clone repository
git clone <repo-url>
cd general-whatsapp-bot

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your local PostgreSQL URL

# 4. Run Prisma database migrations
npx prisma migrate dev --name init

# 5. Start development server
npm run dev
```

Visit [http://localhost:3000/dashboard](http://localhost:3000/dashboard) to view the live dashboard and scan the QR code.

---

## 🔑 Managing API Tokens

Every API endpoint that sends messages requires Bearer token authentication:
```http
Authorization: Bearer wgw_live_xxxxxxxxxxxxxxxxxxxxxxxx
```
Query parameters (e.g. `?token=` or `?api_key=`) are strictly rejected.

### Method 1: Using the Dashboard
Open `/dashboard`, locate the **API Tokens** card, click **+ Create Token**, enter a name (e.g., `Morocco Travel Experts`), and supply your `DASHBOARD_PASSWORD`.

### Method 2: Using the CLI
```bash
# Create a new API token
npm run token:create "Morocco Travel Experts"

# List all active and revoked tokens
npm run token:list
```

---

## 📡 API Endpoints

Interactive Swagger documentation is available at `/api-docs`.

### 1. Send Text Message
```http
POST /api/v1/send
Authorization: Bearer YOUR_API_TOKEN
Content-Type: application/json

{
  "to": "+212 612-345678",
  "message": "Hello, your quotation is ready."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "messageId": "BAE5F123456789",
  "to": "212612345678"
}
```

### 2. Send Image Message
```http
POST /api/v1/send/image
Authorization: Bearer YOUR_API_TOKEN
Content-Type: application/json

{
  "to": "212612345678",
  "url": "https://example.com/voucher.jpg",
  "caption": "Your booking confirmation"
}
```

### 3. Send Document Message (PDF, DOCX, etc.)
```http
POST /api/v1/send/document
Authorization: Bearer YOUR_API_TOKEN
Content-Type: application/json

{
  "to": "212612345678",
  "url": "https://example.com/quotation.pdf",
  "filename": "quotation.pdf",
  "caption": "Your quotation",
  "mimetype": "application/pdf"
}
```

### 4. Health Check
```http
GET /health
```
```json
{
  "status": "ok",
  "database": "connected",
  "whatsapp": "connected",
  "uptime": 86400
}
```

### 5. Gateway Status
```http
GET /api/v1/status
```
```json
{
  "connected": true,
  "phone": "212612345678",
  "status": "open"
}
```

---

## 💾 Session Backup, Restore & Reset

The gateway allows you to export your active authenticated session and restore it on another VPS/container without re-scanning the QR code!

### 1. From the Web Dashboard
* **Backup Session (ZIP)**: Click **Backup ZIP** on the Dashboard to instantly download `whatsapp-session-backup.zip`.
* **Upload / Restore Session**: Click **Upload ZIP**, choose your backup zip, and the server will restore your credentials and reconnect automatically.
* **Reset Session**: Click **Reset Session** to wipe the local credentials and generate a fresh QR code.

### 2. From the CLI
```bash
# Export active session to zip
npm run session:export

# Restore session from zip
npm run session:import ./whatsapp-session-backup.zip
```

---

## 🛡 24/7 High-Availability & Self-Healing

* **Heartbeat Watchdog**: Inspects the WebSocket connection state every 30 seconds. If a silent connection drop or network freeze occurs, it triggers an immediate auto-reconnect.
* **Auto-Reconnect with Backoff**: Catches network drops (`ECONNRESET`, `ETIMEDOUT`) with exponential backoff and handles `DisconnectReason.restartRequired` with an immediate 500ms restart.
* **Process Crash Protection**: Global `uncaughtException` and `unhandledRejection` traps log structured errors via Pino and prevent unexpected process death.

---

## 🪝 Incoming Messages & Webhook Signature Verification

When a customer sends a message to the connected WhatsApp number, the gateway forwards an HTTP POST request to your `WEBHOOK_URL`.

### Webhook Payload
```json
{
  "event": "message.received",
  "timestamp": 1789912345,
  "data": {
    "messageId": "3EB0ABC1234567",
    "from": "212612345678",
    "message": "Hi, I would like to book a tour.",
    "type": "text"
  }
}
```

### Verifying Webhook Signature

The gateway attaches an HMAC-SHA256 signature in the request header:
```http
X-Webhook-Signature: sha256=<hex_signature>
```

#### Node.js / Express Example:
```typescript
import crypto from 'crypto';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/api/webhooks/whatsapp', (req, res) => {
  const secret = process.env.WEBHOOK_SECRET!;
  const signatureHeader = req.headers['x-webhook-signature'] as string;
  
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signatureHeader !== expectedSignature) {
    return res.status(401).send('Invalid signature');
  }

  const { event, data } = req.body;
  console.log(`Received message from ${data.from}: ${data.message}`);
  res.status(200).send('OK');
});
```

#### PHP Example:
```php
<?php
$secret = getenv('WEBHOOK_SECRET');
$signatureHeader = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '';
$payload = file_get_contents('php://input');

$expectedSignature = 'sha256=' . hash_hmac('sha256', $payload, $secret);

if (!hash_equals($expectedSignature, $signatureHeader)) {
    http_response_code(401);
    exit('Invalid signature');
}

$data = json_decode($payload, true);
// Process incoming message...
http_response_code(200);
echo 'OK';
```

---

## 🧪 Automated Testing

Automated test suite covers all components with Baileys and external services completely mocked:

```bash
# Run unit and integration tests
npm test

# Run tests in watch mode
npm run test:watch
```

Test coverage includes:
* Phone normalization (`+212...`, `00212...`, spaces, international digits)
* WhatsApp JID transformation (`212612345678@s.whatsapp.net`)
* API token creation, SHA-256 hashing, caching & revocation
* Strict query parameter rejection (`?token=`)
* Zod request body validation
* Message queue rate limiting & throttling
* HMAC-SHA256 webhook signatures & retry logic
* Health and status endpoints

---

## 🛑 Graceful Shutdown

The application intercepts `SIGTERM` and `SIGINT`:
1. Closes HTTP listener to prevent new incoming API requests.
2. Waits up to 10 seconds to drain active message queue operations.
3. Closes the WhatsApp Baileys socket cleanly (`sock.end(undefined)`).
4. Disconnects Prisma PostgreSQL client.
5. Exits cleanly without corrupting the authentication directory.
