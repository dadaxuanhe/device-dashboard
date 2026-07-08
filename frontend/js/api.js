/**
 * api.js - API 请求封装模块
 *
 * 职责：封装所有后端 API 请求（基于 fetch），自动附加用户 ID 头，
 * 统一检查业务状态码，兼容分页对象和数组两种 data 格式。
 */

/** 后端 API 基础地址 */
const BASE_URL = '/api';

/**
 * 通用请求函数
 * @param {string} endpoint - API 端点
 * @param {object} options - fetch 选项
 * @returns {Promise<*>} 后端返回的 data 字段
 */
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;

  try {
    // 自动附加用户ID头（用于后端角色权限校验）
    const userInfo = (() => {
      try { return JSON.parse(sessionStorage.getItem('userInfo') || '{}'); } catch(e) { return {}; }
    })();
    const headers = {
      'Content-Type': 'application/json',
      'X-User-Id': userInfo.id || '',
      ...options.headers
    };

    const response = await fetch(url, {
      headers,
      ...options
    });

    const body = await response.json();

    // 拦截：检查业务状态码
    if (body.code !== 0) {
      throw new Error(body.message || `请求失败 (${response.status})`);
    }

    // 【核心补丁】确保返回的数据结构兼容两种格式：
    // 情况1：data 是 { list: [...], summary: {...} } 的分页对象 → 直接返回 data
    // 情况2：data 是普通数组或其他数据 → 也直接返回 data
    // 上层调用方（如 alarms.html）通过 Array.isArray / result.list 自行判断
    if (body.data && typeof body.data === 'object' && !Array.isArray(body.data) && body.data.list !== undefined) {
      return body.data;
    }
    return body.data;
  } catch (error) {
    console.error(`❌ API 请求错误 [${endpoint}]:`, error.message);
    throw error;
  }
}

/**
 * 获取设备列表
 * GET /api/equipment
 * @param {Object} params - 查询参数
 * @param {string} [params.status] - 状态筛选（online/warning/error/offline）
 * @param {string} [params.type] - 设备类型筛选
 * @param {string} [params.keyword] - 关键词搜索（设备名称/编号模糊匹配）
 * @returns {Promise<Array>} 设备数组
 */
async function getEquipment(params = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.type) query.set('type', params.type);
  if (params.keyword) query.set('keyword', params.keyword);
  const qs = query.toString();
  return request(`/equipment${qs ? '?' + qs : ''}`);
}

// 添加新设备
async function addEquipment(data) {
  return request('/equipment', { method: 'POST', body: JSON.stringify(data) });
}

/**
 * 获取下一个可用的设备编号
 * GET /api/equipment/next-no
 * @returns {Promise<string>} 下一个编号，如 "EQ-014"
 */
/**
 * 获取下一个可用的设备编号（自动生成 EQ-xxx 递增）
 * GET /api/equipment/next-no
 * @returns {Promise<string>} 下一个编号，如 "EQ-014"
 */
async function getNextEquipmentNo() {
  return request('/equipment/next-no');
}

/**
 * 删除设备（级联删除关联子表数据）
 * DELETE /api/equipment/:id
 * @param {number} id - 设备 ID
 * @returns {Promise<null>} 成功返回 null
 */
async function deleteEquipment(id) {
  return request('/equipment/' + id, { method: 'DELETE' });
}

/**
 * 获取看板 KPI 统计数据
 * GET /api/dashboard/stats
 * @returns {Promise<Object>} KPI 数据
 *   { total, running, idle, fault, offline, alarmCount, todayOutput, avgOee }
 */
async function getStats() {
  return request('/dashboard/stats');
}

/**
 * 获取设备详情（含实时运行参数）
 * GET /api/equipment/:id
 * @param {number} id - 设备 ID
 * @returns {Promise<Object>} 设备详情
 *   { id, name, code, type, status, location, ..., runtime_status, duration }
 */
async function getEquipmentDetail(id) {
  return request(`/equipment/${id}`);
}

/**
 * 获取设备温度历史（用于详情页趋势图）
 * GET /api/equipment/:id/temperature
 * @param {number} id - 设备 ID
 * @param {Object} params - { range: 'today'|'7d'|'30d' }
 * @returns {Promise<Array>} [{ time, value }]
 */
async function getEquipmentTemperature(id, params = {}) {
  const query = new URLSearchParams();
  if (params.range) query.set('range', params.range);
  const qs = query.toString();
  return request(`/equipment/${id}/temperature${qs ? '?' + qs : ''}`);
}

