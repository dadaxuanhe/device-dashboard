/**
 * alarm-engine.js - 告警规则引擎
 *
 * 定时扫描告警规则，比较设备实时参数与阈值，
 * 超限时自动生成告警，同设备同参数未清除前不重复生成。
 */

const { getDb } = require('./database');

let engineInterval = null;

// 参数名 → 设备表字段名映射
const PARAM_FIELD_MAP = {
  temperature: 'temperature',
  current: 'current',
  voltage: 'voltage',
  pressure: 'pressure'
};

// 参数名 → 中文显示名
const PARAM_LABEL_MAP = {
  temperature: '温度',
  current: '电流',
  voltage: '电压',
  pressure: '压力'
};

// 参数名 → 单位
const PARAM_UNIT_MAP = {
  temperature: '℃',
  current: 'A',
  voltage: 'V',
  pressure: 'MPa'
};

/**
 * 启动告警规则引擎
 * @param {number} intervalMs - 检测间隔（毫秒），默认 30 秒
 */
function startAlarmEngine(intervalMs = 30000) {
  if (engineInterval) {
    clearInterval(engineInterval);
  }
  console.log(`🔔 告警规则引擎已启动（间隔 ${intervalMs/1000} 秒）`);
  runAlarmCheck();
  engineInterval = setInterval(runAlarmCheck, intervalMs);
}

/**
 * 停止告警规则引擎
 */
function stopAlarmEngine() {
  if (engineInterval) {
    clearInterval(engineInterval);
    engineInterval = null;
    console.log('🔕 告警规则引擎已停止');
  }
}

/**
 * 执行一次告警检测
 */
function runAlarmCheck() {
  const db = getDb();
  if (!db) return;

  db.all(`
    SELECT ar.*, e.name AS equipment_name, e.equipmentNo,
           e.temperature, e.current, e.voltage, e.pressure
    FROM alarm_rules ar
    LEFT JOIN equipment e ON ar.equipment_id = e.id
    WHERE ar.enabled = 1 AND e.id IS NOT NULL
  `, (err, rules) => {
    if (err) {
      console.error('告警引擎查询规则失败:', err.message);
      return;
    }

    if (!rules || rules.length === 0) return;

    for (const rule of rules) {
      const fieldName = PARAM_FIELD_MAP[rule.param_name];
      if (!fieldName) continue;

      const currentValue = rule[fieldName];
      // 跳过 null/undefined 值（设备无此传感器）
      if (currentValue === null || currentValue === undefined) continue;

      let isTriggered = false;
      let reason = '';

      // 检查上限
      if (rule.max_value !== null && currentValue > rule.max_value) {
        isTriggered = true;
        reason = `${rule.param_label || PARAM_LABEL_MAP[rule.param_name] || rule.param_name}超上限（当前 ${currentValue}${PARAM_UNIT_MAP[rule.param_name]||''}，阈值 ${rule.max_value}${PARAM_UNIT_MAP[rule.param_name]||''}）`;
      }
      // 检查下限
      else if (rule.min_value !== null && currentValue < rule.min_value) {
        isTriggered = true;
        reason = `${rule.param_label || PARAM_LABEL_MAP[rule.param_name] || rule.param_name}低于下限（当前 ${currentValue}${PARAM_UNIT_MAP[rule.param_name]||''}，阈值 ${rule.min_value}${PARAM_UNIT_MAP[rule.param_name]||''}）`;
      }

      if (!isTriggered) continue;

      // 避免重复告警：同设备同参数未清除前不再生成
      const alarmTitle = `${rule.param_label || PARAM_LABEL_MAP[rule.param_name] || rule.param_name}异常`;

      db.get(`
        SELECT id FROM alarms
        WHERE equipment_id = ? AND title = ? AND status IN ('active', 'confirmed')
        ORDER BY created_at DESC LIMIT 1
      `, [rule.equipment_id, alarmTitle], (err2, existingAlarm) => {
        if (err2) return;
        if (existingAlarm) return;

        const level = rule.notify_level || 'warning';
        const message = `${rule.equipment_name}（${rule.equipmentNo}）${reason}`;

        db.run(
          `INSERT INTO alarms (equipment_id, level, title, message, status, created_at)
           VALUES (?, ?, ?, ?, 'active', datetime('now','localtime'))`,
          [rule.equipment_id, level, alarmTitle, message],
          function(err3) {
            if (err3) {
              console.error('告警引擎创建告警失败:', err3.message);
              return;
            }
            console.log(`🔔 [告警引擎] ${level} - ${message}`);
          }
        );
      });
    }
  });
}

module.exports = { startAlarmEngine, stopAlarmEngine };
