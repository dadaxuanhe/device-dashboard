/**
 * app.js - 应用入口模块
 *
 * 职责：页面全局初始化（主题/侧边栏/导航/时钟/快捷键/全屏/通知等），
 * 角色权限守卫，标签页闪烁提醒。
 */

// ==========================================
// 角色权限守卫
// ==========================================

/**
 * 检查当前页面是否允许当前角色访问
 * @returns {boolean} 是否有权限
 */
function checkPageAccess() {
  var user = getCurrentUser();
  if (!user) return true;

  var currentPath = window.location.pathname;
  var currentPage = currentPath.split('/').pop();

  // 普通员工只能访问看板和详情页
  if (isOnlyViewer()) {
    var allowedPages = ['index.html', 'detail.html', 'display.html', ''];
    var isAllowed = allowedPages.some(function(p) {
      return currentPage === p || currentPath.endsWith('/' + p) || currentPath.endsWith('/');
    });
    if (!isAllowed && !currentPath.includes('login.html')) {
      console.warn('⛔ 普通员工权限不足，跳转到首页');
      window.location.href = 'index.html';
      return false;
    }
  }

  // ------------------------------------------------------------
  // 看板模板 & 发布管理 → 仅看板管理员（dashboard_admin）可访问
  // ------------------------------------------------------------
  // 功能：拦截非看板管理员用户通过 URL 直接访问 templates.html 或 publish.html
  // 角色要求：dashboard_admin（看板管理员）
  // 拦截后自动重定向到首页 index.html
  // ------------------------------------------------------------
  var restrictedPages = ['templates.html', 'publish.html'];
  if (restrictedPages.indexOf(currentPage) !== -1 && !hasRole('dashboard_admin')) {
    console.warn('⛔ 权限不足，仅看板管理员可访问此页面，跳转到首页');
    window.location.href = 'index.html';
    return false;
  }

  return true;
}

/**
 * 根据角色过滤侧边栏导航项
 */
function filterSidebarByRole() {
  var navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(function(item) {
    var page = item.dataset.page;
    // 普通员工只显示 dashboard 和 detail
    if (isOnlyViewer()) {
      if (page !== 'dashboard' && page !== 'detail') {
        item.style.display = 'none';
      }
    }
    // 设备维修员、普通员工隐藏设置
    if (page === 'settings' && !hasRole('dashboard_admin') && !hasRole('workshop_supervisor')) {
      item.style.display = 'none';
    }
    // 非车间主管且非看板管理员隐藏人员管理
    if (page === 'personnel' && !hasRole('workshop_supervisor') && !hasRole('dashboard_admin')) {
      item.style.display = 'none';
    }
    // ------------------------------------------------------------
    // 看板模板 & 发布管理 → 仅看板管理员（dashboard_admin）可见
    // ------------------------------------------------------------
    // 目的：侧边栏中「看板模板」和「发布管理」两个导航项
    //       只有拥有 dashboard_admin 角色的用户才显示
    //       其余角色（车间主管/设备维修员/普通员工）均隐藏
    // ------------------------------------------------------------
    if ((page === 'templates' || page === 'publish') && !hasRole('dashboard_admin')) {
      item.style.display = 'none';
    }
  });
}

