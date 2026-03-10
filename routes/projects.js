// ========================================
// GropĐ — Project Routes
// ========================================
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { randomUUID } = require('crypto');
const db = require('../db');
const authenticate = require('../middleware/auth');

router.use(authenticate);

// Helper: check workspace membership
function checkMembership(workspaceId, userId) {
  return db.prepare(`
    SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).get(workspaceId, userId);
}

// ---------- GET /api/projects?workspace_id=xxx ----------
router.get('/', (req, res) => {
  const { workspace_id } = req.query;
  if (!workspace_id) {
    return res.status(400).json({ error: 'workspace_id là bắt buộc.' });
  }

  if (!checkMembership(workspace_id, req.user.id)) {
    return res.status(403).json({ error: 'Không có quyền truy cập workspace này.' });
  }

  const projects = db.prepare(`
    SELECT * FROM projects WHERE workspace_id = ? ORDER BY created_at DESC
  `).all(workspace_id);

  res.json({ projects });
});

// ---------- POST /api/projects ----------
router.post('/', [
  body('workspace_id').notEmpty(),
  body('name').notEmpty().withMessage('Tên dự án là bắt buộc'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { workspace_id, name, description } = req.body;

  const membership = checkMembership(workspace_id, req.user.id);
  if (!membership || membership.role === 'viewer') {
    return res.status(403).json({ error: 'Không có quyền tạo dự án.' });
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO projects (id, workspace_id, name, description, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, workspace_id, name, description || null, req.user.id);

  res.status(201).json({
    message: 'Dự án đã được tạo!',
    project: { id, workspace_id, name, description, status: 'active' }
  });
});

// ---------- PUT /api/projects/:id ----------
router.put('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Dự án không tồn tại.' });
  }

  const membership = checkMembership(project.workspace_id, req.user.id);
  if (!membership || membership.role === 'viewer') {
    return res.status(403).json({ error: 'Không có quyền chỉnh sửa.' });
  }

  const { name, description, status } = req.body;
  db.prepare(`
    UPDATE projects SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(name || null, description || null, status || null, req.params.id);

  res.json({ message: 'Dự án đã cập nhật!' });
});

// ---------- DELETE /api/projects/:id ----------
router.delete('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Dự án không tồn tại.' });
  }

  const membership = checkMembership(project.workspace_id, req.user.id);
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return res.status(403).json({ error: 'Không có quyền xóa dự án.' });
  }

  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ message: 'Dự án đã bị xóa.' });
});

module.exports = router;
