// ========================================
// GropĐ — Project Routes (Supabase)
// ========================================
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { randomUUID } = require('crypto');
const supabase = require('../db');
const authenticate = require('../middleware/auth');

router.use(authenticate);

// Helper: check workspace membership
async function checkMembership(workspaceId, userId) {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data;
}

// ---------- GET /api/projects?workspace_id=xxx ----------
router.get('/', async (req, res) => {
  const { workspace_id } = req.query;
  if (!workspace_id) {
    return res.status(400).json({ error: 'workspace_id là bắt buộc.' });
  }

  try {
    const membership = await checkMembership(workspace_id, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Không có quyền truy cập workspace này.' });
    }

    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .eq('workspace_id', workspace_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ projects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách dự án.' });
  }
});

// ---------- POST /api/projects ----------
router.post('/', [
  body('workspace_id').notEmpty(),
  body('name').notEmpty().withMessage('Tên dự án là bắt buộc'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { workspace_id, name, description } = req.body;

  try {
    const membership = await checkMembership(workspace_id, req.user.id);
    if (!membership || membership.role === 'viewer') {
      return res.status(403).json({ error: 'Không có quyền tạo dự án.' });
    }

    const id = randomUUID();
    const { error } = await supabase
      .from('projects')
      .insert({
        id,
        workspace_id,
        name,
        description: description || null,
        created_by: req.user.id
      });

    if (error) throw error;

    res.status(201).json({
      message: 'Dự án đã được tạo!',
      project: { id, workspace_id, name, description, status: 'active' }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi tạo dự án.' });
  }
});

// ---------- PUT /api/projects/:id ----------
router.put('/:id', async (req, res) => {
  try {
    const { data: project, error: projError } = await supabase
      .from('projects')
      .select('workspace_id')
      .eq('id', req.params.id)
      .single();

    if (projError || !project) {
      return res.status(404).json({ error: 'Dự án không tồn tại.' });
    }

    const membership = await checkMembership(project.workspace_id, req.user.id);
    if (!membership || membership.role === 'viewer') {
      return res.status(403).json({ error: 'Không có quyền chỉnh sửa.' });
    }

    const { name, description, status } = req.body;
    
    // Build update object only with provided fields
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;

    const { error: updateError } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', req.params.id);

    if (updateError) throw updateError;

    res.json({ message: 'Dự án đã cập nhật!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi cập nhật dự án.' });
  }
});

// ---------- DELETE /api/projects/:id ----------
router.delete('/:id', async (req, res) => {
  try {
    const { data: project, error: projError } = await supabase
      .from('projects')
      .select('workspace_id')
      .eq('id', req.params.id)
      .single();

    if (projError || !project) {
      return res.status(404).json({ error: 'Dự án không tồn tại.' });
    }

    const membership = await checkMembership(project.workspace_id, req.user.id);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'Không có quyền xóa dự án.' });
    }

    const { error: delError } = await supabase
      .from('projects')
      .delete()
      .eq('id', req.params.id);

    if (delError) throw delError;

    res.json({ message: 'Dự án đã bị xóa.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi xóa dự án.' });
  }
});

module.exports = router;
