# WhatsApp API Gateway — Live Production Credentials & Documentation

This document contains all production URLs, credentials, tokens, database connection strings, and code examples for your live WhatsApp Gateway deployed on Coolify.

---

## 🌐 Live System URLs

| Service | URL | Description |
| :--- | :--- | :--- |
| **Web Dashboard** | [http://oh7zhjgm4frt4vhfzpslame9.46.225.98.116.sslip.io/dashboard](http://oh7zhjgm4frt4vhfzpslame9.46.225.98.116.sslip.io/dashboard) | Live status, QR code, token management & session backup |
| **Swagger API Docs** | [http://oh7zhjgm4frt4vhfzpslame9.46.225.98.116.sslip.io/api-docs](http://oh7zhjgm4frt4vhfzpslame9.46.225.98.116.sslip.io/api-docs) | Interactive Swagger UI documentation |
| **System Health** | [http://oh7zhjgm4frt4vhfzpslame9.46.225.98.116.sslip.io/health](http://oh7zhjgm4frt4vhfzpslame9.46.225.98.116.sslip.io/health) | Real-time healthcheck endpoint |
| **Gateway Status** | [http://oh7zhjgm4frt4vhfzpslame9.46.225.98.116.sslip.io/api/v1/status](http://oh7zhjgm4frt4vhfzpslame9.46.225.98.116.sslip.io/api/v1/status) | Socket state and connected phone number |
| **GitHub Repo** | [https://github.com/mohamed-bella/whatsapp-api-gateway](https://github.com/mohamed-bella/whatsapp-api-gateway) | Production source code repository |

---

## 📱 Connected WhatsApp Account

* **Account Name**: Rentiq System
* **Connected Phone Number**: `+212 711 567 129`
* **Persistent Storage**: `/data/baileys-auth` (Mounted volume on Coolify)
* **Architecture**: Single-account 24/7 WebSocket connection via Baileys (no Chromium)

---

## 🔑 Authentication & API Tokens

All requests to `/api/v1/send*` endpoints require:
```http
Authorization: Bearer <API_TOKEN>
```
*(Query parameters like `?token=` are strictly rejected).*

### Active API Tokens:

1. **Morocco Travel Experts Token**:
   ```text
   wgw_live_8e75a7fd0c5a7448d1e7b7d2eb52b17ffd0875bd5c5fc15c
   ```

2. **Master Development / Admin Token**:
   ```text
   dev_token
   ```

---

## 🗄 PostgreSQL Database Credentials

### 1. Internal URL (For Coolify Container Environment)
Use this inside the Coolify **Environment Variables** tab:
```env
DATABASE_URL="postgresql://postgres:jdslFMgMiOPY7cljDh5v8Scnr5my5z9OJuQ2L9LVzU62S1hYYN5wxhCf4IqPvVWT@postgresql-database-hrwdoszrjq0nzpofhawl4oyr:5432/postgres?schema=public"
```

### 2. External URL (For TablePlus, DBeaver, pgAdmin from your PC)
Connect to the database remotely from your local computer:
```text
Host:      46.225.98.116
Port:      9121
Database:  postgres
User:      postgres
Password:  jdslFMgMiOPY7cljDh5v8Scnr5my5z9OJuQ2L9LVzU62S1hYYN5wxhCf4IqPvVWT
Full URI:  postgresql://postgres:jdslFMgMiOPY7cljDh5v8Scnr5my5z9OJuQ2L9LVzU62S1hYYN5wxhCf4IqPvVWT@46.225.98.116:9121/postgres?schema=public
```

---

## 🚀 API Quick Start Examples

### 1. Send Text Message

#### cURL
```bash
curl -X POST http://oh7zhjgm4frt4vhfzpslame9.46.225.98.116.sslip.io/api/v1/send \
  -H "Authorization: Bearer wgw_live_8e75a7fd0c5a7448d1e7b7d2eb52b17ffd0875bd5c5fc15c" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+212 612-345678",
    "message": "Hello! Your booking quotation is ready."
  }'
```

#### Node.js / TypeScript (fetch)
```typescript
const response = await fetch('http://oh7zhjgm4frt4vhfzpslame9.46.225.98.116.sslip.io/api/v1/send', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer wgw_live_8e75a7fd0c5a7448d1e7b7d2eb52b17ffd0875bd5c5fc15c',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    to: '212612345678',
    message: 'Hello from RentIQ / Morocco Travel Experts!'
  })
});
const data = await response.json();
console.log(data); // { success: true, messageId: "...", to: "212612345678" }
```

#### PHP (cURL)
```php
<?php
$ch = curl_init('http://oh7zhjgm4frt4vhfzpslame9.46.225.98.116.sslip.io/api/v1/send');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer wgw_live_8e75a7fd0c5a7448d1e7b7d2eb52b17ffd0875bd5c5fc15c',
        'Content-Type: application/json'
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'to' => '212612345678',
        'message' => 'Your confirmation number is #12345'
    ])
]);
$response = curl_exec($ch);
curl_close($ch);
echo $response;
```

#### Python (requests)
```python
import requests

url = "http://oh7zhjgm4frt4vhfzpslame9.46.225.98.116.sslip.io/api/v1/send"
headers = {
    "Authorization": "Bearer wgw_live_8e75a7fd0c5a7448d1e7b7d2eb52b17ffd0875bd5c5fc15c",
    "Content-Type": "application/json"
}
payload = {
    "to": "212612345678",
    "message": "Hello from Python!"
}

res = requests.post(url, json=payload, headers=headers)
print(res.json())
```

---

### 2. Send Image Message

```http
POST /api/v1/send/image
Authorization: Bearer wgw_live_8e75a7fd0c5a7448d1e7b7d2eb52b17ffd0875bd5c5fc15c
Content-Type: application/json

{
  "to": "212612345678",
  "url": "https://example.com/voucher.jpg",
  "caption": "Your booking confirmation voucher"
}
```

---

### 3. Send PDF / Document Message

```http
POST /api/v1/send/document
Authorization: Bearer wgw_live_8e75a7fd0c5a7448d1e7b7d2eb52b17ffd0875bd5c5fc15c
Content-Type: application/json

{
  "to": "212612345678",
  "url": "https://example.com/quotation.pdf",
  "filename": "quotation.pdf",
  "caption": "Your requested quotation",
  "mimetype": "application/pdf"
}
```

---

## 🪝 Receiving Customer Messages (Webhook)

When a customer sends a message to your WhatsApp number `+212 711 567 129`, the gateway forwards the message to your configured `WEBHOOK_URL` with an HMAC-SHA256 signature header:

```http
X-Webhook-Signature: sha256=<hex_hmac>
Content-Type: application/json

{
  "event": "message.received",
  "timestamp": 1789912345,
  "data": {
    "messageId": "3EB0ABC12345",
    "from": "212612345678",
    "message": "Hi, I have a question about my booking.",
    "type": "text"
  }
}
```

---

## 💾 Backups & Session Persistence

* **Session Backup (ZIP)**: Download directly from [http://oh7zhjgm4frt4vhfzpslame9.46.225.98.116.sslip.io/dashboard](http://oh7zhjgm4frt4vhfzpslame9.46.225.98.116.sslip.io/dashboard) $\to$ **Backup ZIP**.
* **Session Restore**: Upload your backup `.zip` at any time to migrate or recover your account instantly.
* **Session Reset**: Click **Reset Session** on the dashboard to unlink the current WhatsApp account and generate a fresh QR code.
