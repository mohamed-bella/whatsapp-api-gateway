import { Router, Request, Response } from 'express';
import { whatsAppClient } from '../whatsapp/client';
import { prisma } from '../database/prisma';
import { tokenService } from '../auth/tokenService';
import { env } from '../config/env';

const router = Router();

/**
 * SSE endpoint for live status updates on the dashboard.
 */
router.get('/sse', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendUpdate = () => {
    const status = whatsAppClient.getStatus();
    res.write(`data: ${JSON.stringify(status)}\n\n`);
  };

  // Send initial state immediately
  sendUpdate();

  // Listen for real-time status changes
  const unsubscribe = (status: any) => {
    res.write(`data: ${JSON.stringify(status)}\n\n`);
  };
  whatsAppClient.onStatusChange(unsubscribe);

  // Periodic heartbeat every 5s
  const interval = setInterval(sendUpdate, 5000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

/**
 * JSON status endpoint for dashboard polling.
 */
router.get('/api/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    whatsapp: whatsAppClient.getStatus()
  });
});

/**
 * Action: Restart/reconnect socket.
 */
router.post('/api/reconnect', async (_req: Request, res: Response) => {
  try {
    await whatsAppClient.init();
    res.json({ success: true, message: 'Reconnecting initiated' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * Action: Export/Download session as a zip archive.
 */
router.get('/api/session/export', (_req: Request, res: Response) => {
  try {
    const zipBuffer = whatsAppClient.exportSessionZip();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="whatsapp-session-backup.zip"');
    res.send(zipBuffer);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Action: Import/Upload session from a zip archive.
 */
router.post('/api/session/import', upload.single('session'), async (req: Request, res: Response) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'No zip file uploaded' });
    }
    await whatsAppClient.importSessionZip(req.file.buffer);
    res.json({ success: true, message: 'Session restored successfully from backup' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Action: Reset session (unlink / clear credentials).
 */
router.post('/api/reset', async (_req: Request, res: Response) => {
  try {
    await whatsAppClient.resetSession();
    res.json({ success: true, message: 'Session reset. Fresh QR will generate.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Main dashboard HTML view.
 */
router.get('/', async (_req: Request, res: Response) => {
  let recentMessages: any[] = [];
  let tokens: any[] = [];

  try {
    recentMessages = await prisma.message.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' }
    });
    tokens = await tokenService.listTokens();
  } catch {
    // Database might still be initializing
  }

  const status = whatsAppClient.getStatus();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp API Gateway Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @keyframes pulse-fast { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .pulse-fast { animation: pulse-fast 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
  </style>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen">
  <div class="max-w-6xl mx-auto px-4 py-8">
    <!-- Header -->
    <header class="flex flex-wrap items-center justify-between border-b border-slate-800 pb-6 mb-8 gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
          <span class="p-2 bg-emerald-600 rounded-lg">
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
            </svg>
          </span>
          WhatsApp API Gateway
        </h1>
        <p class="text-sm text-slate-400 mt-1">Single-account enterprise messaging gateway powered by Baileys</p>
      </div>
      <div class="flex items-center gap-3">
        <a href="/api-docs" target="_blank" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-md border border-slate-700 transition">API Documentation</a>
        <a href="/health" target="_blank" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-md border border-slate-700 transition">Health Status</a>
      </div>
    </header>

    <!-- Main Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
      
      <!-- Connection Card -->
      <div class="lg:col-span-1 bg-slate-800/80 border border-slate-700 rounded-xl p-6 shadow-xl flex flex-col items-center text-center">
        <h2 class="text-lg font-semibold text-slate-100 mb-4 w-full text-left flex items-center justify-between">
          <span>WhatsApp Session</span>
          <span id="badge" class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            status.connected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }">${status.status.toUpperCase()}</span>
        </h2>

        <!-- Connected View -->
        <div id="connected-view" class="${status.connected ? '' : 'hidden'} my-auto py-6">
          <div class="w-20 h-20 mx-auto bg-emerald-500/10 border-2 border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-400 mb-4">
            <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <p class="text-lg font-bold text-white" id="connected-phone">${status.phone ? '+' + status.phone : 'Connected'}</p>
          <p class="text-xs text-emerald-400 mt-1 font-medium">Gateway Active & Ready</p>
          <p class="text-xs text-slate-400 mt-3 max-w-xs">All applications can now dispatch WhatsApp messages via HTTP requests.</p>
        </div>

        <!-- QR Code View -->
        <div id="qr-view" class="${!status.connected && status.qrCode ? '' : 'hidden'} my-auto py-2">
          <div class="bg-white p-3 rounded-xl shadow-lg inline-block mb-3">
            <img id="qr-img" src="${status.qrCode || ''}" alt="Scan WhatsApp QR" class="w-56 h-56 object-contain" />
          </div>
          <p class="text-sm font-semibold text-slate-200">Scan with WhatsApp</p>
          <p class="text-xs text-slate-400 mt-1">Open WhatsApp &gt; Linked Devices &gt; Link a Device</p>
        </div>

        <!-- Connecting / Logged Out View -->
        <div id="waiting-view" class="${!status.connected && !status.qrCode ? '' : 'hidden'} my-auto py-10">
          <div class="w-12 h-12 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p class="text-sm font-medium text-slate-300" id="waiting-text">Connecting to WhatsApp...</p>
          <p class="text-xs text-slate-400 mt-2" id="waiting-subtext">Initializing socket session</p>
        </div>

        <!-- Actions & Session Management -->
        <div class="w-full pt-4 mt-auto border-t border-slate-700 space-y-2">
          <div class="flex gap-2">
            <button onclick="reconnect()" class="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-xs font-semibold rounded-lg transition">
              Reconnect
            </button>
            <button onclick="resetSession()" class="flex-1 px-3 py-2 bg-rose-900/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 text-xs font-semibold rounded-lg transition">
              Reset Session
            </button>
          </div>
          <div class="flex gap-2">
            <button onclick="downloadSession()" class="flex-1 px-3 py-1.5 bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 border border-blue-800/50 text-xs font-medium rounded-lg transition flex items-center justify-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              Backup ZIP
            </button>
            <label class="flex-1 px-3 py-1.5 bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50 text-xs font-medium rounded-lg transition flex items-center justify-center gap-1 cursor-pointer">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12"></path></svg>
              Upload ZIP
              <input type="file" accept=".zip" onchange="uploadSession(event)" class="hidden" />
            </label>
          </div>
        </div>
      </div>

      <!-- System Overview -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Quick stats -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-5">
            <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Gateway Model</span>
            <p class="text-xl font-bold text-white mt-1">Single Account</p>
            <p class="text-xs text-slate-400 mt-0.5">Unified business dispatcher</p>
          </div>
          <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-5">
            <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Webhook URL</span>
            <p class="text-sm font-medium text-white truncate mt-1">${env.WEBHOOK_URL || 'Not configured'}</p>
            <p class="text-xs text-slate-400 mt-0.5">HMAC-SHA256 Signed</p>
          </div>
          <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-5">
            <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active API Tokens</span>
            <p class="text-xl font-bold text-emerald-400 mt-1">${tokens.filter(t => t.active).length}</p>
            <p class="text-xs text-slate-400 mt-0.5">Authorized consumers</p>
          </div>
        </div>

        <!-- API Tokens Card -->
        <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-6 shadow-xl">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-slate-100">API Tokens</h2>
            <button onclick="createTokenPrompt()" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white rounded-lg transition flex items-center gap-1.5">
              <span>+ Create Token</span>
            </button>
          </div>
          
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="text-xs uppercase text-slate-400 border-b border-slate-700">
                <tr>
                  <th class="pb-2">Name</th>
                  <th class="pb-2">Token Prefix</th>
                  <th class="pb-2">Status</th>
                  <th class="pb-2">Created</th>
                  <th class="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-700/50">
                ${tokens.length === 0 ? `<tr><td colspan="5" class="py-4 text-center text-slate-400 text-xs">No tokens created yet. Click "+ Create Token" above.</td></tr>` : ''}
                ${tokens.map(t => `
                  <tr>
                    <td class="py-3 font-medium text-white">${t.name}</td>
                    <td class="py-3 text-slate-400 font-mono text-xs">${t.tokenPrefix}</td>
                    <td class="py-3">
                      <span class="px-2 py-0.5 rounded text-xs font-semibold ${t.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}">
                        ${t.active ? 'Active' : 'Revoked'}
                      </span>
                    </td>
                    <td class="py-3 text-slate-400 text-xs">${new Date(t.createdAt).toLocaleDateString()}</td>
                    <td class="py-3 text-right">
                      ${t.active ? `<button onclick="revokeToken('${t.id}')" class="text-xs text-rose-400 hover:underline">Revoke</button>` : `<span class="text-xs text-slate-400">Revoked</span>`}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Recent Messages Card -->
        <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-6 shadow-xl">
          <h2 class="text-lg font-semibold text-slate-100 mb-4">Recent Messages</h2>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="text-xs uppercase text-slate-400 border-b border-slate-700">
                <tr>
                  <th class="pb-2">Direction</th>
                  <th class="pb-2">Target</th>
                  <th class="pb-2">Type</th>
                  <th class="pb-2">Status</th>
                  <th class="pb-2">Time</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-700/50">
                ${recentMessages.length === 0 ? `<tr><td colspan="5" class="py-4 text-center text-slate-400 text-xs">No message records yet.</td></tr>` : ''}
                ${recentMessages.map(m => `
                  <tr>
                    <td class="py-3">
                      <span class="text-xs font-medium px-2 py-0.5 rounded ${m.direction === 'OUTBOUND' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}">
                        ${m.direction}
                      </span>
                    </td>
                    <td class="py-3 text-slate-200 font-mono text-xs">${m.direction === 'OUTBOUND' ? m.to : m.from}</td>
                    <td class="py-3 text-slate-400 text-xs capitalize">${m.type}</td>
                    <td class="py-3">
                      <span class="text-xs font-medium px-2 py-0.5 rounded ${
                        m.status === 'SENT' ? 'bg-emerald-500/20 text-emerald-400' :
                        m.status === 'FAILED' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                      }">
                        ${m.status}
                      </span>
                    </td>
                    <td class="py-3 text-slate-400 text-xs">${new Date(m.createdAt).toLocaleTimeString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  </div>

  <script>
    const eventSource = new EventSource('/dashboard/sse');
    const badge = document.getElementById('badge');
    const connectedView = document.getElementById('connected-view');
    const qrView = document.getElementById('qr-view');
    const waitingView = document.getElementById('waiting-view');
    const qrImg = document.getElementById('qr-img');
    const connectedPhone = document.getElementById('connected-phone');
    const waitingText = document.getElementById('waiting-text');

    eventSource.onmessage = (event) => {
      const state = JSON.parse(event.data);
      updateUI(state);
    };

    function updateUI(state) {
      badge.textContent = state.status.toUpperCase();

      if (state.connected) {
        badge.className = 'px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        connectedView.classList.remove('hidden');
        qrView.classList.add('hidden');
        waitingView.classList.add('hidden');
        connectedPhone.textContent = state.phone ? '+' + state.phone : 'Connected';
      } else if (state.qrCode) {
        badge.className = 'px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30';
        connectedView.classList.add('hidden');
        qrView.classList.remove('hidden');
        waitingView.classList.add('hidden');
        qrImg.src = state.qrCode;
      } else {
        badge.className = 'px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/20 text-slate-400 border border-slate-500/30';
        connectedView.classList.add('hidden');
        qrView.classList.add('hidden');
        waitingView.classList.remove('hidden');
        if (state.status === 'loggedOut') {
          waitingText.textContent = 'Session logged out. Click Reset Session to re-authenticate.';
        } else {
          waitingText.textContent = 'Connecting to WhatsApp...';
        }
      }
    }

    async function reconnect() {
      await fetch('/dashboard/api/reconnect', { method: 'POST' });
    }

    async function resetSession() {
      if (confirm('Are you sure you want to reset the WhatsApp session? You will need to re-scan a new QR code.')) {
        await fetch('/dashboard/api/reset', { method: 'POST' });
      }
    }

    function downloadSession() {
      window.location.href = '/dashboard/api/session/export';
    }

    async function uploadSession(e) {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('Uploading a session backup will replace the current WhatsApp session on this server. Continue?')) {
        e.target.value = '';
        return;
      }
      const formData = new FormData();
      formData.append('session', file);

      try {
        const res = await fetch('/dashboard/api/session/import', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          alert('Session restored successfully! Reconnecting...');
          window.location.reload();
        } else {
          alert('Upload failed: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Upload failed: ' + err.message);
      } finally {
        e.target.value = '';
      }
    }

    async function createTokenPrompt() {
      const name = prompt('Enter a name for this API Token (e.g. "Morocco Travel Experts", "RentIQ"):');
      if (!name) return;
      const adminKey = prompt('Enter Admin/Dashboard Password:');
      if (!adminKey) return;

      const res = await fetch('/api/v1/tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey
        },
        body: JSON.stringify({ name })
      });

      const data = await res.json();
      if (data.success) {
        prompt('Copy your API token now! It will not be shown again:', data.token.rawToken);
        window.location.reload();
      } else {
        alert('Failed: ' + (data.error?.message || 'Error'));
      }
    }

    async function revokeToken(id) {
      if (!confirm('Revoke this API token immediately?')) return;
      const adminKey = prompt('Enter Admin/Dashboard Password:');
      if (!adminKey) return;

      const res = await fetch('/api/v1/tokens/' + id, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey }
      });
      const data = await res.json();
      if (data.success) {
        window.location.reload();
      } else {
        alert('Failed: ' + (data.error?.message || 'Error'));
      }
    }
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

export default router;
