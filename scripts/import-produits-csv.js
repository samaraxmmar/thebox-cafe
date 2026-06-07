#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Import des produits depuis un CSV
   ────────────────────────────────────────────────────────────────────
   Usage :
     node scripts/import-produits-csv.js <chemin/vers/extract_produits_tailles.csv>

   Format CSV attendu (point-virgule) :
     id;Libellé;En ligne;Catégorie;Prix de vente

   Règles :
     • Ignore les lignes au nom vide
     • Catégorie vide → "Divers"
     • Dédup par nom (insensible à la casse) contre la table existante
     • Tous les produits importés sont actifs
   ────────────────────────────────────────────────────────────────────── */

'use strict';

const fs   = require('fs');
const path = require('path');
require('dotenv').config();

// Pour Electron-build : possible que .env soit dans AppData
try {
  const appData = process.env.APPDATA;
  if (appData) {
    const altEnv = path.join(appData, 'TheBox', '.env');
    if (fs.existsSync(altEnv)) {
      require('dotenv').config({ path: altEnv, override: false });
    }
  }
} catch (_) {}

const { createClient } = require('@supabase/supabase-js');

// ── Configuration ──
const URL = (process.env.SUPABASE_URL || '').trim();
const KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '').trim();
if (!URL || !KEY) {
  console.error('❌ SUPABASE_URL et SUPABASE_KEY (ou SERVICE_KEY) requis dans .env');
  process.exit(1);
}
const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
console.log(`✅ Supabase connecté (${process.env.SUPABASE_SERVICE_KEY ? 'service_role' : 'anon'})`);

// ── Lecture du CSV ──
// Par défaut : data/produits_import.csv (relatif à la racine du projet)
const DEFAULT_CSV = path.join(__dirname, '..', 'data', 'produits_import.csv');
const csvPath = process.argv[2] || DEFAULT_CSV;
if (!fs.existsSync(csvPath)) {
  console.error('❌ Fichier introuvable :', csvPath);
  console.error('   Usage : node scripts/import-produits-csv.js [fichier.csv]');
  console.error('   (par défaut : data/produits_import.csv)');
  process.exit(1);
}
console.log('📁 Fichier CSV :', csvPath);

const raw = fs.readFileSync(csvPath, 'utf8');
const lines = raw.split(/\r?\n/).filter(Boolean);
console.log(`📄 ${lines.length} lignes lues (header inclus)`);

// Parse CSV (point-virgule, pas de guillemets compliqués)
const header = lines[0].split(';').map(s => s.trim().toLowerCase());
const idxNom  = header.findIndex(h => h.includes('libell') || h === 'nom');
const idxCat  = header.findIndex(h => h.includes('cat'));
const idxPrix = header.findIndex(h => h.includes('prix'));
if (idxNom < 0 || idxPrix < 0) {
  console.error('❌ Colonnes "Libellé" ou "Prix de vente" introuvables dans le header');
  process.exit(1);
}

const rowsRaw = lines.slice(1).map(line => {
  const cells = line.split(';');
  return {
    nom:       (cells[idxNom]  || '').trim(),
    categorie: (cells[idxCat]  || '').trim() || 'Divers',
    prix:      parseFloat((cells[idxPrix] || '0').replace(',', '.')) || 0,
  };
});

// Filtre : nom non vide + prix > 0
const rows = rowsRaw.filter(r => r.nom && r.prix > 0);
console.log(`🧹 ${rows.length} produits valides (après filtrage des lignes vides)`);

// ── Récupérer les produits existants pour dédup ──
(async () => {
  console.log('🔍 Récupération des produits existants (pour dédup)…');
  const { data: existing, error: errLoad } = await supabase
    .from('produits').select('nom');
  if (errLoad) {
    console.error('❌ Lecture produits :', errLoad.message);
    process.exit(1);
  }
  const existingNames = new Set((existing || []).map(p => p.nom.toLowerCase().trim()));
  console.log(`📊 ${existingNames.size} produits déjà en base`);

  // Filtrer les doublons + dédup interne au CSV
  const seenInCsv = new Set();
  const toInsert = [];
  let skippedDup = 0, skippedCsvDup = 0;
  for (const r of rows) {
    const key = r.nom.toLowerCase();
    if (existingNames.has(key)) { skippedDup++; continue; }
    if (seenInCsv.has(key))     { skippedCsvDup++; continue; }
    seenInCsv.add(key);
    toInsert.push({
      nom: r.nom.slice(0, 80),
      prix: r.prix,
      categorie: r.categorie.slice(0, 40),
      actif: true,
    });
  }
  console.log(`✨ ${toInsert.length} produits à insérer`);
  console.log(`   ↳ ${skippedDup} déjà présents (skip)`);
  console.log(`   ↳ ${skippedCsvDup} doublons internes au CSV (skip)`);

  if (!toInsert.length) {
    console.log('Rien à insérer. Terminé.');
    return;
  }

  // Insertion par batch de 50
  const BATCH = 50;
  let inserted = 0;
  let failed = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const slice = toInsert.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from('produits').insert(slice).select('id, nom');
    if (error) {
      console.error(`❌ Batch ${Math.floor(i/BATCH)+1} :`, error.message);
      failed += slice.length;
    } else {
      inserted += (data || []).length;
      console.log(`✅ Batch ${Math.floor(i/BATCH)+1} : +${(data||[]).length} produits`);
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🎉 Import terminé : ${inserted} insérés, ${failed} échecs`);
})();
