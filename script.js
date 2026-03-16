/* ========================================
   GropĐ — App Script v2 (Chat + Members)
   ======================================== */

// ─── State ───────────────────────────────
const state = {
  user: null,
  token: null,
  workspaces: [],
  members: [],
  projects: [],
  tasks: [],
  channels: [],
  messages: [],
  currentWorkspaceId: null,
  currentProjectId: null,
  currentChannelId: null,
  activeTab: 'tasks',
  chatSubscription: null,
};

// ─── Supabase Client URL ──────────────────
const API = window.location.origin + '/api';

async function http(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(API + path, { ...opts, headers });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.errors?.[0]?.msg || 'Lỗi không xác định');
  return json;
}

// ─── Toast ───────────────────────────────
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast toast--' + type + ' show';
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 4500);
}

// ─── Auth Modals ─────────────────────────
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  toggleAuthMode('register');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
function toggleAuthMode(mode) {
  const r = document.getElementById('registerView');
  const l = document.getElementById('loginView');
  if (mode === 'login') { r.style.display = 'none'; l.style.display = 'block'; }
  else                  { r.style.display = 'block'; l.style.display = 'none'; }
}

// ─── Generic CRUD Modal ──────────────────
function openGenericModal(title, html, onSubmit) {
  document.getElementById('genericModalTitle').textContent = title;
  document.getElementById('genericFormContent').innerHTML = html;
  document.getElementById('genericModal').classList.add('open');
  document.getElementById('genericForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('genericSubmitBtn');
    btn.disabled = true; btn.textContent = 'Đang lưu...';
    try {
      await onSubmit(new FormData(e.target));
      closeGenericModal();
    } catch (err) {
      toast('❌ ' + err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Lưu';
    }
  };
}
function closeGenericModal() {
  document.getElementById('genericModal').classList.remove('open');
}

// ─── View switching ──────────────────────
function switchView(view) {
  const landing = document.querySelectorAll('header.header, section, footer');
  const dash = document.getElementById('dashboard');
  if (view === 'app') {
    landing.forEach(el => el.style.display = 'none');
    dash.style.display = 'grid';
  } else {
    landing.forEach(el => el.style.display = '');
    dash.style.display = 'none';
  }
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.view-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.getElementById('tabTasks').style.display   = tab === 'tasks'   ? 'block' : 'none';
  document.getElementById('tabMembers').style.display = tab === 'members' ? 'block' : 'none';
  document.getElementById('tabChat').style.display    = tab === 'chat'    ? 'flex'  : 'none';
  document.getElementById('addTaskBtn').style.display = (tab === 'tasks' && state.currentProjectId) ? 'block' : 'none';

  if (tab === 'members') loadMembers();
  if (tab === 'chat') loadChannels();
}

// ─── Auth Logic ──────────────────────────
async function handleLogout() {
  if (state.chatSubscription) state.chatSubscription.unsubscribe();
  await supabase.auth.signOut();
  localStorage.clear();
  window.location.reload();
}

function applyLoggedInUser(userData, token) {
  state.user  = userData;
  state.token = token;
  document.getElementById('userDisplayName').textContent =
    userData.display_name || userData.email.split('@')[0];
  switchView('app');
  loadWorkspaces();
}

// ─── Workspaces ──────────────────────────
async function loadWorkspaces() {
  try {
    const { workspaces } = await http('/workspaces');
    state.workspaces = workspaces;
    renderWorkspaces();
  } catch (e) { console.error(e); }
}

function renderWorkspaces() {
  document.getElementById('workspaceList').innerHTML = state.workspaces
    .map(w => `<li class="${w.id === state.currentWorkspaceId ? 'active' : ''}"
                   onclick="selectWorkspace('${w.id}')">${w.name}</li>`)
    .join('');
}

async function selectWorkspace(id) {
  state.currentWorkspaceId = id;
  state.currentProjectId   = null;
  state.currentChannelId   = null;
  renderWorkspaces();

  const ws = state.workspaces.find(w => w.id === id);
  document.getElementById('currentViewTitle').textContent = ws?.name || 'Workspace';
  document.getElementById('projectSection').style.display = 'block';
  document.getElementById('chatSection').style.display    = 'block';
  document.getElementById('viewTabs').style.display       = 'flex';
  document.getElementById('welcomeScreen').style.display  = 'none';

  const { projects } = await http(`/projects?workspace_id=${id}`);
  state.projects = projects;
  renderProjects();
  switchTab('tasks');
}

function renderProjects() {
  document.getElementById('projectList').innerHTML = state.projects
    .map(p => `<li class="${p.id === state.currentProjectId ? 'active' : ''}"
                   onclick="selectProject('${p.id}')"># ${p.name}</li>`)
    .join('');
}

async function selectProject(id) {
  state.currentProjectId = id;
  renderProjects();
  const p = state.projects.find(p => p.id === id);
  document.getElementById('currentViewTitle').textContent = p?.name || 'Project';
  switchTab('tasks');
  await loadTasks(id);
}

// CRUD
function showCreateWorkspace() {
  openGenericModal('Tạo Workspace mới',
    `<div class="form-group"><label>Tên Workspace</label>
      <input type="text" name="name" placeholder="Ví dụ: Team Marketing" required></div>`,
    async fd => {
      await http('/workspaces', { method: 'POST', body: JSON.stringify({ name: fd.get('name') }) });
      toast('✅ Tạo workspace thành công!');
      loadWorkspaces();
    }
  );
}

function showCreateProject() {
  openGenericModal('Tạo Dự án mới',
    `<div class="form-group"><label>Tên Dự án</label>
      <input type="text" name="name" placeholder="Ví dụ: Website Redesign" required></div>
     <div class="form-group"><label>Mô tả</label>
      <textarea name="description" rows="2"></textarea></div>`,
    async fd => {
      await http('/projects', { method: 'POST', body: JSON.stringify({
        workspace_id: state.currentWorkspaceId,
        name: fd.get('name'), description: fd.get('description')
      })});
      toast('✅ Tạo dự án thành công!');
      const { projects } = await http(`/projects?workspace_id=${state.currentWorkspaceId}`);
      state.projects = projects; renderProjects();
    }
  );
}

// ─── Tasks ───────────────────────────────
async function loadTasks(projectId) {
  try {
    const { tasks } = await http(`/tasks?project_id=${projectId}`);
    state.tasks = tasks;
    renderTasks();
    document.getElementById('tabTasks').style.display = 'block';
    document.getElementById('addTaskBtn').style.display = 'block';
  } catch (e) { toast('❌ ' + e.message, 'error'); }
}

function renderTasks() {
  ['todo', 'in-progress', 'done'].forEach(status => {
    const colId = status === 'todo' ? 'todoTasks' : status === 'in-progress' ? 'inProgressTasks' : 'doneTasks';
    const countId = status === 'todo' ? 'countTodo' : status === 'in-progress' ? 'countInProgress' : 'countDone';
    const filtered = state.tasks.filter(t => t.status === status);
    document.getElementById(colId).innerHTML = filtered.map(t => `
      <div class="task-card" onclick='showEditTask(${JSON.stringify(t)})'>
        <div class="task-card__title">${escHtml(t.title)}</div>
        <div class="task-card__footer">
          <span class="priority-badge priority-${t.priority}">${t.priority}</span>
        </div>
      </div>`).join('');
    document.getElementById(countId).textContent = filtered.length;
  });
}

function showCreateTask() {
  openGenericModal('Thêm Task mới',
    `<div class="form-group"><label>Tiêu đề</label>
      <input type="text" name="title" required></div>
     <div class="form-group"><label>Độ ưu tiên</label>
      <select name="priority">
        <option value="low">Thấp</option>
        <option value="medium" selected>Trung bình</option>
        <option value="high">Cao</option>
      </select></div>`,
    async fd => {
      await http('/tasks', { method: 'POST', body: JSON.stringify({
        project_id: state.currentProjectId,
        title: fd.get('title'), priority: fd.get('priority')
      })});
      toast('✅ Đã thêm task!');
      loadTasks(state.currentProjectId);
    }
  );
}

function showEditTask(task) {
  openGenericModal('Chỉnh sửa Task',
    `<div class="form-group"><label>Tiêu đề</label>
      <input type="text" name="title" value="${escHtml(task.title)}" required></div>
     <div class="form-group"><label>Trạng thái</label>
      <select name="status">
        <option value="todo" ${task.status==='todo'?'selected':''}>🔲 Cần làm</option>
        <option value="in-progress" ${task.status==='in-progress'?'selected':''}>⚡ Đang làm</option>
        <option value="done" ${task.status==='done'?'selected':''}>✅ Hoàn thành</option>
      </select></div>
     <div class="form-group"><label>Độ ưu tiên</label>
      <select name="priority">
        <option value="low" ${task.priority==='low'?'selected':''}>Thấp</option>
        <option value="medium" ${task.priority==='medium'?'selected':''}>Trung bình</option>
        <option value="high" ${task.priority==='high'?'selected':''}>Cao</option>
      </select></div>`,
    async fd => {
      await http(`/tasks/${task.id}`, { method: 'PUT', body: JSON.stringify({
        title: fd.get('title'), status: fd.get('status'), priority: fd.get('priority')
      })});
      toast('✅ Đã cập nhật task!');
      loadTasks(state.currentProjectId);
    }
  );
}

// ─── Members ─────────────────────────────
async function loadMembers() {
  try {
    const { members } = await http(`/workspaces/${state.currentWorkspaceId}`);
    state.members = members;
    renderMembers();
  } catch(e) { toast('❌ ' + e.message, 'error'); }
}

function renderMembers() {
  const list = document.getElementById('membersList');
  list.innerHTML = state.members.map(m => `
    <div class="member-card">
      <div class="member-avatar">${(m.display_name || m.email)[0].toUpperCase()}</div>
      <div class="member-info">
        <strong>${escHtml(m.display_name || m.email.split('@')[0])}</strong>
        <span>${escHtml(m.email)}</span>
      </div>
      <span class="member-role role-${m.role}">${m.role}</span>
    </div>`).join('');
}

function showInviteMember() {
  openGenericModal('Mời thành viên',
    `<div class="form-group"><label>Email thành viên</label>
      <input type="email" name="email" placeholder="name@company.com" required></div>
     <div class="form-group"><label>Vai trò</label>
      <select name="role">
        <option value="member">Member</option>
        <option value="admin">Admin</option>
        <option value="viewer">Viewer</option>
      </select></div>`,
    async fd => {
      const { invitation } = await http(`/workspaces/${state.currentWorkspaceId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ email: fd.get('email'), role: fd.get('role') })
      });
      toast(`✅ Đã gửi lời mời tới ${invitation.email}!`);
    }
  );
}

// ─── Chat ────────────────────────────────
async function loadChannels() {
  try {
    const { channels } = await http(`/chats?workspace_id=${state.currentWorkspaceId}`);
    state.channels = channels;
    renderChannels();
  } catch (e) { console.error(e); }
}

function renderChannels() {
  const build = (listId) => {
    const el = document.getElementById(listId);
    if (!el) return;
    el.innerHTML = state.channels.map(ch => `
      <li class="${ch.id === state.currentChannelId ? 'active' : ''}"
          onclick="selectChannel('${ch.id}')"># ${escHtml(ch.name)}</li>`).join('');
  };
  build('channelList'); build('chatChannelList');
}

async function selectChannel(id) {
  state.currentChannelId = id;
  renderChannels();

  const ch = state.channels.find(c => c.id === id);
  document.getElementById('chatEmpty').style.display = 'none';
  const main = document.getElementById('chatMain');
  main.style.display = 'flex';

  await loadMessages(id);
  subscribeToChannel(id);
  document.getElementById('chatInput').focus();
}

async function loadMessages(channelId) {
  try {
    const { messages } = await http(`/chats/${channelId}/messages`);
    state.messages = messages;
    renderMessages();
  } catch(e) { toast('❌ ' + e.message, 'error'); }
}

function renderMessages() {
  const box = document.getElementById('chatMessages');
  box.innerHTML = state.messages.map(m => {
    const isMe = m.user_id === state.user?.id;
    const name = m.users?.display_name || m.users?.email?.split('@')[0] || '?';
    const time = new Date(m.created_at).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'});
    return `<div class="chat-msg ${isMe ? 'chat-msg--me' : ''}">
      ${!isMe ? `<div class="chat-msg__name">${escHtml(name)}</div>` : ''}
      <div class="chat-msg__bubble">${escHtml(m.content)}</div>
      <div class="chat-msg__time">${time}</div>
    </div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

async function sendMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const content = input.value.trim();
  if (!content || !state.currentChannelId) return;
  input.value = '';
  try {
    await http(`/chats/${state.currentChannelId}/messages`, {
      method: 'POST', body: JSON.stringify({ content })
    });
    // optimistic: refetch
    await loadMessages(state.currentChannelId);
  } catch(e) { toast('❌ ' + e.message, 'error'); }
}

function subscribeToChannel(channelId) {
  if (state.chatSubscription) state.chatSubscription.unsubscribe();
  state.chatSubscription = supabase
    .channel('chat-' + channelId)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'chat_messages',
      filter: `channel_id=eq.${channelId}`
    }, () => loadMessages(channelId))
    .subscribe();
}

function showCreateChannel() {
  openGenericModal('Tạo kênh chat mới',
    `<div class="form-group"><label>Tên kênh</label>
      <input type="text" name="name" placeholder="Ví dụ: general" required></div>
     <div class="form-group"><label>Mô tả (tùy chọn)</label>
      <input type="text" name="description" placeholder="Kênh thảo luận chung"></div>`,
    async fd => {
      await http('/chats', { method: 'POST', body: JSON.stringify({
        workspace_id: state.currentWorkspaceId,
        name: fd.get('name'), description: fd.get('description')
      })});
      toast('✅ Tạo kênh thành công!');
      loadChannels();
    }
  );
}

// ─── Utils ───────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── DOMContentLoaded ─────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Close modals on backdrop click / ESC
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target===o) { closeModal(); closeGenericModal(); } });
  });
  document.addEventListener('keydown', e => { if (e.key==='Escape') { closeModal(); closeGenericModal(); } });

  // ─ Register ─
  document.getElementById('registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('registerBtn');
    btn.disabled = true; btn.textContent = 'Đang xử lý...';
    const email    = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const name     = document.getElementById('regName').value.trim();
    try {
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { display_name: name, full_name: name } }
      });
      if (error) throw error;

      // Show email confirmation notice (Supabase default behaviour)
      document.getElementById('emailConfirmNotice').style.display = 'block';
      toast('🎉 Đăng ký thành công! Hãy kiểm tra email để xác nhận.');
      e.target.reset();
      setTimeout(() => toggleAuthMode('login'), 1500);
    } catch(err) {
      toast('❌ ' + err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Đăng ký miễn phí';
    }
  });

  // ─ Login ─
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.disabled = true; btn.textContent = 'Đang đăng nhập...';
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const token = data.session.access_token;
      const userData = {
        id: data.user.id,
        email: data.user.email,
        display_name: data.user.user_metadata?.display_name || data.user.user_metadata?.full_name || ''
      };
      localStorage.setItem('gropd_token', token);
      localStorage.setItem('gropd_user', JSON.stringify(userData));

      closeModal();
      toast('👋 Chào mừng quay trở lại!');
      applyLoggedInUser(userData, token);
    } catch(err) {
      // friendly email-not-confirmed message
      const msg = err.message.includes('Email not confirmed')
        ? '📧 Bạn chưa xác nhận email. Hãy kiểm tra hộp thư của bạn.'
        : err.message;
      toast('❌ ' + msg, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Đăng nhập';
    }
  });

  // ─ Auto-login if token saved ─
  const savedUser  = localStorage.getItem('gropd_user');
  const savedToken = localStorage.getItem('gropd_token');
  if (savedUser && savedToken) {
    try { applyLoggedInUser(JSON.parse(savedUser), savedToken); } catch(e) {}
  }

  // ─ Mobile hamburger ─
  const ham = document.getElementById('hamburger');
  const nav = document.getElementById('nav');
  if (ham && nav) ham.addEventListener('click', () => { ham.classList.toggle('active'); nav.classList.toggle('open'); });

  // ─ Scroll animations ─
  const fadeEls = document.querySelectorAll('.fade-in');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((en, i) => {
      if (en.isIntersecting) setTimeout(() => en.target.classList.add('visible'), i * 100);
    });
  }, { threshold: 0.1 });
  fadeEls.forEach(el => obs.observe(el));
});
