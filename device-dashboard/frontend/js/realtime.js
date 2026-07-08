/**
 * realtime.js - SSE 实时数据推送客户端
 *
 * 通过 EventSource 连接后端 SSE 端点，接收实时推送事件并分发给各页面注册的处理器。
 * 支持自动重连。
 *
 * 用法：
 *   connectSSE();                          // 启动连接
 *   onSSE('device-param-update', fn);      // 注册事件监听
 *   onSSE('kpi-update', fn);
 *   disconnectSSE();                        // 断开连接
 */

let eventSource = null;
const handlers = {};
let isConnected = false;

/**
 * 注册 SSE 事件处理器
 * @param {string} event - 事件名
 * @param {Function} callback - 回调函数，接收 parsed data 参数
 */
function onSSE(event, callback) {
  if (!handlers[event]) handlers[event] = [];
  handlers[event].push(callback);
  // 如果已经连接过，立即返回当前连接状态
  return function unsubscribe() {
    const idx = (handlers[event] || []).indexOf(callback);
    if (idx !== -1) handlers[event].splice(idx, 1);
  };
}

/**
 * 启动 SSE 连接
 * @param {Object} [options]
 * @param {boolean} [options.autoReconnect=true] - 断开后是否自动重连
 */
function connectSSE(options) {
  if (eventSource) return;
  const autoReconnect = options?.autoReconnect !== false;

  eventSource = new EventSource('/api/sse/events');

  eventSource.addEventListener('connected', function onConnected(e) {
    isConnected = true;
    try {
      const data = JSON.parse(e.data);
      console.log('✅ SSE 实时数据服务已连接', data.message || '');
    } catch (_) { /* ignore */ }
    dispatchEvent('_connected', null);
  });

  // ---- 设备参数实时更新 ----
  eventSource.addEventListener('device-param-update', function(e) {
    try {
      dispatchEvent('device-param-update', JSON.parse(e.data));
    } catch (_) { /* ignore parse errors */ }
  });

  // ---- 设备状态变更 ----
  eventSource.addEventListener('device-status-change', function(e) {
    try {
      dispatchEvent('device-status-change', JSON.parse(e.data));
    } catch (_) { /* ignore */ }
  });

  // ---- 新告警通知 ----
  eventSource.addEventListener('alarm', function(e) {
    try {
      dispatchEvent('alarm', JSON.parse(e.data));
    } catch (_) { /* ignore */ }
  });

  // ---- KPI 统计数据更新 ----
  eventSource.addEventListener('kpi-update', function(e) {
    try {
      dispatchEvent('kpi-update', JSON.parse(e.data));
    } catch (_) { /* ignore */ }
  });

  // ---- 错误 / 断开 ----
  eventSource.onerror = function() {
    isConnected = false;
    console.warn('⚠️ SSE 实时数据连接断开');
    dispatchEvent('_disconnected', null);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (autoReconnect) {
      console.log('🔄 10 秒后尝试重连...');
      setTimeout(function() { connectSSE({ autoReconnect: true }); }, 10000);
    }
  };
}

/**
 * 内部：向所有注册的处理器分发事件
 */
function dispatchEvent(event, data) {
  const list = handlers[event];
  if (!list) return;
  for (var i = 0; i < list.length; i++) {
    try {
      list[i](data);
    } catch (e) {
      console.error('❌ SSE 事件处理器异常 [' + event + ']:', e);
    }
  }
}

/**
 * 断开 SSE 连接
 */
function disconnectSSE() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  isConnected = false;
  console.log('🔌 SSE 实时数据服务已断开');
}

/**
 * 当前连接状态
 */
function isSSEConnected() {
  return isConnected;
}

// 页面卸载时自动断开
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', disconnectSSE);
}

// 导出全局接口
if (typeof window !== 'undefined') {
  window.connectSSE = connectSSE;
  window.disconnectSSE = disconnectSSE;
  window.onSSE = onSSE;
  window.isSSEConnected = isSSEConnected;
}
