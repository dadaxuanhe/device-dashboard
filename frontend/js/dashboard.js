/**
 * dashboard.js - 首页看板逻辑模块
 *
 * 职责：
 * 1. 加载并渲染 KPI 统计数据
 * 2. 渲染设备卡片网格
 * 3. 搜索防抖功能
 * 4. 状态筛选功能
 * 5. 视图切换（卡片/列表）
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
    await Promise.all([
      loadStats(),
      loadDevices()
    ]);
  } catch (error) {
    console.error('看板初始化失败:', error);
  }

  // 标记 API 数据加载完成（隐藏加载进度条）
  if (typeof window.__loaderMarkApiReady === 'function') {
    window.__loaderMarkApiReady();
  }

  // 绑定事件
  bindDashboardEvents();

  // 加载告警滚动条
  loadAlertTicker();
  setInterval(loadAlertTicker, 60000);

  // 初始化图表时间范围按钮
  initRangeButtons();

  // 默认加载图表（使用保存的时间范围设置）
  if (typeof loadAllCharts === 'function') {
    var savedRange = localStorage.getItem('dashboard_timeRange') || '7d';
    loadAllCharts(savedRange);
    // 图表渲染完成后标记
    if (typeof window.__loaderMarkChartsReady === 'function') {
      // 给图表渲染一点时间
      setTimeout(function() { window.__loaderMarkChartsReady(); }, 800);
    }
  } else if (typeof window.__loaderMarkChartsReady === 'function') {
    window.__loaderMarkChartsReady();
  }

  // 数据加载完成标记（不再加载操作员面板）
  if (typeof window.__loaderMarkApiReady === 'function') {
    window.__loaderMarkApiReady();
  }

  // 视图切换 localStorage
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

  // 启动自动刷新（使用保存的间隔设置）
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
let currentType = 'all'; // 新增：记录当前选中的设备类型

/**
 * 加载设备列表（调用 API）
 * @param {Object} params - { keyword, status }
 */
async function loadDevices(params = {}) {
  try {
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

  grid.innerHTML = devices.map(device => `
    <div class="device-card status-${device.status}"
         onclick="location.href='pages/detail.html?id=${device.id}'">
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
  `).join('');
}

/**
 * 防抖搜索
 */
const debouncedSearch = debounce((keyword) => {
  loadDevices({ keyword, status: currentStatus, type: currentType });
}, 300);

/**
 * 更新搜索 UI：清除按钮显隐 + 结果提示条
 * @param {string} keyword - 当前搜索关键词
 * @param {number} count - 匹配设备数
 */
function updateSearchUI(keyword, count) {
  var clearBtn = document.getElementById('searchClear');
  var resultBar = document.getElementById('searchResultBar');
  var resultText = document.getElementById('searchResultText');

  // 清除按钮
  if (clearBtn) {
    clearBtn.classList.toggle('visible', keyword.length > 0);
  }

  // 结果提示条
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
  // 搜索防抖
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      debouncedSearch(e.target.value.trim());
    });
  }

  // 搜索清除按钮
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

  // 搜索结果条「清除筛选」
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

  // 状态筛选按钮
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentStatus = this.dataset.status;
      const keyword = document.getElementById('searchInput')?.value.trim() || '';
      loadDevices({ status: currentStatus, type: currentType, keyword });
    });
  });

  // 类型筛选下拉框修复
  const typeFilter = document.getElementById('typeFilter');
  if (typeFilter) {
    typeFilter.addEventListener('change', function() {
      currentType = this.value;
      const keyword = document.getElementById('searchInput')?.value.trim() || '';
      loadDevices({ status: currentStatus, type: currentType, keyword });
    });
  }

  // 视图切换按钮
  const viewToggle = document.getElementById('viewToggle');
  if (viewToggle) {
    viewToggle.addEventListener('click', function() {
      const grid = document.getElementById('deviceGrid');
      if (!grid) return;
      grid.classList.toggle('list-view');
      this.textContent = grid.classList.contains('list-view') ? '📐 卡片' : '☰ 列表';
    });
  }

  // 刷新按钮（顶栏图标）
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

  // 刷新按钮（页面标题旁）
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

  // 导出按钮（页面标题旁）— 导出 KPI 数据
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
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var oscillator = ctx.createOscillator();
    var gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = 'square';
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

    // 尊重用户手动隐藏告警横幅的设置
    if (localStorage.getItem('dashboard_notification_hidden') === 'true') {
      container.style.display = 'none';
    } else {
      container.style.display = 'flex';
    }
    const displayAlarms = alarms.slice(0, 5);
    content.innerHTML = displayAlarms.map(function(alarm) {
      var levelClass = alarm.level === 'critical' ? 'critical' : (alarm.level === 'major' ? 'major' : '');
      return '<span class="ticker-text ' + levelClass + '">' +
        '⚠️ ' + alarm.equipmentName + ' ' + alarm.content +
        '（' + (alarm.levelText || alarm.level) + '）</span>';
    }).join('');

    // ===== 增量检测：发现新告警时触发通知 =====
    var currentIds = new Set(alarms.map(function(a) { return a.id; }));
    var newAlarms = alarms.filter(function(a) {
      return !prevAlarmIds.has(a.id);
    });
    prevAlarmIds = currentIds;

    if (newAlarms.length === 0) return;

    // 检测是否有紧急/重要级别的告警
    var criticalAlarms = newAlarms.filter(function(a) {
      return a.level === 'critical' || a.level === 'major';
    });
    if (criticalAlarms.length === 0) return;

    // 声音提醒
    if (localStorage.getItem('dashboard_notify_sound') === 'true') {
      playAlertSound();
    }

    // 弹窗通知
    if (localStorage.getItem('dashboard_notify_popup') !== 'false') {
      showAlarmPopup(criticalAlarms);
    }
  } catch (error) {
    console.error('加载告警滚动条失败:', error);
  }
}

