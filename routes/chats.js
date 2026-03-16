// ========================================
// GropĐ — Chat Routes (Supabase)
// ========================================
const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const supabase = require('../db');
const authenticate = require('../middleware/auth');

router.use(authenticate);

// Helper: check if user is in workspace
async function checkWorkspaceAccess(workspaceId, userId) {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  // Also allow workspace owner
  if (!data) {
    const { data: ws } = await supabase
      .from('workspaces')
      .select('owner_id')
      .eq('id', workspaceId)
      .maybeSingle();
    if (!ws || ws.owner_id !== userId) return null;
    return { role: 'owner' };
  }
  return data;
}

// ---------- GET /api/chats?workspace_id= ----------
router.get('/', [
  query('workspace_id').notEmpty().withMessage('workspace_id is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { workspace_id } = req.query;

  try {
    const access = await checkWorkspaceAccess(workspace_id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Không có quyền truy cập workspace này.' });

    const { data: channels, error } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('workspace_id', workspace_id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ channels });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách kênh chat.' });
  }
});

// ---------- POST /api/chats ----------
router.post('/', [
  body('workspace_id').notEmpty(),
  body('name').notEmpty().withMessage('Tên kênh là bắt buộc'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { workspace_id, name, description } = req.body;

  try {
    const access = await checkWorkspaceAccess(workspace_id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Không có quyền tạo kênh trong workspace này.' });

    const { data: channel, error } = await supabase
      .from('chat_channels')
      .insert({ workspace_id, name, description, created_by: req.user.id })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ channel });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi tạo kênh.' });
  }
});

// ---------- GET /api/chats/:channelId/messages ----------
router.get('/:channelId/messages', async (req, res) => {
  const { channelId } = req.params;

  try {
    const { data: channel, error: chanErr } = await supabase
      .from('chat_channels')
      .select('workspace_id')
      .eq('id', channelId)
      .maybeSingle();

    if (chanErr || !channel) return res.status(404).json({ error: 'Kênh không tồn tại.' });

    const access = await checkWorkspaceAccess(channel.workspace_id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Không có quyền xem tin nhắn.' });

    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('*, users(display_name, email, avatar_url)')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) throw error;
    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi lấy tin nhắn.' });
  }
});

// ---------- POST /api/chats/:channelId/messages ----------
router.post('/:channelId/messages', [
  body('content').notEmpty().withMessage('Nội dung tin nhắn không được để trống'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { channelId } = req.params;
  const { content } = req.body;

  try {
    const { data: channel } = await supabase
      .from('chat_channels')
      .select('workspace_id')
      .eq('id', channelId)
      .maybeSingle();

    if (!channel) return res.status(404).json({ error: 'Kênh không tồn tại.' });

    const access = await checkWorkspaceAccess(channel.workspace_id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Không có quyền gửi tin nhắn.' });

    const { data: message, error } = await supabase
      .from('chat_messages')
      .insert({ channel_id: channelId, user_id: req.user.id, content })
      .select('*, users(display_name, email, avatar_url)')
      .single();

    if (error) throw error;
    res.status(201).json({ message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi gửi tin nhắn.' });
  }
});

module.exports = router;
