# device-dashboard

学校实训项目测试

## 智能工厂设备监控看板系统 - 设计说明文档

## 一、项目概述
系统简介：本系统是一个面向制造车间的设备监控看板，提供设备实时状态监控、生产数据可视化、告警管理和设备详情查询等功能。采用 B/S 架构，通过浏览器即可访问，无需安装客户端。后端基于 Node.js + Express 提供 RESTful API，前端使用原生 HTML + CSS + JavaScript（ES6+）实现，图表基于 ECharts 5.x，数据库使用 SQLite3 嵌入式存储。

### 小组成员：
| 姓名 | 学号 |
| --- | --- |
| 田所浩二 | 114514 |
| 张三 | 1919810 |

### 分工说明：
| 成员 | 负责模块 | 贡献比例 |
| --- | --- | --- |
| 田所浩二 | 模块1 | 114% |
| 张三 | 模块2 | 514% |

### 核心数据：
- 后端文件：6 个（server.js, database.js, init-data.js, migrate-equipment.js, package.json）
- 前端页面：6 个 HTML（login, index, detail, alarms, personnel, settings）
- CSS 文件：4 个（base, layout, components, responsive）
- JS 文件：5 个（api, app, utils, charts, dashboard），导出 71 个全局函数
- API 总数：22 个 RESTful 端点
- 数据库表：12 张
- 模拟数据：480 条记录
- SVG 图标：10 个

## 二、项目结构
```
device-dashboard/
│
├── backend/                          后端服务（6 文件）
│   ├── package.json                  express, sqlite3, cors
│   ├── server.js                     22 个 API + 静态文件托管
│   ├── database.js                   12 张表建表语句
│   ├── init-data.js                  模拟数据初始化（480 条记录）
│   ├── migrate-equipment.js          精确设备数据迁移
│   └── data.db                       SQLite 数据库（自动生成）
│
├── frontend/                         前端应用
│   ├── index.html                    CoreUI 风格首页看板
│   ├── login.html                    登录/注册（4 角色动画）
│   ├── pages/
│   │   ├── alarms.html               告警管理（筛选 + 分页 + CSV 导出）
│   │   ├── detail.html               设备详情（参数 + 趋势 + 维修）
│   │   ├── personnel.html            人员管理（卡片 + 日志 + 绩效图）
│   │   └── settings.html             系统设置（7 个配置模块）
│   ├── css/
│   │   ├── base.css                  CSS 变量 + 暗色/亮色主题 + Reset
│   │   ├── layout.css                布局（侧边栏 + Grid + 响应式）
│   │   ├── components.css            组件样式（卡片/按钮/表格/徽章）
│   │   └── responsive.css            三端响应式（PC / 平板 / 手机）
│   ├── js/
│   │   ├── utils.js                  16 个工具函数（防抖/日期/CSV导出）
│   │   ├── api.js                    20 个 API 封装（fetch + 统一拦截）
│   │   ├── charts.js                 ECharts 图表（产量/OEE/温度）
│   │   ├── dashboard.js              首页逻辑（KPI/设备/搜索/自动刷新）
│   │   └── app.js                    入口（侧边栏/主题/快捷键/登录守卫）
│   └── assets/icons/                 10 个 SVG 图标
│
├── 设计说明文档.html                 本文档（HTML 版）
├── 设计说明文档.txt                  本文档（纯文本版）
└── 部署说明.txt                      部署手册
```

## 三、设计思路
### 整体架构：
1. 前端（原生 HTML+CSS+JS + ECharts）→ HTTP → 后端（Node.js + Express）→ SQLite3
- 单服务托管模式：Express 通过 express.static 统一托管前端静态文件
- 所有 API 统一返回格式：`{ code, data, message }`
- 前端不依赖构建工具，直接运行

2. 响应式策略：三断点设计
- PC（≥1024px）：240px 侧边栏展开，4 列网格，完整功能
- 平板（768-1023px）：侧边栏折叠为抽屉菜单，汉堡菜单，2 列网格
- 手机（≤767px）：底部 Tab 栏替代侧边栏，单列布局，44px 触控热区

3. 技术选型理由：
- 原生三件套：零构建步骤，直接运行，适合教学演示
- ECharts 5.x：功能丰富，深色/浅色自适应，CDN 加载
- SQLite3：零配置嵌入式数据库，文件级存储，适合中小型应用
- Express：最流行的 Node.js 框架，中间件生态完善

4. UI 风格：参考 CoreUI Admin 模板
- 侧边栏 `1a1e2e` 深色背景，激活项紫色 `6C3FF5` 左边框
- 卡片 8px 圆角 + 微阴影
- Font Awesome 6 图标库
- 暗色/亮色双主题通过 CSS 变量切换