/**
 * 获取产量数据
 * GET /api/production?range=&equipmentId=&equipment_id=&days=
 * @param {Object} params - 查询参数
 * @param {string} [params.range] - 时间范围（today/7d/30d），默认 7d
 * @param {number} [params.equipmentId] - 设备ID（新命名）
 * @param {number} [params.equipment_id] - 设备ID（兼容旧命名）
 * @param {number} [params.days] - 天数（兼容旧参数）
 * @returns {Promise<Array>} 产量数据 [{ date, planQuantity, actualQuantity, qualifiedQuantity }]
 */
async function getProduction(params = {}) {
  const query = new URLSearchParams();
  if (params.range) query.set('range', params.range);
  else if (params.days) query.set('range', params.days + 'd');
  else query.set('range', '7d');
  if (params.equipmentId) query.set('equipmentId', params.equipmentId);
  else if (params.equipment_id) query.set('equipmentId', params.equipment_id);
  const qs = query.toString();
  return request(`/production${qs ? '?' + qs : ''}`);
}

/**
 * 获取告警列表
 * GET /api/alarms?level=&status=
 * @param {object} params - 查询参数
 * @param {string} [params.level] - 告警级别
 * @param {string} [params.status] - 告警状态
 * @returns {Promise<Array>} 告警列表
 */
async function getAlarms(params = {}) {
  const query = new URLSearchParams();
  if (params.level && params.level !== 'all') query.set('level', params.level);
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.equipmentId && params.equipmentId !== 'all') query.set('equipmentId', params.equipmentId);
  if (params.limit) query.set('limit', params.limit);
  if (params.page) query.set('page', params.page); /* 【核心补丁】补全遗漏的 page 参数 */
  const qs = query.toString();
  return request(`/alarms${qs ? '?' + qs : ''}`);
}

/**
 * 获取告警统计摘要
 * GET /api/alarms/summary
 * @returns {Promise<object>} 告警统计数据
 */
async function getAlarmSummary() {
  return request('/alarms/summary');
}

/**
 * 确认告警
 * PATCH /api/alarms/:id/confirm
 * @param {number} id - 告警 ID
 * @param {string} handler - 确认人姓名
 * @returns {Promise<object>} 响应结果
 */
async function confirmAlarm(id, handler) {
  return request(`/alarms/${id}/confirm`, {
    method: 'PATCH',
    body: JSON.stringify({ handler: handler || '管理员' })
  });
}

/**
 * 清除告警
 * PATCH /api/alarms/:id/clear
 * @param {number} id - 告警 ID
 * @param {string} handler - 处理人姓名
 * @returns {Promise<object>} 响应结果
 */
async function clearAlarm(id, handler) {
  return request(`/alarms/${id}/clear`, {
    method: 'PATCH',
    body: JSON.stringify({ handler: handler || '管理员' })
  });
}

/**
 * 获取设备完整详情（聚合：基本信息 + 温度 + 产量 + 维修 + 操作日志）
 * GET /api/equipment/:id/detail
 * @param {number} id - 设备 ID
 * @returns {Promise<object>} 设备完整详情
 */
async function getEquipmentFullDetail(id) {
  return request(`/equipment/${id}/detail`);
}

/**
 * 获取人员列表
 * GET /api/personnel
 * @returns {Promise<Array>} 人员列表
 */
async function getPersonnel() {
  return request('/personnel');
}

// 值班人员 API
async function getStaff() {
  return request('/staff');
}
// 添加值班人员
async function addStaff(data) {
  return request('/staff', { method: 'POST', body: data });
}
// 删除值班人员
async function deleteStaff(id) {
  return request('/staff/' + id, { method: 'DELETE' });
}

// 用户管理 API
async function getUsers() {
  return request('/users');
}

// 注册新用户
async function registerUser(data) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

// 删除用户
async function deleteUser(id) {
  return request('/users/' + id, { method: 'DELETE' });
}

