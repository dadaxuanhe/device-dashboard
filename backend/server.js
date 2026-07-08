/**
 * server.js - 后端服务主入口
 *
 * 功能：
 * - 创建 Express 应用，配置 JSON 解析和 CORS 中间件
 * - 通过 express.static 托管前端静态文件
 * - 提供约 60 个 RESTful API（认证/设备/仪表盘/告警/用户/人员/模板/实例/终端）
 * - 启动时初始化数据库、模拟数据和告警规则引擎
 * - 多角色权限中间件（dashboard_admin/workshop_supervisor/maintenance_tech/viewer）
 * - 监听 3000 端口
 */

// ===== 第三方依赖 =====
const express = require('express');   // Web 框架
const cors = require('cors');         // 跨域资源共享中间件
const path = require('path');         // 路径处理

// ===== 本地模块 =====
const { getDb, waitForDb, closeDb } = require('./database');      // 数据库连接管理
const { initData } = require('./init-data');                       // 模拟数据初始化
const { startAlarmEngine } = require('./alarm-engine');            // 告警规则引擎
const { setupSSEEndpoint, broadcastSSE } = require('./sse');      // SSE 实时推送

const app = express();
const PORT = process.env.PORT || 3000;  // 监听端口，默认 3000

// ==========================================
// 中间件配置
// ==========================================

// 允许所有来源的跨域请求
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());                    // 解析 JSON 请求体
app.use(express.urlencoded({ extended: true }));  // 解析 URL 编码的请求体

// ==========================================
// 统一响应辅助函数
// ==========================================

/** 成功响应 */
function success(res, data = null, message = 'success') {
  return res.json({ code: 0, data, message });
}

/** 错误响应 */
function fail(res, message = '服务器内部错误', status = 500) {
  return res.status(status).json({ code: -1, data: null, message });
}

// ==========================================
// 角色常量与权限中间件
// ==========================================

// 角色英文 → 中文映射（用于返回给前端显示）
const ROLES = {
  dashboard_admin: '看板管理员',
  workshop_supervisor: '车间主管',
  maintenance_tech: '设备维修员',
  viewer: '普通员工'
};

// 角色中文 → 英文映射（反向查找）
const ROLES_MAP = {
  '看板管理员': 'dashboard_admin',
  '车间主管': 'workshop_supervisor',
  '设备维修员': 'maintenance_tech',
  '普通员工': 'viewer'
};

/**
 * 角色权限中间件 — 检查当前用户是否拥有指定角色之一
 * 通过请求头 X-User-Id 获取用户信息（简化方案，后续可改 JWT）
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ code: 401, data: null, message: '未登录' });
    }
    const db = getDb();
    db.get('SELECT roles FROM users WHERE id = ?', [userId], (err, user) => {
      if (err || !user) {
        return res.status(401).json({ code: 401, data: null, message: '用户不存在' });
      }
      const userRoles = (user.roles || '').split(',').filter(Boolean);
      const hasRole = allowedRoles.some(r => userRoles.includes(r));
      if (!hasRole) {
        return res.status(403).json({ code: 403, data: null, message: '权限不足' });
      }
      req.userRoles = userRoles;
      next();
    });
  };
}

// ==========================================
// API 路由 - 用户认证
// ==========================================

/** POST /api/auth/login - 用户登录 */
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ code: 400, data: null, message: '请输入用户名和密码' });
  }
  const db = getDb();
  db.get(
    'SELECT id, username, name, roles FROM users WHERE username = ? AND password = ?',
    [username, password],
    (err, row) => {
      if (err) return res.status(500).json({ code: 500, data: null, message: '服务器错误' });
      if (!row) return res.status(401).json({ code: 401, data: null, message: '用户名或密码错误' });
      const roles = (row.roles || '').split(',').filter(Boolean);
      const roleTexts = roles.map(r => ROLES[r] || r).join('、');
      res.json({ code: 0, data: { id: row.id, username, name: row.name, roles, roleText: roleTexts || '普通员工' }, message: '登录成功' });
    }
  );
});

/** POST /api/auth/register - 用户注册（多角色） */
app.post('/api/auth/register', (req, res) => {
  const { username, password, name, roles } = req.body;
  if (!username || !password || !name || !roles || !Array.isArray(roles) || roles.length === 0) {
    return res.status(400).json({ code: 400, data: null, message: '请填写完整信息并选择至少一个角色' });
  }
  if (username.length < 3) return res.status(400).json({ code: 400, data: null, message: '用户名至少3个字符' });
  if (password.length < 4) return res.status(400).json({ code: 400, data: null, message: '密码至少4位' });

  const validRoles = Object.keys(ROLES);
  const invalidRoles = roles.filter(r => !validRoles.includes(r));
  if (invalidRoles.length > 0) {
    return res.status(400).json({ code: 400, data: null, message: `无效角色: ${invalidRoles.join(', ')}` });
  }

  const rolesStr = roles.join(',');
  const db = getDb();
  db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
    if (err) return res.status(500).json({ code: 500, data: null, message: '服务器错误' });
    if (row) return res.status(409).json({ code: 409, data: null, message: '用户名已存在，请更换' });

    db.run(
      'INSERT INTO users (username, password, name, roles) VALUES (?, ?, ?, ?)',
      [username, password, name, rolesStr],
      function(err) {
        if (err) return res.status(500).json({ code: 500, data: null, message: '注册失败，请重试' });
        const roleTexts = roles.map(r => ROLES[r] || r).join('、');
        res.json({ code: 0, data: { id: this.lastID, username, name, roles, roleText: roleTexts }, message: '注册成功' });
      }
    );
  });
});

// ==========================================
// 静态文件托管
// ==========================================
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ==========================================
// API 路由 - 设备总览模块
// ==========================================

/** GET /api/equipment - 获取设备列表（支持 status/type/keyword 筛选） */
app.get('/api/equipment', (req, res) => {
  const db = getDb();
  const { status, type, keyword } = req.query;
  const userId = req.headers['x-user-id'];

  let sql = 'SELECT e.*, e.equipmentNo AS code FROM equipment e WHERE 1=1';
  const params = [];

  if (status) { sql += ' AND e.status = ?'; params.push(status); }
  if (type) { sql += ' AND e.type = ?'; params.push(type); }
  if (keyword) {
    sql += ' AND (e.name LIKE ? OR e.equipmentNo LIKE ?)';
    const like = `%${keyword}%`;
    params.push(like, like);
  }
  sql += ' ORDER BY e.id ASC';

  db.all(sql, params, (err, rows) => {
    if (err) return fail(res, err.message);
    if (!userId) return success(res, rows);

    // 获取用户收藏的设备ID列表，标记 is_favorited
    db.all('SELECT equipment_id FROM user_favorites WHERE user_id = ?', [userId], (err2, favs) => {
      if (err2) return success(res, rows);
      const favIds = new Set((favs || []).map(f => f.equipment_id));
      rows.forEach(r => { r.is_favorited = favIds.has(r.id) ? 1 : 0; });
      success(res, rows);
    });
  });
});

