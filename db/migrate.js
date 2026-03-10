// ========================================
// GropĐ — Database Migration
// ========================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('./index');

console.log('🚀 Running GropĐ database migration...\n');

// ---------- Create Tables ----------
db.exec(`
  -- 1. Plans (must be first — referenced by workspaces)
  CREATE TABLE IF NOT EXISTS plans (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    max_members   INTEGER DEFAULT 10,
    max_projects  INTEGER DEFAULT 5,
    storage_mb    INTEGER DEFAULT 500,
    price_monthly REAL DEFAULT 0,
    is_active     INTEGER DEFAULT 1,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  -- 2. Users
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name  TEXT,
    avatar_url    TEXT,
    is_verified   INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  -- 3. Workspaces
  CREATE TABLE IF NOT EXISTS workspaces (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id    TEXT REFERENCES plans(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- 4. Workspace Members
  CREATE TABLE IF NOT EXISTS workspace_members (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    joined_at    TEXT DEFAULT (datetime('now')),
    UNIQUE(workspace_id, user_id)
  );

  -- 5. Projects
  CREATE TABLE IF NOT EXISTS projects (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT,
    status       TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
    created_by   TEXT REFERENCES users(id),
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );

  -- 6. Tasks
  CREATE TABLE IF NOT EXISTS tasks (
    id             TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    title          TEXT NOT NULL,
    description    TEXT,
    status         TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
    priority       TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date       TEXT,
    position       INTEGER DEFAULT 0,
    created_by     TEXT REFERENCES users(id),
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  );

  -- 7. Task Assignees
  CREATE TABLE IF NOT EXISTS task_assignees (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
  );

  -- 8. Invitations
  CREATE TABLE IF NOT EXISTS invitations (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    invited_by   TEXT NOT NULL REFERENCES users(id),
    email        TEXT NOT NULL,
    role         TEXT DEFAULT 'member',
    status       TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    token        TEXT NOT NULL UNIQUE,
    created_at   TEXT DEFAULT (datetime('now')),
    expires_at   TEXT DEFAULT (datetime('now', '+7 days'))
  );

  -- 9. Devices
  CREATE TABLE IF NOT EXISTS devices (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name  TEXT,
    platform     TEXT CHECK (platform IN ('web', 'ios', 'android', 'desktop')),
    push_token   TEXT,
    last_sync_at TEXT DEFAULT (datetime('now')),
    created_at   TEXT DEFAULT (datetime('now'))
  );

  -- 10. Activity Log
  CREATE TABLE IF NOT EXISTS activity_log (
    id           TEXT PRIMARY KEY,
    user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    action       TEXT NOT NULL,
    entity_type  TEXT,
    entity_id    TEXT,
    metadata     TEXT DEFAULT '{}',
    created_at   TEXT DEFAULT (datetime('now'))
  );
`);

console.log('✅ All 10 tables created');

// ---------- Indexes ----------
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_members_workspace    ON workspace_members(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_members_user         ON workspace_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_projects_ws          ON projects(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_project        ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status         ON tasks(project_id, status);
  CREATE INDEX IF NOT EXISTS idx_invitations_email    ON invitations(email, status);
  CREATE INDEX IF NOT EXISTS idx_devices_user         ON devices(user_id);
  CREATE INDEX IF NOT EXISTS idx_activity_ws_time     ON activity_log(workspace_id, created_at);
`);

console.log('✅ Indexes created');

// ---------- Seed Plans ----------
const { randomUUID } = require('crypto');

const insertPlan = db.prepare(`
  INSERT OR IGNORE INTO plans (id, name, max_members, max_projects, storage_mb, price_monthly)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const existingPlans = db.prepare('SELECT COUNT(*) as count FROM plans').get();
if (existingPlans.count === 0) {
  insertPlan.run(randomUUID(), 'Free', 10, 5, 500, 0);
  insertPlan.run(randomUUID(), 'Pro', -1, -1, 10000, 199000);
  insertPlan.run(randomUUID(), 'Enterprise', -1, -1, -1, 499000);
  console.log('✅ Plans seeded (Free, Pro, Enterprise)');
} else {
  console.log('ℹ️  Plans already exist, skipping seed');
}

console.log('\n🎉 Migration complete!\n');
