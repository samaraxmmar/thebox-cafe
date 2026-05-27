'use strict';

/* ──────────────────────────────────────────────────────────────────────
   clean-dist.js — nettoie avant un build Electron
   - Tue les processus qui pourraient verrouiller des fichiers
   - Supprime dist/ avec retries
   - Vide le cache winCodeSign corrompu (symlinks ratés sur Windows
     sans Developer Mode)
   ────────────────────────────────────────────────────────────────────── */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST = path.join(__dirname, 'dist');
const WIN_CACHE = path.join(
  process.env.LOCALAPPDATA || '',
  'electron-builder', 'Cache', 'winCodeSign'
);

function killLockingProcesses() {
  if (process.platform !== 'win32') return;
  const names = ['TheBox.exe', 'electron.exe'];
  for (const n of names) {
    try {
      execSync(`taskkill /F /IM "${n}" /T`, { stdio: 'ignore' });
      console.log(`[clean] processus ${n} terminé`);
    } catch (_) {}
  }
}

async function rmRetry(dir, attempts = 8) {
  if (!fs.existsSync(dir)) return;
  for (let i = 0; i < attempts; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
      console.log(`[clean] supprimé: ${dir}`);
      return;
    } catch (e) {
      console.log(`[clean] tentative ${i + 1}/${attempts} : ${e.code || e.message}`);
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  console.warn(`[clean] ⚠ Impossible de supprimer ${dir}`);
}

(async () => {
  console.log('[clean] début');
  killLockingProcesses();
  await new Promise(r => setTimeout(r, 600));
  await rmRetry(DIST);

  // Nettoyer le cache winCodeSign si présent (souvent corrompu sur Windows
  // sans Developer Mode à cause des symlinks .dylib macOS)
  if (process.platform === 'win32' && WIN_CACHE && fs.existsSync(WIN_CACHE)) {
    console.log('[clean] purge du cache winCodeSign corrompu...');
    await rmRetry(WIN_CACHE);
  }

  // Forcer skip auto-discovery de certificats — pas de signing
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';

  console.log('[clean] terminé');
})();