## 四、数据库设计
共 12 张表：

1.  equipment（设备信息表）
    `id, name, code, type, status, oee, currentOutput`, 4 个阈值字段

2.  runtime（运行记录表）
    `id, equipment_id(FK), status, start_time, end_time, duration, record_time`

3.  production（产量记录表）
    `id, equipment_id(FK), output_count, reject_count, record_date`

4.  alarms（告警记录表）
    `id, equipment_id(FK), level(critical/warning/info), title, message, status(active/confirmed/cleared)`

5.  temperature（温度采集记录表）
    `id, equipment_id(FK), temp_value, record_time`

6.  personnel（人员信息表）
    `id, name, employee_no(UNIQUE), role, phone`

7.  operations（操作日志表）
    `id, equipment_id(FK), operator_id(FK), action, result`

8.  maintenance（维修记录表）
    `id, equipment_id(FK), technician_id(FK), type, description, cost, start_time, end_time, status`

9.  users（用户认证表）
    `id, username(UNIQUE), password, name, role, roleText`

10. staff（值班人员表）
    `id, name, position, shift, phone`

11. op_log（操作记录表）
    `id, time, person, action, device, result`

12. performance（绩效数据表）
    `id, name, month, output`

## 五、API 接口清单
共 22 个 RESTful API：

### 1. 认证模块：
| 请求方法 | 请求路径 | 接口描述 | 备注 |
| --- | --- | --- | --- |
| POST | /api/auth/login | 用户登录 | \ |
| POST | /api/auth/register | 用户注册 | 含重名校验 |

### 2. 设备模块：
| 请求方法 | 请求路径 | 接口描述 | 备注 |
| --- | --- | --- | --- |
| GET | /api/equipment | 设备列表 | 支持 status/type/keyword 筛选 |
| GET | /api/equipment/:id | 设备详情 | 含实时参数 + 维修历史 |
| GET | /api/equipment/:id/temperature | 设备温度历史 | \ |
| GET | /api/equipment/:id/detail | 设备完整聚合详情 | \ |

### 3. 仪表盘模块：
| 请求方法 | 请求路径 | 接口描述 | 备注 |
| --- | --- | --- | --- |
| GET | /api/dashboard/stats |  KPI 统计 | 8 个指标 |
| GET | /api/dashboard/oee | OEE 数据 | 整体 + 各设备 |
| GET | /api/production | 产量数据 | range=today/7d/30d |
| GET | /api/temperature | 温度数据 | range=today/7d/30d |

### 4. 告警模块：
| 请求方法 | 请求路径 | 接口描述 | 备注 |
| --- | --- | --- | --- |
| GET | `/api/alarms` | 告警列表 | 分页 + 筛选 + 统计摘要 |
| GET | `/api/alarms/summary` | 告警统计摘要 |  |
| GET | `/api/alarms/active` | 活跃告警 | 用于首页滚动条 |
| PATCH | `/api/alarms/:id/confirm` | 确认告警 | 仅限 active 状态 |
| PATCH | `/api/alarms/:id/clear` | 清除告警 | 仅限 confirmed 状态 |

### 5. 人员与组织：
| 请求方法 | 请求路径 | 接口描述 | 备注 |
| --- | --- | --- | --- |
| GET | `/api/users` | 用户列表 | 用于设置页面 |
| GET | `/api/personnel` | 人员列表 | 名字和上面查重率极高 |
| GET | `/api/staff` | 值班人员列表 |  |
| GET | `/api/performance` | 绩效排名 | 按产量降序 |

### 6. 日志与历史记录：
| 请求方法 | 请求路径 | 接口描述 | 备注 |
| --- | --- | --- | --- |
| GET | `/api/op_log` | 操作记录 | 按人员筛选 |
| GET | `/api/operations` | 操作日志 | 按设备筛选（名字和上面亲如兄弟） |
| GET | `/api/maintenance` | 维修记录 | 按设备筛选 |

## 六、模拟数据
- 12 台设备（数控机床、焊接机器人、注塑机、冲压机、AGV、检测仪、3D 打印机）
- 8 名人员（操作员、技术员、管理员）
- 50 条告警记录（20 active + 15 confirmed + 15 cleared）
- 90 条产量记录（近 30 天）
- 200 条温度采集记录（近 7 天）
- 60 条操作日志
- 30 条维修记录（近 60 天）
- 3 个默认用户（admin/engineer/operator，密码 123456）
- 8 名值班人员（含白班/夜班）
- 12 条操作记录（用于首页）
- 5 条绩效数据
- 共计 480 条记录