/** GET /api/equipment/next-no - 获取下一个可用的设备编号（自动生成 EQ-xxx） */
app.get('/api/equipment/next-no', (req, res) => {
  const db = getDb();
  db.all(`SELECT equipmentNo FROM equipment WHERE equipmentNo LIKE 'EQ-%' ORDER BY CAST(SUBSTR(equipmentNo,4) AS INTEGER) DESC`, (err, rows) => {
    if (err) return fail(res, err.message);
    let nextNum = 1;
    if (rows && rows.length > 0) {
      const maxNum = parseInt(rows[0].equipmentNo.replace('EQ-', ''), 10);
      if (!isNaN(maxNum)) nextNum = maxNum + 1;
    }
    const nextNo = 'EQ-' + String(nextNum).padStart(3, '0');
    success(res, { nextNo });
  });
});

/** POST /api/equipment - 新增设备（需管理员/主管权限） */
app.post('/api/equipment', requireRole('dashboard_admin', 'workshop_supervisor'), (req, res) => {
  const { equipmentNo, name, type, model, manufacturer, location, installDate, status, description,
          tempMin, tempMax, currentMin, currentMax, voltageMin, voltageMax, pressureMin, pressureMax, maintenance_cycle } = req.body;
  if (!equipmentNo || !name || !type) return fail(res, '设备编号、名称和类型不能为空', 400);
  const db = getDb();
  db.run(`INSERT INTO equipment (equipmentNo, name, type, model, manufacturer, location, installDate, status, description,
          tempMin, tempMax, currentMin, currentMax, voltageMin, voltageMax, pressureMin, pressureMax, maintenance_cycle)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [equipmentNo, name, type, model||'', manufacturer||'', location||'', installDate||'', status||'offline', description||'',
     tempMin??20, tempMax??50, currentMin??10, currentMax??25, voltageMin??340, voltageMax??420, pressureMin??0.4, pressureMax??0.8, maintenance_cycle??90],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return fail(res, '设备编号已存在', 400);
        return fail(res, err.message);
      }
      success(res, { id: this.lastID, equipmentNo, name, type, maintenance_cycle: maintenance_cycle??90 }, '设备添加成功');
    }
  );
});

/** DELETE /api/equipment/:id - 删除设备（级联删除关联子表数据） */
app.delete('/api/equipment/:id', (req, res) => {
  const db = getDb();
  // 级联删除关联子表数据（温度记录、运行记录、维修记录、操作日志），避免外键约束冲突
  db.run('DELETE FROM temperature WHERE equipment_id = ?', [req.params.id]);
  db.run('DELETE FROM runtime WHERE equipment_id = ?', [req.params.id]);
  db.run('DELETE FROM maintenance WHERE equipment_id = ?', [req.params.id]);
  db.run('DELETE FROM operations WHERE equipment_id = ?', [req.params.id]);
  // 最后删除设备主表记录
  db.run('DELETE FROM equipment WHERE id = ?', [req.params.id], function(err) {
    if (err) return fail(res, err.message);
    if (this.changes === 0) return fail(res, '设备不存在', 404);
    success(res, null, '设备已删除');
  });
});

/** GET /api/equipment/:id - 获取单台设备完整信息（含实时参数 + 阈值 + 维修历史） */
app.get('/api/equipment/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  db.get('SELECT * FROM equipment WHERE id = ?', [id], (err, equip) => {
    if (err) return fail(res, err.message);
    if (!equip) return fail(res, '设备不存在', 404);

    // 并行查询该设备的维修历史，按开始时间降序排列
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
        // 将数据库状态码转换为前端识别的状态码（online→running, warning→idle, error→fault）
      status: ({ online: 'running', warning: 'idle', error: 'fault', offline: 'offline' })[equip.status] || equip.status,
        oee: equip.oee || 0,
        currentOutput: equip.currentOutput || 0,
        temperature: equip.temperature,
        current: equip.current,
        voltage: equip.voltage,
        pressure: equip.pressure,
        maintenance_cycle: equip.maintenance_cycle ?? 90,
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

/** GET /api/equipment/:id/temperature - 获取设备温度历史（用于详情页趋势图） */
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

/** GET /api/dashboard/stats - 获取 KPI 统计数据 */
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

/** GET /api/production - 获取产量历史数据 */
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
    // 按日期聚合（多设备时取平均值），生成 planQuantity/actualQuantity/qualifiedQuantity 三个系列
    const dateMap = {};
    rows.forEach(r => {
      if (!dateMap[r.date]) dateMap[r.date] = { date: r.date, planQuantity: 0, actualQuantity: 0, qualifiedQuantity: 0, count: 0 };
      dateMap[r.date].planQuantity += r.planQuantity;
      dateMap[r.date].actualQuantity += r.actualQuantity;
      dateMap[r.date].qualifiedQuantity += r.qualifiedQuantity;
      dateMap[r.date].count++;
    });
    const result = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));  // 按日期升序排列
    success(res, result);
  });
});

// ==========================================
// API 路由 - 告警管理模块
// ==========================================

/**
 * 级别映射：数据库原始级别 → 前端显示级别
 * 数据库存储 critical/warning/info，前端展示 critical/major/minor
 */
function mapLevel(level) {
  const map = { critical: 'critical', warning: 'major', info: 'minor' };
  return map[level] || 'minor';
}

/**
 * 反向映射：前端显示级别 → 数据库原始级别
 * 前端筛选传 major/minor 时转回数据库的 warning/info
 */
function unmapLevel(level) {
  const map = { critical: 'critical', major: 'warning', minor: 'info' };
  return map[level] || level;
}

/** 告警级别 → 中文文本（用于前端表格显示） */
function getLevelText(level) {
  const map = { critical: '紧急', major: '重要', minor: '一般' };
  return map[level] || level;
}

/** GET /api/alarms/summary - 获取告警统计摘要 */
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

/** GET /api/alarms - 获取告警列表（分页 + 筛选，含统计摘要） */
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

/** PATCH /api/alarms/:id/confirm - 确认告警（active → confirmed，需主管权限） */
app.patch('/api/alarms/:id/confirm', requireRole('workshop_supervisor', 'dashboard_admin'), (req, res) => {
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

/** PATCH /api/alarms/:id/clear - 清除告警（confirmed → cleared，需主管权限） */
app.patch('/api/alarms/:id/clear', requireRole('workshop_supervisor', 'dashboard_admin'), (req, res) => {
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

/** GET /api/alarms/active - 获取当前活跃告警（用于顶部滚动条） */
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
// API 路由 - 告警统计
// ==========================================

/** GET /api/alarms/stats/by-device - 按设备统计告警数量 */
app.get('/api/alarms/stats/by-device', (req, res) => {
  const db = getDb();
  const { range = '7d' } = req.query;
  const rangeMap = {
    today: "datetime('now','localtime')",
    '7d': "datetime('now','-6 days','localtime')",
    '30d': "datetime('now','-29 days','localtime')"
  };
  const dateExpr = rangeMap[range] || rangeMap['7d'];
  db.all(`
    SELECT e.id, e.name AS equipment_name, COUNT(a.id) AS alarm_count,
           SUM(CASE WHEN a.level = 'critical' THEN 1 ELSE 0 END) AS critical_count,
           SUM(CASE WHEN a.level = 'warning' THEN 1 ELSE 0 END) AS warning_count,
           SUM(CASE WHEN a.level = 'info' THEN 1 ELSE 0 END) AS info_count
    FROM equipment e
    LEFT JOIN alarms a ON e.id = a.equipment_id AND a.created_at >= ${dateExpr}
    GROUP BY e.id
    ORDER BY alarm_count DESC
  `, (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows || []);
  });
});

/** GET /api/alarms/stats/by-level - 按告警级别统计数量 */
app.get('/api/alarms/stats/by-level', (req, res) => {
  const db = getDb();
  db.get(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN level = 'critical' THEN 1 ELSE 0 END) AS critical,
      SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) AS warning,
      SUM(CASE WHEN level = 'info' THEN 1 ELSE 0 END) AS info
    FROM alarms
  `, (err, row) => {
    if (err) return fail(res, err.message);
    success(res, row || { total: 0, critical: 0, warning: 0, info: 0 });
  });
});

