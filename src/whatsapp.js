'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — WhatsApp (Baileys)
   Baileys est passé en ESM-only dans ses versions récentes.
   On utilise un dynamic import() pour rester compatible CommonJS.
   Si Baileys échoue à charger (ESM/network/permission), WhatsApp est
   DÉSACTIVÉ silencieusement — l'app continue normalement.
   ────────────────────────────────────────────────────────────────────── */

/* ── Silencer le bruit interne de libsignal/baileys ──────────────────── */
(() => {
  const NOISE = [
    'Closing session:', 'SessionEntry', 'Closing open session in favor',
    'No matching sessions found for message',
    'Removing old closed session', 'Old session being added',
    'Failed to decrypt message', 'Session error:', 'Bad MAC',
    'verifyMAC', 'doDecryptWhisperMessage', 'decryptWithSessions',
    'session_cipher.js', 'queue_job.js', 'libsignal',
  ];
  const _log  = console.log;
  const _err  = console.error;
  const _warn = console.warn;
  const _filter = (args) => {
    if (!args || !args.length) return false;
    for (const a of args) {
      const s = (a && a.stack) ? String(a.stack) : String(a == null ? '' : a);
      if (NOISE.some(n => s.includes(n))) return true;
    }
    return false;
  };
  console.log   = (...a) => { if (!_filter(a)) _log.apply(console, a); };
  console.error = (...a) => { if (!_filter(a)) _err.apply(console, a); };
  console.warn  = (...a) => { if (!_filter(a)) _warn.apply(console, a); };
  const _wrap = (stream) => {
    const _orig = stream.write.bind(stream);
    stream.write = function(chunk, ...rest) {
      try {
        const s = String(chunk == null ? '' : chunk);
        if (NOISE.some(n => s.includes(n))) return true;
      } catch (_) {}
      return _orig(chunk, ...rest);
    };
  };
  _wrap(process.stdout);
  _wrap(process.stderr);
})();

const fs    = require('fs');
const path  = require('path');

// On NE require PAS baileys au top level (ESM-only sur versions récentes)
let _baileys = null;          // module baileys cache (chargé via import())
let _baileysFailed = false;   // si une erreur de chargement → on n'essaie plus
let qrcode = null;
let pino   = null;
try { qrcode = require('qrcode-terminal'); } catch (_) {}
try { pino   = require('pino'); }            catch (_) {}

async function _loadBaileys() {
  if (_baileys)        return _baileys;
  if (_baileysFailed)  return null;
  try {
    const mod = await import('@whiskeysockets/baileys');
    _baileys = mod && mod.default ? mod : { ...mod };
    // Compat : si default contient les fonctions, les exposer
    if (_baileys.default && typeof _baileys.default === 'object') {
      Object.assign(_baileys, _baileys.default);
    }
    return _baileys;
  } catch (e) {
    _baileysFailed = true;
    console.warn('[WA] Baileys indisponible — WhatsApp désactivé.');
    console.warn('[WA] Cause :', (e && e.message) ? e.message.split('\n')[0] : e);
    return null;
  }
}

const AUTH_DIR = path.join(
  process.env.APPDATA || process.env.HOME || __dirname,
  '.thebox-baileys'
);
const NUMBER = process.env.WHATSAPP_NUMBER;

let sock   = null;
let _ready = false;

let _initInFlight   = false;
let _reconnectTimer = null;
function _scheduleReconnect(ms) {
  if (_reconnectTimer) clearTimeout(_reconnectTimer);
  _reconnectTimer = setTimeout(() => { _reconnectTimer = null; initWA(); }, ms);
  _reconnectTimer.unref();
}

async function send(text, timeoutMs = 8000) {
  if (!_ready || !sock || !NUMBER) {
    return false;
  }
  try {
    await Promise.race([
      sock.sendMessage(`${NUMBER}@s.whatsapp.net`, { text }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('WA timeout')), timeoutMs)),
    ]);
    console.log('[WA] Envoyé:', text.substring(0, 60));
    return true;
  } catch (err) {
    console.error('[WA] Erreur envoi:', err.message);
    return false;
  }
}

