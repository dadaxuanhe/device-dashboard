/**
 * server.js - 后端服务主入口
 *
 * 职责：
 * 1. 创建 Express 应用实例
 * 2. 配置 JSON 解析和 CORS 中间件
 * 3. 通过 express.static 托管前端静态文件
 * 4. 提供 RESTful API 路由（占位 + 后续实现）
 * 5. 启动时初始化数据库和模拟数据
 * 6. 监听 3000 端口
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb, waitForDb, closeDb } = require('./database');
const { initData } = require('./init-data');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 中间件配置
// ==========================================

// CORS（允许前端跨域请求）
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// JSON 请求体解析
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 统一响应辅助函数
// ==========================================

/**
 * 成功响应
 * @param {object} res - Express response 对象
 * @param {*} data - 响应数据
 * @param {string} message - 提示信息
 */
function success(res, data = null, message = 'success') {
  return res.json({ code: 0, data, message });
}

/**
 * 错误响应
 * @param {object} res - Express response 对象
 * @param {string} message - 错误信息
 * @param {number} status - HTTP 状态码
 */
function fail(res, message = '服务器内部错误', status = 500) {
  return res.status(status).json({ code: -1, data: null, message });
}

// ==========================================
// API 路由 - 用户认证
// ==========================================

// POST /api/auth/login - 用户登录
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ code: 400, data: null, message: '请输入用户名和密码' });
  }
  const db = getDb();
  db.get(
    'SELECT id, username, name, role, roleText FROM users WHERE username = ? AND password = ?',
    [username, password],
    (err, row) => {
      if (err) return res.status(500).json({ code: 500, data: null, message: '服务器错误' });
      if (!row) return res.status(401).json({ code: 401, data: null, message: '用户名或密码错误' });
      res.json({ code: 0, data: row, message: '登录成功' });
    }
  );
});

// POST /api/auth/register - 用户注册
app.post('/api/auth/register', (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ code: 400, data: null, message: '请填写完整信息' });
  }
  if (username.length < 3) return res.status(400).json({ code: 400, data: null, message: '用户名至少3个字符' });
  if (password.length < 4) return res.status(400).json({ code: 400, data: null, message: '密码至少4位' });

  const roleMap = { admin: '车间主管', engineer: '设备工程师', operator: '产线操作员' };
  const roleText = roleMap[role] || '操作员';

  const db = getDb();
  db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
    if (err) return res.status(500).json({ code: 500, data: null, message: '服务器错误' });
    if (row) return res.status(409).json({ code: 409, data: null, message: '用户名已存在，请更换' });

    db.run(
      'INSERT INTO users (username, password, name, role, roleText) VALUES (?, ?, ?, ?, ?)',
      [username, password, name, role, roleText],
      function(err) {
        if (err) return res.status(500).json({ code: 500, data: null, message: '注册失败，请重试' });
        res.json({ code: 0, data: { id: this.lastID, username, name, role, roleText }, message: '注册成功' });
      }
    );
  });
});

// ==========================================
// 静态文件托管（前端）
// ==========================================
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ==========================================
// API 路由 - 设备总览模块
// ==========================================

/**
 * GET /api/equipment
 * 获取所有设备列表（支持筛选与搜索）
 * Query参数：
 *   - status: 按状态筛选（online/warning/error/offline）
 *   - type: 按设备类型筛选
 *   - keyword: 按设备编号或名称模糊搜索
 */