/** GET /api/alarms/stats/by-time - 按时间统计告警数量 */
app.get('/api/alarms/stats/by-time', (req, res) => {
  const db = getDb();
  const { range = '30d' } = req.query;
  const rangeMap = {
    '7d': "date('now','-6 days','localtime')",
    '30d': "date('now','-29 days','localtime')",
    '90d': "date('now','-89 days','localtime')"
  };
  const dateExpr = rangeMap[range] || rangeMap['30d'];
  db.all(`
    SELECT date(created_at) AS date, COUNT(*) AS count,
           SUM(CASE WHEN level = 'critical' THEN 1 ELSE 0 END) AS critical,
           SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) AS warning
    FROM alarms
    WHERE created_at >= ${dateExpr}
    GROUP BY date(created_at)
    ORDER BY date ASC
  `, (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows || []);
  });
});

// ==========================================
// API 路由 - OEE 数据
// ==========================================

/** GET /api/dashboard/oee - 获取各设备 OEE 数据 */
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

    // OEE = 设备可用率 × 良品率，可用率 = 在线设备数 / 总设备数
    const onlineCount = rows.filter(r => r.status === 'online').length;
    const totalCount = rows.length;
    const availability = totalCount > 0 ? onlineCount / totalCount : 0;

    const devices = rows.map(r => ({
      name: r.name,
      oee: Math.round(r.qualityRate * availability * 10) / 10  // 保留一位小数
    }));

    // 整体 OEE = 各设备 OEE 的平均值
    const overall = devices.length > 0
      ? Math.round(devices.reduce((s, d) => s + d.oee, 0) / devices.length * 10) / 10
      : 0;

    success(res, { overall, devices });
  });
});

// ==========================================
// API 路由 - 温度数据
// ==========================================

/** GET /api/temperature - 获取温度数据（含阈值标注） */
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
// API 路由 - 数据源管理（看板管理员）
// ==========================================

