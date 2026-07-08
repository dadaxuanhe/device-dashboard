/**
 * dashboard.js - 首页看板逻辑模块
 *
 * 职责：KPI 统计、设备卡片网格、视图切换、告警轮询通知、
 * 自动刷新、值班人员/操作记录/绩效图表加载。
 */

// ==========================================
// 初始化
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 仅首页执行
  if (!document.getElementById('deviceGrid')) return;

  initDashboard();
});

/**
 * 初始化看板
 */
async function initDashboard() {
  try {
    // 并行加载 KPI 统计数据和设备列表
    await Promise.all([
      loadStats(),
      loadDevices()
    ]);
  } catch (error) {
    console.error('看板初始化失败:', error);
  }

  if (typeof window.__loaderMarkApiReady === 'function') {
    window.__loaderMarkApiReady();
  }

  // 绑定事件
  bindDashboardEvents();

  // 告警轮询（60s）
  loadAlertTicker();
  setInterval(loadAlertTicker, 60000);
  if (typeof checkAlarmStatus === 'function') {
    setInterval(checkAlarmStatus, 60000);
    checkAlarmStatus();
  }

  // 普通员工：加载收藏状态并初始化关注按钮
  if (isOnlyViewer()) {
    initFavorites();
  }

  // 初始化图表时间范围按钮
  initRangeButtons();

  if (typeof loadAllCharts === 'function') {
    var savedRange = localStorage.getItem('dashboard_timeRange') || '7d';
    loadAllCharts(savedRange);
    if (typeof window.__loaderMarkChartsReady === 'function') {
      setTimeout(function() { window.__loaderMarkChartsReady(); }, 800);
    }
  } else if (typeof window.__loaderMarkChartsReady === 'function') {
    window.__loaderMarkChartsReady();
  }

  if (typeof window.__loaderMarkApiReady === 'function') {
    window.__loaderMarkApiReady();
  }

  // 恢复视图模式
  var viewToggle = document.getElementById('viewToggle');
  if (viewToggle) {
    var savedView = localStorage.getItem('dashboard_viewMode');
    if (savedView === 'list') {
      document.getElementById('deviceGrid')?.classList.add('list-view');
      viewToggle.textContent = '📐 卡片';
    }
    viewToggle.addEventListener('click', function() {
      var grid = document.getElementById('deviceGrid');
      if (!grid) return;
      grid.classList.toggle('list-view');
      var isList = grid.classList.contains('list-view');
      this.textContent = isList ? '📐 卡片' : '☰ 列表';
      localStorage.setItem('dashboard_viewMode', isList ? 'list' : 'grid');
    });
  }

  // 启动自动刷新
  var savedInterval = parseInt(localStorage.getItem('dashboard_refreshInterval')) || 10000;
  startAutoRefresh(savedInterval);
}

// ==========================================
// KPI 统计
// ==========================================


// ==========================================
// 设备列表
// ==========================================

let currentStatus = 'all';
let currentType = 'all';

/**
 * 加载设备列表（调用 API）
 * @param {Object} params - { keyword, status }
 */
async function loadDevices(params = {}) {
  try {
    // 构建查询参数，过滤掉无效的筛选条件
    const query = {};
    if (params.status && params.status !== 'all') query.status = params.status;
    if (params.type && params.type !== 'all') query.type = params.type;
    if (params.keyword) query.keyword = params.keyword;
    const devices = await getEquipment(query);
    renderDevices(devices);
    updateSearchUI(params.keyword || '', devices ? devices.length : 0);
  } catch (error) {
    console.error('加载设备列表失败:', error);
  }
}

/**
 * 渲染设备卡片
 * @param {Array} devices - 设备数据
 */
