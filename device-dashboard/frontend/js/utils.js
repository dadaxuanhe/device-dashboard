/**
 * utils.js - 工具函数集合
 *
 * 防抖、日期格式化、状态映射、CSV 导出、角色权限、Toast 等。
 * 状态映射兼容新旧命名（online↔running, warning↔idle, error↔fault）。
 */

/**
 * 防抖函数
 * @param {Function} fn
 * @param {number} delay - 延迟毫秒数，默认 300
 * @returns {Function}
 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 格式化日期
 * @param {string|Date} dateStr - 日期字符串或 Date 对象
 * @param {string} format - 格式（默认 YYYY-MM-DD HH:mm）
 * @returns {string} 格式化后的日期
 */
function formatDate(dateStr, format = 'YYYY-MM-DD HH:mm') {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '--';

  const pad = (n) => String(n).padStart(2, '0');

  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * 简单日期格式（仅日期）
 * @param {string|Date} date
 * @returns {string}
 */
function formatDateShort(date) {
  return formatDate(date, 'YYYY-MM-DD');
}

/**
 * 时间格式（仅时间）
 * @param {string|Date} date
 * @returns {string}
 */
function formatTime(date) {
  return formatDate(date, 'HH:mm:ss');
}

/**
 * 获取状态颜色
 * @param {string} status
 * @returns {string} 十六进制颜色值
 */
function getStatusColor(status) {
  const map = {
    running: '#00e676',
    online: '#00e676',
    idle: '#ffd740',
    warning: '#ffd740',
    fault: '#ff1744',
    error: '#ff1744',
    offline: '#546e7a'
  };
  return map[status] || '#546e7a';
}

/**
 * 获取状态对应的 CSS 类名
 * @param {string} status - 设备状态
 * @returns {string} CSS 类名
 */
function getStatusClass(status) {
  const map = {
    online: 'badge--online',
    offline: 'badge--offline',
    warning: 'badge--warning-status',
    error: 'badge--error-status'
  };
  return map[status] || 'badge--offline';
}

/**
 * 获取状态文本
 * @param {string} status
 * @returns {string} 中文状态名
 */
function getStatusText(status) {
  const map = {
    running: '运行中',
    online: '运行中',
    idle: '待机',
    warning: '警告',
    fault: '故障',
    error: '故障',
    offline: '离线'
  };
  return map[status] || '未知';
}

/**
 * 获取告警级别对应的 CSS 类名
 * @param {string} level - 告警级别
 * @returns {string} CSS 类名
 */
function getAlarmLevelClass(level) {
  const map = {
    critical: 'badge--critical',
    warning: 'badge--warning',
    info: 'badge--info'
  };
  return map[level] || 'badge--info';
}

/**
 * 获取告警级别中文文本
 * @param {string} level - 告警级别
 * @returns {string} 中文文本
 */
function getAlarmLevelText(level) {
  const map = {
    critical: '严重',
    warning: '警告',
    info: '提示'
  };
  return map[level] || '未知';
}

/**
 * 获取告警状态中文文本
 * @param {string} status - 告警状态
 * @returns {string} 中文文本
 */
function getAlarmStatusText(status) {
  const map = {
    active: '待处理',
    confirmed: '已确认',
    cleared: '已清除'
  };
  return map[status] || '未知';
}

/**
 * 获取告警状态 CSS 类名
 * @param {string} status - 告警状态
 * @returns {string} CSS 类名
 */
function getAlarmStatusClass(status) {
  const map = {
    active: 'badge--active',
    confirmed: 'badge--confirmed',
    cleared: 'badge--cleared'
  };
  return map[status] || 'badge--info';
}

/**
 * 格式化数字（千分位）
 * @param {number} num
 * @returns {string}
 */
function formatNumber(num) {
  if (num === null || num === undefined) return '--';
  return num.toLocaleString('zh-CN');
}

/**
 * 获取设备类型对应的图标 emoji
 * @param {string} type - 设备类型
 * @returns {string} emoji 字符
 */
function getDeviceTypeIcon(type) {
  const map = {
    '数控机床': '🔧',
    '注塑机': '💉',
    '工业机器人': '🤖',
    '贴片机': '📦',
    '空压机': '🌀',
    '检测仪': '🔬'
  };
  return map[type] || '⚙️';
}

// ============================================================
// 导出CSV工具
// ============================================================

/**
 * 导出数据为CSV文件
 * @param {Array} data - 数据数组
 * @param {Array} columns - 列配置 [{ key, label }]
 * @param {string} filename - 文件名（不含扩展名）
 */
function exportToCSV(data, columns, filename) {
  filename = filename || 'export';
  var header = columns.map(function(col) { return col.label; }).join(',');
  var rows = data.map(function(item) {
    return columns.map(function(col) {
      var value = item[col.key] !== undefined ? item[col.key] : '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        value = '"' + value.replace(/"/g, '""') + '"';
      }
      return value;
    }).join(',');
  });
  var csv = [header].concat(rows).join('\n');
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  var url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename + '_' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================
// 告警相关
// ============================================================

