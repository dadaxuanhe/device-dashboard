/**
 * app.js - 应用入口模块
 *
 * 职责：
 * 1. 页面加载完成后初始化全局功能
 * 2. 侧边栏折叠/展开控制
 * 3. 导航高亮（根据当前页面）
 * 4. 全局时钟显示
 * 5. 响应式侧边栏（移动端点击遮罩关闭）
 */

// ==========================================
// 全局初始化
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 登录检查：未登录跳转到登录页
  if (sessionStorage.getItem('isLoggedIn') !== 'true' && !window.location.pathname.includes('login.html')) {
    window.location.href = 'login.html';
    return;
  }

  initTheme();
  initSidebar();
  initNavigation();
  initClock();
  initKeyboardShortcuts();
  initFullscreenBtn();
  initThemeToggle();

  // 侧边栏遮罩点击关闭
  var overlay = document.getElementById('sidebarOverlay');
  if (overlay) {
    overlay.addEventListener('click', function() {
      document.getElementById('sidebar')?.classList.remove('open');
      overlay.classList.remove('active');
    });
  }

  // 初始化时间范围切换按钮（图表联动）
  if (typeof initRangeButtons === 'function') {
    initRangeButtons();
  }

  // 默认加载近7天图表
  if (typeof loadAllCharts === 'function') {
    loadAllCharts('7d');
  }
});

// ==========================================
// 侧边栏控制
// ==========================================

/**
 * 初始化侧边栏功能
 */
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggle');
  const menuBtn = document.getElementById('menuBtn');
  const overlay = document.getElementById('sidebarOverlay');

  // 防御：若 #sidebar 不存在则日志反馈
  if (!sidebar) {
    console.error('[initSidebar] 未找到 #sidebar 元素 —— 侧边栏功能将不可用');
  }

  // 移动端：打开/关闭侧边栏
  function openSidebar() {
    if (sidebar) {
      sidebar.classList.remove('collapsed');
      sidebar.classList.add('open');
    }
    if (overlay) overlay.classList.add('active');
  }
  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('open', 'collapsed');
    if (overlay) overlay.classList.remove('active');
  }

  // 桌面端折叠按钮
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      if (window.innerWidth <= 1023) {
        // 平板/手机：切换侧边栏
        sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
      } else {
        // 桌面：折叠/展开
        sidebar.classList.toggle('collapsed');
        const icon = toggleBtn.querySelector('img');
        if (icon) {
          var basePath = window.location.pathname.includes('/pages/') ? '../assets/icons/' : 'assets/icons/';
          var expandIcon = basePath + 'expand.svg';
          var collapseIcon = basePath + 'collapse.svg';
          icon.src = sidebar.classList.contains('collapsed') ? expandIcon : collapseIcon;
          icon.alt = sidebar.classList.contains('collapsed') ? '展开' : '折叠';
          // 图片加载失败时回退为 Font Awesome 图标，避免 404 空白
          icon.onerror = function() {
            icon.outerHTML = '<i class="fas fa-arrow-left" style="font-size:16px;color:#6C3FF5;margin:0 auto;"></i>';
          };
        }
      }
    });
  }

  // 移动端菜单按钮
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      openSidebar();
    });
  }

  // 点击主内容区关闭移动端侧边栏（修复因窗口尺寸判断导致的点击全屏触发）
  const mainContent = document.getElementById('mainContent');
  if (mainContent) {
    mainContent.addEventListener('click', function(e) {
      // 仅在侧边栏处于打开状态（open）并且是平板/手机宽度时，才关闭它
      if (window.innerWidth <= 1023 && document.getElementById('sidebar')?.classList.contains('open')) {
        closeSidebar();
      }
    });
  }
}

// ==========================================
// 导航高亮
// ==========================================

/**
 * 初始化导航高亮
 * 根据当前页面 URL 自动高亮对应导航项（不写死 active 类）
 */
function initNavigation() {
  const currentPath = window.location.pathname;
  const currentPage = currentPath.split('/').pop();

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    const href = item.getAttribute('href') || '';
    const page = item.dataset.page;

    // 精确匹配文件名
    if (href === currentPage) {
      item.classList.add('active');
      return;
    }

    // data-page 匹配
    if (page === 'dashboard' && (currentPage === 'index.html' || currentPage === '' || currentPage === '/')) {
      item.classList.add('active');
    } else if (page === 'detail' && currentPage === 'detail.html') {
      item.classList.add('active');
    } else if (page === 'alarms' && currentPage === 'alarms.html') {
      item.classList.add('active');
    } else if (page === 'personnel' && currentPage === 'personnel.html') {
      item.classList.add('active');
    } else if (page === 'settings' && currentPage === 'settings.html') {
      item.classList.add('active');
    }
  });
}

