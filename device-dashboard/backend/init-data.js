/**
 * init-data.js - 模拟数据初始化模块（约 500 条记录）
 *
 * 插入 12 台设备、8 名人员、50 条告警、90 条产量记录、
 * 200 条温度记录、60 条操作日志、30 条维修记录、4 个默认用户、
 * 值班人员/操作记录/绩效、数据源/告警规则、组件库/看板模板。
 * 幂等执行，事务包裹保证原子性。
 */

const { getDb, closeDb } = require('./database');

function initData() {
  const db = getDb();

  console.log('🚀 开始初始化模拟数据...');

  // 1. 设备信息（12台）
  const equipmentList = [
    { equipmentNo:'EQ-001', name:'数控机床-1', type:'数控机床', model:'CNC-500', manufacturer:'沈阳机床', location:'一车间-A区', installDate:'2024-03-15', status:'online', oee:87.5, currentOutput:156, temperature:42.3, current:15.6, voltage:380, pressure:0.65, tempMin:20, tempMax:50, currentMin:10, currentMax:25, voltageMin:340, voltageMax:420, pressureMin:0.4, pressureMax:0.8, maintenance_cycle:90 },
    { equipmentNo:'EQ-002', name:'数控机床-2', type:'数控机床', model:'CNC-500', manufacturer:'沈阳机床', location:'一车间-A区', installDate:'2024-06-01', status:'online', oee:72.3, currentOutput:98, temperature:38.7, current:12.1, voltage:375, pressure:0.52, tempMin:20, tempMax:50, currentMin:10, currentMax:25, voltageMin:340, voltageMax:420, pressureMin:0.4, pressureMax:0.8, maintenance_cycle:90 },
    { equipmentNo:'EQ-003', name:'注塑机-1', type:'注塑机', model:'Haitian-260', manufacturer:'海天塑机', location:'二车间-B区', installDate:'2023-11-10', status:'warning', oee:0, currentOutput:0, temperature:25.1, current:0.8, voltage:382, pressure:0.05, tempMin:20, tempMax:45, currentMin:5, currentMax:30, voltageMin:340, voltageMax:420, pressureMin:0.5, pressureMax:1.2, maintenance_cycle:60 },
    { equipmentNo:'EQ-004', name:'注塑机-2', type:'注塑机', model:'Haitian-360', manufacturer:'海天塑机', location:'二车间-B区', installDate:'2024-02-20', status:'error', oee:0, currentOutput:0, temperature:78.5, current:32.1, voltage:385, pressure:1.45, tempMin:20, tempMax:45, currentMin:5, currentMax:30, voltageMin:340, voltageMax:420, pressureMin:0.5, pressureMax:1.2, maintenance_cycle:60 },
    { equipmentNo:'EQ-005', name:'焊接机器人-1', type:'焊接机器人', model:'ABB-IRB1600', manufacturer:'ABB', location:'三车间-C区', installDate:'2024-10-20', status:'online', oee:91.2, currentOutput:234, temperature:55.8, current:28.3, voltage:395, pressure:0.72, tempMin:30, tempMax:70, currentMin:20, currentMax:40, voltageMin:360, voltageMax:420, pressureMin:0.5, pressureMax:0.9, maintenance_cycle:120 },
    { equipmentNo:'EQ-006', name:'冲压机-1', type:'冲压机', model:'J23-100', manufacturer:'扬州锻压', location:'三车间-C区', installDate:'2024-08-05', status:'warning', oee:0, currentOutput:0, temperature:22.4, current:0.3, voltage:378, pressure:0, tempMin:15, tempMax:40, currentMin:10, currentMax:35, voltageMin:340, voltageMax:420, pressureMin:0.3, pressureMax:0.7, maintenance_cycle:90 },
    { equipmentNo:'EQ-007', name:'冲压机-2', type:'冲压机', model:'J23-160', manufacturer:'扬州锻压', location:'三车间-C区', installDate:'2024-09-12', status:'error', oee:0, currentOutput:0, temperature:15.2, current:0.1, voltage:0, pressure:0, tempMin:15, tempMax:40, currentMin:10, currentMax:35, voltageMin:340, voltageMax:420, pressureMin:0.3, pressureMax:0.7, maintenance_cycle:90 },
    { equipmentNo:'EQ-008', name:'检测仪-1', type:'检测设备', model:'Vision-1000', manufacturer:'基恩士', location:'四车间-D区', installDate:'2025-01-15', status:'warning', oee:0, currentOutput:0, temperature:18.2, current:0.2, voltage:220, pressure:null, tempMin:15, tempMax:30, currentMin:0.1, currentMax:0.5, voltageMin:210, voltageMax:230, pressureMin:null, pressureMax:null, maintenance_cycle:180 },
    { equipmentNo:'EQ-009', name:'AGV-2', type:'AGV', model:'KIVA-M200', manufacturer:'极智嘉', location:'四车间-D区', installDate:'2025-04-20', status:'offline', oee:0, currentOutput:0, temperature:null, current:null, voltage:null, pressure:null, tempMin:20, tempMax:55, currentMin:10, currentMax:35, voltageMin:44, voltageMax:55, pressureMin:null, pressureMax:null, maintenance_cycle:60 },
    { equipmentNo:'EQ-010', name:'AGV-1', type:'AGV', model:'KIVA-M100', manufacturer:'极智嘉', location:'四车间-D区', installDate:'2025-03-01', status:'error', oee:0, currentOutput:0, temperature:62.3, current:45.2, voltage:48, pressure:null, tempMin:20, tempMax:55, currentMin:10, currentMax:35, voltageMin:44, voltageMax:55, pressureMin:null, pressureMax:null, maintenance_cycle:60 },
    { equipmentNo:'EQ-011', name:'检测仪-2', type:'检测设备', model:'Vision-2000', manufacturer:'基恩士', location:'四车间-D区', installDate:'2025-05-10', status:'offline', oee:0, currentOutput:0, temperature:null, current:null, voltage:null, pressure:null, tempMin:15, tempMax:30, currentMin:0.1, currentMax:0.5, voltageMin:210, voltageMax:230, pressureMin:null, pressureMax:null, maintenance_cycle:180 },
    { equipmentNo:'EQ-012', name:'3D打印机-1', type:'增材设备', model:'EOS-M290', manufacturer:'EOS', location:'研发中心-101', installDate:'2025-06-01', status:'offline', oee:0, currentOutput:0, temperature:null, current:null, voltage:null, pressure:null, tempMin:20, tempMax:30, currentMin:5, currentMax:15, voltageMin:220, voltageMax:240, pressureMin:0.1, pressureMax:0.3, maintenance_cycle:90 }
  ];

  // 2. 人员信息（8名）
  const personnelList = [
    { name: '张伟', employee_no: 'EMP-001', role: 'operator', phone: '13800001001', email: 'zhangwei@factory.com' },
    { name: '李强', employee_no: 'EMP-002', role: 'operator', phone: '13800001002', email: 'liqiang@factory.com' },
    { name: '王芳', employee_no: 'EMP-003', role: 'technician', phone: '13800001003', email: 'wangfang@factory.com' },
    { name: '赵磊', employee_no: 'EMP-004', role: 'technician', phone: '13800001004', email: 'zhaolei@factory.com' },
    { name: '陈静', employee_no: 'EMP-005', role: 'manager', phone: '13800001005', email: 'chenjing@factory.com' },
    { name: '刘洋', employee_no: 'EMP-006', role: 'operator', phone: '13800001006', email: 'liuyang@factory.com' },
    { name: '孙婷', employee_no: 'EMP-007', role: 'technician', phone: '13800001007', email: 'sunting@factory.com' },
    { name: '周杰', employee_no: 'EMP-008', role: 'operator', phone: '13800001008', email: 'zhoujie@factory.com' }
  ];

  const statuses = ['online', 'offline', 'warning', 'error'];
  const alarmLevels = ['critical', 'warning', 'info'];
  const alarmTemplates = [
    { title: '温度过高', message: '设备运行温度超过安全阈值，请立即检查冷却系统' },
    { title: '振动异常', message: '设备振动幅度超出正常范围，可能存在机械故障' },
    { title: '气压不足', message: '供气压力低于设定值，影响设备正常运行' },
    { title: '润滑油位低', message: '润滑油位低于警戒线，请及时添加' },
    { title: '刀具磨损', message: '刀具使用时间已超过寿命周期，建议更换' },
    { title: '电机过载', message: '电机电流超过额定值，存在过热风险' },
    { title: '通讯中断', message: '设备与控制中心的通讯连接已断开' },
    { title: '门禁异常', message: '安全门未正常关闭，设备已自动暂停' },
    { title: '参数漂移', message: '关键工艺参数发生偏移，需进行校准' },
    { title: '过滤器堵塞', message: '空气过滤器压差过大，需清洁或更换' }
  ];
  const operationActions = ['启动', '停止', '参数调整', '模式切换', '急停', '复位', '校准', '换刀'];
  const maintenanceTypes = ['repair', 'inspection', 'upgrade'];
  const maintenanceStatuses = ['pending', 'in_progress', 'completed'];
  const roleNames = { operator: '操作员', technician: '技术员', manager: '管理员' };

  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function pick(arr) { return arr[rand(0, arr.length - 1)]; }
  function dateStr(offset) {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toISOString().split('T')[0];
  }
  function dateTimeStr(dayOffset, hourOffset) {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    d.setHours(hourOffset || rand(0, 23), rand(0, 59), rand(0, 59));
    return d.toISOString().replace('T', ' ').split('.')[0];
  }

  // 幂等检查：若已有设备数据则跳过，防止重复插入
  db.get('SELECT COUNT(*) as cnt FROM equipment', (err, row) => {
    if (err) { console.error(err); return; }
    if (row.cnt > 0) {
      console.log('⏭️  数据已存在，跳过初始化');
      return;  // 不关闭数据库，保留连接供API使用
    }

    // 使用事务包裹所有插入操作，保证原子性：要么全部成功，要么全部回滚
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // 插入设备（含重复检查：INSERT OR IGNORE 按 equipmentNo UNIQUE 去重）
      const insertEq = db.prepare(`INSERT OR IGNORE INTO equipment
        (equipmentNo, name, type, model, manufacturer, location, installDate, status,
         oee, currentOutput, temperature, current, voltage, pressure,
         tempMin, tempMax, currentMin, currentMax, voltageMin, voltageMax, pressureMin, pressureMax,
         maintenance_cycle)
        VALUES (?,?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?)`);
      insertEq.on('error', () => {});
      for (const eq of equipmentList) {
        insertEq.run(eq.equipmentNo, eq.name, eq.type, eq.model, eq.manufacturer, eq.location, eq.installDate, eq.status,
          eq.oee, eq.currentOutput, eq.temperature, eq.current, eq.voltage, eq.pressure,
          eq.tempMin, eq.tempMax, eq.currentMin, eq.currentMax, eq.voltageMin, eq.voltageMax, eq.pressureMin, eq.pressureMax,
          eq.maintenance_cycle ?? 90);
      }
      insertEq.finalize();
      console.log(`✅ 插入设备: ${equipmentList.length} 台`);

    // 插入人员
    const insertPerson = db.prepare('INSERT INTO personnel (name, employee_no, role, phone, email) VALUES (?, ?, ?, ?, ?)');
    insertPerson.on('error', () => {});
    for (const p of personnelList) {
      insertPerson.run(p.name, p.employee_no, p.role, p.phone, p.email);
    }
    insertPerson.finalize();
    console.log(`✅ 插入人员: ${personnelList.length} 名`);

    // 插入告警（50条）
    const insertAlarm = db.prepare('INSERT INTO alarms (equipment_id, level, title, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    insertAlarm.on('error', () => {});
    for (let i = 0; i < 50; i++) {
      const eqId = rand(1, 12);
      const template = pick(alarmTemplates);
      const level = pick(alarmLevels);
      const status = i < 20 ? 'active' : (i < 35 ? 'confirmed' : 'cleared');
      const createdAt = dateTimeStr(rand(0, 14), rand(0, 23));
      insertAlarm.run(eqId, level, template.title, template.message, status, createdAt);
    }
    insertAlarm.finalize();
    console.log('✅ 插入告警: 50 条');

    // 插入产量记录（90条：近30天，每天随机设备产生）
    const insertProd = db.prepare('INSERT INTO production (equipment_id, output_count, reject_count, cycle_time, record_date) VALUES (?, ?, ?, ?, ?)');
    insertProd.on('error', () => {});
    for (let i = 0; i < 90; i++) {
      const eqId = rand(1, 12);
      const outputCount = rand(100, 500);
      const rejectCount = rand(0, Math.floor(outputCount * 0.05));
      const cycleTime = parseFloat((rand(10, 120) / 10).toFixed(1));
      const recordDate = dateStr(rand(0, 29));
      insertProd.run(eqId, outputCount, rejectCount, cycleTime, recordDate);
    }
    insertProd.finalize();
    console.log('✅ 插入产量记录: 90 条');

    // 插入温度记录（200条）
    const insertTemp = db.prepare('INSERT INTO temperature (equipment_id, temp_value, record_time) VALUES (?, ?, ?)');
    insertTemp.on('error', () => {});
    for (let i = 0; i < 200; i++) {
      const eqId = rand(1, 12);
      const tempValue = parseFloat((rand(200, 850) / 10).toFixed(1));
      const recordTime = dateTimeStr(rand(0, 7), rand(0, 23));
      insertTemp.run(eqId, tempValue, recordTime);
    }
    insertTemp.finalize();
    console.log('✅ 插入温度记录: 200 条');

    // 插入操作日志（60条）
    const insertOp = db.prepare('INSERT INTO operations (equipment_id, operator_id, action, detail, result, record_time) VALUES (?, ?, ?, ?, ?, ?)');
    insertOp.on('error', () => {});
    for (let i = 0; i < 60; i++) {
      const eqId = rand(1, 12);
      const opId = rand(1, 8);
      const action = pick(operationActions);
      const detail = `${action}操作 - ${equipmentList[eqId - 1].name}`;
      const result = pick(['成功', '成功', '成功', '成功', '失败']);
      const recordTime = dateTimeStr(rand(0, 14), rand(0, 23));
      insertOp.run(eqId, opId, action, detail, result, recordTime);
    }
    insertOp.finalize();
    console.log('✅ 插入操作日志: 60 条');

    // 插入维修记录（30条）
    const insertMaint = db.prepare('INSERT INTO maintenance (equipment_id, technician_id, type, description, cost, start_time, end_time, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    insertMaint.on('error', () => {});
    for (let i = 0; i < 30; i++) {
      const eqId = rand(1, 12);
      const techId = rand(1, 8);
      const type = pick(maintenanceTypes);
      const desc = pick(['定期检查', '更换磨损部件', '软件升级', '机械校准', '电气检修', '润滑保养']);
      const cost = parseFloat((rand(10, 200) * 10).toFixed(2));
      const startDayOffset = rand(1, 60);
      const startDate = dateTimeStr(startDayOffset, rand(8, 10));
      const hours = rand(1, 8);
      const endDayOffset = rand(1, startDayOffset); // 确保 ≤ startDayOffset，即 end ≥ start
      const endDate = dateTimeStr(endDayOffset, rand(10, 18));
      const status = i < 10 ? 'completed' : (i < 22 ? 'in_progress' : 'pending');
      insertMaint.run(eqId, techId, type, desc, cost, startDate, endDate, status);
    }
    insertMaint.finalize();
    console.log('✅ 插入维修记录: 30 条');

    // 插入初始用户（4个默认账号，对应4种角色）
    const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password, name, roles) VALUES (?, ?, ?, ?)');
    insertUser.on('error', () => {});
    const defaultUsers = [
      ['admin', '123456', '系统管理员', 'dashboard_admin,workshop_supervisor'],
      ['supervisor', '123456', '张主管', 'workshop_supervisor'],
      ['maintainer', '123456', '王维修', 'maintenance_tech'],
      ['viewer', '123456', '李员工', 'viewer']
    ];
    defaultUsers.forEach(u => insertUser.run(u[0], u[1], u[2], u[3]));
    insertUser.finalize();
    console.log('✅ 插入用户: 4 个默认账号（多角色支持）');

    // 值班人员
    const staffList = [
      { name:'张伟', position:'车间主管', shift:'白班 08:00-20:00', phone:'13800001001' },
      { name:'李娜', position:'设备工程师', shift:'白班 08:00-20:00', phone:'13800001002' },
      { name:'王强', position:'操作员', shift:'白班 08:00-20:00', phone:'13800001003' },
      { name:'刘洋', position:'操作员', shift:'夜班 20:00-08:00', phone:'13800001004' },
      { name:'陈敏', position:'操作员', shift:'白班 08:00-20:00', phone:'13800001005' },
      { name:'杨磊', position:'设备工程师', shift:'夜班 20:00-08:00', phone:'13800001006' },
      { name:'赵静', position:'操作员', shift:'白班 08:00-20:00', phone:'13800001007' },
      { name:'黄海', position:'操作员', shift:'夜班 20:00-08:00', phone:'13800001008' }
    ];
    const insertStaff = db.prepare('INSERT OR IGNORE INTO staff (name,position,shift,phone) VALUES (?,?,?,?)');
    insertStaff.on('error', () => {});
    staffList.forEach(s => insertStaff.run(s.name, s.position, s.shift, s.phone));
    insertStaff.finalize();
    console.log('✅ 插入值班人员: 8 名');

    // 操作记录
    const opLogList = [
      { time:'2026-06-19 08:30', person:'张伟', action:'登录系统', device:'--', result:'成功' },
      { time:'2026-06-19 09:00', person:'李娜', action:'巡检', device:'数控机床-1', result:'正常' },
      { time:'2026-06-19 09:30', person:'王强', action:'开机', device:'注塑机-1', result:'成功' },
      { time:'2026-06-19 10:15', person:'刘洋', action:'报工', device:'冲压机-1', result:'完成' },
      { time:'2026-06-19 10:45', person:'陈敏', action:'质检', device:'焊接机器人-1', result:'合格' },
      { time:'2026-06-19 11:20', person:'杨磊', action:'维修', device:'注塑机-2', result:'完成' },
      { time:'2026-06-19 13:00', person:'赵静', action:'开机', device:'数控机床-2', result:'成功' },
      { time:'2026-06-19 14:30', person:'黄海', action:'巡检', device:'AGV-1', result:'异常' },
      { time:'2026-06-19 15:00', person:'张伟', action:'审批', device:'--', result:'通过' },
      { time:'2026-06-19 16:00', person:'李娜', action:'调试', device:'焊接机器人-1', result:'完成' },
      { time:'2026-06-19 16:30', person:'王强', action:'报工', device:'注塑机-1', result:'完成' },
      { time:'2026-06-19 17:00', person:'陈敏', action:'质检', device:'数控机床-1', result:'合格' }
    ];
    const insertOpLog = db.prepare('INSERT OR IGNORE INTO op_log (time,person,action,device,result) VALUES (?,?,?,?,?)');
    insertOpLog.on('error', () => {});
    opLogList.forEach(o => insertOpLog.run(o.time, o.person, o.action, o.device, o.result));
    insertOpLog.finalize();
    console.log('✅ 插入操作记录: 12 条');

    // 绩效数据
    const perfList = [
      { name:'王强', month:'2026-06', output:2850 },
      { name:'刘洋', month:'2026-06', output:3120 },
      { name:'陈敏', month:'2026-06', output:2780 },
      { name:'赵静', month:'2026-06', output:2950 },
      { name:'黄海', month:'2026-06', output:2600 }
    ];
    const insertPerf = db.prepare('INSERT OR IGNORE INTO performance (name,month,output) VALUES (?,?,?)');
    insertPerf.on('error', () => {});
    perfList.forEach(p => insertPerf.run(p.name, p.month, p.output));
    insertPerf.finalize();
    console.log('✅ 插入绩效数据: 5 条');

    // 数据源示例
    const dataSourceList = [
      { name:'天气监测API', type:'api', endpoint:'https://api.weather.com/v1/plant', api_key:'sk-weather-demo', headers:'{"Content-Type":"application/json"}', refresh_interval:300, description:'车间外部天气数据接口' },
      { name:'MES生产数据', type:'api', endpoint:'https://mes-api.factory.local/production', api_key:'sk-mes-demo-key', headers:'{"Authorization":"Bearer demo"}', refresh_interval:60, description:'MES系统生产计划与实绩数据' },
      { name:'能源监控系统', type:'api', endpoint:'https://energy-api.factory.local/power', api_key:'', headers:'{}', refresh_interval:120, description:'车间能耗数据接口' }
    ];
    const insertDs = db.prepare('INSERT OR IGNORE INTO data_sources (name,type,endpoint,api_key,headers,refresh_interval,description) VALUES (?,?,?,?,?,?,?)');
    insertDs.on('error', () => {});
    dataSourceList.forEach(d => insertDs.run(d.name, d.type, d.endpoint, d.api_key, d.headers, d.refresh_interval, d.description));
    insertDs.finalize();
    console.log('✅ 插入数据源: 3 个');

    // 告警规则示例
    const alarmRuleList = [
      { equipment_id:1, param_name:'temperature', param_label:'温度', min_value:20, max_value:50, enabled:1, notify_level:'warning' },
      { equipment_id:1, param_name:'current', param_label:'电流', min_value:10, max_value:25, enabled:1, notify_level:'warning' },
      { equipment_id:1, param_name:'voltage', param_label:'电压', min_value:340, max_value:420, enabled:1, notify_level:'info' },
      { equipment_id:1, param_name:'pressure', param_label:'压力', min_value:0.4, max_value:0.8, enabled:1, notify_level:'warning' },
      { equipment_id:4, param_name:'temperature', param_label:'温度', min_value:20, max_value:45, enabled:1, notify_level:'critical' },
      { equipment_id:4, param_name:'current', param_label:'电流', min_value:5, max_value:30, enabled:1, notify_level:'critical' },
      { equipment_id:5, param_name:'temperature', param_label:'温度', min_value:30, max_value:70, enabled:1, notify_level:'warning' },
      { equipment_id:5, param_name:'pressure', param_label:'压力', min_value:0.5, max_value:0.9, enabled:1, notify_level:'warning' },
      { equipment_id:7, param_name:'voltage', param_label:'电压', min_value:340, max_value:420, enabled:1, notify_level:'critical' },
      { equipment_id:10, param_name:'temperature', param_label:'温度', min_value:20, max_value:55, enabled:1, notify_level:'critical' }
    ];
    const insertRule = db.prepare('INSERT OR IGNORE INTO alarm_rules (equipment_id, param_name, param_label, min_value, max_value, enabled, notify_level) VALUES (?,?,?,?,?,?,?)');
    insertRule.on('error', () => {});
    alarmRuleList.forEach(r => insertRule.run(r.equipment_id, r.param_name, r.param_label, r.min_value, r.max_value, r.enabled, r.notify_level));
    insertRule.finalize();
    console.log('✅ 插入告警规则: ' + alarmRuleList.length + ' 条');

    // 组件库示例（5种预定义组件）
    const componentList = [
      { name:'数据卡片', type:'data_card', icon:'fa-solid fa-chart-simple', default_config:'{"title":"统计指标","dataSource":"stats","refreshInterval":10}', description:'显示单个KPI数值，支持自定义标题和数据源' },
      { name:'实时表格', type:'real_table', icon:'fa-solid fa-table', default_config:'{"title":"设备列表","dataSource":"equipment","pageSize":5,"refreshInterval":10}', description:'实时设备数据表格，支持分页显示' },
      { name:'趋势图', type:'trend_chart', icon:'fa-solid fa-chart-line', default_config:'{"title":"产量趋势","chartType":"line","dataSource":"production","range":"7d"}', description:'折线图/柱状图展示历史趋势数据' },
      { name:'报警列表', type:'alarm_list', icon:'fa-solid fa-bell', default_config:'{"title":"最新告警","dataSource":"alarms","maxItems":5,"refreshInterval":30}', description:'实时告警信息列表，支持级别颜色区分' },
      { name:'进度条', type:'progress_bar', icon:'fa-solid fa-gauge-high', default_config:'{"title":"OEE完成率","dataSource":"oee","maxValue":100}', description:'进度条展示完成率、利用率等百分比数据' }
    ];
    const insertComp = db.prepare('INSERT OR IGNORE INTO component_library (name, type, icon, default_config, description) VALUES (?,?,?,?,?)');
    insertComp.on('error', () => {});
    componentList.forEach(c => insertComp.run(c.name, c.type, c.icon, c.default_config, c.description));
    insertComp.finalize();
    console.log('✅ 插入组件库: ' + componentList.length + ' 个组件');

    // 看板模板示例
    const templateList = [
      { name:'生产总览看板', description:'展示生产核心KPI和设备状态', layout_type:'mixed', config:'{"header":{"showTitle":true,"showTime":true},"theme":"dark"}', status:'published' },
      { name:'设备监控看板', description:'聚焦设备运行状态和告警', layout_type:'double', config:'{"header":{"showTitle":true,"showTime":true},"theme":"dark"}', status:'published' },
      { name:'产量分析看板', description:'产量数据分析和趋势展示', layout_type:'single', config:'{"header":{"showTitle":true,"showTime":false},"theme":"dark"}', status:'draft' }
    ];
    const insertTpl = db.prepare('INSERT OR IGNORE INTO board_templates (name, description, layout_type, config, status) VALUES (?,?,?,?,?)');
    insertTpl.on('error', () => {});
    templateList.forEach(t => insertTpl.run(t.name, t.description, t.layout_type, t.config, t.status));
    insertTpl.finalize();
    console.log('✅ 插入看板模板: ' + templateList.length + ' 个');

    db.run('COMMIT');
    console.log('🎉 所有模拟数据初始化完成!');
  }); // end db.serialize
  });
}

// 直接运行则执行初始化
if (require.main === module) {
  initData();
}

module.exports = { initData };