/**
 * 获取告警级别文本
 * @param {string} level - critical / major / minor
 * @returns {string} 中文级别名
 */
function getLevelText(level) {
  var map = { critical: '紧急', major: '重要', minor: '一般', warning: '重要', info: '一般' };
  return map[level] || level;
}

/**
 * 计算时间差（相对时间）
 * @param {string} dateStr - 日期字符串
 * @returns {string} 如 "3分钟前"、"2小时前"、"昨天"
 */
function getTimeAgo(dateStr) {
  var now = new Date();
  var past = new Date(dateStr);
  var diffMs = now.getTime() - past.getTime();
  var diffMin = Math.floor(diffMs / 60000);
  var diffHour = Math.floor(diffMs / 3600000);
  var diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return diffMin + '分钟前';
  if (diffHour < 24) return diffHour + '小时前';
  if (diffDay < 7) return diffDay + '天前';
  return formatDate(dateStr, 'YYYY-MM-DD');
}

// ==========================================
// 角色权限工具函数
// ==========================================

/**
 * 获取当前登录用户信息
 * @returns {object|null} { id, username, name, roles }
 */
function getCurrentUser() {
  try {
    return JSON.parse(sessionStorage.getItem('userInfo') || 'null');
  } catch (e) {
    return null;
  }
}

/**
 * 检查当前用户是否拥有指定角色
 * @param {string} role - 角色名（dashboard_admin / workshop_supervisor / maintenance_tech / viewer）
 * @returns {boolean}
 */
function hasRole(role) {
  var user = getCurrentUser();
  return user && user.roles && user.roles.indexOf(role) !== -1;
}

/**
 * 检查当前用户是否只有普通员工角色（只读模式）
 * @returns {boolean}
 */
function isOnlyViewer() {
  var user = getCurrentUser();
  if (!user || !user.roles) return false;
  return user.roles.length === 1 && user.roles[0] === 'viewer';
}

/**
 * 角色中文名映射
 */
var ROLE_NAMES = {
  dashboard_admin: '看板管理员',
  workshop_supervisor: '车间主管',
  maintenance_tech: '设备维修员',
  viewer: '普通员工'
};

/**
 * 获取角色中文名
 * @param {string} role
 * @returns {string}
 */
function getRoleText(role) {
  return ROLE_NAMES[role] || role;
}

/**
 * 全局 Toast 消息提示（供各页面通用）
 * 如果页面已有自己的 showToast 则不覆盖
 */
if (typeof window !== 'undefined' && typeof window.showToast !== 'function') {
  window.showToast = function(msg) {
    var el = document.getElementById('toastMessage');
    if (!el) {
      // 动态创建 toast 元素
      el = document.createElement('div');
      el.id = 'toastMessage';
      el.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%) translateY(20px);padding:12px 24px;background:rgba(0,230,118,0.12);color:#00e676;border:1px solid #00e676;border-radius:8px;font-size:14px;font-weight:500;opacity:0;pointer-events:none;transition:all 0.4s ease;z-index:9999;white-space:nowrap;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(function() {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(20px)';
    }, 3000);
  };
}

// ==========================================
// 全局导出（兼容 <script> 标签非模块加载）
// ==========================================
if (typeof window !== 'undefined') {
  window.debounce = debounce;
  window.formatDate = formatDate;
  window.getStatusColor = getStatusColor;
  window.getStatusText = getStatusText;
  window.getLevelText = getLevelText;
  window.getTimeAgo = getTimeAgo;
  window.getAlarmLevelClass = getAlarmLevelClass;
  window.getAlarmLevelText = getAlarmLevelText;
  window.getAlarmStatusText = getAlarmStatusText;
  window.getAlarmStatusClass = getAlarmStatusClass;
  window.formatNumber = formatNumber;
  window.getDeviceTypeIcon = getDeviceTypeIcon;
  window.exportToCSV = exportToCSV;
  window.getCurrentUser = getCurrentUser;
  window.hasRole = hasRole;
  window.isOnlyViewer = isOnlyViewer;
  window.getRoleText = getRoleText;
  window.ROLE_NAMES = ROLE_NAMES;
}
