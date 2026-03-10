/* ========================================
   GropĐ — Interactive Scripts + API Integration
   ======================================== */

// ---------- State Management ----------
let currentState = {
  user: null,
  workspaces: [],
  projects: [],
  tasks: [],
  currentWorkspaceId: null,
  currentProjectId: null
};

// ---------- API Base URL ----------
const API_BASE = window.location.origin + '/api';

// ---------- Helpers ----------
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('gropd_token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || result.errors?.[0]?.msg || 'API Error');
  return result;
}

// ---------- Modal Functions ----------
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
  const regView = document.getElementById('registerView');
  const loginView = document.getElementById('loginView');
  if (mode === 'login') {
    regView.style.display = 'none';
    loginView.style.display = 'block';
    document.getElementById('loginEmail').focus();
  } else {
    regView.style.display = 'block';
    loginView.style.display = 'none';
    document.getElementById('regEmail').focus();
  }
}

// ---------- Generic Modal (CRUD) ----------
function openGenericModal(title, contentHtml, onSubmit) {
  const modal = document.getElementById('genericModal');
  document.getElementById('genericModalTitle').textContent = title;
  document.getElementById('genericFormContent').innerHTML = contentHtml;
  modal.classList.add('open');
  
  const form = document.getElementById('genericForm');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('genericSubmitBtn');
    btn.disabled = true;
    try {
      await onSubmit(new FormData(form));
      closeGenericModal();
    } catch (err) {
      showToast('❌ ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };
}

function closeGenericModal() {
  document.getElementById('genericModal').classList.remove('open');
}

// ---------- UI Rendering ----------
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast toast--' + type + ' show';
  setTimeout(() => toast.classList.remove('show'), 4000);
}

function switchView(view) {
  const landing = document.querySelectorAll('header, section, footer');
  const dashboard = document.getElementById('dashboard');
  
  if (view === 'app') {
    landing.forEach(el => { if(el.id !== 'dashboard') el.style.display = 'none'; });
    dashboard.style.display = 'grid';
    document.body.style.backgroundColor = 'var(--color-bg)';
  } else {
    landing.forEach(el => { if(el.id !== 'dashboard') el.style.display = ''; });
    dashboard.style.display = 'none';
  }
}

// ---------- Auth Logic ----------
async function handleLogout() {
  await supabase.auth.signOut();
  localStorage.removeItem('gropd_token');
  localStorage.removeItem('gropd_user');
  window.location.reload();
}

function updateAuthUI(user) {
  if (user) {
    currentState.user = user;
    document.getElementById('userDisplayName').textContent = user.display_name || user.email.split('@')[0];
    switchView('app');
    loadWorkspaces();
  }
}

// ---------- Data Loading ----------
async function loadWorkspaces() {
  try {
    const { workspaces } = await apiRequest('/workspaces');
    currentState.workspaces = workspaces;
    renderWorkspaces();
  } catch (err) {
    console.error(err);
  }
}

function renderWorkspaces() {
  const list = document.getElementById('workspaceList');
  list.innerHTML = currentState.workspaces.map(ws => `
    <li class="${currentState.currentWorkspaceId === ws.id ? 'active' : ''}" onclick="selectWorkspace('${ws.id}')">
      ${ws.name}
    </li>
  `).join('');
}

async function selectWorkspace(id) {
  currentState.currentWorkspaceId = id;
  currentState.currentProjectId = null;
  renderWorkspaces();
  document.getElementById('newProjectBtn').disabled = false;
  document.getElementById('currentViewTitle').textContent = currentState.workspaces.find(w => w.id === id).name;
  
  try {
    const { projects } = await apiRequest(`/projects?workspace_id=${id}`);
    currentState.projects = projects;
    renderProjects();
    showWelcome();
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
}

function renderProjects() {
  const list = document.getElementById('projectList');
  list.innerHTML = currentState.projects.map(p => `
    <li class="${currentState.currentProjectId === p.id ? 'active' : ''}" onclick="selectProject('${p.id}')">
      # ${p.name}
    </li>
  `).join('');
}

async function selectProject(id) {
  currentState.currentProjectId = id;
  renderProjects();
  const project = currentState.projects.find(p => p.id === id);
  document.getElementById('currentViewTitle').textContent = project.name;
  document.getElementById('addTaskBtn').style.display = 'block';
  
  await loadTasks(id);
}

async function loadTasks(projectId) {
  try {
    const { tasks } = await apiRequest(`/tasks?project_id=${projectId}`);
    currentState.tasks = tasks;
    renderTasks();
    
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('taskBoard').style.display = 'grid';
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
}

function renderTasks() {
  const columns = {
    todo: document.getElementById('todoTasks'),
    'in-progress': document.getElementById('inProgressTasks'),
    done: document.getElementById('doneTasks')
  };
  
  Object.values(columns).forEach(col => col.innerHTML = '');
  
  currentState.tasks.forEach(task => {
    const col = columns[task.status] || columns.todo;
    const card = document.createElement('div');
    card.className = 'task-card';
    card.onclick = () => showEditTask(task);
    card.innerHTML = `
      <div class="task-card__title">${task.title}</div>
      <div class="task-card__footer">
        <span class="priority-badge priority-${task.priority}">${task.priority}</span>
      </div>
    `;
    col.appendChild(card);
  });
  
  // Update counts
  document.querySelectorAll('.board-column').forEach(col => {
    const status = col.dataset.status;
    const count = currentState.tasks.filter(t => t.status === status).length;
    col.querySelector('.count').textContent = count;
  });
}

function showWelcome() {
  document.getElementById('welcomeScreen').style.display = 'block';
  document.getElementById('taskBoard').style.display = 'none';
  document.getElementById('addTaskBtn').style.display = 'none';
}

// ---------- CRUD Actions ----------
function showCreateWorkspace() {
  openGenericModal('Tạo Workspace mới', `
    <div class="form-group">
      <label>Tên Workspace</label>
      <input type="text" name="name" placeholder="Ví dụ: Team Marketing" required>
    </div>
  `, async (formData) => {
    await apiRequest('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: formData.get('name') })
    });
    showToast('Tạo workspace thành công!');
    loadWorkspaces();
  });
}

function showCreateProject() {
  openGenericModal('Tạo Dự án mới', `
    <div class="form-group">
      <label>Tên Dự án</label>
      <input type="text" name="name" placeholder="Ví dụ: Website Redesign" required>
    </div>
    <div class="form-group">
      <label>Mô tả</label>
      <textarea name="description" rows="3"></textarea>
    </div>
  `, async (formData) => {
    await apiRequest('/projects', {
      method: 'POST',
      body: JSON.stringify({
        workspace_id: currentState.currentWorkspaceId,
        name: formData.get('name'),
        description: formData.get('description')
      })
    });
    showToast('Tạo dự án thành công!');
    selectWorkspace(currentState.currentWorkspaceId);
  });
}

function showCreateTask() {
  openGenericModal('Thêm Task mới', `
    <div class="form-group">
      <label>Tiêu đề</label>
      <input type="text" name="title" required>
    </div>
    <div class="form-group">
      <label>Độ ưu tiên</label>
      <select name="priority">
        <option value="low">Thấp</option>
        <option value="medium" selected>Trung bình</option>
        <option value="high">Cao</option>
      </select>
    </div>
  `, async (formData) => {
    await apiRequest('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        project_id: currentState.currentProjectId,
        title: formData.get('title'),
        priority: formData.get('priority')
      })
    });
    showToast('Đã thêm task!');
    loadTasks(currentState.currentProjectId);
  });
}

