// ========================================
// GropĐ — Express Server
// ========================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// ---------- API Routes ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/workspaces', require('./routes/workspaces'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/chats', require('./routes/chats'));

// ---------- Config Endpoint ----------
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || 'https://bywdgwqwtnopqhjdwknp.supabase.co',
    supabaseKey: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d2Rnd3F3dG5vcHFoamR3a25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNzYzMTQsImV4cCI6MjA4ODY1MjMxNH0.mhVjS6AQspd3JPfa5qXZuAB91TQlkVfjZ7vCbTPLOKw'
  });
});

// ---------- SPA Fallback ----------
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------- Global Error Handler ----------
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.message);
  res.status(500).json({ error: 'Lỗi hệ thống. Vui lòng thử lại.' });
});

// ---------- Start Server or Export for Serverless ----------
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`\n🚀 GropĐ server running at http://localhost:${PORT}`);
    console.log(`📡 API: http://localhost:${PORT}/api`);
    console.log(`🌐 Frontend: http://localhost:${PORT}\n`);
  });
}

// Export the app for Vercel
module.exports = app;
