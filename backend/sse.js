/**
 * sse.js - SSE (Server-Sent Events) 广播模块
 *
 * 职责：
 * - 管理 SSE 客户端连接
 * - 提供统一广播接口 broadcastSSE(event, data)
 * - 提供 SSE HTTP 端点 /api/sse/events
 */

/** 当前所有已连接的 SSE 客户端响应对象集合 */
const sseClients = new Set();

/**
 * 在 Express 应用上挂载 SSE 端点
 * @param {import('express').Express} app
 */
function setupSSEEndpoint(app) {
  app.get('/api/sse/events', (req, res) => {
    // SSE 必需的头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // 发送连接成功事件
    res.write(`event: connected\ndata: ${JSON.stringify({ message: '已连接实时数据服务' })}\n\n`);

    sseClients.add(res);
    console.log(`🟢 SSE 客户端已连接，当前连接数: ${sseClients.size}`);

    // 每 15 秒发送心跳，防止代理/浏览器超时断开
    const keepAlive = setInterval(() => {
      try {
        res.write(':keepalive\n\n');
      } catch (_) {
        clearInterval(keepAlive);
      }
    }, 15000);

    // 客户端断开时自动清理
    req.on('close', () => {
      sseClients.delete(res);
      clearInterval(keepAlive);
      console.log(`🔴 SSE 客户端已断开，当前连接数: ${sseClients.size}`);
    });
  });
}

/**
 * 向所有已连接的 SSE 客户端广播事件
 * @param {string} event - 事件名称（如 device-param-update, alarm, kpi-update）
 * @param {*} data - 要发送的数据（会被 JSON.stringify）
 */
function broadcastSSE(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(message);
    } catch (_) {
      // 写入失败的客户端自动移除
      sseClients.delete(client);
    }
  });
}

/**
 * 获取当前 SSE 客户端连接数
 * @returns {number}
 */
function getSSEClientCount() {
  return sseClients.size;
}

module.exports = { setupSSEEndpoint, broadcastSSE, getSSEClientCount };