function renderDevices(devices) {
  const grid = document.getElementById('deviceGrid');
  if (!grid) return;

  if (!devices || devices.length === 0) {
    grid.innerHTML = '<div class="empty-state">暂无匹配的设备</div>';
    return;
  }
  grid.innerHTML = devices.map(device => {
    var isFav = device.is_favorited == 1;
    var favStar = isOnlyViewer()
      ? `<span class="fav-star ${isFav ? 'active' : ''}" data-id="${device.id}" onclick="event.stopPropagation();toggleFavStar(this, ${device.id})">★</span>`
      : '';
    return `
    <div class="device-card status-${device.status} ${isFav ? 'is-favorited' : ''}" data-id="${device.id}">
      ${favStar}
      <div style="cursor:pointer;" onclick="location.href='pages/detail.html?id=${device.id}'">
        <div class="device-header">
          <span class="device-name">${device.name}</span>
          <span class="status-dot status-${device.status}"></span>
        </div>
        <div class="device-body">
          <div class="device-code">${device.code}</div>
          <div class="device-type">${device.type}</div>
          <div class="device-metrics">
            <span class="metric">稼动率 <strong>${device.oee != null ? device.oee + '%' : '--'}</strong></span>
            <span class="metric">产量 <strong>${device.currentOutput != null ? device.currentOutput : '--'}</strong></span>
          </div>
        </div>
        <div class="device-footer">
          <span class="status-text status-${device.status}">${getStatusText(device.status)}</span>
        </div>
      </div>
      ${isOnlyViewer() ? '' : `<button onclick="event.stopPropagation();deleteDevice(${device.id},'${device.name.replace(/'/g,"\\'")}')" title="删除设备" style="position:absolute;top:8px;right:8px;width:28px;height:28px;border:none;border-radius:6px;background:rgba(244,67,54,0.15);color:#f44336;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s;" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0"><i class="fas fa-times"></i></button>`}
    </div>`;
  }).join('');
}

/**
 * 防抖搜索
 */
const debouncedSearch = debounce((keyword) => {
  loadDevices({ keyword, status: currentStatus, type: currentType });
}, 300);

/**
 * 更新搜索 UI
 * @param {string} keyword
 * @param {number} count
 */
function updateSearchUI(keyword, count) {
  var clearBtn = document.getElementById('searchClear');
  var resultBar = document.getElementById('searchResultBar');
  var resultText = document.getElementById('searchResultText');

  if (clearBtn) {
    clearBtn.classList.toggle('visible', keyword.length > 0);
  }

  if (resultBar && resultText) {
    if (keyword.length > 0) {
      resultText.textContent = '\ud83d\udd0d 找到 ' + count + ' 台匹配"' + keyword + '"的设备';
      resultBar.classList.add('visible');
    } else {
      resultBar.classList.remove('visible');
    }
  }
}

// ==========================================
// 产量图表
// ==========================================

// ==========================================
// 事件绑定
// ==========================================

/**
 * 绑定看板页面事件
 */
function bindDashboardEvents() {
  // 搜索输入
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      debouncedSearch(e.target.value.trim());
    });
  }

  // 搜索清除
  const searchClear = document.getElementById('searchClear');
  if (searchClear) {
    searchClear.addEventListener('click', function() {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
        debouncedSearch('');
      }
    });
  }

  const resultClear = document.getElementById('searchResultClear');
  if (resultClear) {
    resultClear.addEventListener('click', function() {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
        debouncedSearch('');
      }
    });
  }

  // 状态筛选
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentStatus = this.dataset.status;
      const keyword = document.getElementById('searchInput')?.value.trim() || '';
      loadDevices({ status: currentStatus, type: currentType, keyword });
    });
  });

  // 类型筛选
  const typeFilter = document.getElementById('typeFilter');
  if (typeFilter) {
    typeFilter.addEventListener('change', function() {
      currentType = this.value;
      const keyword = document.getElementById('searchInput')?.value.trim() || '';
      loadDevices({ status: currentStatus, type: currentType, keyword });
    });
  }

  // 视图切换
  const viewToggle = document.getElementById('viewToggle');
  if (viewToggle) {
    viewToggle.addEventListener('click', function() {
      const grid = document.getElementById('deviceGrid');
      if (!grid) return;
      grid.classList.toggle('list-view');
      this.textContent = grid.classList.contains('list-view') ? '📐 卡片' : '☰ 列表';
    });
  }

  // 添加设备
  const addDeviceBtn = document.getElementById('addDeviceBtn');
  if (addDeviceBtn) {
    addDeviceBtn.addEventListener('click', openAddDevice);
  }

  // 刷新（顶栏）
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async function() {
      if (this.disabled) return;
      this.disabled = true;
      this.classList.add('rotating');

      try {
        await Promise.all([
          loadStats(),
          loadDevices(),
          typeof loadAllCharts === 'function' ? loadAllCharts() : Promise.resolve()
        ]);
      } catch (error) {
        console.error('刷新时发生错误:', error);
      } finally {
        this.disabled = false;
        setTimeout(() => this.classList.remove('rotating'), 500);
      }
    });
  }

  // 刷新（页面标题旁）
  const refreshBtn2 = document.getElementById('refreshBtn2');
  if (refreshBtn2) {
    refreshBtn2.addEventListener('click', async function() {
      if (this.disabled) return;
      this.disabled = true;

      try {
        await Promise.all([
          loadStats(),
          loadDevices(),
          typeof loadAllCharts === 'function' ? loadAllCharts() : Promise.resolve()
        ]);
      } catch (error) {
        console.error('刷新时发生错误:', error);
      } finally {
        this.disabled = false;
      }
    });
  }

  // 导出 KPI 数据
  var exportBtn = document.querySelector('.page-header__actions .btn:last-child');
  if (exportBtn) {
    exportBtn.addEventListener('click', async function() {
      try {
        var totalEl = document.getElementById('kpi-total');
        if (!totalEl || totalEl.textContent === '--') {
          alert('暂无KPI数据可导出');
          return;
        }
        var kpiData = [
          { key: '指标', label: '指标' },
          { key: '数值', label: '数值' }
        ];
        var kpiRows = [
          { 指标: '设备总数', 数值: document.getElementById('kpi-total')?.textContent || '--' },
          { 指标: '运行中', 数值: document.getElementById('kpi-running')?.textContent || '--' },
          { 指标: '待机', 数值: document.getElementById('kpi-idle')?.textContent || '--' },
          { 指标: '故障', 数值: document.getElementById('kpi-fault')?.textContent || '--' },
          { 指标: '离线', 数值: document.getElementById('kpi-offline')?.textContent || '--' },
          { 指标: '今日产量', 数值: document.getElementById('kpi-output')?.textContent || '--' },
          { 指标: '平均稼动率', 数值: document.getElementById('kpi-oee')?.textContent || '--' },
          { 指标: '未处理告警', 数值: document.getElementById('kpi-alarms')?.textContent || '--' }
        ];
        if (typeof exportToCSV === 'function') {
          exportToCSV(kpiRows, kpiData, 'KPI数据统计');
        } else {
          throw new Error('导出工具函数未加载');
        }
      } catch (error) {
        console.error('导出失败:', error);
        alert('导出数据失败，请稍后重试或检查控制台错误信息。');
      }
    });
  }
}

// ============================================================
// 告警滚动条 + 通知功能
// ============================================================

/** 记录上一次检测到的告警 ID 集合，用于增量检测 */
let prevAlarmIds = new Set();

/**
 * 播放提示音（使用 Web Audio API，无需外部音频文件）
 */
function playAlertSound() {
  try {
    // 创建 Web Audio 上下文
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var oscillator = ctx.createOscillator();
    var gain = ctx.createGain();
    // 连接音频节点：振荡器 → 增益 → 输出
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = 'square';
    // 从 880Hz 降到 660Hz 的短促警示音
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.4);
  } catch (e) {
    console.warn('播放提示音失败:', e.message);
  }
}

/**
 * 弹出告警通知
 * @param {Array} newAlarms - 新增的告警列表
 */
function showAlarmPopup(newAlarms) {
  var modal = document.getElementById('alarmModal');
  var body = document.getElementById('alarmModalBody');
  if (!modal || !body) return;

  body.innerHTML = newAlarms.map(function(a) {
    var levelText = a.level === 'critical' ? '紧急' : (a.level === 'major' ? '重要' : '一般');
    return '<div class="alarm-item">' +
      '<span class="alarm-level">' + levelText + '</span>' +
      '<div><strong>' + (a.equipmentName || '未知设备') + '</strong><br>' +
      (a.content || '') + '</div></div>';
  }).join('');

  modal.classList.add('show');
}

/**
 * 加载活跃告警并渲染滚动条，同时检测新告警触发通知
 */
async function loadAlertTicker() {
  try {
    const alarms = await getActiveAlarms();
    const container = document.getElementById('alertTicker');
    const content = document.getElementById('tickerContent');
    if (!container || !content) return;

    if (!alarms || alarms.length === 0) {
      container.style.display = 'none';
      prevAlarmIds = new Set();
      return;
    }

    if (localStorage.getItem('dashboard_notification_hidden') === 'true') {
      container.style.display = 'none';
    } else {
      container.style.display = 'flex';
    }
    const displayAlarms = alarms.slice(0, 5);
    var hasCritical = false;
    content.innerHTML = displayAlarms.map(function(alarm) {
      if (alarm.level === 'critical') hasCritical = true;
      var levelClass = alarm.level === 'critical' ? 'critical alarm-flash-critical' : (alarm.level === 'major' ? 'major alarm-flash-warning' : '');
      return '<span class="ticker-text ' + levelClass + '">' +
        '⚠️ ' + alarm.equipmentName + ' ' + alarm.content +
        '（' + (alarm.levelText || alarm.level) + '）</span>';
    }).join('');
    updateAlarmBadge(alarms.length, hasCritical);

    // 增量检测新告警
    var currentIds = new Set(alarms.map(function(a) { return a.id; }));
    var newAlarms = alarms.filter(function(a) {
      return !prevAlarmIds.has(a.id);
    });
    prevAlarmIds = currentIds;

    if (newAlarms.length === 0) return;

    var criticalAlarms = newAlarms.filter(function(a) {
      return a.level === 'critical' || a.level === 'major';
    });
    if (criticalAlarms.length === 0) return;

    if (localStorage.getItem('dashboard_notify_sound') === 'true') {
      playAlertSound();
    }

    if (localStorage.getItem('dashboard_notify_popup') !== 'false') {
      showAlarmPopup(criticalAlarms);
    }
  } catch (error) {
    console.error('加载告警滚动条失败:', error);
  }
}

// 关闭告警弹窗
document.addEventListener('click', function(e) {
  var modal = document.getElementById('alarmModal');
  var btn = document.getElementById('alarmModalBtn');
  if (!modal) return;
  if (e.target === btn || e.target === modal) {
    modal.classList.remove('show');
  }
});

// 值班人员卡片
async function loadStaffCards() {
  try {
    var staff = await getStaff();
    var container = document.getElementById('staffCards');
    if (!container || !staff) return;
    var posMap = { '车间主管':'manager', '设备工程师':'engineer', '操作员':'operator' };
    container.innerHTML = staff.map(function(s) {
      var cls = posMap[s.position] || 'operator';
      return '<div class="ops-card"><div class="name">' + s.name + '</div>' +
        '<span class="pos-badge ' + cls + '">' + s.position + '</span>' +
        '<div class="info-row">⏰ ' + (s.shift || '--') + '</div>' +
        '<div class="info-row">📞 ' + (s.phone || '--') + '</div></div>';
    }).join('');
  } catch (e) { console.error('加载值班人员失败:', e); }
}

// 操作记录
async function loadOpLog(person) {
  try {
    var rows = await getOpLog(person ? { person: person } : {});
    var tbody = document.getElementById('opLogBody');
    if (!tbody) return;
    // 无记录时显示空状态提示
    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">暂无记录</td></tr>';
      return;
    }
    // 渲染表格行：操作结果异常的记录用红色字体标识
    tbody.innerHTML = rows.map(function(r) {
      var cls = r.result === '成功' || r.result === '完成' || r.result === '正常' || r.result === '合格' || r.result === '通过' ? '' : 'color:var(--color-danger);';
      return '<tr><td>' + r.time + '</td><td>' + r.person + '</td><td>' + r.action + '</td><td>' + r.device + '</td><td style="' + cls + '">' + r.result + '</td></tr>';
    }).join('');
  } catch (e) { console.error('加载操作记录失败:', e); }
}

// 绩效柱状图
async function loadPerfChart() {
  try {
    var data = await getPerformance();
    var dom = document.getElementById('perfChart');
    if (!dom || !data || !data.length) return;
    // 复用已存在的图表实例，避免重复初始化
    var chart = echarts.getInstanceByDom(dom) || echarts.init(dom, 'dark');
    // 配置柱状图：人员姓名 X 轴，产量 Y 轴，使用紫色渐变填充
    chart.setOption({
      tooltip: { trigger:'axis', formatter:function(p) { return p[0].axisValue + '<br/>产量: ' + p[0].value + ' 件'; } },
      grid: { left:85, right:20, top:30, bottom:30, containLabel:true },
      xAxis: { type:'category', data:data.map(function(d){return d.name;}), axisLine:{lineStyle:{color:'#2a3a5c'}}, axisLabel:{color:'#8899bb'} },
      yAxis: { type:'value', name:'产量（件）', nameLocation:'middle', nameGap:60, nameTextStyle:{color:'#8899bb',fontSize:12}, splitLine:{lineStyle:{color:'#1a2335'}}, axisLabel:{color:'#8899bb'} },
      series: [{ type:'bar', data:data.map(function(d){return d.output;}), itemStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#6C3FF5'},{offset:1,color:'#8b5cf6'}])}, barWidth:'50%' }]
    }, true);
    chart.resize();
  } catch (e) { console.error('加载绩效数据失败:', e); }
}

// ============================================================
// 时间范围切换（图表联动）
// ============================================================

/**
 * 初始化时间范围切换按钮
 */
function initRangeButtons() {
  var buttons = document.querySelectorAll('.range-btn');
  
  // 从 localStorage 恢复上次选中的时间范围，并高亮对应的按钮
  var savedRange = localStorage.getItem('dashboard_timeRange') || '7d';
  buttons.forEach(function(btn) {
    btn.classList.remove('active');
    if (btn.dataset.range === savedRange) {
      btn.classList.add('active');
    }
    
    // 点击切换时间范围，更新按钮高亮并重新加载图表
    btn.addEventListener('click', function() {
      buttons.forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      var range = this.dataset.range;
      if (typeof loadAllCharts === 'function') loadAllCharts(range);
    });
  });
}

// ============================================================
// KPI 数字滚动动画
// ============================================================

/**
 * 数字滚动动画（easeOutCubic）
 * @param {HTMLElement} element - 目标元素
 * @param {number} target - 目标值
 * @param {number} duration - 动画持续时间（毫秒）
 * @param {string} suffix - 后缀（如 '%'）
 */
function animateNumber(element, target, duration, suffix) {
  duration = duration || 1200;
  suffix = suffix || '';
  var start = 0;
  var startTime = performance.now();
  var isPercent = suffix === '%';
  var decimals = isPercent ? 1 : 0;
  function update(currentTime) {
    var elapsed = currentTime - startTime;
    var progress = Math.min(elapsed / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic 缓动函数：先快后慢
    var current = start + (target - start) * eased;
    element.textContent = current.toFixed(decimals) + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

/**
 * 为所有 KPI 数字添加滚动动画
 * @param {Object} stats - KPI 统计数据
 */
function animateKPI(stats) {
  var kpiMap = [
    { id: 'kpi-total', value: stats.total, suffix: '' },
    { id: 'kpi-running', value: stats.running, suffix: '' },
    { id: 'kpi-idle', value: stats.idle, suffix: '' },
    { id: 'kpi-fault', value: stats.fault, suffix: '' },
    { id: 'kpi-offline', value: stats.offline, suffix: '' },
    { id: 'kpi-output', value: stats.todayOutput || 0, suffix: '' },
    { id: 'kpi-oee', value: stats.avgOee || 0, suffix: '%' },
    { id: 'kpi-alarms', value: stats.alarmCount || 0, suffix: '' }
  ];

  // 遍历所有 KPI 元素，先置零再启动滚动动画
  kpiMap.forEach(function(item) {
    var el = document.getElementById(item.id);
    if (el) {
      el.textContent = '0' + item.suffix;
      animateNumber(el, item.value, 1200, item.suffix);
    }
  });
}

// 更新 loadStats —— 获取 KPI 数据后调用 animateKPI 播放滚动动画
async function loadStats() {
  try {
    var stats = await getStats();
    animateKPI(stats);
    // 告警呼吸光晕：有未处理告警时高亮告警卡片
    var alarmCard = document.querySelector('.alarm-highlight');
    if (alarmCard) alarmCard.classList.toggle('has-alarms', (stats.alarmCount || 0) > 0);
    return stats;
  } catch (error) {
    console.error('加载KPI数据失败:', error);
  }
}

// ============================================================
// 数据自动刷新
// ============================================================
let refreshInterval = null;
let isRefreshing = false;

function startAutoRefresh(interval) {
  interval = interval || 10000;
  if (refreshInterval) clearInterval(refreshInterval);
  // 每隔指定时间自动刷新一次看板数据
  refreshInterval = setInterval(function() {
    if (!isRefreshing) refreshDashboard();
  }, interval);
  console.log('🔄 自动刷新已启动，间隔：' + (interval / 1000) + '秒');
}

function stopAutoRefresh() {
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
}

// 刷新看板：同时更新 KPI、设备列表、告警滚动条和图表
async function refreshDashboard() {
  isRefreshing = true;
  try {
    await loadStats();
    var keyword = document.getElementById('searchInput')?.value || '';
    await loadDevices({ keyword: keyword, status: currentStatus || 'all', type: currentType || 'all' });
    if (typeof loadAlertTicker === 'function') await loadAlertTicker();
    if (!document.hidden && typeof loadAllCharts === 'function') await loadAllCharts(currentRange || '7d');
    // 更新最后刷新时间显示
    var timeEl = document.getElementById('lastRefreshTime');
    if (timeEl) timeEl.textContent = '🔄 ' + new Date().toLocaleTimeString();
  } catch (error) { console.error('自动刷新失败:', error); }
  finally { isRefreshing = false; }
}

// ============================================================
// 告警闪烁：更新侧边栏徽章和通知按钮
// ============================================================

/**
 * 更新告警徽章和通知按钮的闪烁状态
 */
function updateAlarmBadge(count, hasCritical) {
  var badge = document.getElementById('alarmBadge');
  var mobileBadge = document.getElementById('mobileAlarmBadge');
  var notifBtn = document.getElementById('notificationBtn');

  // 侧边栏告警徽章
  if (badge) {
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline';
      badge.classList.toggle('has-active', hasCritical);
    } else {
      badge.style.display = 'none';
      badge.classList.remove('has-active');
    }
  }
  // 移动端底部Tab告警徽章
  if (mobileBadge) {
    if (count > 0) {
      mobileBadge.textContent = count;
      mobileBadge.style.display = 'inline';
    } else {
      mobileBadge.style.display = 'none';
    }
  }
  // 通知按钮闪烁
  if (notifBtn) {
    notifBtn.classList.toggle('has-active', hasCritical);
  }
}

/**
 * 在非看板页面也更新告警状态（供 app.js 定时调用）
 */
async function checkAlarmStatus() {
  try {
    var summary = await getAlarmSummary();
    if (summary) {
      var total = (summary.critical||0) + (summary.major||0) + (summary.minor||0);
      updateAlarmBadge(total, (summary.critical||0) > 0);
    }
  } catch(e) { /* ignore */ }
}

// 页面可见性变化处理：隐藏时停止自动刷新，重新可见时立即刷新并重启定时器
document.addEventListener('visibilitychange', function() {
  if (document.hidden) { stopAutoRefresh(); }
  else {
    refreshDashboard();
    var savedInterval = parseInt(localStorage.getItem('dashboard_refreshInterval')) || 10000;
    startAutoRefresh(savedInterval);
  }
});

// ============================================================
// KPI 卡片点击处理函数
// ============================================================
// KPI 卡片点击处理函数：type='status' 执行状态筛选，type='info' 给出轻提示
window.handleCardClick = function(type, value) {
  if (type === 'status') {
    // 1. 更新页面状态筛选按钮的高亮
    document.querySelectorAll('.filter-btn').forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.dataset.status === value) {
        btn.classList.add('active');
      }
    });

    // 2. 更新全局变量并触发重新加载
    currentStatus = value;
    // 如果点击的是 'all'，顺便把类型和搜索清空
    if (value === 'all') {
      currentType = 'all';
      var typeFilter = document.getElementById('typeFilter');
      if (typeFilter) typeFilter.value = 'all';
      var searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
    }
    // 调用加载设备方法
    var keyword = document.getElementById('searchInput')?.value.trim() || '';
    loadDevices({ status: currentStatus, type: currentType, keyword: keyword });

    // 【平滑滚动】：让页面自动定位到设备列表区域
    setTimeout(function() {
      var targetElement = document.getElementById('deviceGrid');
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  } else if (type === 'info') {
    if (value === 'output' || value === 'oee') {
      // 产量和稼动率卡片仅为数据展示，点击给出轻提示
      if (typeof showToast === 'function') {
        showToast('💡 当前仅为数据展示卡片');
      } else {
        alert('💡 当前仅为数据展示卡片，无独立详情页。');
      }
    }
  }
};

// ============================================================
// 添加 / 删除设备
// ============================================================
// 打开添加设备弹窗，聚焦编号输入框，默认填入今天日期
function openAddDevice() {
  document.getElementById('addDeviceModal').style.display = 'flex';
  // 自动获取并填充下一个设备编号
  if (typeof getNextEquipmentNo === 'function') {
    getNextEquipmentNo().then(function(result) {
      if (result && result.nextNo) {
        document.getElementById('de_no').value = result.nextNo;
      }
      document.getElementById('de_no').focus();
    }).catch(function() {
      document.getElementById('de_no').focus();
    });
  } else {
    document.getElementById('de_no').focus();
  }
  var today = new Date().toISOString().split('T')[0];
  document.getElementById('de_date').value = today;
}
// 关闭添加设备弹窗，清空所有表单字段
function closeAddDevice() {
  document.getElementById('addDeviceModal').style.display = 'none';
  ['de_no','de_name','de_model','de_mfr','de_loc','de_date'].forEach(function(id) { document.getElementById(id).value = ''; });
}
// 提交添加设备表单：收集字段、校验必填项、调用 API 并刷新列表
async function submitAddDevice() {
  var no = document.getElementById('de_no').value.trim();
  var name = document.getElementById('de_name').value.trim();
  var type = document.getElementById('de_type').value;
  var model = document.getElementById('de_model').value.trim();
  var mfr = document.getElementById('de_mfr').value.trim();
  var loc = document.getElementById('de_loc').value.trim();
  var date = document.getElementById('de_date').value;
  var status = document.getElementById('de_status').value;
  if (!no) { alert('请输入设备编号'); return; }
  if (!name) { alert('请输入设备名称'); return; }
  // 禁用按钮并显示加载状态，防止重复提交
  var btn = document.getElementById('confirmAddDevice');
  btn.textContent = '添加中...'; btn.disabled = true;
  try {
    var r = await addEquipment({ equipmentNo:no, name:name, type:type, model:model, manufacturer:mfr, location:loc, installDate:date, status:status });
    if (r && r.success !== false) {
      closeAddDevice();
      await loadDevices({ status: currentStatus, type: currentType });
      if (typeof showToast === 'function') showToast('✅ 设备 "' + name + '" 添加成功');
    } else {
      alert('添加失败：' + (r && r.message || '未知错误'));
    }
  } catch (e) { alert('添加失败：' + e.message); }
  finally { btn.textContent = '确认添加'; btn.disabled = false; }
}
// 删除设备：弹出确认对话框，确认后调用 API 删除并刷新列表
// 注意：api.js 的 request() 在业务失败时会 throw Error，所以这里直接 await 即可
window.deleteDevice = async function(id, name) {
  if (!confirm('确定要删除设备 "' + name + '" 吗？此操作不可恢复！')) return;
  try {
    await deleteEquipment(id);                // 调用 DELETE API，失败时自动抛异常
    await loadDevices({ status: currentStatus, type: currentType }); // 刷新设备列表
    if (typeof showToast === 'function') showToast('✅ 设备 "' + name + '" 已删除');
  } catch (e) { alert('删除失败：' + e.message); }
};

// ============================================================
// 设备收藏功能（普通员工专用）
// ============================================================

/** 当前用户收藏的设备ID集合 */
let favoriteIds = new Set();
/** 是否仅显示关注的设备 */
let showFavOnly = false;

/**
 * 初始化收藏功能：加载收藏列表、初始化关注按钮
 */
async function initFavorites() {
  try {
    var ids = await getFavorites();
    favoriteIds = new Set(ids || []);
  } catch (e) {
    console.warn('加载收藏列表失败:', e);
    favoriteIds = new Set();
  }

  // 显示"只看关注"按钮
  var favToggle = document.getElementById('favToggle');
  if (favToggle) {
    favToggle.style.display = 'inline-flex';
    favToggle.addEventListener('click', function() {
      showFavOnly = !showFavOnly;
      this.classList.toggle('active', showFavOnly);
      this.innerHTML = showFavOnly
        ? '<i class="fas fa-star"></i> 全部'
        : '<i class="fas fa-star"></i> 关注';
      document.getElementById('deviceGrid')?.classList.toggle('show-fav-only', showFavOnly);
      if (typeof showToast === 'function') {
        showToast(showFavOnly ? '⭐ 仅显示关注的设备' : '📋 显示全部设备');
      }
    });
  }
}

/**
 * 切换设备收藏星标
 * @param {HTMLElement} el - 星标元素
 * @param {number} id - 设备ID
 */
async function toggleFavStar(el, id) {
  try {
    var result = await toggleFavorite(id);
    if (result.favorited) {
      el.classList.add('active');
      el.closest('.device-card')?.classList.add('is-favorited');
      favoriteIds.add(id);
      if (typeof showToast === 'function') showToast('⭐ 已关注该设备');
    } else {
      el.classList.remove('active');
      el.closest('.device-card')?.classList.remove('is-favorited');
      favoriteIds.delete(id);
      if (typeof showToast === 'function') showToast('已取消关注');
    }
  } catch (e) {
    console.error('切换收藏失败:', e);
    if (typeof showToast === 'function') showToast('❌ 操作失败，请重试');
  }
}

// ============================================================
// SSE 实时数据推送 — 首页看板事件处理
// 通过 realtime.js 的 onSSE() 注册事件监听，后端 SSE 模拟器
// 定时推送更新，无需手动刷新页面。
// ============================================================

/**
 * 初始化 SSE 连接并注册首页看板的事件处理器
 * 在 DOMContentLoaded 后由页面底部的条件判断自动调用
 */
function initRealtimeDashboard() {
  if (typeof connectSSE !== 'function') return;

  // 启动 SSE 连接（与后端 /api/sse/events 建立 EventSource）
  connectSSE();

  // ---- 1. KPI 统计数据实时更新 ----
  // 后端每 15 秒计算一次 KPI 并广播 kpi-update 事件
  onSSE('kpi-update', function(data) {
    var el;
    el = document.getElementById('kpi-total');
    if (el) el.textContent = data.total ?? '--';
    el = document.getElementById('kpi-running');
    if (el) el.textContent = data.running ?? '--';
    el = document.getElementById('kpi-idle');
    if (el) el.textContent = data.idle ?? '--';
    el = document.getElementById('kpi-fault');
    if (el) el.textContent = data.fault ?? '--';
    el = document.getElementById('kpi-offline');
    if (el) el.textContent = data.offline ?? '--';
    el = document.getElementById('kpi-output');
    if (el) el.textContent = data.todayOutput != null ? data.todayOutput : '--';
    el = document.getElementById('kpi-oee');
    if (el) el.textContent = data.avgOee != null ? data.avgOee + '%' : '--';
    el = document.getElementById('kpi-alarms');
    if (el) el.textContent = data.alarmCount ?? '--';
  });

  // ---- 2. 设备参数实时更新 ----
  onSSE('device-param-update', function(data) {
    if (!data.devices || data.devices.length === 0) return;
    data.devices.forEach(function(dev) {
      // 查找对应的设备卡片
      var card = document.querySelector('.device-card[data-id="' + dev.id + '"]');
      if (!card) return;
      // 更新参数显示（目前卡片显示 OEE 和产量，后续可扩展显示实时参数）
      // 如果卡片上有额外的参数显示元素，可以在这里更新
    });
  });

  // ---- 3. 设备状态变更 ----
  onSSE('device-status-change', function(data) {
    var card = document.querySelector('.device-card[data-id="' + data.id + '"]');
    if (!card) return;

    // 更新卡片外层 status class
    card.className = card.className.replace(/status-\S+/g, '');
    card.classList.add('status-' + data.newStatus);

    // 更新状态圆点
    var dot = card.querySelector('.status-dot');
    if (dot) {
      dot.className = dot.className.replace(/status-\S+/g, '');
      dot.classList.add('status-' + data.newStatus);
    }

    // 更新状态文本
    var statusText = card.querySelector('.status-text');
    if (statusText) {
      statusText.className = statusText.className.replace(/status-\S+/g, '');
      statusText.classList.add('status-' + data.newStatus);
      if (typeof getStatusText === 'function') {
        statusText.textContent = getStatusText(data.newStatus);
      }
    }
  });

  // ---- 4. 新告警通知 ----
  onSSE('alarm', function(data) {
    if (!data.alarms || data.alarms.length === 0) return;
    // 调用已有的告警弹窗功能（如果可用）
    if (typeof showAlarmPopup === 'function') {
      showAlarmPopup(data.alarms);
    }
    // 更新告警徽标（如果有）
    var alarmBadge = document.getElementById('mobileAlarmBadge');
    var alarmCount = document.getElementById('kpi-alarms');
    if (alarmBadge || alarmCount) {
      // 重新加载告警摘要以获取最新计数
      if (typeof getAlarmSummary === 'function') {
        getAlarmSummary().then(function(summary) {
          if (summary && summary.activeCount != null) {
            if (alarmBadge) {
              alarmBadge.textContent = summary.activeCount;
              alarmBadge.style.display = summary.activeCount > 0 ? 'inline' : 'none';
            }
          }
        }).catch(function() {});
      }
    }
  });
}

// 在页面加载完成后初始化 SSE
if (document.getElementById('deviceGrid')) {
  // 首页看板存在时初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRealtimeDashboard);
  } else {
    initRealtimeDashboard();
  }
}

// 暴露全局函数供 HTML 中使用
window.toggleFavStar = toggleFavStar;