// ===== 关闭告警弹窗 =====
document.addEventListener('click', function(e) {
  var modal = document.getElementById('alarmModal');
  var btn = document.getElementById('alarmModalBtn');
  if (!modal) return;
  if (e.target === btn || e.target === modal) {
    modal.classList.remove('show');
  }
});

// ===== 新增：加载值班人员卡片 =====
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

// ===== 新增：加载操作记录 =====
async function loadOpLog(person) {
  try {
    var rows = await getOpLog(person ? { person: person } : {});
    var tbody = document.getElementById('opLogBody');
    if (!tbody) return;
    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">暂无记录</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function(r) {
      var cls = r.result === '成功' || r.result === '完成' || r.result === '正常' || r.result === '合格' || r.result === '通过' ? '' : 'color:var(--color-danger);';
      return '<tr><td>' + r.time + '</td><td>' + r.person + '</td><td>' + r.action + '</td><td>' + r.device + '</td><td style="' + cls + '">' + r.result + '</td></tr>';
    }).join('');
  } catch (e) { console.error('加载操作记录失败:', e); }
}

// ===== 新增：加载绩效柱状图 =====
async function loadPerfChart() {
  try {
    var data = await getPerformance();
    var dom = document.getElementById('perfChart');
    if (!dom || !data || !data.length) return;
    var chart = echarts.getInstanceByDom(dom) || echarts.init(dom, 'dark');
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
  
  // 自动选中已保存的时间范围（先清除所有 active，再激活匹配的按钮）
  var savedRange = localStorage.getItem('dashboard_timeRange') || '7d';
  buttons.forEach(function(btn) {
    btn.classList.remove('active');
    if (btn.dataset.range === savedRange) {
      btn.classList.add('active');
    }
    
    btn.addEventListener('click', function() {
      buttons.forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      var range = this.dataset.range;
      if (typeof loadAllCharts === 'function') loadAllCharts(range);
    });
  });
}

// ============================================================
// 加分项：KPI 数字滚动动画
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
    var eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
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

  kpiMap.forEach(function(item) {
    var el = document.getElementById(item.id);
    if (el) {
      el.textContent = '0' + item.suffix;
      animateNumber(el, item.value, 1200, item.suffix);
    }
  });
}

// 更新 loadStats —— 获取数据后调用 animateKPI
async function loadStats() {
  try {
    var stats = await getStats();
    animateKPI(stats);
    // 告警呼吸光晕
    var alarmCard = document.querySelector('.alarm-highlight');
    if (alarmCard) alarmCard.classList.toggle('has-alarms', (stats.alarmCount || 0) > 0);
    return stats;
  } catch (error) {
    console.error('加载KPI数据失败:', error);
  }
}

// ============================================================
// 加分项：数据自动刷新（模拟实时）
// ============================================================
let refreshInterval = null;
let isRefreshing = false;

function startAutoRefresh(interval) {
  interval = interval || 10000;
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(function() {
    if (!isRefreshing) refreshDashboard();
  }, interval);
  console.log('🔄 自动刷新已启动，间隔：' + (interval / 1000) + '秒');
}

function stopAutoRefresh() {
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
}

async function refreshDashboard() {
  isRefreshing = true;
  try {
    await loadStats();
    var keyword = document.getElementById('searchInput')?.value || '';
    await loadDevices({ keyword: keyword, status: currentStatus || 'all', type: currentType || 'all' });
    if (typeof loadAlertTicker === 'function') await loadAlertTicker();
    if (!document.hidden && typeof loadAllCharts === 'function') await loadAllCharts(currentRange || '7d');
    var timeEl = document.getElementById('lastRefreshTime');
    if (timeEl) timeEl.textContent = '🔄 ' + new Date().toLocaleTimeString();
  } catch (error) { console.error('自动刷新失败:', error); }
  finally { isRefreshing = false; }
}

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
      // 给出轻提示（因为没有跳转页面）
      if (typeof showToast === 'function') {
        showToast('💡 当前仅为数据展示卡片');
      } else {
        alert('💡 当前仅为数据展示卡片，无独立详情页。');
      }
    }
  }
};
