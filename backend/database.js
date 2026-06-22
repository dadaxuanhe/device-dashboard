/**
 * database.js - 数据库连接与建表模块
 *
 * 职责：
 * 1. 连接 SQLite 数据库（文件存储）
 * 2. 创建 8 张业务表（若不存在）
 * 3. 导出 getDb() 和 closeDb() 供其他模块使用
 *
 * 数据表清单：
 * - equipment:    设备基本信息表
 * - runtime:      设备运行记录表
 * - production:   产量记录表
 * - alarms:       告警记录表
 * - temperature:  温度采集记录表
 * - personnel:    人员信息表
 * - operations:   操作日志表
 * - maintenance:  维修记录表
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');

let db = null;
let dbReady = null; // Promise for database initialization

/**
 * 获取数据库实例（单例），若未初始化则自动初始化
 * @returns {sqlite3.Database}
 */
function getDb() {
  if (db) return db;

  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('❌ 数据库连接失败:', err.message);
      process.exit(1);
    }
    console.log('✅ 数据库连接成功:', DB_PATH);
  });

  // 建表初始化立即开始（异步流水线）
  dbReady = new Promise((resolve) => {
    db.serialize(() => {
      db.run('PRAGMA journal_mode=WAL;');
      db.run('PRAGMA foreign_keys=ON;');
      createTables();
      resolve();
    });
  });

  return db;
}

/**
 * 等待数据库初始化完成（表结构已就绪）
 * @returns {Promise<void>}
 */
function waitForDb() {
  if (dbReady) return dbReady;
  // 触发首次初始化
  getDb();
  return dbReady;
}

/**
 * 建表：若表不存在则创建
 */
