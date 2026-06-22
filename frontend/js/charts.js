/**
 * ============================================================
 * charts.js - ECharts 图表配置与渲染
 * 功能：产量折线图、OEE 环形图、温度曲线图
 * 依赖：ECharts CDN（window.echarts）、api.js（window.getProduction/等）
 * ============================================================
 */

// ECharts 通过 CDN script 标签加载，使用全局变量
const echarts = window.echarts;

// ============================================================
// 图表实例缓存
// ============================================================
let productionChart = null;
let oeeChart = null;
let temperatureChart = null;
let currentRange = '7d';

// ============================================================
// 1. 产量折线图
// ============================================================
function renderProductionChart(data, range) {
  var dom = document.getElementById('productionChart');
  if (!dom) { console.warn('productionChart 容器未找到'); return; }

  if (!productionChart) productionChart = echarts.init(dom, 'dark');

  // 根据选择的 range 计算完整的日期窗口
  var rangeConfig = { today: 0, '7d': 6, '30d': 29 };
  var daysBack = rangeConfig[range] !== undefined ? rangeConfig[range] : 29;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var startDate = new Date(today);
  startDate.setDate(startDate.getDate() - daysBack);
  var endDate = new Date(today);

  // 构建日期到数据的映射
  var map = {};
  if (data && data.length > 0) {
    data.forEach(function(d) { map[d.date] = d; });
  }

  // 生成完整的日期序列
  var filled = [];
  var cur = new Date(startDate);
  while (cur <= endDate) {
    var key = cur.toISOString().slice(0, 10);
    filled.push(map[key] || { date: key, planQuantity: 0, actualQuantity: 0, qualifiedQuantity: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  data = filled;

  var option = {
    tooltip: {
      trigger: 'axis',
      position: function(point, params, dom, rect, size) {
        var x = point[0] - size.contentSize[0] / 2;
        x = Math.max(4, Math.min(x, size.viewSize[0] - size.contentSize[0] - 4));
        return [x, -size.contentSize[1] - 8];
      },
      formatter: function(params) {
        var html = '<strong>' + params[0].axisValue + '</strong><br/>';
        params.forEach(function(p) {
          html += p.marker + ' ' + p.seriesName + ': ' + p.value + ' 件<br/>';
        });
        return html;
      }
    },
    legend: {
      data: ['计划产量', '实际产量', '良品数'],
      textStyle: { color: '#8899bb' },
      top: 0,
      right: 0
    },
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'category',
      data: data.map(function(d) { return d.date; }),
      axisLine: { lineStyle: { color: '#2a3a5c' } },
      axisLabel: { color: '#8899bb', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      name: '产量（件）',
      nameTextStyle: { color: '#8899bb', fontSize: 11 },
      splitLine: { lineStyle: { color: '#1a2335' } },
      axisLabel: { color: '#8899bb' }
    },
    series: [
      {
        name: '计划产量',
        type: 'line',
        data: data.map(function(d) { return d.planQuantity; }),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#3d5afe', width: 2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(61, 90, 254, 0.3)' },
              { offset: 1, color: 'rgba(61, 90, 254, 0)' }
            ]
          }
        }
      },
      {
        name: '实际产量',
        type: 'line',
        data: data.map(function(d) { return d.actualQuantity; }),
        smooth: true,
        symbol: 'diamond',
        symbolSize: 8,
        lineStyle: { color: '#00bcd4', width: 2 }
      },
      {
        name: '良品数',
        type: 'line',
        data: data.map(function(d) { return d.qualifiedQuantity; }),
        smooth: true,
        symbol: 'triangle',
        symbolSize: 8,
        lineStyle: { color: '#00e676', width: 2 }
      }
    ]
  };

  productionChart.setOption(option, true);
  productionChart.resize();
}

// ============================================================
// 2. OEE 环形图（外层整体 + 内层各设备分布）
// ============================================================
function renderOeeChart(oeeData) {
  var dom = document.getElementById('oeeChart');
  if (!dom) { console.warn('oeeChart 容器未找到'); return; }

  if (!oeeChart) oeeChart = echarts.init(dom, 'dark');

  var overall = oeeData.overall;
  var devices = oeeData.devices;

  function getColor(value) {
    if (value >= 85) return '#00e676';
    if (value >= 70) return '#ffd740';
    if (value >= 60) return '#ff9100';
    return '#ff1744';
  }

  var option = {
    tooltip: {
      formatter: function(params) {
        if (params.name === '整体OEE') return '<strong>整体OEE</strong><br/>' + params.value + '%';
        return params.name + '<br/>OEE: ' + params.value + '%';
      }
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '72%'],
        avoidLabelOverlap: false,
        label: { show: false },
        emphasis: { scale: false },
        data: [
          { value: overall, name: '整体OEE', itemStyle: { color: getColor(overall) } },
          { value: Math.max(100 - overall, 0), name: '剩余', itemStyle: { color: '#1a2335' } }
        ],
        animationDuration: 1500,
        animationEasing: 'bounceOut'
      },
      {
        type: 'pie',
        radius: ['30%', '45%'],
        avoidLabelOverlap: false,
        label: {
          show: true,
          position: 'outside',
          formatter: '{b}\n{d}%',
          color: '#8899bb',
          fontSize: 10,
          lineHeight: 14
        },
        labelLine: { length: 8, length2: 8, lineStyle: { color: '#2a3a5c' } },
        emphasis: { scale: true },
        data: devices.map(function(d) {
          return { name: d.name, value: d.oee, itemStyle: { color: getColor(d.oee) } };
        }),
        animationDuration: 1800,
        animationEasing: 'bounceOut'
      }
    ],
    graphic: [
      { type: 'text', left: 'center', top: '40%', style: { text: overall + '%', fill: '#e8edf5', fontSize: 28, fontWeight: 'bold' }, z: 100 },
      { type: 'text', left: 'center', top: '55%', style: { text: '整体OEE', fill: '#8899bb', fontSize: 12 }, z: 100 }
    ]
  };

  oeeChart.setOption(option, true);
  oeeChart.resize();
}