/** POST /api/users/change-password - 修改密码 */
async function changePassword(data) {
  return request('/users/change-password', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

// 操作记录 API
async function getOpLog(params = {}) {
  const query = new URLSearchParams();
  if (params.person) query.set('person', params.person);
  const qs = query.toString();
  return request(`/op_log${qs ? '?' + qs : ''}`);
}

// 绩效 API
async function getPerformance() {
  return request('/performance');
}

// 数据源管理 API
async function getDataSources() {
  return request('/data-sources');
}
// 新增数据源
async function addDataSource(data) {
  return request('/data-sources', { method: 'POST', body: JSON.stringify(data) });
}
// 更新数据源
async function updateDataSource(id, data) {
  return request('/data-sources/' + id, { method: 'PUT', body: JSON.stringify(data) });
}
// 删除数据源
async function deleteDataSource(id) {
  return request('/data-sources/' + id, { method: 'DELETE' });
}
// 测试数据源连接
async function testDataSource(id) {
  return request('/data-sources/' + id + '/test', { method: 'POST' });
}

// 告警规则管理 API
async function getAlarmRules(params = {}) {
  const query = new URLSearchParams();
  if (params.equipmentId) query.set('equipmentId', params.equipmentId);
  const qs = query.toString();
  return request('/alarm-rules' + (qs ? '?' + qs : ''));
}
// 新增告警规则
async function addAlarmRule(data) {
  return request('/alarm-rules', { method: 'POST', body: JSON.stringify(data) });
}
// 更新告警规则
async function updateAlarmRule(id, data) {
  return request('/alarm-rules/' + id, { method: 'PUT', body: JSON.stringify(data) });
}
// 删除告警规则
async function deleteAlarmRule(id) {
  return request('/alarm-rules/' + id, { method: 'DELETE' });
}

// 告警统计 API
async function getAlarmStatsByDevice(params = {}) {
  const query = new URLSearchParams();
  if (params.range) query.set('range', params.range);
  const qs = query.toString();
  return request('/alarms/stats/by-device' + (qs ? '?' + qs : ''));
}
// 按级别统计告警
async function getAlarmStatsByLevel() {
  return request('/alarms/stats/by-level');
}
// 按时间统计告警
async function getAlarmStatsByTime(params = {}) {
  const query = new URLSearchParams();
  if (params.range) query.set('range', params.range);
  const qs = query.toString();
  return request('/alarms/stats/by-time' + (qs ? '?' + qs : ''));
}

// 人员管理 API
async function addPersonnel(data) {
  return request('/personnel', { method: 'POST', body: JSON.stringify(data) });
}
// 更新人员
async function updatePersonnel(id, data) {
  return request('/personnel/' + id, { method: 'PUT', body: JSON.stringify(data) });
}
// 删除人员
async function deletePersonnel(id) {
  return request('/personnel/' + id, { method: 'DELETE' });
}

// 看板模板管理 API
async function getBoardTemplates() {
  return request('/board-templates');
}
// 获取模板详情（含组件）
async function getBoardTemplateDetail(id) {
  return request('/board-templates/' + id);
}
// 创建模板
async function createBoardTemplate(data) {
  return request('/board-templates', { method: 'POST', body: JSON.stringify(data) });
}
// 更新模板
async function updateBoardTemplate(id, data) {
  return request('/board-templates/' + id, { method: 'PUT', body: JSON.stringify(data) });
}
// 删除模板
async function deleteBoardTemplate(id) {
  return request('/board-templates/' + id, { method: 'DELETE' });
}
// 添加组件到模板
async function addTemplateComponent(templateId, data) {
  return request('/board-templates/' + templateId + '/components', { method: 'POST', body: JSON.stringify(data) });
}
// 更新模板组件
async function updateTemplateComponent(templateId, compId, data) {
  return request('/board-templates/' + templateId + '/components/' + compId, { method: 'PUT', body: JSON.stringify(data) });
}
// 移除模板组件
async function removeTemplateComponent(templateId, compId) {
  return request('/board-templates/' + templateId + '/components/' + compId, { method: 'DELETE' });
}

// 组件库 API
async function getComponentLibrary() {
  return request('/component-library');
}

// 看板实例管理 API
async function getBoardInstances() {
  return request('/board-instances');
}
async function createBoardInstance(data) {
  return request('/board-instances', { method: 'POST', body: JSON.stringify(data) });
}
async function updateBoardInstance(id, data) {
  return request('/board-instances/' + id, { method: 'PUT', body: JSON.stringify(data) });
}
async function deleteBoardInstance(id) {
  return request('/board-instances/' + id, { method: 'DELETE' });
}
async function publishBoardInstance(id, status) {
  return request('/board-instances/' + id + '/publish', { method: 'POST', body: JSON.stringify({ status }) });
}
async function getBoardRenderData(id) {
  return request('/board-instances/' + id + '/render');
}

// 展示终端管理 API
async function getDisplayTerminals() {
  return request('/display-terminals');
}
async function registerDisplayTerminal(data) {
  return request('/display-terminals', { method: 'POST', body: JSON.stringify(data) });
}
async function updateDisplayTerminal(id, data) {
  return request('/display-terminals/' + id, { method: 'PUT', body: JSON.stringify(data) });
}
async function deleteDisplayTerminal(id) {
  return request('/display-terminals/' + id, { method: 'DELETE' });
}

// 维修记录 API
async function createMaintenanceFromAlarm(data) {
  return request('/maintenance/from-alarm', { method: 'POST', body: JSON.stringify(data) });
}
// 更新维修记录
async function updateMaintenance(id, data) {
  return request('/maintenance/' + id, { method: 'PUT', body: JSON.stringify(data) });
}
// 获取告警关联的维修记录
async function getAlarmMaintenance(alarmId) {
  return request('/maintenance?alarm_id=' + alarmId);
}

/**
 * 获取操作日志
 * GET /api/operations?equipment_id=
 * @param {object} params - 查询参数
 * @param {number} [params.equipment_id] - 设备 ID
 * @returns {Promise<Array>} 操作日志列表
 */
async function getOperations(params = {}) {
  const query = new URLSearchParams();
  if (params.equipment_id) query.set('equipment_id', params.equipment_id);
  const qs = query.toString();
  return request(`/operations${qs ? '?' + qs : ''}`);
}

/**
 * 获取温度数据
 * GET /api/temperature?range=&equipmentId=
 * @param {Object} params - 查询参数
 * @param {string} [params.range] - 时间范围（today/7d/30d），默认 7d
 * @param {number} [params.equipmentId] - 设备ID
 * @returns {Promise<Array>} 温度数据 [{ timestamp, equipmentName, value, upperLimit, lowerLimit }]
 */
async function getTemperature(params = {}) {
  const query = new URLSearchParams();
  // 优先使用 range 参数，若无则尝试兼容旧的 hours 参数
  if (params.range) query.set('range', params.range);
  else if (params.hours) {
    // 旧参数 hours → 映射到 range
    if (params.hours <= 24) query.set('range', 'today');
    else query.set('range', '7d');
  }
  // 默认查询范围为 7 天
  else query.set('range', '7d');
  if (params.equipment_id) query.set('equipmentId', params.equipment_id);
  else if (params.equipmentId) query.set('equipmentId', params.equipmentId);
  const qs = query.toString();
  return request(`/temperature${qs ? '?' + qs : ''}`);
}

/**
 * 获取 OEE 数据
 * GET /api/dashboard/oee
 * @returns {Promise<Object>} { overall: number, devices: [{ name, oee }] }
 */
async function getOEE() {
  return request('/dashboard/oee');
}

/**
 * 获取活跃告警（用于顶部滚动条）
 * GET /api/alarms/active
 * @returns {Promise<Array>} 活跃告警列表
 */
async function getActiveAlarms() {
  return request('/alarms/active');
}

/**
 * 获取维修记录
 * GET /api/maintenance?equipment_id=
 * @param {object} params - 查询参数
 * @param {number} [params.equipment_id] - 设备 ID
 * @returns {Promise<Array>} 维修记录列表
 */
async function getMaintenance(params = {}) {
  const query = new URLSearchParams();
  if (params.equipment_id) query.set('equipment_id', params.equipment_id);
  const qs = query.toString();
  return request(`/maintenance${qs ? '?' + qs : ''}`);
}

/**
 * 获取当前用户的收藏设备ID列表
 * GET /api/favorites
 * @returns {Promise<Array<number>>} 收藏的设备ID数组
 */
async function getFavorites() {
  return request('/favorites');
}

/**
 * 切换设备收藏状态
 * POST /api/favorites/toggle
 * @param {number} equipmentId - 设备ID
 * @returns {Promise<Object>} { favorited: boolean }
 */
async function toggleFavorite(equipmentId) {
  return request('/favorites/toggle', {
    method: 'POST',
    body: JSON.stringify({ equipmentId })
  });
}

// ==========================================
// 全局导出
// ==========================================
if (typeof window !== 'undefined') {
  window.getEquipment = getEquipment;
  window.addEquipment = addEquipment;
  window.deleteEquipment = deleteEquipment;
  window.getStats = getStats;
  window.getEquipmentDetail = getEquipmentDetail;
  window.getEquipmentTemperature = getEquipmentTemperature;
  window.getProduction = getProduction;
  window.getTemperature = getTemperature;
  window.getOEE = getOEE;
  window.getAlarms = getAlarms;
  window.confirmAlarm = confirmAlarm;
  window.clearAlarm = clearAlarm;
  window.getActiveAlarms = getActiveAlarms;
  window.getAlarmSummary = getAlarmSummary;
  window.getEquipmentFullDetail = getEquipmentFullDetail;
  window.getPersonnel = getPersonnel;
  window.getStaff = getStaff;
  window.addStaff = addStaff;
  window.deleteStaff = deleteStaff;
  window.getUsers = getUsers;
  window.registerUser = registerUser;
  window.deleteUser = deleteUser;
  window.changePassword = changePassword;
  window.getOpLog = getOpLog;
  window.getPerformance = getPerformance;
  window.getOperations = getOperations;
  window.getMaintenance = getMaintenance;
  window.getFavorites = getFavorites;
  window.toggleFavorite = toggleFavorite;
  window.getNextEquipmentNo = getNextEquipmentNo;
  window.addEquipment = addEquipment;
}