// ==========================================
// 全局初始化
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 登录检查
  if (sessionStorage.getItem('isLoggedIn') !== 'true' && !window.location.pathname.includes('login.html')) {
    window.location.href = 'login.html';
    return;
  }

  // 角色权限守卫
  if (!checkPageAccess()) return;

  // 普通员工标记（方便CSS控制显示/隐藏）
  if (isOnlyViewer()) {
    document.body.classList.add('is-viewer');
  }

  initTheme();
  initSidebar();
  initNavigation();
  filterSidebarByRole();
  initClock();
  initKeyboardShortcuts();
  initThemeToggle();
  initNotificationToggle();
  initUserAvatar();

  // 侧边栏遮罩点击关闭
  var overlay = document.getElementById('sidebarOverlay');
  if (overlay) {
    overlay.addEventListener('click', function() {
      document.getElementById('sidebar')?.classList.remove('open');
      overlay.classList.remove('active');
    });
  }


  if (typeof loadAllCharts === 'function') {
    var savedRange = localStorage.getItem('dashboard_timeRange') || '7d';
    loadAllCharts(savedRange);
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

  if (!sidebar) {
    console.error('[initSidebar] 未找到 #sidebar 元素 —— 侧边栏功能将不可用');
  }

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
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.innerWidth <= 1023) {
        sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
      } else {
        sidebar.classList.toggle('collapsed');
        var isCollapsed = sidebar.classList.contains('collapsed');
        var imgIcon = toggleBtn.querySelector('img');
        if (imgIcon) {
          var basePath = window.location.pathname.includes('/pages/') ? '../assets/icons/' : 'assets/icons/';
          imgIcon.src = isCollapsed ? basePath + 'expand.svg' : basePath + 'collapse.svg';
          imgIcon.alt = isCollapsed ? '展开' : '折叠';
          imgIcon.onerror = function() {
            imgIcon.outerHTML = '<i class="fas fa-arrow-left" style="font-size:16px;color:#6C3FF5;margin:0 auto;"></i>';
          };
        } else {
          // <i> 图标切换：bars ↔ arrow-left
          var iIcon = toggleBtn.querySelector('i');
          if (iIcon) {
            iIcon.className = isCollapsed ? 'fas fa-arrow-left' : 'fas fa-bars';
          }
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

  const mainContent = document.getElementById('mainContent');
  if (mainContent) {
    mainContent.addEventListener('click', function(e) {
      // 仅在侧边栏处于打开状态（open）并且是平板/手机宽度时，才关闭它
      if (window.innerWidth <= 1023 && document.getElementById('sidebar')?.classList.contains('open')) {
        closeSidebar();
      }
    });
  }

  // 点击遮罩层关闭侧边栏（移动端）
  if (overlay) {
    overlay.addEventListener('click', function() {
      closeSidebar();
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
    } else if (page === 'templates' && currentPage === 'templates.html') {
      item.classList.add('active');
    } else if (page === 'publish' && currentPage === 'publish.html') {
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
// 标签页闪烁
// ============================================================

let originalTitle = document.title;
let isBlinking = false;
let blinkInterval = null;

/**
 * 开始闪烁标签页标题
 * @param {string} message
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
 * 检查新告警并触发闪烁
 * @param {number} previousCount
 * @param {number} currentCount
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
// 主题切换
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
    var topIcon = document.querySelector('#topThemeBtn i');
    if (topIcon) { topIcon.className = 'fas fa-sun'; topIcon.style.color = '#ffd740'; }
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('dashboard_theme', 'dark');
    var label = document.querySelector('.theme-label');
    var icon = document.querySelector('.theme-icon');
    if (label) label.textContent = '暗色主题';
    if (icon) icon.textContent = '🌙';
    var topIcon = document.querySelector('#topThemeBtn i');
    if (topIcon) { topIcon.className = 'fas fa-moon'; topIcon.style.color = ''; }
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
 * 初始化通知横幅开关
 */
function initNotificationToggle() {
  var btn = document.getElementById('notificationBtn');
  var ticker = document.getElementById('alertTicker');
  if (!btn || !ticker) return;

  // 回显上次的状态
  var hidden = localStorage.getItem('dashboard_notification_hidden') === 'true';
  if (hidden) {
    ticker.style.display = 'none';
    btn.classList.add('muted');
  }

  btn.addEventListener('click', function() {
    var isHidden = ticker.style.display === 'none' || ticker.style.display === '';
    if (isHidden || getComputedStyle(ticker).display === 'none') {
      ticker.style.display = 'flex';
      btn.classList.remove('muted');
      localStorage.setItem('dashboard_notification_hidden', 'false');
    } else {
      ticker.style.display = 'none';
      btn.classList.add('muted');
      localStorage.setItem('dashboard_notification_hidden', 'true');
    }
  });
}

/**
 * 初始化主题切换按钮
 */
function initThemeToggle() {
  var sidebarBtn = document.getElementById('themeToggle');
  if (sidebarBtn) sidebarBtn.addEventListener('click', toggleTheme);
  var topBtn = document.getElementById('topThemeBtn');
  if (topBtn) topBtn.addEventListener('click', toggleTheme);
}

/**
 * 用户头像按钮 → 跳转系统设置
 */
function initUserAvatar() {
  var avatar = document.getElementById('userAvatar');
  if (avatar) {
    var user = getCurrentUser();
    var canAccessSettings = user && user.roles && (user.roles.indexOf('dashboard_admin') !== -1 || user.roles.indexOf('workshop_supervisor') !== -1);

    // 根据角色设置不同的光标样式和标题提示
    if (canAccessSettings) {
      avatar.style.cursor = 'pointer';
      avatar.title = '点击进入系统设置';
      avatar.addEventListener('click', function() {
        // 检测当前是否在 pages/ 子目录下，正确拼接路径
        var inSubDir = window.location.pathname.indexOf('/pages/') !== -1;
        location.href = inSubDir ? 'settings.html' : 'pages/settings.html';
      });
    } else if (isOnlyViewer()) {
      avatar.style.cursor = 'default';
      avatar.title = '只读模式，无法访问设置';
    } else {
      avatar.style.cursor = 'not-allowed';
      avatar.title = '当前角色无权限访问设置';
      avatar.addEventListener('click', function() {
        if (typeof showToast === 'function') showToast('⛔ 当前角色无权限访问系统设置');
      });
    }
  }

  // 更新顶部栏的用户名和角色显示
  var userNameEl = document.getElementById('userNameDisplay');
  var userRoleEl = document.getElementById('userRoleDisplay');
  var user = getCurrentUser();
  if (user) {
    if (userNameEl) userNameEl.textContent = user.name || user.username;
    if (userRoleEl) {
      var roleTexts = (user.roles || []).map(function(r) { return getRoleText(r); }).join(' / ');
      userRoleEl.textContent = roleTexts || '普通员工';
    }
  }
}

// ============================================================
// 键盘快捷键
// ============================================================
function initKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    // Ctrl+K 搜索
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      var searchInput = document.getElementById('searchInput');
      if (searchInput) { searchInput.focus(); searchInput.select(); }
      return;
    }
    // ESC 取消聚焦
    if (e.key === 'Escape') {
      var searchInput = document.getElementById('searchInput');
      if (searchInput && document.activeElement === searchInput) { searchInput.blur(); return; }
    }
    // R 键刷新
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      var refreshBtn = document.getElementById('refreshBtn');
      if (refreshBtn) refreshBtn.click();
    }
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
