// ========================================
// GropĐ — Task Routes (Supabase)
// ========================================
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { randomUUID } = require('crypto');
const supabase = require('../db');
const authenticate = require('../middleware/auth');

router.use(authenticate);

// Helper: check project access through workspace membership
async function checkProjectAccess(projectId, userId) {
  // 1. Get workspace_id for the project
  const { data: project, error: projError } = await supabase
    .from('projects')
    .select('workspace_id')
    .eq('id', projectId)
    .single();

  if (projError || !project) return null;

  // 2. Check membership in that workspace
  const { data: membership, error: memError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', project.workspace_id)
    .eq('user_id', userId)
    .single();

  if (memError || !membership) return null;

  return { role: membership.role, workspace_id: project.workspace_id };
}

// ---------- GET /api/tasks?project_id=xxx ----------
router.get('/', async (req, res) => {
  const { project_id } = req.query;
  if (!project_id) {
    return res.status(400).json({ error: 'project_id là bắt buộc.' });
  }

  try {
    const access = await checkProjectAccess(project_id, req.user.id);
    if (!access) {
      return res.status(403).json({ error: 'Không có quyền truy cập dự án này.' });
    }

    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*, task_assignees(user_id)')
      .eq('project_id', project_id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Parse assignee_ids uniformly
    const result = tasks.map(t => ({
      ...t,
      assignees: t.task_assignees ? t.task_assignees.map(a => a.user_id) : [],
      task_assignees: undefined
    }));

    res.json({ tasks: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách task.' });
  }
});

// ---------- POST /api/tasks ----------
router.post('/', [
  body('project_id').notEmpty(),
  body('title').notEmpty().withMessage('Tiêu đề task là bắt buộc'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { project_id, title, description, priority, due_date, parent_task_id, assignee_ids } = req.body;

  try {
    const access = await checkProjectAccess(project_id, req.user.id);
    if (!access || access.role === 'viewer') {
      return res.status(403).json({ error: 'Không có quyền tạo task.' });
    }

    const id = randomUUID();

    // Get max position
    const { data: maxPosData } = await supabase
      .from('tasks')
      .select('position')
      .eq('project_id', project_id)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const position = (maxPosData?.position || 0) + 1;

    const { error: insertError } = await supabase
      .from('tasks')
      .insert({
        id,
        project_id,
        parent_task_id: parent_task_id || null,
        title,
        description: description || null,
        priority: priority || 'medium',
        due_date: due_date || null,
        position,
        created_by: req.user.id
      });

    if (insertError) throw insertError;

    // Assign members if provided
    if (assignee_ids && Array.isArray(assignee_ids)) {
      const assigneesToInsert = assignee_ids.map(uid => ({ task_id: id, user_id: uid }));
      const { error: assignError } = await supabase
        .from('task_assignees')
        .insert(assigneesToInsert);
        
      if (assignError) console.error("Could not assign users:", assignError);
    }

    res.status(201).json({
      message: 'Task đã được tạo!',
      task: { id, project_id, title, status: 'todo', priority: priority || 'medium', position }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi tạo task.' });
  }
});

// ---------- PUT /api/tasks/:id ----------
router.put('/:id', async (req, res) => {
  try {
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('project_id')
      .eq('id', req.params.id)
      .single();

    if (taskError || !task) {
      return res.status(404).json({ error: 'Task không tồn tại.' });
    }

    const access = await checkProjectAccess(task.project_id, req.user.id);
    if (!access || access.role === 'viewer') {
      return res.status(403).json({ error: 'Không có quyền chỉnh sửa task.' });
    }

    const { title, description, status, priority, due_date, position } = req.body;
    
    // Build update object only with provided fields
    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;
    if (due_date !== undefined) updates.due_date = due_date;
    if (position !== undefined) updates.position = position;

    const { error: updateError } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', req.params.id);

    if (updateError) throw updateError;

    res.json({ message: 'Task đã cập nhật!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi cập nhật task.' });
  }
});

// ---------- POST /api/tasks/:id/assign ----------
router.post('/:id/assign', [
  body('user_id').notEmpty(),
], async (req, res) => {
  try {
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('project_id')
      .eq('id', req.params.id)
      .single();

    if (taskError || !task) {
      return res.status(404).json({ error: 'Task không tồn tại.' });
    }

    const access = await checkProjectAccess(task.project_id, req.user.id);
    if (!access || access.role === 'viewer') {
      return res.status(403).json({ error: 'Không có quyền.' });
    }

    const { error: assignError } = await supabase
      .from('task_assignees')
      .insert({ task_id: req.params.id, user_id: req.body.user_id });

    // Handle unique constraint violations gracefully
    if (assignError && assignError.code !== '23505') {
       throw assignError;
    }

    res.json({ message: 'Đã giao task thành công!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi giao task.' });
  }
});

// ---------- DELETE /api/tasks/:id ----------
router.delete('/:id', async (req, res) => {
  try {
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('project_id')
      .eq('id', req.params.id)
      .single();

    if (taskError || !task) {
      return res.status(404).json({ error: 'Task không tồn tại.' });
    }

    const access = await checkProjectAccess(task.project_id, req.user.id);
    if (!access || !['owner', 'admin'].includes(access.role)) {
      return res.status(403).json({ error: 'Không có quyền xóa task.' });
    }

    const { error: delError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', req.params.id);

    if (delError) throw delError;

    res.json({ message: 'Task đã bị xóa.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi xóa task.' });
  }
});

module.exports = router;