// ============================================================
// 3. 温度曲线图
// ============================================================
function renderTemperatureChart(data) {
  var dom = document.getElementById('temperatureChart');
  if (!dom) { console.warn('temperatureChart 容器未找到'); return; }

  if (!temperatureChart) temperatureChart = echarts.init(dom, 'dark');

  // 提取设备名称（去重）
  var deviceNames = [];
  data.forEach(function(d) {
    if (deviceNames.indexOf(d.equipmentName) === -1) deviceNames.push(d.equipmentName);
  });

  var colors = ['#00bcd4', '#3d5afe', '#7c4dff', '#00e676', '#ff9100'];

  var series = deviceNames.map(function(device, index) {
    var deviceData = data.filter(function(d) { return d.equipmentName === device; });
    return {
      name: device,
      type: 'line',
      data: deviceData.map(function(d) { return d.value; }),
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { color: colors[index % colors.length], width: 2 }
    };
  });

  // 用第一个设备的时间作为 X 轴
  var firstDeviceData = data.filter(function(d) { return d.equipmentName === deviceNames[0]; });
  var timeLabels = firstDeviceData.map(function(d) {
    var parts = d.timestamp.split(' ');
    return parts.length > 1 ? parts[1].substring(0, 5) : d.timestamp;
  });

  var option = {
    tooltip: {
      trigger: 'axis',
      position: function(point, params, dom, rect, size) {
        var x = point[0] - size.contentSize[0] / 2;
        x = Math.max(4, Math.min(x, size.viewSize[0] - size.contentSize[0] - 4));
        return [x, -size.contentSize[1] - 8];
      },
      formatter: function(params) {
        var html = '<strong>' + params[0].axisValue + '</strong><br/>';
        params.forEach(function(p) {
          var threshold = null;
          for (var i = 0; i < data.length; i++) {
            if (data[i].equipmentName === p.seriesName) { threshold = data[i]; break; }
          }
          var upper = threshold ? threshold.upperLimit : '--';
          var lower = threshold ? threshold.lowerLimit : '--';
          html += p.marker + ' ' + p.seriesName + ': ' + p.value + '℃ (阈值 ' + lower + '~' + upper + '℃)<br/>';
        });
        return html;
      }
    },
    legend: {
      type: 'scroll',
      data: deviceNames,
      textStyle: { color: '#8899bb', fontSize: 11 },
      top: 0, right: 0,
      pageIconColor: '#6C3FF5',
      pageIconInactiveColor: '#2a3a5c',
      pageIconSize: 10
    },
    grid: { left: 50, right: 20, top: 50, bottom: 30 },
    xAxis: {
      type: 'category',
      data: timeLabels,
      axisLine: { lineStyle: { color: '#2a3a5c' } },
      axisLabel: { color: '#8899bb', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      name: '温度（℃）',
      nameTextStyle: { color: '#8899bb', fontSize: 11 },
      splitLine: { lineStyle: { color: '#1a2335' } },
      axisLabel: { color: '#8899bb' }
    },
    series: series
  };

  temperatureChart.setOption(option, true);
  temperatureChart.resize();
}

// ============================================================
// 4. 图表窗口自适应
// ============================================================
function resizeCharts() {
  if (productionChart) productionChart.resize();
  if (oeeChart) oeeChart.resize();
  if (temperatureChart) temperatureChart.resize();
}

window.addEventListener('resize', resizeCharts);

// ============================================================
// 5. 加载所有图表（按时间范围）
// ============================================================
async function loadAllCharts(range) {
  range = range || '7d';
  try {
    var results = await Promise.all([
      window.getProduction ? window.getProduction({ range: range }) : Promise.reject('getProduction not available'),
      window.getTemperature ? window.getTemperature({ range: range }) : Promise.reject('getTemperature not available'),
      window.getOEE ? window.getOEE() : Promise.reject('getOEE not available')
    ]);

    renderProductionChart(results[0], range);
    renderTemperatureChart(results[1]);
    renderOeeChart(results[2]);

    currentRange = range;
  } catch (error) {
    console.error('图表数据加载失败:', error);
  }
}
