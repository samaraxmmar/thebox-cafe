'use strict';

const express     = require('express');
const router      = express.Router();
const auth        = require('../auth');
const logs        = require('../logbuffer');
const permissions = require('../permissions');
const V           = require('../validate');

// Toutes les routes ici sont protégées par users.manage (sauf list/read pour soi).
router.use(auth.requireAuth);

// GET /api/users — liste (admin/manager peuvent voir)
router.get('/', auth.requirePerm('users.manage'), (req, res) => {
  const users = auth.getUsers().map(u => auth._sanitize(u));
  res.json(users);
});

// POST /api/users — créer
router.post('/', auth.requirePerm('users.manage'), (req, res) => {
  const body = req.body || {};
  const username = V.str(body.username, 40).toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  const nom      = V.str(body.nom, 80);
  const role     = V.oneOf(body.role, Object.keys(permissions.ROLE_LABELS));
  const pin      = V.str(body.pin, 20);
  const actif    = body.actif !== false;

  if (!username || username.length < 3) return res.status(400).json({ error: 'Identifiant invalide (min 3 caractères)' });
  if (!nom)                              return res.status(400).json({ error: 'Nom requis' });
  if (!role)                             return res.status(400).json({ error: 'Rôle invalide' });
  if (pin.length < 4)                    return res.status(400).json({ error: 'PIN trop court (min 4)' });

  const users = auth.getUsers();
  if (users.some(u => u.username.toLowerCase() === username)) {
    return res.status(409).json({ error: 'Username déjà utilisé' });
  }

  const u = {
    id:        auth.nextUserId(),
    username,
    nom,
    role,
    pinHash:   auth.hash(pin),
    actif,
    created_at:new Date().toISOString(),
  };
  users.push(u);
  auth.saveUsers(users);
  logs.add('info', 'Utilisateur créé', { username: u.username, role: u.role, by: req.user.username });
  res.status(201).json(auth._sanitize(u));
});

// PATCH /api/users/:id — modifier
router.patch('/:id', auth.requirePerm('users.manage'), (req, res) => {
  const id = parseInt(req.params.id);
  const users = auth.getUsers();
  const u = users.find(x => x.id === id);
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const { nom, role, actif, pin } = req.body || {};
  if (nom !== undefined)   u.nom = String(nom).trim();
  if (role !== undefined && permissions.ROLE_LABELS[role]) u.role = role;
  if (actif !== undefined) u.actif = !!actif;
  if (pin !== undefined && String(pin).length >= 4) u.pinHash = auth.hash(pin);
  u.updated_at = new Date().toISOString();

  // Empêcher de désactiver le DERNIER admin actif
  const activeAdmins = users.filter(x => x.role === 'admin' && x.actif !== false);
  if (activeAdmins.length === 0) {
    return res.status(400).json({ error: 'Impossible : au moins un admin actif requis' });
  }

  auth.saveUsers(users);
  logs.add('info', 'Utilisateur modifié', { id, by: req.user.username });
  res.json(auth._sanitize(u));
});

// DELETE /api/users/:id
router.delete('/:id', auth.requirePerm('users.manage'), (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'Impossible de te supprimer toi-même' });
  let users = auth.getUsers();
  const before = users.length;
  users = users.filter(u => u.id !== id);
  if (users.length === before) return res.status(404).json({ error: 'Utilisateur introuvable' });
  const activeAdmins = users.filter(x => x.role === 'admin' && x.actif !== false);
  if (activeAdmins.length === 0) {
    return res.status(400).json({ error: 'Impossible : il doit rester au moins un admin actif' });
  }
  auth.saveUsers(users);
  logs.add('warn', 'Utilisateur supprimé', { id, by: req.user.username });
  res.json({ success: true });
});

module.exports = router;