function showEditTask(task) {
  openGenericModal('Chỉnh sửa Task', `
    <div class="form-group">
      <label>Tiêu đề</label>
      <input type="text" name="title" value="${task.title}" required>
    </div>
    <div class="form-group">
      <label>Trạng thái</label>
      <select name="status">
        <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>Cần làm</option>
        <option value="in-progress" ${task.status === 'in-progress' ? 'selected' : ''}>Đang làm</option>
        <option value="done" ${task.status === 'done' ? 'selected' : ''}>Hoàn thành</option>
      </select>
    </div>
    <div class="form-group">
      <label>Độ ưu tiên</label>
      <select name="priority">
        <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Thấp</option>
        <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Trung bình</option>
        <option value="high" ${task.priority === 'high' ? 'selected' : ''}>Cao</option>
      </select>
    </div>
  `, async (formData) => {
    await apiRequest(`/tasks/${task.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: formData.get('title'),
        status: formData.get('status'),
        priority: formData.get('priority')
      })
    });
    showToast('Đã cập nhật task!');
    loadTasks(currentState.currentProjectId);
  });
}

// ---------- DOM Ready ----------
document.addEventListener('DOMContentLoaded', () => {

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal();
        closeGenericModal();
      }
    });
  });

  // Modal: close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeGenericModal();
    }
  });

  // Registration Form
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('registerBtn');
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Đang xử lý...';

      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      const display_name = document.getElementById('regName').value.trim();

      try {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { display_name } }
        });

        if (error) throw error;
        
        showToast('🎉 Đăng ký thành công! Hãy đăng nhập.', 'success');
        toggleAuthMode('login');
        registerForm.reset();
      } catch (err) {
        showToast('❌ ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  }

  // Login Form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('loginBtn');
      btn.disabled = true;
      btn.textContent = 'Đang đăng nhập...';

      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;

      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        localStorage.setItem('gropd_token', data.session.access_token);
        const userData = {
          email: data.user.email,
          display_name: data.user.user_metadata.display_name
        };
        localStorage.setItem('gropd_user', JSON.stringify(userData));

        closeModal();
        showToast('Chào mừng quay trở lại!', 'success');
        updateAuthUI(userData);
      } catch (err) {
        showToast('❌ ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Đăng nhập';
      }
    });
  }

  // Check if already logged in
  const savedUser = localStorage.getItem('gropd_user');
  if (savedUser) {
    try {
      updateAuthUI(JSON.parse(savedUser));
    } catch (e) {}
  }

  // Mobile Menu Toggle
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('nav');

  if (hamburger && nav) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      nav.classList.toggle('open');
    });
  }

  // Header Scroll Effect
  const header = document.getElementById('header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 100) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }
  }, { passive: true });

  // Intersection Observer for animations
  const fadeEls = document.querySelectorAll('.fade-in');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), index * 100);
      }
    });
  }, { threshold: 0.1 });
  fadeEls.forEach(el => observer.observe(el));

});
