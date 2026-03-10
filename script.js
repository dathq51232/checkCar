/* ========================================
   GropĐ — Interactive Scripts + API Integration
   ======================================== */

// ---------- API Base URL ----------
const API_BASE = window.location.origin + '/api';

// ---------- Modal Functions ----------
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  // Focus first input
  setTimeout(() => document.getElementById('regEmail').focus(), 300);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ---------- Toast Notification ----------
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast toast--' + type + ' show';

  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// ---------- DOM Ready ----------
document.addEventListener('DOMContentLoaded', () => {

  // ----- Modal: close on overlay click -----
  const overlay = document.getElementById('modalOverlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  // ----- Modal: close on Escape key -----
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // ----- Registration Form -----
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
          email: email,
          password: password,
          options: {
            data: {
              full_name: display_name
            }
          }
        });

        if (error) {
          throw error;
        }

        if (data.session) {
          localStorage.setItem('gropd_token', data.session.access_token);
          localStorage.setItem('gropd_user', JSON.stringify({
            email: data.user.email,
            display_name: data.user.user_metadata.full_name
          }));
        }

        closeModal();
        showToast('🎉 Đăng ký thành công!', 'success');
        registerForm.reset();

        updateAuthUI({
          email: data.user.email,
          display_name: data.user.user_metadata.full_name || data.user.email.split('@')[0]
        });
      } catch (err) {
        showToast('❌ ' + (err.message || 'Không thể kết nối server. Vui lòng thử lại.'), 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  }

  // ----- Update Auth UI -----
  function updateAuthUI(user) {
    const headerCta = document.querySelector('.header__cta');
    if (headerCta && user) {
      headerCta.textContent = user.display_name || user.email.split('@')[0];
      headerCta.onclick = null;
      headerCta.style.cursor = 'default';
    }
  }

  // ----- Check if already logged in -----
  const savedUser = localStorage.getItem('gropd_user');
  if (savedUser) {
    try {
      updateAuthUI(JSON.parse(savedUser));
    } catch (e) {}
  }

  // ---------- Mobile Menu Toggle ----------
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('nav');

  if (hamburger && nav) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      nav.classList.toggle('open');
      document.body.style.overflow = nav.classList.contains('open') ? 'hidden' : '';
    });

    // Close menu when a nav link is clicked
    nav.querySelectorAll('.nav__link').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        nav.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  // ---------- Header Scroll Effect ----------
  const header = document.getElementById('header');

  window.addEventListener('scroll', () => {
    const current = window.scrollY;
    if (current > 100) {
      header.style.boxShadow = '0 4px 0 var(--color-black)';
    } else {
      header.style.boxShadow = 'none';
    }
  }, { passive: true });

  // ---------- Scroll Animations (Intersection Observer) ----------
  const fadeEls = document.querySelectorAll('.fade-in');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.classList.add('visible');
          }, index * 120);
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -40px 0px'
    });

    fadeEls.forEach(el => observer.observe(el));
  } else {
    fadeEls.forEach(el => el.classList.add('visible'));
  }

  // ---------- Animated Stat Counters ----------
  const statNumbers = document.querySelectorAll('.stat__number[data-target]');

  function animateCounter(el) {
    const target = parseInt(el.dataset.target, 10);
    const duration = 2000;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * target);

      el.textContent = current.toLocaleString('vi-VN');

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        const label = el.closest('.stat').querySelector('.stat__label').textContent;
        if (label.includes('%')) {
          el.textContent = target + '%';
        } else if (target >= 100) {
          el.textContent = target.toLocaleString('vi-VN') + '+';
        } else {
          el.textContent = target;
        }
      }
    }

    requestAnimationFrame(update);
  }

  if ('IntersectionObserver' in window) {
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    statNumbers.forEach(el => counterObserver.observe(el));
  } else {
    statNumbers.forEach(el => {
      el.textContent = parseInt(el.dataset.target, 10).toLocaleString('vi-VN');
    });
  }

  // ---------- Smooth Scroll for anchor links ----------
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        const headerHeight = header ? header.offsetHeight : 0;
        const top = targetEl.getBoundingClientRect().top + window.scrollY - headerHeight;

        window.scrollTo({
          top,
          behavior: 'smooth'
        });
      }
    });
  });

});
