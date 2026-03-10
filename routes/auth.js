// ========================================
// GropĐ — Auth Routes
// ========================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { randomUUID } = require('crypto');
const db = require('../db');
const authenticate = require('../middleware/auth');

// ---------- POST /api/auth/register ----------
router.post('/register', [
  body('email').isEmail().withMessage('Email không hợp lệ'),
  body('password').isLength({ min: 6 }).withMessage('Mật khẩu tối thiểu 6 ký tự'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, display_name } = req.body;

  // Check existing user
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Email đã được đăng ký.' });
  }

  // Create user
  const id = randomUUID();
  const password_hash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name)
    VALUES (?, ?, ?, ?)
  `).run(id, email, password_hash, display_name || null);

  // Generate JWT
  const token = jwt.sign({ id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });

  // Auto-create a default workspace
  const wsId = randomUUID();
  const slug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-') + '-ws';

  db.prepare(`
    INSERT INTO workspaces (id, name, slug, owner_id)
    VALUES (?, ?, ?, ?)
  `).run(wsId, 'My Workspace', slug, id);

  db.prepare(`
    INSERT INTO workspace_members (id, workspace_id, user_id, role)
    VALUES (?, ?, ?, 'owner')
  `).run(randomUUID(), wsId, id);

  res.status(201).json({
    message: 'Đăng ký thành công!',
    user: { id, email, display_name },
    token,
    workspace: { id: wsId, name: 'My Workspace', slug }
  });
});

// ---------- POST /api/auth/login ----------
router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
  }

  // Update last login
  db.prepare('UPDATE users SET last_login_at = datetime("now") WHERE id = ?').run(user.id);

  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

  res.json({
    message: 'Đăng nhập thành công!',
    user: { id: user.id, email: user.email, display_name: user.display_name },
    token
  });
});

// ---------- GET /api/auth/me ----------
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, email, display_name, avatar_url, created_at FROM users WHERE id = ?').get(req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'Người dùng không tồn tại.' });
  }

  res.json({ user });
});

module.exports = router;