app.get('/api/equipment', (req, res) => {
  const db = getDb();
  const { status, type, keyword } = req.query;

  let sql = 'SELECT *, equipmentNo AS code FROM equipment WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (keyword) {
    sql += ' AND (name LIKE ? OR equipmentNo LIKE ?)';
    const like = `%${keyword}%`;
    params.push(like, like);
  }

  sql += ' ORDER BY id ASC';

  db.all(sql, params, (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

/**
 * GET /api/equipment/:id
 * 获取单台设备完整信息
 * 直接从 equipment 表读取所有字段（含实时参数 + 阈值 + OEE + 产量）
 */
app.get('/api/equipment/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  db.get('SELECT * FROM equipment WHERE id = ?', [id], (err, equip) => {
    if (err) return fail(res, err.message);
    if (!equip) return fail(res, '设备不存在', 404);

    // 维修历史
    db.all(`SELECT id, description AS faultDesc, description AS measure, '' AS handler,
                   ROUND(ROUND((julianday(end_time) - julianday(start_time)) * 24, 1)) AS hours,
                   date(start_time) AS date
            FROM maintenance WHERE equipment_id = ? ORDER BY start_time DESC`, [id], (err5, maint) => {
      if (err5) return fail(res, err5.message);

      success(res, {
        id: equip.id,
        equipmentNo: equip.equipmentNo,
        name: equip.name,
        type: equip.type,
        model: equip.model || '',
        manufacturer: equip.manufacturer || '',
        location: equip.location || '未知',
        installDate: equip.installDate || '--',
        status: ({ online: 'running', warning: 'idle', error: 'fault', offline: 'offline' })[equip.status] || equip.status,
        oee: equip.oee || 0,
        currentOutput: equip.currentOutput || 0,
        temperature: equip.temperature,
        current: equip.current,
        voltage: equip.voltage,
        pressure: equip.pressure,
        thresholds: {
          temperature: { min: equip.tempMin, max: equip.tempMax },
          current: { min: equip.currentMin, max: equip.currentMax },
          voltage: { min: equip.voltageMin, max: equip.voltageMax },
          pressure: { min: equip.pressureMin, max: equip.pressureMax }
        },
        maintenanceHistory: (maint || []).map(m => ({
          id: m.id, faultDesc: m.faultDesc || '常规检查', measure: m.measure || '已完成',
          handler: m.handler || '技术员', hours: m.hours || 1, date: m.date || '--'
        }))
      });
    });
  });
});

/**
 * GET /api/equipment/:id/temperature?range=
 * 获取单台设备的温度历史数据（用于详情页趋势图）
 */
app.get('/api/equipment/:id/temperature', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { range = '7d' } = req.query;

  const rangeMap = {
    today: "datetime('now','localtime')",
    '7d': "datetime('now','-6 days','localtime')",
    '30d': "datetime('now','-29 days','localtime')"
  };
  const dateExpr = rangeMap[range] || rangeMap['7d'];

  db.all(`
    SELECT strftime('%H:%M', record_time) AS time, ROUND(temp_value, 1) AS value
    FROM temperature
    WHERE equipment_id = ? AND record_time >= ${dateExpr}
    ORDER BY record_time ASC
  `, [id], (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows || []);
  });
});

// ==========================================
// API 路由 - 仪表盘统计
// ==========================================

/**
 * GET /api/dashboard/stats
 * 获取看板 KPI 统计数据
 * 返回：
 *   - total:         设备总数
 *   - running:       运行中数量（status = 'online'）
 *   - idle:          待机数量（当前无此状态，保留 0）
 *   - fault:         故障数量（status = 'error'）
 *   - offline:       离线数量（status = 'offline'）
 *   - alarmCount:    未处理告警数（紧急+重要）
 *   - todayOutput:   今日总产量
 *   - avgOee:        平均稼动率（基于良品率 × 设备在线率估算）
 */