// ==========================================
// 全局时钟
// ==========================================

let clockInterval = null;

/**
 * 初始化全局时钟
 */
function initClock() {
  const clockEl = document.getElementById('clock');
  if (!clockEl) return;

  function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    clockEl.textContent = `${hours}:${minutes}:${seconds}`;
  }

  updateClock();
  clockInterval = setInterval(updateClock, 1000);
}

// ============================================================
// 标签页闪烁（加分项：有新告警时闪烁标题）
// ============================================================

let originalTitle = document.title;
let isBlinking = false;
let blinkInterval = null;

/**
 * 开始闪烁标签页标题
 * @param {string} message - 闪烁时显示的消息
 */
function startBlinking(message) {
  message = message || '⚠️ 新告警！';
  if (isBlinking) return;
  isBlinking = true;

  var count = 0;
  blinkInterval = setInterval(function() {
    count++;
    document.title = (count % 2 === 0) ? originalTitle : message + ' - ' + originalTitle;
  }, 500);
}

/**
 * 停止闪烁标签页标题
 */
function stopBlinking() {
  if (blinkInterval) {
    clearInterval(blinkInterval);
    blinkInterval = null;
  }
  isBlinking = false;
  document.title = originalTitle;
}

/**
 * 检查是否有新告警并触发闪烁
 * @param {number} previousCount - 之前的告警数
 * @param {number} currentCount - 当前的告警数
 */
function checkNewAlarms(previousCount, currentCount) {
  if (currentCount > previousCount) {
    startBlinking('🔔 ' + (currentCount - previousCount) + '条新告警');

    // 页面可见时自动停止闪烁
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) stopBlinking();
    });

    // 用户点击页面任意位置停止闪烁
    document.addEventListener('click', function() { stopBlinking(); }, { once: true });
  }
}

// ============================================================
// 主题切换功能（加分项）
// ============================================================

var currentTheme = localStorage.getItem('dashboard_theme') || 'dark';

/**
 * 应用主题
 * @param {string} theme - 'dark' 或 'light'
 */
function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('dashboard_theme', 'light');
    var label = document.querySelector('.theme-label');
    var icon = document.querySelector('.theme-icon');
    if (label) label.textContent = '亮色主题';
    if (icon) icon.textContent = '☀️';
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('dashboard_theme', 'dark');
    var label = document.querySelector('.theme-label');
    var icon = document.querySelector('.theme-icon');
    if (label) label.textContent = '暗色主题';
    if (icon) icon.textContent = '🌙';
  }
  currentTheme = theme;
}

/**
 * 切换主题
 */
function toggleTheme() {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

/**
 * 初始化主题（页面加载时调用）
 */
function initTheme() {
  var saved = localStorage.getItem('dashboard_theme');
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

/**
 * 初始化主题切换按钮
 */
function initThemeToggle() {
  var btn = document.getElementById('themeToggle');
  if (btn) btn.addEventListener('click', toggleTheme);
}

// ============================================================
// 加分项：键盘快捷键
// ============================================================
function initKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      var searchInput = document.getElementById('searchInput');
      if (searchInput) { searchInput.focus(); searchInput.select(); }
      return;
    }
    if (e.key === 'Escape') {
      var searchInput = document.getElementById('searchInput');
      if (searchInput && document.activeElement === searchInput) { searchInput.blur(); return; }
    }
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      var refreshBtn = document.getElementById('refreshBtn');
      if (refreshBtn) refreshBtn.click();
    }
  });
}

// ============================================================
// 加分项：全屏模式
// ============================================================
function toggleFullscreen() {
  var el = document.documentElement;
  if (!document.fullscreenElement) {
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.msRequestFullscreen) el.msRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  }
}

function initFullscreenBtn() {
  var btn = document.getElementById('fullscreenBtn');
  if (!btn) return;
  btn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', function() {
    btn.textContent = document.fullscreenElement ? '⛶ 退出全屏' : '⛶ 全屏';
  });
}

// ==========================================
// 页面卸载清理
// ==========================================
window.addEventListener('beforeunload', () => {
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
});