## 七、功能实现说明
1.  设备总览模块（index.html）
    - KPI 卡片：8 张（设备总数/运行中/待机/故障/离线/今日产量/平均稼动率/未处理告警）
    - 搜索筛选：300ms 防抖 + 清除按钮 + 搜索结果条
    - 设备卡片网格：4 列（PC）/2 列（平板）/1 列（手机），hover 紫色边框
    - 视图切换：卡片↔列表（localStorage 持久化）

2.  数据可视化模块（ECharts）
    - 产量折线图：计划/实际/良品 3 条曲线
    - OEE 环形图：双环设计
    - 温度曲线图：多设备 + 阈值标注
    - 时间范围切换：今日/7天/30天联动刷新

3.  告警管理模块（alarms.html）
    - 告警统计摘要 + 级别/状态/设备三栏筛选 + 分页
    - 确认/清除操作（状态流转校验）
    - 告警滚动条（首页）
    - CSV 导出（BOM 编码）
    - 紧急告警弹窗（localStorage 去重）

4.  设备详情模块（detail.html）
    - 设备信息头部 + 4 个实时参数（温度/电流/电压/压力）+ 阈值指示条
    - 温度趋势图（ECharts 面积图）+ 维修历史表格

5.  人员管理模块（personnel.html）
    - 值班人员卡片网格 + 职位徽章
    - 操作记录表格（按人筛选）+ 绩效柱状图

6.  系统设置模块（settings.html）
    - 7 个配置：主题/刷新间隔/时间范围/视图/通知/用户/保存恢复
    - Toast 动画提示

7.  用户认证模块（login.html）
    - 登录/注册 Tab 切换
    - 登录守卫（自动跳转）

8.  已实现的功能扩展
    - ✅ 暗色/亮色主题切换（localStorage 持久化）
    - ✅ KPI 数字滚动动画（easeOutCubic 缓动）
    - ✅ 告警滚动条（悬停暂停）
    - ✅ 浏览器标签页闪烁（新告警提醒）
    - ✅ 数据自动刷新（10s + visibilitychange）
    - ✅ 键盘快捷键（Ctrl+K 搜索 / ESC 取消 / R 刷新）
    - ✅ 导出 CSV（中文 BOM）
    - ✅ 全屏模式
    - ✅ 底部 Tab 栏（手机端）
    - ✅ 侧边栏遮罩层（平板/手机端）

## 八、遇到的问题与解决方案
问题1：SQLite 异步建表与数据初始化竞态
解决方案：通过 Promise + `db.serialize()` 确保建表完成后再插入数据，导出 `waitForDb()` 返回 Promise 确保表结构就绪。

问题2：前端 ES Module 与全局 Script 的兼容
解决方案：每个模块同时支持 export 和 `window.xxx` 全局导出，共导出 71 个全局函数。

问题3：SQLite 外键约束导致确认告警操作失败
解决方案：确认告警时不更新 `confirmed_by`（INTEGER FK），仅更新 `confirmed_at` 时间戳，handler 在响应中返回。

问题4：侧边栏重构导致样式污染
解决方案：统一删除 index.html 中的内联样式（约450行），全部迁移到外部 CSS 文件，统一类名命名。

问题5：亮色主题下文字对比度不足
解决方案：加深 `--text-secondary` 和 `--text-muted` 变量，设备名称和 KPI 标签改用 `var(--text-primary)`。

问题6：常量声明导致的服务器崩溃
解决方案：`const summarySql` 改为 `let`，修复告警级别筛选映射。

## 九、使用说明
环境要求：   
Node.js 14+，现代浏览器

安装步骤：
```shell
cd backend
npm install
```

启动命令：
```shell
npm start
```

初始化精确设备数据（可选）：
```shell
cd backend && node migrate-equipment.js
```

访问地址：
- 登录页：
```
http://localhost:3000/login.html
```
- 首页：
```
http://localhost:3000/index.html
```
- 告警：
```
http://localhost:3000/pages/alarms.html
```
- 详情：
```
http://localhost:3000/pages/detail.html?id=1
```
- 人员：
```
http://localhost:3000/pages/personnel.html
```
- 设置：
```
http://localhost:3000/pages/settings.html
```

默认账号：
主管账号有权注销自己账号，删除他人账号和添加他人账号
- `admin`    / `123456`  车间主管
- `engineer` / `123456`  设备工程师
- `operator` / `123456`  产线操作员

## 十、总结与反思
（小组成员撰写项目收获与改进方向）