function createTables() {
  const stmts = [
    // 1. 设备信息表
    `CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipmentNo TEXT UNIQUE NOT NULL,       -- 设备编号
      name TEXT NOT NULL,                     -- 设备名称
      type TEXT NOT NULL,                     -- 设备类型
      model TEXT DEFAULT '',                  -- 设备型号
      manufacturer TEXT DEFAULT '',           -- 制造商
      location TEXT,                          -- 安装位置
      installDate TEXT,                       -- 安装日期
      status TEXT DEFAULT 'offline',          -- 运行状态（online/offline/warning/error）
      oee REAL DEFAULT 0,                    -- 稼动率
      currentOutput INTEGER DEFAULT 0,       -- 当前产量
      temperature REAL DEFAULT 0,            -- 实时温度
      current REAL DEFAULT 0,                -- 实时电流
      voltage REAL DEFAULT 0,                -- 实时电压
      pressure REAL DEFAULT 0,               -- 实时压力
      tempMin REAL DEFAULT 20,               -- 温度下限
      tempMax REAL DEFAULT 50,               -- 温度上限
      currentMin REAL DEFAULT 10,            -- 电流下限
      currentMax REAL DEFAULT 25,            -- 电流上限
      voltageMin REAL DEFAULT 340,           -- 电压下限
      voltageMax REAL DEFAULT 420,           -- 电压上限
      pressureMin REAL DEFAULT 0.4,          -- 压力下限
      pressureMax REAL DEFAULT 0.8,          -- 压力上限
      description TEXT,                       -- 设备描述/备注
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`,

    // 2. 运行记录表
    `CREATE TABLE IF NOT EXISTS runtime (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,          -- 关联设备ID
      status TEXT NOT NULL,                   -- 运行状态
      start_time TEXT,                        -- 开始时间
      end_time TEXT,                          -- 结束时间
      duration INTEGER DEFAULT 0,            -- 持续时长（秒）
      record_time TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
    )`,

    // 3. 产量记录表
    `CREATE TABLE IF NOT EXISTS production (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,          -- 关联设备ID
      output_count INTEGER DEFAULT 0,         -- 产出数量
      reject_count INTEGER DEFAULT 0,         -- 次品数量
      cycle_time REAL DEFAULT 0,             -- 平均节拍（秒）
      record_date TEXT NOT NULL,              -- 记录日期
      record_time TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
    )`,

    // 4. 告警记录表
    `CREATE TABLE IF NOT EXISTS alarms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,          -- 关联设备ID
      level TEXT NOT NULL DEFAULT 'info',     -- 告警级别（critical/warning/info）
      title TEXT NOT NULL,                    -- 告警标题
      message TEXT,                           -- 告警详情
      status TEXT DEFAULT 'active',           -- 状态（active/confirmed/cleared）
      confirmed_by INTEGER,                   -- 确认人（关联人员ID）
      confirmed_at TEXT,                      -- 确认时间
      cleared_at TEXT,                        -- 清除时间
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
      FOREIGN KEY (confirmed_by) REFERENCES personnel(id)
    )`,

    // 5. 温度采集记录表
    `CREATE TABLE IF NOT EXISTS temperature (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,          -- 关联设备ID
      temp_value REAL NOT NULL,               -- 温度值（℃）
      record_time TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
    )`,

    // 6. 人员信息表
    `CREATE TABLE IF NOT EXISTS personnel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,                     -- 姓名
      employee_no TEXT UNIQUE NOT NULL,       -- 工号
      role TEXT NOT NULL,                     -- 角色（operator/technician/manager）
      phone TEXT,                             -- 联系电话
      email TEXT,                             -- 邮箱
      status TEXT DEFAULT 'active',           -- 状态（active/inactive）
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,

    // 7. 操作日志表
    `CREATE TABLE IF NOT EXISTS operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,          -- 关联设备ID
      operator_id INTEGER NOT NULL,           -- 操作人ID
      action TEXT NOT NULL,                   -- 操作动作
      detail TEXT,                            -- 操作详情
      result TEXT,                            -- 操作结果
      record_time TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES personnel(id)
    )`,

    // 8. 维修记录表
    `CREATE TABLE IF NOT EXISTS maintenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,          -- 关联设备ID
      technician_id INTEGER NOT NULL,         -- 维修人员ID
      type TEXT NOT NULL,                     -- 维修类型（repair/inspection/upgrade）
      description TEXT,                       -- 维修描述
      cost REAL DEFAULT 0,                   -- 维修费用
      start_time TEXT,                        -- 开始时间
      end_time TEXT,                          -- 结束时间
      status TEXT DEFAULT 'pending',          -- 状态（pending/in_progress/completed）
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
      FOREIGN KEY (technician_id) REFERENCES personnel(id)
    )`,

    // 9. 用户表（登录认证）
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,           -- 用户名（登录用）
      password TEXT NOT NULL,                  -- 密码
      name TEXT NOT NULL,                      -- 真实姓名
      role TEXT NOT NULL,                      -- 角色（admin/engineer/operator）
      roleText TEXT NOT NULL,                  -- 角色中文名
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    // 10. 值班人员表
    `CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      shift TEXT,
      phone TEXT
    )`,

    // 11. 操作记录表
    `CREATE TABLE IF NOT EXISTS op_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT NOT NULL,
      person TEXT NOT NULL,
      action TEXT NOT NULL,
      device TEXT,
      result TEXT
    )`,

    // 12. 绩效表
    `CREATE TABLE IF NOT EXISTS performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      month TEXT NOT NULL,
      output INTEGER NOT NULL
    )`
  ];

  for (const stmt of stmts) {
    db.run(stmt, (err) => {
      if (err) console.error('❌ 建表失败:', err.message);
    });
  }

  console.log('✅ 数据库表结构已就绪');
}

/**
 * 关闭数据库连接
 */
function closeDb() {
  if (db) {
    // 移除错误监听器防止未处理异常
    db.removeAllListeners('error');
    db.close((err) => {
      if (err) {
        console.error('❌ 关闭数据库失败:', err.message);
      } else {
        console.log('✅ 数据库连接已关闭');
        db = null;
      }
    });
  }
}

module.exports = { getDb, waitForDb, closeDb };