app.get('/api/dashboard/stats', (req, res) => {
  const db = getDb();
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM equipment) AS total,
      (SELECT COUNT(*) FROM equipment WHERE status = 'online') AS running,
      (SELECT COUNT(*) FROM equipment WHERE status = 'warning') AS idle,
      (SELECT COUNT(*) FROM equipment WHERE status = 'error') AS fault,
      (SELECT COUNT(*) FROM equipment WHERE status = 'offline') AS offline,
      (SELECT COUNT(*) FROM alarms WHERE status = 'active' AND level IN ('critical','warning')) AS alarmCount,
      (SELECT IFNULL(SUM(output_count), 0) FROM production WHERE record_date = date('now','localtime')) AS todayOutput,
      ROUND(
        IFNULL((
          SELECT AVG(
            CASE WHEN output_count > 0
              THEN (output_count - reject_count) * 100.0 / output_count
              ELSE 0 END
          ) FROM production WHERE record_date >= date('now','-7 days')
        ), 0)
        * (SELECT COUNT(*) FROM equipment WHERE status = 'online') * 1.0
        / MAX((SELECT COUNT(*) FROM equipment), 1)
      , 1) AS avgOee
  `;
  db.get(sql, (err, row) => {
    if (err) return fail(res, err.message);
    success(res, row);
  });
});

// ==========================================
// API 路由 - 产量数据
// ==========================================

/**
 * GET /api/production?range=&equipmentId=
 * 获取产量历史数据
 * Query参数：
 *   - range: 时间范围（today/7d/30d），默认 7d
 *   - equipmentId: 可选，指定设备ID
 * 返回：{ date, planQuantity, actualQuantity, qualifiedQuantity }
 */
app.get('/api/production', (req, res) => {
  const db = getDb();
  const { range = '7d', equipmentId } = req.query;

  const rangeMap = {
    today: "date('now','localtime')",
    '7d': "date('now','-6 days','localtime')",
    '30d': "date('now','-29 days','localtime')"
  };
  const dateExpr = rangeMap[range] || rangeMap['7d'];

  let sql = `
    SELECT 
      record_date AS date,
      output_count AS actualQuantity,
      MAX(0, output_count - reject_count) AS qualifiedQuantity,
      ROUND(output_count * 1.15) AS planQuantity
    FROM production 
    WHERE record_date >= ${dateExpr}
  `;
  const params = [];

  if (equipmentId) {
    sql += ' AND equipment_id = ?';
    params.push(equipmentId);
  }

  sql += ' ORDER BY record_date ASC';

  db.all(sql, params, (err, rows) => {
    if (err) return fail(res, err.message);
    // 按日期聚合（多设备时取平均）
    const dateMap = {};
    rows.forEach(r => {
      if (!dateMap[r.date]) dateMap[r.date] = { date: r.date, planQuantity: 0, actualQuantity: 0, qualifiedQuantity: 0, count: 0 };
      dateMap[r.date].planQuantity += r.planQuantity;
      dateMap[r.date].actualQuantity += r.actualQuantity;
      dateMap[r.date].qualifiedQuantity += r.qualifiedQuantity;
      dateMap[r.date].count++;
    });
    const result = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
    success(res, result);
  });
});

// ==========================================
// API 路由 - 告警管理模块
// ==========================================

/**
 * 级别映射：数据库 warning → major, info → minor
 */
function mapLevel(level) {
  const map = { critical: 'critical', warning: 'major', info: 'minor' };
  return map[level] || 'minor';
}

/**
 * 反向映射：前端传的显示级别 → 数据库原始级别
 */
function unmapLevel(level) {
  const map = { critical: 'critical', major: 'warning', minor: 'info' };
  return map[level] || level;
}

/**
 * 级别中文文本
 */
function getLevelText(level) {
  const map = { critical: '紧急', major: '重要', minor: '一般' };
  return map[level] || level;
}

/**
 * GET /api/alarms/summary
 * 获取告警统计摘要（总数 & 各级别数量）
 */
app.get('/api/alarms/summary', (req, res) => {
  const db = getDb();
  db.get(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN level = 'critical' THEN 1 ELSE 0 END) AS critical,
      SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) AS major,
      SUM(CASE WHEN level = 'info' THEN 1 ELSE 0 END) AS minor
    FROM alarms
  `, (err, summary) => {
    if (err) return fail(res, err.message);
    success(res, summary || { total: 0, critical: 0, major: 0, minor: 0 });
  });
});

/**
 * GET /api/alarms?level=&status=&equipmentId=&limit=
 * 获取告警列表（含统计摘要）
 */
app.get('/api/alarms', (req, res) => {
  const db = getDb();
  const { level, status, equipmentId, limit = 10, page = 1 } = req.query;

  let sql = `
    SELECT a.id, a.equipment_id AS equipmentId, a.level, a.title, a.message,
           a.status, a.created_at AS occurredAt, a.confirmed_at AS confirmedAt,
           a.cleared_at AS clearedAt, a.confirmed_by AS handler,
           e.name AS equipmentName
    FROM alarms a
    LEFT JOIN equipment e ON a.equipment_id = e.id
    WHERE 1=1
  `;
  const params = [];
  if (level && level !== 'all') { sql += ' AND a.level = ?'; params.push(unmapLevel(level)); }
  if (status && status !== 'all') { sql += ' AND a.status = ?'; params.push(status); }
  if (equipmentId && equipmentId !== 'all') { sql += ' AND a.equipment_id = ?'; params.push(equipmentId); }
  sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  const limitNum = parseInt(limit) || 10;
  const offset = (parseInt(page) - 1) * limitNum;
  params.push(limitNum, offset);

  db.all(sql, params, (err, rows) => {
    if (err) return fail(res, err.message);

    // 映射格式
    const list = rows.map(r => ({
      id: r.id,
      equipmentId: r.equipmentId,
      equipmentName: r.equipmentName || '未知',
      level: mapLevel(r.level),
      levelText: getLevelText(mapLevel(r.level)),
      content: (r.title || '') + (r.message ? ': ' + r.message : ''),
      occurredAt: r.occurredAt,
      confirmedAt: r.confirmedAt,
      clearedAt: r.clearedAt,
      status: r.status,
      handler: r.handler
    }));

    // 汇总统计（使用原始 level 值）
    let summarySql = `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN level = 'critical' THEN 1 ELSE 0 END) AS critical,
        SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) AS major,
        SUM(CASE WHEN level = 'info' THEN 1 ELSE 0 END) AS minor
      FROM alarms
      WHERE 1=1
    `;
    const sumParams = [];
    if (level && level !== 'all') { summarySql += ' AND level = ?'; sumParams.push(unmapLevel(level)); }
    if (equipmentId && equipmentId !== 'all') { summarySql += ' AND equipment_id = ?'; sumParams.push(equipmentId); }

    db.get(summarySql, sumParams, (err2, summary) => {
      if (err2) return fail(res, err2.message);
      success(res, { list, summary: summary || { total: 0, critical: 0, major: 0, minor: 0 } });
    });
  });
});

