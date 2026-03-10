// ========================================
// GropĐ — Task Routes
// ========================================
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { randomUUID } = require('crypto');
const db = require('../db');
const authenticate = require('../middleware/auth');

router.use(authenticate);

// Helper: check project access through workspace membership
function checkProjectAccess(projectId, userId) {
  return db.prepare(`
    SELECT wm.role, p.workspace_id
    FROM projects p
    JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
    WHERE p.id = ? AND wm.user_id = ?
  `).get(projectId, userId);
}

// ---------- GET /api/tasks?project_id=xxx ----------
router.get('/', (req, res) => {
  const { project_id } = req.query;
  if (!project_id) {
    return res.status(400).json({ error: 'project_id là bắt buộc.' });
  }

  const access = checkProjectAccess(project_id, req.user.id);
  if (!access) {
    return res.status(403).json({ error: 'Không có quyền truy cập dự án này.' });
  }

  const tasks = db.prepare(`
    SELECT t.*,
      GROUP_CONCAT(ta.user_id) as assignee_ids
    FROM tasks t
    LEFT JOIN task_assignees ta ON ta.task_id = t.id
    WHERE t.project_id = ?
    GROUP BY t.id
    ORDER BY t.position ASC, t.created_at DESC
  `).all(project_id);

  // Parse assignee_ids
  const result = tasks.map(t => ({
    ...t,
    assignees: t.assignee_ids ? t.assignee_ids.split(',') : []
  }));

  res.json({ tasks: result });
});

// ---------- POST /api/tasks ----------
router.post('/', [
  body('project_id').notEmpty(),
  body('title').notEmpty().withMessage('Tiêu đề task là bắt buộc'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { project_id, title, description, priority, due_date, parent_task_id, assignee_ids } = req.body;

  const access = checkProjectAccess(project_id, req.user.id);
  if (!access || access.role === 'viewer') {
    return res.status(403).json({ error: 'Không có quyền tạo task.' });
  }

  const id = randomUUID();

  // Get max position
  const maxPos = db.prepare('SELECT MAX(position) as mp FROM tasks WHERE project_id = ?').get(project_id);
  const position = (maxPos.mp || 0) + 1;

  db.prepare(`
    INSERT INTO tasks (id, project_id, parent_task_id, title, description, priority, due_date, position, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, project_id, parent_task_id || null, title, description || null, priority || 'medium', due_date || null, position, req.user.id);

  // Assign members if provided
  if (assignee_ids && Array.isArray(assignee_ids)) {
    const insertAssignee = db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)');
    for (const uid of assignee_ids) {
      insertAssignee.run(id, uid);
    }
  }

  res.status(201).json({
    message: 'Task đã được tạo!',
    task: { id, project_id, title, status: 'todo', priority: priority || 'medium', position }
  });
});

// ---------- PUT /api/tasks/:id ----------
router.put('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task không tồn tại.' });
  }

  const access = checkProjectAccess(task.project_id, req.user.id);
  if (!access || access.role === 'viewer') {
    return res.status(403).json({ error: 'Không có quyền chỉnh sửa task.' });
  }

  const { title, description, status, priority, due_date, position } = req.body;

  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      priority = COALESCE(?, priority),
      due_date = COALESCE(?, due_date),
      position = COALESCE(?, position),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title || null, description || null, status || null,
    priority || null, due_date || null, position ?? null, req.params.id
  );

  res.json({ message: 'Task đã cập nhật!' });
});

// ---------- POST /api/tasks/:id/assign ----------
router.post('/:id/assign', [
  body('user_id').notEmpty(),
], (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task không tồn tại.' });
  }

  const access = checkProjectAccess(task.project_id, req.user.id);
  if (!access || access.role === 'viewer') {
    return res.status(403).json({ error: 'Không có quyền.' });
  }

  db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)').run(req.params.id, req.body.user_id);

  res.json({ message: 'Đã giao task thành công!' });
});

// ---------- DELETE /api/tasks/:id ----------
router.delete('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task không tồn tại.' });
  }

  const access = checkProjectAccess(task.project_id, req.user.id);
  if (!access || !['owner', 'admin'].includes(access.role)) {
    return res.status(403).json({ error: 'Không có quyền xóa task.' });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ message: 'Task đã bị xóa.' });
});

module.exports = router;