/** GET /api/data-sources - 获取数据源列表 */
app.get('/api/data-sources', (req, res) => {
  const db = getDb();
  db.all('SELECT * FROM data_sources ORDER BY id', (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

/** POST /api/data-sources - 新增数据源 */
app.post('/api/data-sources', (req, res) => {
  const { name, type, endpoint, api_key, headers, refresh_interval, description } = req.body;
  if (!name || !endpoint) return fail(res, '名称和接口地址不能为空', 400);
  const db = getDb();
  db.run(`INSERT INTO data_sources (name, type, endpoint, api_key, headers, refresh_interval, description)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, type || 'api', endpoint, api_key || '', headers || '{}', refresh_interval || 60, description || ''],
    function(err) {
      if (err) return fail(res, err.message);
      success(res, { id: this.lastID, name, endpoint }, '数据源添加成功');
    }
  );
});

/** PUT /api/data-sources/:id - 修改数据源 */
app.put('/api/data-sources/:id', (req, res) => {
  const { name, type, endpoint, api_key, headers, refresh_interval, description, status } = req.body;
  const db = getDb();
  db.run(`UPDATE data_sources SET name=?, type=?, endpoint=?, api_key=?, headers=?,
          refresh_interval=?, description=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`,
    [name, type, endpoint, api_key, headers, refresh_interval, description, status, req.params.id],
    function(err) {
      if (err) return fail(res, err.message);
      if (this.changes === 0) return fail(res, '数据源不存在', 404);
      success(res, null, '数据源更新成功');
    }
  );
});

/** DELETE /api/data-sources/:id - 删除数据源 */
app.delete('/api/data-sources/:id', (req, res) => {
  const db = getDb();
  db.run('DELETE FROM data_sources WHERE id = ?', [req.params.id], function(err) {
    if (err) return fail(res, err.message);
    if (this.changes === 0) return fail(res, '数据源不存在', 404);
    success(res, null, '数据源已删除');
  });
});

/** POST /api/data-sources/:id/test - 测试数据源连接 */
app.post('/api/data-sources/:id/test', (req, res) => {
  const db = getDb();
  db.get('SELECT * FROM data_sources WHERE id = ?', [req.params.id], (err, ds) => {
    if (err) return fail(res, err.message);
    if (!ds) return fail(res, '数据源不存在', 404);
    // 模拟测试连接
    const result = Math.random() > 0.3 ? '连接成功' : '连接失败（超时）';
    db.run('UPDATE data_sources SET last_test_at=datetime(\'now\',\'localtime\'), last_test_result=? WHERE id=?',
      [result, req.params.id], (err2) => {
        if (err2) return fail(res, err2.message);
        success(res, { result }, result);
      }
    );
  });
});

// ==========================================
// API 路由 - 用户 & 人员
// ==========================================

/** GET /api/users - 获取用户列表（含角色数组） */
app.get('/api/users', (req, res) => {
  const db = getDb();
  db.all('SELECT id, username, name, roles FROM users ORDER BY id', (err, rows) => {
    if (err) return fail(res, err.message);
    const list = rows.map(r => ({
      ...r,
      roles: (r.roles || '').split(',').filter(Boolean)
    }));
    success(res, list);
  });
});

/** DELETE /api/users/:id - 删除用户 */
app.delete('/api/users/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  db.get('SELECT roles FROM users WHERE id = ?', [id], (err, user) => {
    if (err) return fail(res, err.message);
    if (!user) return fail(res, '用户不存在', 404);

    // 保护机制：不允许删除最后一个看板管理员（防止系统无人管理）
    const userRoles = (user.roles || '').split(',').filter(Boolean);
    if (userRoles.includes('dashboard_admin')) {
      db.get('SELECT COUNT(*) AS cnt FROM users WHERE roles LIKE ?', ['%dashboard_admin%'], (err2, row) => {
        if (err2) return fail(res, err2.message);
        if (row.cnt <= 1) {
          return fail(res, '无法删除最后一个看板管理员账号', 400);
        }
        proceedDelete(db, id, res);
      });
    } else {
      proceedDelete(db, id, res);
    }

    function proceedDelete(db, uid, res) {
      db.run('DELETE FROM users WHERE id = ?', [uid], function(err3) {
        if (err3) return fail(res, err3.message);
        if (this.changes === 0) return fail(res, '用户不存在', 404);
        success(res, null, '用户已删除');
      });
    }
  });
});

/** POST /api/users/change-password - 修改密码 */
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

/** GET /api/personnel - 获取人员列表 */
app.get('/api/personnel', (req, res) => {
  const db = getDb();
  db.all('SELECT * FROM personnel ORDER BY id', (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

/** POST /api/personnel - 新增人员（车间主管） */
app.post('/api/personnel', (req, res) => {
  const { name, employee_no, role, phone, email } = req.body;
  if (!name || !employee_no || !role) return fail(res, '姓名、工号和角色不能为空', 400);
  const db = getDb();
  db.run('INSERT INTO personnel (name, employee_no, role, phone, email) VALUES (?, ?, ?, ?, ?)',
    [name, employee_no, role, phone || '', email || ''],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return fail(res, '工号已存在', 400);
        return fail(res, err.message);
      }
      success(res, { id: this.lastID, name, employee_no, role }, '人员添加成功');
    }
  );
});

/** PUT /api/personnel/:id - 编辑人员（车间主管） */
app.put('/api/personnel/:id', (req, res) => {
  const { name, role, phone, email, status } = req.body;
  const db = getDb();
  db.run('UPDATE personnel SET name=?, role=?, phone=?, email=?, status=? WHERE id=?',
    [name, role, phone, email, status || 'active', req.params.id],
    function(err) {
      if (err) return fail(res, err.message);
      if (this.changes === 0) return fail(res, '人员不存在', 404);
      success(res, null, '人员更新成功');
    }
  );
});

/** DELETE /api/personnel/:id - 删除人员（车间主管） */
app.delete('/api/personnel/:id', (req, res) => {
  const db = getDb();
  // 级联清空关联的维修记录等技术员引用
  db.run('UPDATE maintenance SET technician_id = NULL WHERE technician_id = ?', [req.params.id]);
  db.run('DELETE FROM personnel WHERE id = ?', [req.params.id], function(err) {
    if (err) return fail(res, err.message);
    if (this.changes === 0) return fail(res, '人员不存在', 404);
    success(res, null, '人员已删除');
  });
});

// ===== 值班人员 API =====
/** GET /api/staff - 获取值班人员列表 */
app.get('/api/staff', (req, res) => {
  const db = getDb();
  db.all('SELECT * FROM staff ORDER BY id', (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

/** POST /api/staff - 新增值班人员 */
app.post('/api/staff', (req, res) => {
  const { name, position, shift, phone } = req.body;
  if (!name || !position) return fail(res, '姓名和岗位不能为空', 400);
  const db = getDb();
  db.run('INSERT INTO staff (name, position, shift, phone) VALUES (?, ?, ?, ?)',
    [name, position, shift || '', phone || ''],
    function(err) {
      if (err) return fail(res, err.message);
      success(res, { id: this.lastID, name, position, shift, phone }, '人员添加成功');
    }
  );
});

/** DELETE /api/staff/:id - 删除值班人员 */
app.delete('/api/staff/:id', (req, res) => {
  const db = getDb();
  db.run('DELETE FROM staff WHERE id = ?', [req.params.id], function(err) {
    if (err) return fail(res, err.message);
    if (this.changes === 0) return fail(res, '人员不存在', 404);
    success(res, null, '人员已删除');
  });
});

/** GET /api/op_log - 获取操作记录（可按人员筛选） */
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

/** GET /api/performance - 获取绩效排名（按产量降序） */
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

/** GET /api/operations - 获取操作日志（按设备筛选） */
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

/** GET /api/maintenance - 获取维修记录（按设备/告警筛选） */
app.get('/api/maintenance', (req, res) => {
  const db = getDb();
  const { equipment_id, alarm_id } = req.query;
  let sql = `
    SELECT m.*, p.name AS technician_name
    FROM maintenance m
    LEFT JOIN personnel p ON m.technician_id = p.id
    WHERE 1=1
  `;
  const params = [];
  if (equipment_id) { sql += ' AND m.equipment_id = ?'; params.push(equipment_id); }
  if (alarm_id) { sql += ' AND m.alarm_id = ?'; params.push(alarm_id); }
  sql += ' ORDER BY m.created_at DESC LIMIT 50';
  db.all(sql, params, (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

/** POST /api/maintenance/from-alarm - 从告警创建维修记录（设备维修员） */
app.post('/api/maintenance/from-alarm', (req, res) => {
  const { alarm_id, equipment_id, technician_id, description, fault_cause, parts_replaced, cost, notes } = req.body;
  if (!alarm_id || !equipment_id || !technician_id) {
    return fail(res, '告警ID、设备ID和维修人员不能为空', 400);
  }
  const db = getDb();
  db.run(`INSERT INTO maintenance (equipment_id, technician_id, type, description, fault_cause, parts_replaced, cost, notes, alarm_id, status, start_time)
          VALUES (?, ?, 'repair', ?, ?, ?, ?, ?, ?, 'in_progress', datetime('now','localtime'))`,
    [equipment_id, technician_id, description || '', fault_cause || '', parts_replaced || '', cost || 0, notes || '', alarm_id],
    function(err) {
      if (err) return fail(res, err.message);
      // 同时将告警状态改为 confirmed
      db.run('UPDATE alarms SET status="confirmed", confirmed_at=datetime("now","localtime") WHERE id=? AND status="active"', [alarm_id]);
      success(res, { id: this.lastID, alarm_id }, '维修记录已创建');
    }
  );
});

/** PUT /api/maintenance/:id - 更新维修记录 */
app.put('/api/maintenance/:id', (req, res) => {
  const { description, fault_cause, parts_replaced, cost, notes, status, end_time } = req.body;
  const db = getDb();
  const endTime = end_time || new Date().toISOString().replace('T', ' ').split('.')[0];
  db.run(`UPDATE maintenance SET description=?, fault_cause=?, parts_replaced=?, cost=?, notes=?, status=?, end_time=?, updated_at=datetime('now','localtime') WHERE id=?`,
    [description, fault_cause, parts_replaced, cost, notes, status, endTime, req.params.id],
    function(err) {
      if (err) return fail(res, err.message);
      if (this.changes === 0) return fail(res, '维修记录不存在', 404);
      success(res, null, '维修记录已更新');
    }
  );
});

// ==========================================
// 设备详情聚合接口
// ==========================================

/** GET /api/equipment/:id/detail - 获取设备完整聚合详情 */
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
// API 路由 - 告警规则管理
// ==========================================

/** GET /api/alarm-rules - 获取告警规则列表（可按设备筛选） */
app.get('/api/alarm-rules', (req, res) => {
  const db = getDb();
  const { equipmentId } = req.query;
  let sql = `
    SELECT ar.*, e.name AS equipment_name, e.equipmentNo
    FROM alarm_rules ar
    LEFT JOIN equipment e ON ar.equipment_id = e.id
    WHERE 1=1
  `;
  const params = [];
  if (equipmentId && equipmentId !== 'all') {
    sql += ' AND ar.equipment_id = ?';
    params.push(equipmentId);
  }
  sql += ' ORDER BY ar.equipment_id, ar.param_name';
  db.all(sql, params, (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

/** POST /api/alarm-rules - 新增告警规则 */
app.post('/api/alarm-rules', requireRole('dashboard_admin', 'workshop_supervisor'), (req, res) => {
  const { equipment_id, param_name, param_label, min_value, max_value, enabled, notify_level } = req.body;
  if (!equipment_id || !param_name) return fail(res, '设备ID和参数名不能为空', 400);
  const db = getDb();
  db.run(`INSERT INTO alarm_rules (equipment_id, param_name, param_label, min_value, max_value, enabled, notify_level)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [equipment_id, param_name, param_label || '', min_value ?? null, max_value ?? null, enabled ?? 1, notify_level || 'warning'],
    function(err) {
      if (err) return fail(res, err.message);
      success(res, { id: this.lastID }, '规则添加成功');
    }
  );
});

/** PUT /api/alarm-rules/:id - 修改告警规则 */
app.put('/api/alarm-rules/:id', requireRole('dashboard_admin', 'workshop_supervisor'), (req, res) => {
  const { param_name, param_label, min_value, max_value, enabled, notify_level } = req.body;
  const db = getDb();
  db.run(`UPDATE alarm_rules SET param_name=?, param_label=?, min_value=?, max_value=?, enabled=?, notify_level=?, updated_at=datetime('now','localtime') WHERE id=?`,
    [param_name, param_label, min_value ?? null, max_value ?? null, enabled, notify_level, req.params.id],
    function(err) {
      if (err) return fail(res, err.message);
      if (this.changes === 0) return fail(res, '规则不存在', 404);
      success(res, null, '规则更新成功');
    }
  );
});

/** DELETE /api/alarm-rules/:id - 删除告警规则 */
app.delete('/api/alarm-rules/:id', requireRole('dashboard_admin', 'workshop_supervisor'), (req, res) => {
  const db = getDb();
  db.run('DELETE FROM alarm_rules WHERE id = ?', [req.params.id], function(err) {
    if (err) return fail(res, err.message);
    if (this.changes === 0) return fail(res, '规则不存在', 404);
    success(res, null, '规则已删除');
  });
});

// ==========================================
// API 路由 - 看板模板管理
// ==========================================

/** GET /api/board-templates - 获取模板列表 */
app.get('/api/board-templates', (req, res) => {
  const db = getDb();
  db.all(`SELECT bt.*,
    (SELECT COUNT(*) FROM template_components WHERE template_id = bt.id) AS component_count
    FROM board_templates bt ORDER BY bt.id DESC`, (err, rows) => {
    if (err) return fail(res, err.message);
    rows.forEach(r => {
      try { r.config = JSON.parse(r.config || '{}'); } catch(e) { r.config = {}; }
    });
    success(res, rows);
  });
});

/** POST /api/board-templates - 创建模板 */
app.post('/api/board-templates', (req, res) => {
  const { name, description, layout_type, config } = req.body;
  if (!name) return fail(res, '模板名称不能为空', 400);
  const db = getDb();
  db.run(`INSERT INTO board_templates (name, description, layout_type, config) VALUES (?,?,?,?)`,
    [name, description||'', layout_type||'single', JSON.stringify(config||{})],
    function(err) {
      if (err) return fail(res, err.message);
      success(res, { id: this.lastID, name }, '模板创建成功');
    }
  );
});

/** GET /api/board-templates/:id - 模板详情（含组件列表） */
app.get('/api/board-templates/:id', (req, res) => {
  const db = getDb();
  db.get('SELECT * FROM board_templates WHERE id = ?', [req.params.id], (err, tpl) => {
    if (err) return fail(res, err.message);
    if (!tpl) return fail(res, '模板不存在', 404);
    try { tpl.config = JSON.parse(tpl.config || '{}'); } catch(e) { tpl.config = {}; }
    // 查询关联组件
    db.all(`SELECT tc.*, cl.name AS comp_name, cl.type AS comp_type, cl.icon, cl.default_config
      FROM template_components tc
      LEFT JOIN component_library cl ON tc.component_id = cl.id
      WHERE tc.template_id = ? ORDER BY tc.sort_order`, [req.params.id], (err2, comps) => {
      if (err2) return fail(res, err2.message);
      comps.forEach(c => {
        try { c.position = JSON.parse(c.position || '{}'); } catch(e) { c.position = {}; }
        try { c.config = JSON.parse(c.config || '{}'); } catch(e) { c.config = {}; }
      });
      tpl.components = comps;
      success(res, tpl);
    });
  });
});

/** PUT /api/board-templates/:id - 更新模板 */
app.put('/api/board-templates/:id', (req, res) => {
  const { name, description, layout_type, config, status } = req.body;
  const db = getDb();
  db.run(`UPDATE board_templates SET name=?, description=?, layout_type=?, config=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`,
    [name, description, layout_type, JSON.stringify(config||{}), status, req.params.id],
    function(err) {
      if (err) return fail(res, err.message);
      if (this.changes === 0) return fail(res, '模板不存在', 404);
      success(res, null, '模板更新成功');
    }
  );
});

/** DELETE /api/board-templates/:id - 删除模板 */
app.delete('/api/board-templates/:id', (req, res) => {
  const db = getDb();
  db.run('DELETE FROM board_templates WHERE id = ?', [req.params.id], function(err) {
    if (err) return fail(res, err.message);
    if (this.changes === 0) return fail(res, '模板不存在', 404);
    success(res, null, '模板已删除');
  });
});

/** POST /api/board-templates/:id/components - 向模板添加组件 */
app.post('/api/board-templates/:id/components', (req, res) => {
  const { component_id, position, config, refresh_interval, sort_order } = req.body;
  if (!component_id) return fail(res, '组件ID不能为空', 400);
  const db = getDb();
  db.run(`INSERT INTO template_components (template_id, component_id, position, config, refresh_interval, sort_order) VALUES (?,?,?,?,?,?)`,
    [req.params.id, component_id, JSON.stringify(position||{}), JSON.stringify(config||{}), refresh_interval||0, sort_order||0],
    function(err) {
      if (err) return fail(res, err.message);
      success(res, { id: this.lastID }, '组件已添加到模板');
    }
  );
});

/** PUT /api/board-templates/:id/components/:compId - 更新模板组件 */
app.put('/api/board-templates/:id/components/:compId', (req, res) => {
  const { position, config, refresh_interval, sort_order } = req.body;
  const db = getDb();
  db.run(`UPDATE template_components SET position=?, config=?, refresh_interval=?, sort_order=? WHERE id=? AND template_id=?`,
    [JSON.stringify(position||{}), JSON.stringify(config||{}), refresh_interval, sort_order, req.params.compId, req.params.id],
    function(err) {
      if (err) return fail(res, err.message);
      if (this.changes === 0) return fail(res, '组件不存在', 404);
      success(res, null, '组件已更新');
    }
  );
});

/** DELETE /api/board-templates/:id/components/:compId - 移除模板组件 */
app.delete('/api/board-templates/:id/components/:compId', (req, res) => {
  const db = getDb();
  db.run('DELETE FROM template_components WHERE id=? AND template_id=?', [req.params.compId, req.params.id], function(err) {
    if (err) return fail(res, err.message);
    if (this.changes === 0) return fail(res, '组件不存在', 404);
    success(res, null, '组件已移除');
  });
});

// ==========================================
// API 路由 - 组件库
// ==========================================

/** GET /api/component-library - 获取组件库列表 */
app.get('/api/component-library', (req, res) => {
  const db = getDb();
  db.all('SELECT * FROM component_library ORDER BY id', (err, rows) => {
    if (err) return fail(res, err.message);
    rows.forEach(r => {
      try { r.default_config = JSON.parse(r.default_config || '{}'); } catch(e) { r.default_config = {}; }
    });
    success(res, rows);
  });
});

// ==========================================
// API 路由 - 看板实例管理
// ==========================================

/** GET /api/board-instances - 获取实例列表 */
app.get('/api/board-instances', (req, res) => {
  const db = getDb();
  db.all(`SELECT bi.*, bt.name AS template_name, bt.layout_type
    FROM board_instances bi
    LEFT JOIN board_templates bt ON bi.template_id = bt.id
    ORDER BY bi.id DESC`, (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

/** POST /api/board-instances - 创建实例 */
app.post('/api/board-instances', (req, res) => {
  const { template_id, name, description, display_config, refresh_interval } = req.body;
  if (!template_id || !name) return fail(res, '模板ID和实例名称不能为空', 400);
  const db = getDb();
  db.run(`INSERT INTO board_instances (template_id, name, description, display_config, refresh_interval) VALUES (?,?,?,?,?)`,
    [template_id, name, description||'', JSON.stringify(display_config||{}), refresh_interval||30],
    function(err) {
      if (err) return fail(res, err.message);
      success(res, { id: this.lastID, name }, '实例创建成功');
    }
  );
});

/** PUT /api/board-instances/:id - 更新实例 */
app.put('/api/board-instances/:id', (req, res) => {
  const { name, description, display_config, status, refresh_interval } = req.body;
  const db = getDb();
  db.run(`UPDATE board_instances SET name=?, description=?, display_config=?, status=?, refresh_interval=?, updated_at=datetime('now','localtime') WHERE id=?`,
    [name, description, JSON.stringify(display_config||{}), status, refresh_interval, req.params.id],
    function(err) {
      if (err) return fail(res, err.message);
      if (this.changes === 0) return fail(res, '实例不存在', 404);
      success(res, null, '实例更新成功');
    }
  );
});

/** DELETE /api/board-instances/:id - 删除实例 */
app.delete('/api/board-instances/:id', (req, res) => {
  const db = getDb();
  db.run('DELETE FROM board_instances WHERE id = ?', [req.params.id], function(err) {
    if (err) return fail(res, err.message);
    if (this.changes === 0) return fail(res, '实例不存在', 404);
    success(res, null, '实例已删除');
  });
});

/** POST /api/board-instances/:id/publish - 发布/下架看板 */
app.post('/api/board-instances/:id/publish', (req, res) => {
  const { status } = req.body; // 'published' or 'draft' or 'offline'
  const db = getDb();
  db.run(`UPDATE board_instances SET status=?, updated_at=datetime('now','localtime') WHERE id=?`,
    [status || 'published', req.params.id],
    function(err) {
      if (err) return fail(res, err.message);
      if (this.changes === 0) return fail(res, '实例不存在', 404);
      success(res, null, status === 'published' ? '看板已发布' : '看板已下架');
    }
  );
});

/** GET /api/board-instances/:id/render - 获取渲染数据（供展示终端调用） */
app.get('/api/board-instances/:id/render', (req, res) => {
  const db = getDb();
  db.get(`SELECT bi.*, bt.name AS template_name, bt.layout_type, bt.config AS template_config
    FROM board_instances bi
    LEFT JOIN board_templates bt ON bi.template_id = bt.id
    WHERE bi.id = ? AND bi.status = 'published'`, [req.params.id], (err, instance) => {
    if (err) return fail(res, err.message);
    if (!instance) return fail(res, '看板不存在或未发布', 404);
    try { instance.template_config = JSON.parse(instance.template_config || '{}'); } catch(e) {}
    try { instance.display_config = JSON.parse(instance.display_config || '{}'); } catch(e) {}
    // 查询组件
    db.all(`SELECT tc.*, cl.name AS comp_name, cl.type AS comp_type, cl.icon, cl.default_config
      FROM template_components tc
      LEFT JOIN component_library cl ON tc.component_id = cl.id
      WHERE tc.template_id = ? ORDER BY tc.sort_order`, [instance.template_id], (err2, comps) => {
      if (err2) return fail(res, err2.message);
      comps.forEach(c => {
        try { c.position = JSON.parse(c.position || '{}'); } catch(e) { c.position = {}; }
        try { c.config = JSON.parse(c.config || '{}'); } catch(e) { c.config = {}; }
        try { c.default_config = JSON.parse(c.default_config || '{}'); } catch(e) { c.default_config = {}; }
      });
      instance.components = comps;
      success(res, instance);
    });
  });
});

// ==========================================
// API 路由 - 用户看板分配
// ==========================================

/** POST /api/board-instances/:id/assign - 分配看板给指定用户 */
app.post('/api/board-instances/:id/assign', (req, res) => {
  const { user_ids } = req.body; // 数组 [1,2,3]
  if (!Array.isArray(user_ids) || user_ids.length === 0) return fail(res, '请选择至少一个用户', 400);
  const db = getDb();
  const instanceId = req.params.id;
  // 先清除旧分配，再插入新分配
  db.run('DELETE FROM user_board_assignments WHERE instance_id = ?', [instanceId], function(err) {
    if (err) return fail(res, err.message);
    if (user_ids.length === 0) return success(res, null, '分配已清除');
    const placeholders = user_ids.map(() => '(?,?)').join(',');
    const values = [];
    user_ids.forEach(uid => { values.push(instanceId, uid); });
    db.run(`INSERT OR IGNORE INTO user_board_assignments (instance_id, user_id) VALUES ${placeholders}`, values, function(err2) {
      if (err2) return fail(res, err2.message);
      success(res, { assigned: user_ids.length }, '分配成功');
    });
  });
});

/** GET /api/board-instances/:id/assignments - 获取某实例已分配的用户列表 */
app.get('/api/board-instances/:id/assignments', (req, res) => {
  const db = getDb();
  db.all(`SELECT u.id, u.name, u.username
    FROM user_board_assignments a
    JOIN users u ON a.user_id = u.id
    WHERE a.instance_id = ?`, [req.params.id], (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows || []);
  });
});

/** GET /api/my-assigned-board - 获取当前用户被分配的看板（用于员工登录后跳转） */
app.get('/api/my-assigned-board', (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return fail(res, '未登录', 401);
  const db = getDb();
  db.get(`SELECT bi.*, bt.name AS template_name, bt.layout_type
    FROM user_board_assignments a
    JOIN board_instances bi ON a.instance_id = bi.id
    LEFT JOIN board_templates bt ON bi.template_id = bt.id
    WHERE a.user_id = ? AND bi.status = 'published'
    ORDER BY a.id DESC LIMIT 1`, [userId], (err, instance) => {
    if (err) return fail(res, err.message);
    if (!instance) return fail(res, '暂无分配的看板', 404);
    success(res, instance);
  });
});

// ==========================================
// API 路由 - 终端心跳与状态
// ==========================================

/**
 * POST /api/terminal/heartbeat - 展示页面发送心跳
 * 更新用户的在线状态、设备类型和最后活跃时间
 * 展示终端每隔 30 秒调用一次
 */
app.post('/api/terminal/heartbeat', (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return fail(res, '未登录', 401);
  const { device_type } = req.body;
  const db = getDb();
  // 更新分配记录中的设备类型、最后活跃时间和在线状态
  db.run(`UPDATE user_board_assignments SET device_type=?, last_active=datetime('now','localtime'), is_online=1 WHERE user_id=?`,
    [device_type || 'pc', userId],
    function(err) {
      if (err) return fail(res, err.message);
      success(res, null, '心跳已更新');
    }
  );
});

/** POST /api/terminal/offline - 展示页面关闭/切走时标记离线（保留 last_active） */
app.post('/api/terminal/offline', (req, res) => {
  const userId = req.headers['x-user-id'] || req.body.user_id;
  if (!userId) return fail(res, '未登录', 401);
  const db = getDb();
  db.run(`UPDATE user_board_assignments SET is_online=0 WHERE user_id=?`,
    [userId],
    function(err) {
      if (err) return fail(res, err.message);
      success(res, null, '已标记离线');
    }
  );
});

/** GET /api/terminals/status - 获取所有已分配看板的终端在线状态 */
app.get('/api/terminals/status', (req, res) => {
  const db = getDb();
  db.all(`SELECT a.*, u.name AS user_name, u.username, bi.name AS instance_name
    FROM user_board_assignments a
    JOIN users u ON a.user_id = u.id
    JOIN board_instances bi ON a.instance_id = bi.id
    ORDER BY a.id`, (err, rows) => {
    if (err) return fail(res, err.message);
    const list = rows.map(r => {
      // is_online=1 但超过 35 秒无心跳 → 强制离线（兜底）
      var online = r.is_online === 1;
      if (online && r.last_active) {
        var diff = (new Date() - new Date(r.last_active + 'Z')) / 1000;
        if (diff > 35) online = false;
      }
      return { ...r, online };
    });
    success(res, list);
  });
});

// ==========================================
// API 路由 - 展示终端管理
// ==========================================

/** GET /api/display-terminals - 获取终端列表 */
app.get('/api/display-terminals', (req, res) => {
  const db = getDb();
  db.all(`SELECT dt.*, bi.name AS bound_instance_name
    FROM display_terminals dt
    LEFT JOIN board_instances bi ON dt.bound_instance_id = bi.id
    ORDER BY dt.id`, (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, rows);
  });
});

/** POST /api/display-terminals - 注册终端 */
app.post('/api/display-terminals', (req, res) => {
  const { name, type, location, resolution } = req.body;
  if (!name) return fail(res, '终端名称不能为空', 400);
  const db = getDb();
  db.run(`INSERT INTO display_terminals (name, type, location, resolution, status) VALUES (?,?,?,?,'offline')`,
    [name, type||'pc', location||'', resolution||''],
    function(err) {
      if (err) return fail(res, err.message);
      success(res, { id: this.lastID, name }, '终端注册成功');
    }
  );
});

/** PUT /api/display-terminals/:id - 更新终端 */
app.put('/api/display-terminals/:id', (req, res) => {
  const { name, type, location, resolution, bound_instance_id } = req.body;
  const db = getDb();
  db.run(`UPDATE display_terminals SET name=?, type=?, location=?, resolution=?, bound_instance_id=? WHERE id=?`,
    [name, type, location, resolution, bound_instance_id||null, req.params.id],
    function(err) {
      if (err) return fail(res, err.message);
      if (this.changes === 0) return fail(res, '终端不存在', 404);
      success(res, null, '终端已更新');
    }
  );
});

/** DELETE /api/display-terminals/:id - 删除终端 */
app.delete('/api/display-terminals/:id', (req, res) => {
  const db = getDb();
  db.run('DELETE FROM display_terminals WHERE id = ?', [req.params.id], function(err) {
    if (err) return fail(res, err.message);
    if (this.changes === 0) return fail(res, '终端不存在', 404);
    success(res, null, '终端已删除');
  });
});

// ==========================================
// API 路由 - 用户设备收藏
// ==========================================

/** GET /api/favorites - 获取当前用户的收藏设备ID列表（仅普通员工） */
app.get('/api/favorites', requireRole('viewer'), (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return fail(res, '未登录', 401);
  const db = getDb();
  db.all('SELECT equipment_id FROM user_favorites WHERE user_id = ?', [userId], (err, rows) => {
    if (err) return fail(res, err.message);
    success(res, (rows || []).map(r => r.equipment_id));
  });
});

/** POST /api/favorites/toggle - 切换收藏状态（仅普通员工） */
app.post('/api/favorites/toggle', requireRole('viewer'), (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return fail(res, '未登录', 401);
  const { equipmentId } = req.body;
  if (!equipmentId) return fail(res, '缺少设备ID', 400);
  const db = getDb();
  db.get('SELECT id FROM user_favorites WHERE user_id = ? AND equipment_id = ?', [userId, equipmentId], (err, row) => {
    if (err) return fail(res, err.message);
    if (row) {
      db.run('DELETE FROM user_favorites WHERE id = ?', [row.id], function(err2) {
        if (err2) return fail(res, err2.message);
        success(res, { favorited: false }, '已取消收藏');
      });
    } else {
      db.run('INSERT INTO user_favorites (user_id, equipment_id) VALUES (?, ?)', [userId, equipmentId], function(err2) {
        if (err2) return fail(res, err2.message);
        success(res, { favorited: true }, '已收藏');
      });
    }
  });
});

// ==========================================
// 错误处理中间件
// ==========================================

// ==========================================
// SSE 实时推送端点
// ==========================================
setupSSEEndpoint(app);

// 404 处理：匹配不到任何路由时返回 404
app.use((req, res) => {
  fail(res, '接口不存在', 404);
});

// 全局错误处理中间件：捕获所有未处理的异常
app.use((err, req, res, next) => {
  console.error('❌ 服务器错误:', err);
  fail(res, '服务器内部错误');
});

// ==========================================
// 全局未捕获异常处理（防止进程崩溃退出）
// ==========================================
process.on('uncaughtException', (err) => {
  console.error('❌ 未捕获异常:', err.message);
  console.error(err.stack);
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
  // 启动告警规则引擎（每30秒检测一次）
  startAlarmEngine(30000);
  // 终端在线状态兜底清理：每 30 秒将超时未续心跳的标记为离线
  setInterval(() => {
    const db = getDb();
    db.run(`UPDATE user_board_assignments SET is_online=0
      WHERE is_online=1 AND last_active IS NOT NULL
      AND (strftime('%s','now','localtime') - strftime('%s',last_active)) > 35`);
  }, 30000);

  // ==========================================
  // SSE 实时数据推送
  // 通过 Server-Sent Events 向前端浏览器推送设备参数变化、
  // 设备状态变更、新告警通知和 KPI 统计数据更新。
  // 模拟器产生的数据变化会自动告警引擎检测并生成告警。
  // ==========================================

  // lastAlarmId 用于增量检测新告警，启动时初始化为当前最大 ID 避免推送历史
  let lastAlarmId = 0;
  const db_init = getDb();
  if (db_init) {
    db_init.get('SELECT MAX(id) AS maxId FROM alarms', (err, row) => {
      if (!err && row) {
        lastAlarmId = row.maxId || 0;
        console.log(`📋 SSE 告警起点 ID: ${lastAlarmId}`);
      }
    });
  }
  const PARAM_NAMES = ['temperature', 'current', 'voltage', 'pressure'];
  const STATUSES = ['online', 'online', 'online', 'warning', 'offline', 'error']; // 加权随机（online 概率更高）

  // ----------------------------------------------------------
  // 模拟器 1：设备参数随机波动
  // 每 6~9 秒随机选取 3~5 台设备，对其 1~3 个参数做 ±20% 微调，
  // 更新数据库后通过 SSE 广播 device-param-update 事件。
  // 新值被限制在设备各自的阈值范围内（tempMin~tempMax 等）。
  // 未选中的参数保持不变（动态 SQL 仅更新有变化的字段）。
  // ----------------------------------------------------------
  setInterval(() => {
    const db = getDb();
    if (!db) return;

    db.all('SELECT id, temperature, current, voltage, pressure, tempMin, tempMax, currentMin, currentMax, voltageMin, voltageMax, pressureMin, pressureMax FROM equipment ORDER BY RANDOM() LIMIT ?',
      [Math.floor(Math.random() * 3) + 3], (err, devices) => {
      if (err || !devices || devices.length === 0) return;
      const changedDevices = [];

      devices.forEach(dev => {
        const newParams = {};
        // 随机选取 1~3 个参数进行微调
        const paramCount = Math.floor(Math.random() * 3) + 1;
        const shuffled = [...PARAM_NAMES].sort(() => Math.random() - 0.5);
        for (let i = 0; i < paramCount; i++) {
          const param = shuffled[i];
          const oldVal = dev[param];
          const minField = param + 'Min';
          const maxField = param + 'Max';
          const pMin = dev[minField] != null ? dev[minField] : 0;
          const pMax = dev[maxField] != null ? dev[maxField] : 100;
          const range = pMax - pMin;

          let newVal;
          if (oldVal != null && oldVal > 0) {
            // 有初始值：在原值 ±20% 范围内波动
            const delta = oldVal * (Math.random() * 0.4 - 0.2);
            newVal = Math.round((oldVal + delta) * 10) / 10;
          } else {
            // 无初始值：在阈值范围内生成随机值
            newVal = Math.round((pMin + Math.random() * range) * 10) / 10;
          }
          // 限制在阈值范围内
          newVal = Math.max(pMin, Math.min(pMax, newVal));
          newVal = Math.round(newVal * 10) / 10;
          newParams[param] = newVal;
        }

        if (Object.keys(newParams).length > 0) {
          changedDevices.push({ id: dev.id, params: newParams });
        }
      });

      // 批量更新数据库 — 动态拼接 SQL，只更新有变化的字段
      // 避免使用固定 UPDATE 所有 4 个字段导致未选中参数被写入 null
      changedDevices.forEach(dev => {
        const params = dev.params;
        const setClauses = [];
        const setValues = [];
        if (params.temperature !== undefined) { setClauses.push('temperature=?'); setValues.push(params.temperature); }
        if (params.current !== undefined) { setClauses.push('current=?'); setValues.push(params.current); }
        if (params.voltage !== undefined) { setClauses.push('voltage=?'); setValues.push(params.voltage); }
        if (params.pressure !== undefined) { setClauses.push('pressure=?'); setValues.push(params.pressure); }
        if (setClauses.length === 0) return;
        setValues.push(dev.id);
        db.run('UPDATE equipment SET ' + setClauses.join(',') + ' WHERE id=?', setValues);
      });

      // 广播设备参数更新事件给所有连接的 SSE 客户端
      if (changedDevices.length > 0) {
        broadcastSSE('device-param-update', { devices: changedDevices });
      }
    });
  }, 6000 + Math.floor(Math.random() * 3000)); // 6~9 秒间隔

  // ----------------------------------------------------------
  // 模拟器 2：设备状态随机变更
  // 每 25~35 秒随机选取 1 台设备，将其状态切换为不同的状态
  // （online/warning/offline/error），更新数据库后广播
  // device-status-change 事件，前端自动更新状态圆点和文字。
  // ----------------------------------------------------------
  setInterval(() => {
    const db = getDb();
    if (!db) return;

    db.all('SELECT id, name, status FROM equipment ORDER BY RANDOM() LIMIT 1', (err, devices) => {
      if (err || !devices || devices.length === 0) return;
      const dev = devices[0];
      // 从不同状态中随机选一个新状态
      const oldStatus = dev.status;
      let newStatus;
      do {
        newStatus = STATUSES[Math.floor(Math.random() * STATUSES.length)];
      } while (newStatus === oldStatus);

      db.run('UPDATE equipment SET status=? WHERE id=?', [newStatus, dev.id], function(upErr) {
        if (upErr) return;
        console.log(`🔄 设备状态变更: ${dev.name} (${oldStatus} → ${newStatus})`);
        broadcastSSE('device-status-change', {
          id: dev.id,
          oldStatus,
          newStatus,
          name: dev.name
        });
      });
    });
  }, 25000 + Math.floor(Math.random() * 10000)); // 25~35 秒间隔

  // 3. 新告警增量检测：每 10 秒查询是否有新告警并广播
  setInterval(() => {
    const db = getDb();
    if (!db) return;

    db.all(`SELECT a.*, e.name AS equipment_name
      FROM alarms a LEFT JOIN equipment e ON a.equipment_id = e.id
      WHERE a.id > ? ORDER BY a.id ASC LIMIT 10`,
      [lastAlarmId], (err, alarms) => {
      if (err || !alarms || alarms.length === 0) return;

      // 更新最新告警 ID
      const maxId = Math.max(...alarms.map(a => a.id));
      if (maxId > lastAlarmId) lastAlarmId = maxId;

      // 转换字段名为驼峰格式，与前端 showAlarmPopup 期望的一致
      const transformedAlarms = alarms.map(a => ({
        id: a.id,
        equipmentName: a.equipment_name || '未知',
        level: mapLevel(a.level),
        levelText: getLevelText(mapLevel(a.level)),
        content: (a.title || '') + (a.message ? ': ' + a.message : ''),
        occurredAt: a.created_at
      }));

      console.log(`🔔 SSE 推送 ${transformedAlarms.length} 条新告警`);
      broadcastSSE('alarm', { alarms: transformedAlarms });
    });
  }, 10000);

  // 4. KPI 统计数据推送：每 15 秒计算并广播
  setInterval(() => {
    const db = getDb();
    if (!db) return;

    db.get(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status='online' OR status='running' THEN 1 ELSE 0 END) AS running,
      SUM(CASE WHEN status='warning' OR status='idle' THEN 1 ELSE 0 END) AS idle,
      SUM(CASE WHEN status='error' OR status='fault' THEN 1 ELSE 0 END) AS fault,
      SUM(CASE WHEN status='offline' THEN 1 ELSE 0 END) AS offline
      FROM equipment`, (err, stats) => {
      if (err || !stats) return;

      db.get('SELECT COUNT(*) AS count FROM alarms WHERE status IN (\'active\',\'confirmed\')', (err2, alarmStats) => {
        if (err2) return;

        // 计算平均 OEE 和今日总产量
        db.get('SELECT ROUND(AVG(oee),1) AS avgOee, SUM(currentOutput) AS todayOutput FROM equipment', (err3, prodStats) => {
          if (err3) return;

          broadcastSSE('kpi-update', {
            total: stats.total || 0,
            running: stats.running || 0,
            idle: stats.idle || 0,
            fault: stats.fault || 0,
            offline: stats.offline || 0,
            todayOutput: prodStats?.todayOutput || 0,
            avgOee: prodStats?.avgOee || 0,
            alarmCount: alarmStats?.count || 0
          });
        });
      });
    });
  }, 15000);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 正在关闭服务...');
  const { stopAlarmEngine } = require('./alarm-engine');
  stopAlarmEngine();
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDb();
  process.exit(0);
});

module.exports = app;
