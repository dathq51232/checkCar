// ========================================
// GropĐ — Workspace Routes (Supabase)
// ========================================
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { randomUUID } = require('crypto');
const supabase = require('../db');
const authenticate = require('../middleware/auth');

// All workspace routes require authentication
router.use(authenticate);

// ---------- GET /api/workspaces ----------
router.get('/', async (req, res) => {
  try {
    const { data: workspaces, error } = await supabase
      .from('workspaces')
      .select('*, workspace_members!inner(role)')
      .eq('workspace_members.user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Flatten the role from the joined table
    const formattedWorkspaces = workspaces.map(w => ({
      ...w,
      role: w.workspace_members[0]?.role,
      workspace_members: undefined
    }));

    res.json({ workspaces: formattedWorkspaces });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách workspaces.' });
  }
});

// ---------- POST /api/workspaces ----------
router.post('/', [
  body('name').notEmpty().withMessage('Tên workspace là bắt buộc'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name } = req.body;
  const id = randomUUID();
  const slug = name.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]/g, '-').replace(/-+/g, '-') + '-' + Date.now().toString(36);

  try {
    const { error: insertError } = await supabase
      .from('workspaces')
      .insert({ id, name, slug, owner_id: req.user.id });

    if (insertError) throw insertError;

    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({ workspace_id: id, user_id: req.user.id, role: 'owner' });

    if (memberError) throw memberError;

    res.status(201).json({
      message: 'Workspace đã được tạo!',
      workspace: { id, name, slug }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi tạo workspace.' });
  }
});

// ---------- GET /api/workspaces/:id ----------
router.get('/:id', async (req, res) => {
  try {
    // Check if user is a member
    const { data: membership, error: memError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (memError || !membership) {
      return res.status(404).json({ error: 'Workspace không tồn tại hoặc bạn không có quyền truy cập.' });
    }

    // Get workspace details
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', req.params.id)
      .single();
      
    if (wsError) throw wsError;
    workspace.user_role = membership.role;

    // Get all members
    const { data: members, error: membersError } = await supabase
      .from('workspace_members')
      .select('role, joined_at, users(id, email, display_name, avatar_url)')
      .eq('workspace_id', req.params.id);

    if (membersError) throw membersError;

    // Flatten the user data
    const formattedMembers = members.map(m => ({
      id: m.users.id,
      email: m.users.email,
      display_name: m.users.display_name,
      avatar_url: m.users.avatar_url,
      role: m.role,
      joined_at: m.joined_at
    }));

    res.json({ workspace, members: formattedMembers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi lấy chi tiết workspace.' });
  }
});

// ---------- POST /api/workspaces/:id/invite ----------
router.post('/:id/invite', [
  body('email').isEmail().withMessage('Email không hợp lệ'),
  body('role').optional().isIn(['admin', 'member', 'viewer']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Verify user is owner/admin
    const { data: membership, error: memError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (memError || !membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'Bạn không có quyền mời thành viên.' });
    }

    const { email, role } = req.body;
    const id = randomUUID();
    const token = randomUUID().replace(/-/g, '');

    const { error: inviteError } = await supabase
      .from('invitations')
      .insert({
        id,
        workspace_id: req.params.id,
        invited_by: req.user.id,
        email,
        role: role || 'member',
        token
      });

    if (inviteError) throw inviteError;

    res.status(201).json({
      message: 'Lời mời đã được gửi!',
      invitation: { id, email, role: role || 'member', token }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi tạo lời mời.' });
  }
});

module.exports = router;
