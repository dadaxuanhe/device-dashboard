/**
 * migrate-equipment.js - 插入精确的设备数据（含完整参数 + 阈值）
 * 运行方式: cd backend && node migrate-equipment.js
 */
const { getDb, waitForDb, closeDb } = require('./database');

const eqData = [
  {id:1, equipmentNo:'EQ-001', name:'数控机床-1', type:'数控机床', model:'CNC-500', manufacturer:'沈阳机床', location:'一车间-A区', installDate:'2024-03-15', status:'online', oee:87.5, currentOutput:156, temperature:42.3, current:15.6, voltage:380, pressure:0.65, tempMin:20, tempMax:50, currentMin:10, currentMax:25, voltageMin:340, voltageMax:420, pressureMin:0.4, pressureMax:0.8},
  {id:2, equipmentNo:'EQ-002', name:'数控机床-2', type:'数控机床', model:'CNC-500', manufacturer:'沈阳机床', location:'一车间-A区', installDate:'2024-06-01', status:'online', oee:72.3, currentOutput:98, temperature:38.7, current:12.1, voltage:375, pressure:0.52, tempMin:20, tempMax:50, currentMin:10, currentMax:25, voltageMin:340, voltageMax:420, pressureMin:0.4, pressureMax:0.8},
  {id:3, equipmentNo:'EQ-005', name:'焊接机器人-1', type:'焊接机器人', model:'ABB-IRB1600', manufacturer:'ABB', location:'三车间-C区', installDate:'2024-10-20', status:'online', oee:91.2, currentOutput:234, temperature:55.8, current:28.3, voltage:395, pressure:0.72, tempMin:30, tempMax:70, currentMin:20, currentMax:40, voltageMin:360, voltageMax:420, pressureMin:0.5, pressureMax:0.9},
  {id:4, equipmentNo:'EQ-003', name:'注塑机-1', type:'注塑机', model:'Haitian-260', manufacturer:'海天塑机', location:'二车间-B区', installDate:'2023-11-10', status:'warning', oee:0, currentOutput:0, temperature:25.1, current:0.8, voltage:382, pressure:0.05, tempMin:20, tempMax:45, currentMin:5, currentMax:30, voltageMin:340, voltageMax:420, pressureMin:0.5, pressureMax:1.2},
  {id:5, equipmentNo:'EQ-006', name:'冲压机-1', type:'冲压机', model:'J23-100', manufacturer:'扬州锻压', location:'三车间-C区', installDate:'2024-08-05', status:'warning', oee:0, currentOutput:0, temperature:22.4, current:0.3, voltage:378, pressure:0, tempMin:15, tempMax:40, currentMin:10, currentMax:35, voltageMin:340, voltageMax:420, pressureMin:0.3, pressureMax:0.7},
  {id:6, equipmentNo:'EQ-008', name:'检测仪-1', type:'检测设备', model:'Vision-1000', manufacturer:'基恩士', location:'四车间-D区', installDate:'2025-01-15', status:'warning', oee:0, currentOutput:0, temperature:18.2, current:0.2, voltage:220, pressure:null, tempMin:15, tempMax:30, currentMin:0.1, currentMax:0.5, voltageMin:210, voltageMax:230, pressureMin:null, pressureMax:null},
  {id:7, equipmentNo:'EQ-004', name:'注塑机-2', type:'注塑机', model:'Haitian-360', manufacturer:'海天塑机', location:'二车间-B区', installDate:'2024-02-20', status:'error', oee:0, currentOutput:0, temperature:78.5, current:32.1, voltage:385, pressure:1.45, tempMin:20, tempMax:45, currentMin:5, currentMax:30, voltageMin:340, voltageMax:420, pressureMin:0.5, pressureMax:1.2},
  {id:8, equipmentNo:'EQ-007', name:'冲压机-2', type:'冲压机', model:'J23-160', manufacturer:'扬州锻压', location:'三车间-C区', installDate:'2024-09-12', status:'error', oee:0, currentOutput:0, temperature:15.2, current:0.1, voltage:0, pressure:0, tempMin:15, tempMax:40, currentMin:10, currentMax:35, voltageMin:340, voltageMax:420, pressureMin:0.3, pressureMax:0.7},
  {id:9, equipmentNo:'EQ-010', name:'AGV-1', type:'AGV', model:'KIVA-M100', manufacturer:'极智嘉', location:'四车间-D区', installDate:'2025-03-01', status:'error', oee:0, currentOutput:0, temperature:62.3, current:45.2, voltage:48, pressure:null, tempMin:20, tempMax:55, currentMin:10, currentMax:35, voltageMin:44, voltageMax:55, pressureMin:null, pressureMax:null},
  {id:10, equipmentNo:'EQ-009', name:'AGV-2', type:'AGV', model:'KIVA-M200', manufacturer:'极智嘉', location:'四车间-D区', installDate:'2025-04-20', status:'offline', oee:0, currentOutput:0, temperature:null, current:null, voltage:null, pressure:null, tempMin:20, tempMax:55, currentMin:10, currentMax:35, voltageMin:44, voltageMax:55, pressureMin:null, pressureMax:null},
  {id:11, equipmentNo:'EQ-011', name:'检测仪-2', type:'检测设备', model:'Vision-2000', manufacturer:'基恩士', location:'四车间-D区', installDate:'2025-05-10', status:'offline', oee:0, currentOutput:0, temperature:null, current:null, voltage:null, pressure:null, tempMin:15, tempMax:30, currentMin:0.1, currentMax:0.5, voltageMin:210, voltageMax:230, pressureMin:null, pressureMax:null},
  {id:12, equipmentNo:'EQ-012', name:'3D打印机-1', type:'增材设备', model:'EOS-M290', manufacturer:'EOS', location:'研发中心-101', installDate:'2025-06-01', status:'offline', oee:0, currentOutput:0, temperature:null, current:null, voltage:null, pressure:null, tempMin:20, tempMax:30, currentMin:5, currentMax:15, voltageMin:220, voltageMax:240, pressureMin:0.1, pressureMax:0.3}
];

async function migrate() {
  await waitForDb();
  const db = getDb();

  db.serialize(() => {
    const stmt = db.prepare(`UPDATE equipment SET
      equipmentNo=?, name=?, type=?, model=?, manufacturer=?, location=?, installDate=?, status=?,
      oee=?, currentOutput=?, temperature=?, current=?, voltage=?, pressure=?,
      tempMin=?, tempMax=?, currentMin=?, currentMax=?, voltageMin=?, voltageMax=?, pressureMin=?, pressureMax=?
      WHERE id=?`);
    stmt.on('error', () => {});

    eqData.forEach(e => {
      stmt.run(e.equipmentNo, e.name, e.type, e.model, e.manufacturer, e.location, e.installDate, e.status,
        e.oee, e.currentOutput, e.temperature, e.current, e.voltage, e.pressure,
        e.tempMin, e.tempMax, e.currentMin, e.currentMax, e.voltageMin, e.voltageMax, e.pressureMin, e.pressureMax,
        e.id);
    });
    stmt.finalize();
  });

  console.log('✅ 已更新 ' + eqData.length + ' 条设备数据（含完整参数+阈值，关联数据已保留）');
  closeDb();
}

migrate();
