// ========================================
// GropĐ — Workspace Routes
// ========================================
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { randomUUID } = require('crypto');
const db = require('../db');
const authenticate = require('../middleware/auth');

// All workspace routes require authentication
router.use(authenticate);

// ---------- GET /api/workspaces ----------
router.get('/', (req, res) => {
  const workspaces = db.prepare(`
    SELECT w.*, wm.role
    FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ?
    ORDER BY w.created_at DESC
  `).all(req.user.id);

  res.json({ workspaces });
});

// ---------- POST /api/workspaces ----------
router.post('/', [
  body('name').notEmpty().withMessage('Tên workspace là bắt buộc'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name } = req.body;
  const id = randomUUID();
  const slug = name.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]/g, '-').replace(/-+/g, '-') + '-' + Date.now().toString(36);

  db.prepare(`
    INSERT INTO workspaces (id, name, slug, owner_id)
    VALUES (?, ?, ?, ?)
  `).run(id, name, slug, req.user.id);

  db.prepare(`
    INSERT INTO workspace_members (id, workspace_id, user_id, role)
    VALUES (?, ?, ?, 'owner')
  `).run(randomUUID(), id, req.user.id);

  res.status(201).json({
    message: 'Workspace đã được tạo!',
    workspace: { id, name, slug }
  });
});

// ---------- GET /api/workspaces/:id ----------
router.get('/:id', (req, res) => {
  const workspace = db.prepare(`
    SELECT w.*, wm.role as user_role
    FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE w.id = ? AND wm.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!workspace) {
    return res.status(404).json({ error: 'Workspace không tồn tại hoặc bạn không có quyền truy cập.' });
  }

  const members = db.prepare(`
    SELECT u.id, u.email, u.display_name, u.avatar_url, wm.role, wm.joined_at
    FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = ?
  `).all(req.params.id);

  res.json({ workspace, members });
});

// ---------- POST /api/workspaces/:id/invite ----------
router.post('/:id/invite', [
  body('email').isEmail().withMessage('Email không hợp lệ'),
  body('role').optional().isIn(['admin', 'member', 'viewer']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Verify the user is an owner or admin of this workspace
  const membership = db.prepare(`
    SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).get(req.params.id, req.user.id);

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return res.status(403).json({ error: 'Bạn không có quyền mời thành viên.' });
  }

  const { email, role } = req.body;
  const id = randomUUID();
  const token = randomUUID().replace(/-/g, '');

  db.prepare(`
    INSERT INTO invitations (id, workspace_id, invited_by, email, role, token)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, req.user.id, email, role || 'member', token);

  res.status(201).json({
    message: 'Lời mời đã được gửi!',
    invitation: { id, email, role: role || 'member', token }
  });
});

module.exports = router;