/**
 * PATCH /api/alarms/:id/confirm
 * 确认告警（仅 active 可确认）
 */
app.patch('/api/alarms/:id/confirm', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { handler } = req.body;

  db.get('SELECT status FROM alarms WHERE id = ?', [id], (err, row) => {
    if (err) return fail(res, err.message);
    if (!row) return fail(res, '告警不存在', 404);
    if (row.status !== 'active') return fail(res, '仅 active 状态的告警可确认', 400);

    db.run(
      'UPDATE alarms SET status = "confirmed", confirmed_at = datetime("now","localtime") WHERE id = ? AND status = ?',
      [id, 'active'],
      function(err2) {
        if (err2) return fail(res, err2.message);
        if (this.changes === 0) return fail(res, '操作失败', 404);
        success(res, {
          id: parseInt(id),
          status: 'confirmed',
          confirmedAt: new Date().toISOString().replace('T', ' ').split('.')[0],
          handler: handler || '管理员'
        }, '确认成功');
      }
    );
  });
});

/**
 * PATCH /api/alarms/:id/clear
 * 清除告警（仅 confirmed 可清除）
 */
app.patch('/api/alarms/:id/clear', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { handler } = req.body;

  db.get('SELECT status FROM alarms WHERE id = ?', [id], (err, row) => {
    if (err) return fail(res, err.message);
    if (!row) return fail(res, '告警不存在', 404);
    if (row.status !== 'confirmed') return fail(res, '仅 confirmed 状态的告警可清除', 400);

    db.run(
      'UPDATE alarms SET status = "cleared", cleared_at = datetime("now","localtime") WHERE id = ?',
      [id],
      function(err2) {
        if (err2) return fail(res, err2.message);
        if (this.changes === 0) return fail(res, '操作失败', 404);
        success(res, {
          id: parseInt(id),
          status: 'cleared',
          clearedAt: new Date().toISOString().replace('T', ' ').split('.')[0],
          handler: handler || '管理员'
        }, '清除成功');
      }
    );
  });
});

/**
 * GET /api/alarms/active
 * 获取当前活跃告警（用于顶部滚动条）
 */
app.get('/api/alarms/active', (req, res) => {
  const db = getDb();
  db.all(`
    SELECT a.id, e.name AS equipmentName, a.level, a.title, a.message, a.created_at AS occurredAt
    FROM alarms a
    LEFT JOIN equipment e ON a.equipment_id = e.id
    WHERE a.status = 'active'
    ORDER BY CASE a.level WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, a.created_at DESC
    LIMIT 20
  `, (err, rows) => {
    if (err) return fail(res, err.message);
    const list = rows.map(r => ({
      id: r.id,
      equipmentName: r.equipmentName || '未知',
      level: mapLevel(r.level),
      levelText: getLevelText(mapLevel(r.level)),
      content: (r.title || '') + (r.message ? ': ' + r.message : ''),
      occurredAt: r.occurredAt
    }));
    success(res, list);
  });
});

// ==========================================
// API 路由 - OEE 数据
// ==========================================

/**
 * GET /api/dashboard/oee
 * 获取各设备 OEE 数据
 */
