// ========================================
// GropĐ — Auth Routes (Supabase)
// ========================================
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { randomUUID } = require('crypto');
const supabase = require('../db');
const authenticate = require('../middleware/auth');

// ---------- POST /api/auth/register ----------
router.post('/register', [
  body('email').isEmail().withMessage('Email không hợp lệ'),
  body('password').isLength({ min: 6 }).withMessage('Mật khẩu tối thiểu 6 ký tự'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, display_name } = req.body;

  try {
    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: display_name,
        }
      }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
         return res.status(409).json({ error: 'Email đã được đăng ký.' });
      }
      throw authError;
    }

    const user = authData.user;
    if (!user) throw new Error('Failed to create user');

    // Note: The Trigger `handle_new_user` in Supabase will automatically create the public.users record.

    // 2. Auto-create a default workspace
    const wsId = randomUUID();
    const slug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-') + '-ws';

    const { error: wsError } = await supabase
      .from('workspaces')
      .insert({ id: wsId, name: 'My Workspace', slug, owner_id: user.id });
      
    if (wsError) throw wsError;

    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({ workspace_id: wsId, user_id: user.id, role: 'owner' });

    if (memberError) throw memberError;

    res.status(201).json({
      message: 'Đăng ký thành công!',
      user: { id: user.id, email: user.email, display_name },
      token: authData.session?.access_token || null,
      workspace: { id: wsId, name: 'My Workspace', slug }
    });

  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ error: 'Lỗi hệ thống khi đăng ký.' });
  }
});

// ---------- POST /api/auth/login ----------
router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
       return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
    }

    // Fetch public profile
    const { data: profile } = await supabase
      .from('users')
      .select('id, email, display_name')
      .eq('id', data.user.id)
      .single();

    res.json({
      message: 'Đăng nhập thành công!',
      user: profile || { id: data.user.id, email: data.user.email },
      token: data.session.access_token
    });

  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Lỗi hệ thống khi đăng nhập.' });
  }
});

// ---------- GET /api/auth/me ----------
router.get('/me', authenticate, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, display_name, avatar_url, created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'Người dùng không tồn tại.' });
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi hệ thống.' });
  }
});

module.exports = router;