async function initWA() {
  if (!NUMBER) {
    console.log('[WA] WHATSAPP_NUMBER non défini — WhatsApp désactivé.');
    return;
  }
  if (_initInFlight) return;
  _initInFlight = true;

  try {
    const lib = await _loadBaileys();
    if (!lib) return;  // baileys non dispo → on abandonne silencieusement

    const makeWASocket            = lib.makeWASocket || lib.default;
    const useMultiFileAuthState   = lib.useMultiFileAuthState;
    const DisconnectReason        = lib.DisconnectReason;
    const fetchLatestBaileysVersion = lib.fetchLatestBaileysVersion;

    if (!makeWASocket || !useMultiFileAuthState) {
      console.warn('[WA] API Baileys incompatible — WhatsApp désactivé.');
      _baileysFailed = true;
      return;
    }

    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    let version;
    try { ({ version } = await fetchLatestBaileysVersion()); } catch (_) { version = undefined; }

    const logger = pino ? pino({ level: 'silent' }) : undefined;

    sock = makeWASocket({
      version,
      auth: state,
      browser: ['The Box', 'Chrome', '1.0'],
      logger,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr && qrcode) {
        console.log('\n📱 Scanner ce QR avec WhatsApp :\n');
        qrcode.generate(qr, { small: true });
        console.log('\n→ WhatsApp → Paramètres → Appareils connectés\n');
      }

      if (connection === 'open') {
        _ready = true;
        console.log('✅ WhatsApp connecté\n');
        setTimeout(() => send(`✅ *The Box* démarré — ${new Date().toLocaleDateString('fr-FR')}`), 4000);
      }

      if (connection === 'close') {
        _ready = false;
        const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
        const loggedOut = DisconnectReason && code === DisconnectReason.loggedOut;
        console.log(`[WA] Déconnecté (code: ${code || '?'})`);
        if (!loggedOut) {
          _scheduleReconnect(5000);
        } else {
          console.log('[WA] Session expirée, suppression...');
          try { if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (_) {}
          _scheduleReconnect(2000);
        }
      }
    });

    sock.ev.on('error', (err) => {
      if (err && err.message && (err.message.includes('me') || err.message.includes('Session'))) return;
      console.error('[WA] Erreur socket:', err && err.message);
    });

  } catch (err) {
    console.error('[WA] Init échouée:', err && err.message);
    _scheduleReconnect(10000);
  } finally {
    _initInFlight = false;
  }
}

// ── Templates messages ────────────────────────────────
function msgAlerteStock(items) {
  const lines = (items || []).map(i => {
    const cur = parseFloat(i.stock_actuel ?? i.stock ?? 0);
    const min = parseFloat(i.seuil_minimum ?? i.seuil ?? 1);
    const pct = Math.round((cur / Math.max(min, 1)) * 100);
    return `${pct < 50 ? '🔴' : '🟠'} *${i.nom}* : ${cur}${i.unite || ''} (seuil: ${min}${i.unite || ''})`;
  });
  return [
    `⚠️ *The Box — Alerte Stock*`,
    new Date().toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }),
    '', ...lines, '',
    '_Réapprovisionnez avant la prochaine ouverture._',
  ].join('\n');
}

function msgRapport({ ca, nb, topProduit, alertes }) {
  const a = alertes || [];
  const alertLines = a.length === 0
    ? '   ✅ Tout est OK'
    : a.map(i => `   🔴 ${i.nom}`).join('\n');
  return [
    `📊 *The Box — Rapport du ${new Date().toLocaleDateString('fr-FR')}*`, '',
    `💰 CA : *${Number(ca || 0).toFixed(3)} DT*`,
    `🧾 Commandes : *${nb || 0}*`,
    `☕ Produit phare : *${topProduit || '—'}*`, '',
    `📦 Stock bas :`, alertLines,
  ].join('\n');
}

function msgBonjour(alertes) {
  const a = alertes || [];
  return a.length > 0
    ? `☀️ *The Box — Bonjour !*\n\n⚠️ ${a.length} produit(s) à commander :\n` +
      a.map(i => `   🔴 ${i.nom} (${i.stock_actuel ?? i.stock ?? 0}${i.unite || ''})`).join('\n')
    : `☀️ *The Box — Bonjour !*\n\n✅ Stock OK — Bonne journée !`;
}

module.exports = { initWA, send, msgAlerteStock, msgRapport, msgBonjour, isReady: () => _ready };