app.get('/api/dashboard/oee', (req, res) => {
  const db = getDb();

  const sql = `
    SELECT 
      e.id, e.name, e.status,
      COALESCE((
        SELECT ROUND(AVG(CASE WHEN p.output_count > 0
          THEN (p.output_count - p.reject_count) * 100.0 / p.output_count ELSE 0 END), 1)
        FROM production p WHERE p.equipment_id = e.id AND p.record_date >= date('now','-7 days')
      ), 0) AS qualityRate,
      CASE WHEN e.status = 'online' THEN 1.0 ELSE 0 END AS onlineFlag
    FROM equipment e ORDER BY e.id
  `;

  db.all(sql, (err, rows) => {
    if (err) return fail(res, err.message);

    const onlineCount = rows.filter(r => r.status === 'online').length;
    const totalCount = rows.length;
    const availability = totalCount > 0 ? onlineCount / totalCount : 0;

    const devices = rows.map(r => ({
      name: r.name,
      oee: Math.round(r.qualityRate * availability * 10) / 10
    }));

    const overall = devices.length > 0
      ? Math.round(devices.reduce((s, d) => s + d.oee, 0) / devices.length * 10) / 10
      : 0;

    success(res, { overall, devices });
  });
});

// ==========================================
// API 路由 - 温度数据
// ==========================================
app.get('/api/temperature', (req, res) => {
  const db = getDb();
  const { range = '7d', equipmentId } = req.query;

  const rangeMap = {
    today: "datetime('now','localtime')",
    '7d': "datetime('now','-6 days','localtime')",
    '30d': "datetime('now','-29 days','localtime')"
  };
  const dateExpr = rangeMap[range] || rangeMap['7d'];

  let sql = `
    SELECT 
      t.record_time AS timestamp,
      e.name AS equipmentName,
      ROUND(t.temp_value, 1) AS value,
      CASE 
        WHEN e.type IN ('数控机床','注塑机') THEN 65
        WHEN e.type = '空压机' THEN 80
        ELSE 55
      END AS upperLimit,
      CASE 
        WHEN e.type IN ('数控机床','注塑机') THEN 10
        WHEN e.type = '空压机' THEN 5
        ELSE 5
      END AS lowerLimit
    FROM temperature t
    LEFT JOIN equipment e ON t.equipment_id = e.id
    WHERE t.record_time >= ${dateExpr}
  `;
  const params = [];

  if (equipmentId) {
    sql += ' AND t.equipment_id = ?';
    params.push(equipmentId);
  }

  sql += ' ORDER BY t.record_time ASC';

  db.all(sql, params, (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

// ==========================================
// API 路由 - 用户 & 人员
// ==========================================

// GET /api/users - 获取用户列表（用于设置页面）
app.get('/api/users', (req, res) => {
  const db = getDb();
  db.all('SELECT id, username, name, role, roleText FROM users ORDER BY id', (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

// DELETE /api/users/:id - 删除用户（主管权限）
app.delete('/api/users/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  // 不允许删除最后一个管理员
  db.get('SELECT role FROM users WHERE id = ?', [id], (err, user) => {
    if (err) return fail(res, err.message);
    if (!user) return fail(res, '用户不存在', 404);

    db.get('SELECT COUNT(*) AS cnt FROM users WHERE role = ?', ['admin'], (err2, row) => {
      if (err2) return fail(res, err2.message);
      if (user.role === 'admin' && row.cnt <= 1) {
        return fail(res, '无法删除最后一个主管账号', 400);
      }

      db.run('DELETE FROM users WHERE id = ?', [id], function(err3) {
        if (err3) return fail(res, err3.message);
        if (this.changes === 0) return fail(res, '用户不存在', 404);
        success(res, null, '用户已删除');
      });
    });
  });
});

// POST /api/users/change-password - 修改密码（主管改自己密码）
app.post('/api/users/change-password', (req, res) => {
  const { id, oldPassword, newPassword } = req.body;
  if (!id || !oldPassword || !newPassword) {
    return fail(res, '参数不完整', 400);
  }
  if (newPassword.length < 4) return fail(res, '新密码至少4位', 400);

  const db = getDb();
  db.get('SELECT id FROM users WHERE id = ? AND password = ?', [id, oldPassword], (err, row) => {
    if (err) return fail(res, err.message);
    if (!row) return fail(res, '原密码错误', 403);
    db.run('UPDATE users SET password = ? WHERE id = ?', [newPassword, id], function(err2) {
      if (err2) return fail(res, err2.message);
      success(res, null, '密码已修改');
    });
  });
});

// GET /api/personnel - 获取人员列表
app.get('/api/personnel', (req, res) => {
  const db = getDb();
  db.all('SELECT * FROM personnel ORDER BY id', (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

// ===== 新增：值班人员 API =====
app.get('/api/staff', (req, res) => {
  const db = getDb();
  db.all('SELECT * FROM staff ORDER BY id', (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

// ===== 新增：操作记录 API =====
app.get('/api/op_log', (req, res) => {
  const db = getDb();
  const { person } = req.query;
  let sql = 'SELECT * FROM op_log WHERE 1=1';
  const params = [];
  if (person) { sql += ' AND person = ?'; params.push(person); }
  sql += ' ORDER BY time DESC';
  db.all(sql, params, (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

// ===== 新增：绩效 API =====
app.get('/api/performance', (req, res) => {
  const db = getDb();
  db.all('SELECT * FROM performance ORDER BY output DESC', (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

// ==========================================
// API 路由 - 操作日志
// ==========================================

// GET /api/operations?equipment_id= - 获取操作日志
app.get('/api/operations', (req, res) => {
  const db = getDb();
  const { equipment_id } = req.query;
  let sql = `
    SELECT o.*, p.name AS operator_name
    FROM operations o
    LEFT JOIN personnel p ON o.operator_id = p.id
    WHERE 1=1
  `;
  const params = [];
  if (equipment_id) { sql += ' AND o.equipment_id = ?'; params.push(equipment_id); }
  sql += ' ORDER BY o.record_time DESC LIMIT 100';
  db.all(sql, params, (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

// ==========================================
// API 路由 - 维修记录
// ==========================================

// GET /api/maintenance?equipment_id= - 获取维修记录
app.get('/api/maintenance', (req, res) => {
  const db = getDb();
  const { equipment_id } = req.query;
  let sql = `
    SELECT m.*, p.name AS technician_name
    FROM maintenance m
    LEFT JOIN personnel p ON m.technician_id = p.id
    WHERE 1=1
  `;
  const params = [];
  if (equipment_id) { sql += ' AND m.equipment_id = ?'; params.push(equipment_id); }
  sql += ' ORDER BY m.created_at DESC LIMIT 50';
  db.all(sql, params, (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

// ==========================================
// 设备详情聚合接口
// ==========================================

// GET /api/equipment/:id/detail - 获取设备完整详情
app.get('/api/equipment/:id/detail', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  db.all(`SELECT * FROM temperature WHERE equipment_id = ? ORDER BY record_time DESC LIMIT 20`, [id], (err, temps) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(`SELECT * FROM production WHERE equipment_id = ? ORDER BY record_date DESC LIMIT 30`, [id], (err, prods) => {
      if (err) return fail(res, err.message);

      db.all(`SELECT m.*, p.name AS technician_name FROM maintenance m LEFT JOIN personnel p ON m.technician_id = p.id WHERE m.equipment_id = ? ORDER BY m.created_at DESC LIMIT 10`, [id], (err, maint) => {
        if (err) return fail(res, err.message);

        db.all(`SELECT o.*, p.name AS operator_name FROM operations o LEFT JOIN personnel p ON o.operator_id = p.id WHERE o.equipment_id = ? ORDER BY o.record_time DESC LIMIT 10`, [id], (err, ops) => {
          if (err) return fail(res, err.message);

          db.get('SELECT * FROM equipment WHERE id = ?', [id], (err, equip) => {
            if (err) return fail(res, err.message);
            if (!equip) return fail(res, '设备不存在', 404);

            res.json({
              code: 0,
              data: {
                equipment: equip,
                temperature: temps,
                production: prods,
                maintenance: maint,
                operations: ops
              },
              message: 'success'
            });
          });
        });
      });
    });
  });
});

// ==========================================
// 错误处理中间件
// ==========================================

// 404 处理
app.use((req, res) => {
  fail(res, '接口不存在', 404);
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('❌ 服务器错误:', err);
  fail(res, '服务器内部错误');
});

// ==========================================
// 全局未捕获异常处理（防止进程崩溃）
// ==========================================
process.on('uncaughtException', (err) => {
  console.error('❌ 未捕获异常:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason);
});

// ==========================================
// 启动服务
// ==========================================

app.listen(PORT, async () => {
  console.log('='.repeat(50));
  console.log('🏭 智能工厂设备监控看板系统');
  console.log(`🌐 访问地址: http://localhost:${PORT}`);
  console.log(`📂 静态文件: ${path.join(__dirname, '..', 'frontend')}`);
  console.log('='.repeat(50));

  // 初始化数据库（建表）后再初始化模拟数据
  await waitForDb();
  initData();
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 正在关闭服务...');
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDb();
  process.exit(0);
});

module.exports = app;
