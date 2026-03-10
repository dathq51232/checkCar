// ========================================
// GropĐ — Supabase Auth Middleware
// ========================================
const supabase = require('../db');

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Chưa đăng nhập. Vui lòng cung cấp token.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Lỗi xác thực token.' });
  }
}

module.exports = authenticate;
