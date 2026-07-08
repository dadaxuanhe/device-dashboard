# device-dashboard

智能工厂设备监控看板系统 · 学校实训项目

## 一、项目概述

本系统是一个面向制造车间的设备监控看板，提供设备实时状态监控、生产数据可视化、告警管理和设备详情查询等功能。采用 B/S 架构，后端基于 **Node.js + Express** 提供 RESTful API，前端使用 **原生 HTML + CSS + JavaScript（ES6+）** 实现，图表基于 **ECharts 5.x**，数据库使用 **SQLite3** 嵌入式存储。

### 核心数据
- 后端文件：8 个（server.js, database.js, init-data.js, migrate-equipment.js, alarm-engine.js, sse.js, package.json）
- 前端页面：9 个 HTML（login, index, display, detail, alarms, personnel, settings, templates, publish）
- CSS 文件：4 个（base, layout, components, responsive）
- JS 文件：6 个（api, app, utils, charts, dashboard, realtime），导出约 65+ 个全局函数
- API 总数：约 65 个 RESTful 端点 + SSE 实时推送
- 数据库表：19 张
- 模拟数据：约 500 条记录
- SVG 图标：10 个
### 所需依赖

#### 运行环境
| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| **Node.js** | ≥ 14.x | JavaScript 运行时（后端） |
| **现代浏览器** | Chrome / Firefox / Edge (ES6+) | 前端运行环境 |

#### 后端依赖（npm 包）
| 包名 | 版本 | 说明 |
| --- | --- | --- |
| **express** | ^4.18.2 | Web 框架，提供 RESTful API 与静态文件托管 |
| **cors** | ^2.8.5 | 跨域资源共享中间件 |
| **sqlite3** | ^5.1.6 | SQLite 嵌入式数据库驱动 |

#### 前端 CDN 依赖（需互联网加载）
| 库名 | 版本 | CDN 地址 | 用途 |
| --- | --- | --- | --- |
| **ECharts** | 5.5.0 | `https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js` | 图表可视化（产量/OEE/温度曲线） |
| **Font Awesome** | 6.5.1 | `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css` | 图标库 |

#### 最低浏览器版本
|浏览器|最低版本|发布年份|
|---|---|---|
|Google Chrome|	≥ 57|	2017年|
Mozilla Firefox|	≥ 52|	2017年
Microsoft Edge|	≥ 17（Chromium 版均可）|	2018年
Apple Safari|	≥ 10.1|	2017年
Opera|	≥ 44|	2017年

## 二、项目结构

```
device-dashboard/
│
├── backend/                          # 后端服务（8 文件）
│   ├── package.json                  # express, sqlite3, cors
│   ├── server.js                     # 约 65 个 API 路由 + 静态托管 + SSE 模拟器
│   ├── database.js                   # 19 张表建表语句
│   ├── init-data.js                  # 模拟数据初始化（约 500 条记录）
│   ├── migrate-equipment.js          # 精确设备数据迁移脚本
│   ├── alarm-engine.js               # 告警规则引擎（定时扫描自动生成告警）
│   ├── sse.js                        # SSE 广播模块（客户端管理/心跳/事件推送）
│   └── data.db                       # SQLite 数据库（自动生成）
│
├── frontend/                         # 前端应用（9 HTML + 4 CSS + 5 JS）
│   ├── index.html                    # 总览看板（KPI 卡片 + 图表 + 设备网格）
│   ├── login.html                    # 登录/注册（4 角色动画，瞳孔跟随鼠标）
│   ├── display.html                  # 看板展示页（大屏终端渲染）
│   ├── pages/
│   │   ├── alarms.html               # 告警管理（筛选 + 分页 + CSV 导出）
│   │   ├── detail.html               # 设备详情（实时参数 + 温度趋势 + 维修历史）
│   │   ├── personnel.html            # 人员管理（卡片 + 操作日志 + 绩效图）
│   │   ├── settings.html             # 系统设置（7 个配置模块 + 用户管理）
│   │   ├── templates.html            # 看板模板管理（创建/编辑模板）
│   │   └── publish.html              # 发布管理（看板实例 + 展示终端）
│   ├── css/
│   │   ├── base.css                  # CSS 变量 + 暗色/亮色主题 + Reset
│   │   ├── layout.css                # 页面布局（侧边栏 + Grid）
│   │   ├── components.css            # 组件样式（卡片 / 按钮 / 表格 / 徽章）
│   │   └── responsive.css            # 三端响应式（PC / 平板 / 手机）
│   ├── js/
│   │   ├── utils.js                  # 21 个工具函数（防抖 / 日期 / CSV导出 / 角色权限 / Toast）
│   │   ├── api.js                    # 68 个 API 封装（fetch + 统一拦截）
│   │   ├── charts.js                 # ECharts 图表（产量 / OEE / 温度）
│   │   ├── realtime.js               # SSE 客户端（EventSource/自动重连/事件分发）
│   │   ├── dashboard.js              # 首页逻辑（KPI / 设备卡片 / 搜索 / 自动刷新 / SSE）
│   │   └── app.js                    # 入口（侧边栏 / 主题 / 快捷键 / 登录守卫）
│   └── assets/icons/                 # 10 个 SVG 图标
│
├── 设计说明文档.html                  # 本文档（HTML 版）
├── 设计说明文档.md                    # 本文档（Markdown版）
└── 部署说明.txt                       # 部署手册
```

## 三、设计思路

### 整体架构
前端（原生 HTML+CSS+JS + ECharts）→ HTTP → 后端（Node.js + Express）→ SQLite3

- **单服务托管模式**：Express 通过 `express.static` 统一托管前端静态文件
- 所有 API 统一返回格式：`{ code, data, message }`
- **多角色权限系统**：看板管理员 / 车间主管 / 设备维修员 / 普通员工，基于请求头 `X-User-Id` 实现权限校验

### 响应式策略
| 断点 | 侧边栏 | 网格 | 导航 |
| --- | --- | --- | --- |
| PC ≥1024px | 展开 240px | 4 列 | 侧边栏 |
| 平板 768-1023px | 折叠抽屉 | 2 列 | 汉堡菜单 |
| 手机 ≤767px | 隐藏 | 单列 | 底部 Tab 栏 |

### UI 风格
参考 **CoreUI Admin 模板**：侧边栏 `#0d1117` 深色背景，激活项紫色 `#6C3FF5` 左边框，卡片 8px 圆角 + 微阴影，Font Awesome 6 图标库。暗色/亮色双主题通过 CSS 变量实现切换。

### 技术选型理由
- **原生三件套**：零构建步骤，直接运行，适合教学演示
- **ECharts 5.x**：功能丰富，深色/浅色自适应，CDN 加载
- **SQLite3**：零配置嵌入式数据库，文件级存储，适合中小型应用
- **Express**：最流行的 Node.js 框架，中间件生态完善

## 四、数据库设计

共 19 张表：

| # | 表名 | 说明 | 关键字段 |
| --- | --- | --- | --- |
| 1 | `equipment` | 设备信息 | equipmentNo, name, type, status, oee, 4 params + 8 thresholds |
| 2 | `runtime` | 运行记录 | equipment_id, status, duration, record_time |
| 3 | `production` | 产量记录 | equipment_id, output_count, reject_count, cycle_time, record_date |
| 4 | `alarms` | 告警记录 | equipment_id, level, title, message, status, confirmed_at |
| 5 | `temperature` | 温度采集 | equipment_id, temp_value, record_time |
| 6 | `personnel` | 人员信息 | name, employee_no, role, phone, email, status |
| 7 | `operations` | 操作日志 | equipment_id, operator_id, action, detail, result |
| 8 | `maintenance` | 维修记录 | equipment_id, type, description, fault_cause, parts_replaced, cost |
| 9 | `users` | 用户认证 | username, password, name, roles（逗号分隔多角色） |
| 10 | `staff` | 值班人员 | name, position, shift, phone |
| 11 | `op_log` | 操作记录 | time, person, action, device, result |
| 12 | `performance` | 绩效数据 | name, month, output |
| 13 | `data_sources` | 数据源配置 | name, endpoint, api_key, headers, refresh_interval |
| 14 | `alarm_rules` | 告警规则 | equipment_id, param_name, min_value, max_value, notify_level |
| 15 | `board_templates` | 看板模板 | name, layout_type, config, status(draft/published) |
| 16 | `component_library` | 组件库 | name, type, icon, default_config |
| 17 | `template_components` | 模板组件关联 | template_id, component_id, position, config |
| 18 | `board_instances` | 看板实例 | template_id, name, status, display_config |
| 19 | `display_terminals` | 展示终端 | name, type, bound_instance_id, status |

## 五、API 接口清单

共约 60 个 RESTful API 端点：

### 认证模块
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/register` | 用户注册（多角色） |

### SSE 实时推送
| 端点 | 说明 |
| --- | --- |
| GET | `/api/sse/events` | Server-Sent Events 实时数据流 |

SSE 推送事件列表：
| 事件名 | 推送频率 | 说明 |
| --- | --- | --- |
| `device-param-update` | 每 6~9 秒 | 设备实时参数变化（温度/电流/电压/压力） |
| `device-status-change` | 每 25~35 秒 | 设备运行状态变更 |
| `alarm` | 每 10 秒增量检测 | 新告警通知 |
| `kpi-update` | 每 15 秒 | KPI 统计数据刷新 |

### 收藏模块
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/favorites` | 获取收藏设备 ID 列表（仅普通员工） |
| POST | `/api/favorites/toggle` | 切换设备收藏状态（仅普通员工） |

### 设备模块
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/equipment` | 设备列表（status/type/keyword 筛选） |
| POST | `/api/equipment` | 新增设备（需管理员/主管权限） |
| DELETE | `/api/equipment/:id` | 删除设备（级联删除关联子表） |
| GET | `/api/equipment/:id` | 设备详情 |
| GET | `/api/equipment/:id/temperature` | 设备温度历史 |
| GET | `/api/equipment/:id/detail` | 设备完整聚合详情 |
| GET | `/api/equipment/next-no` | 获取下一个可用设备编号（自动生成 EQ-xxx） |

### 仪表盘模块
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dashboard/stats` | KPI 统计 |
| GET | `/api/dashboard/oee` | OEE 数据 |
| GET | `/api/production` | 产量数据 |
| GET | `/api/temperature` | 温度数据 |

### 告警模块
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/alarms` | 告警列表（分页 + 筛选 + 统计摘要） |
| GET | `/api/alarms/summary` | 告警统计摘要 |
| GET | `/api/alarms/active` | 活跃告警 |
| PATCH | `/api/alarms/:id/confirm` | 确认告警 |
| PATCH | `/api/alarms/:id/clear` | 清除告警 |
| GET | `/api/alarms/stats/by-device` | 按设备统计告警 |
| GET | `/api/alarms/stats/by-level` | 按级别统计告警 |
| GET | `/api/alarms/stats/by-time` | 按时间统计告警 |

### 人员与值班
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST/PUT/DELETE | `/api/personnel` | 人员 CRUD |
| GET/POST/DELETE | `/api/staff` | 值班人员管理 |
| GET | `/api/users` | 用户列表 |
| DELETE | `/api/users/:id` | 删除用户 |
| POST | `/api/users/change-password` | 修改密码 |

### 日志与维修
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/op_log` | 操作记录 |
| GET | `/api/operations` | 操作日志 |
| GET/POST/PUT | `/api/maintenance` | 维修记录管理 |
| POST | `/api/maintenance/from-alarm` | 从告警创建维修 |

### 数据源管理（看板管理员）
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST/PUT/DELETE | `/api/data-sources` | 数据源 CRUD |
| POST | `/api/data-sources/:id/test` | 测试数据源连接 |

### 告警规则管理
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST/PUT/DELETE | `/api/alarm-rules` | 告警规则 CRUD |

### 看板模板 / 组件库
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST/PUT/DELETE | `/api/board-templates` | 模板 CRUD |
| POST/PUT/DELETE | `/api/board-templates/:id/components` | 模板组件管理 |
| GET | `/api/component-library` | 组件库列表 |

### 看板实例 / 展示终端
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST/PUT/DELETE | `/api/board-instances` | 实例 CRUD |
| POST | `/api/board-instances/:id/publish` | 发布/下架看板 |
| GET | `/api/board-instances/:id/render` | 获取渲染数据 |
| GET/POST/PUT/DELETE | `/api/display-terminals` | 终端管理 |

## 六、模拟数据

| 数据类型 | 数量 | 说明 |
| --- | --- | --- |
| 设备 | 12 台 | 数控机床、焊接机器人、注塑机、冲压机、AGV、检测仪、3D 打印机等 |
| 人员 | 8 名 | 操作员、技术员、管理员 |
| 告警 | 50 条 | 20 active / 15 confirmed / 15 cleared |
| 产量 | 90 条 | 近 30 天 |
| 温度 | 200 条 | 多设备 7 天采集 |
| 操作日志 | 60 条 | 近 14 天 |
| 维修记录 | 30 条 | 近 60 天 |
| 用户 | 4 个 | admin/supervisor/maintainer/viewer |
| 值班人员 | 8 名 | 白班/夜班 |
| 操作记录 | 12 条 | 用于首页 |
| 绩效数据 | 5 条 | 人员产量排名 |
| 数据源 | 3 个 | 天气/MES/能源示例 |
| 告警规则 | 10 条 | 设备参数阈值规则 |
| 组件库 | 5 个 | 预定义看板组件 |
| 看板模板 | 3 个 | 生产/设备/产量模板 |
| **合计** | **约 500 条** | 幂等初始化 |

## 七、角色权限体系

共 4 种角色，支持多角色组合（逗号分隔）：

| 角色标识 | 角色中文名 | 权限说明 |
| --- | --- | --- |
| `dashboard_admin` | 看板管理员 | 全部权限，含用户管理、数据源管理 |
| `workshop_supervisor` | 车间主管 | 人员管理、告警确认/清除、设置访问 |
| `maintenance_tech` | 设备维修员 | 维修记录创建/更新、告警查看 |
| `viewer` | 普通员工 | 仅可访问总览看板和设备详情 |

默认账号（4 个，密码均为 `123456`）：

| 用户名 | 姓名 | 角色 |
| --- | --- | --- |
| `admin` | 系统管理员 | dashboard_admin + workshop_supervisor |
| `supervisor` | 张主管 | workshop_supervisor |
| `maintainer` | 王维修 | maintenance_tech |
| `viewer` | 李员工 | viewer（只读模式） |

## 八、功能实现说明

### 1. 设备总览模块（index.html）
- **KPI 卡片**：8 张（设备总数/运行中/待机/故障/离线/今日产量/平均稼动率/未处理告警），带趋势标签
- **搜索筛选**：按设备名称/编号实时搜索（300ms 防抖），支持清除按钮和搜索结果条
- **设备卡片网格**：4 列（PC）/ 2 列（平板）/ 1 列（手机），hover 紫色边框
- 视图切换：卡片 ↔ 列表（localStorage 持久化）
- 设备类型下拉筛选 + KPI 卡片点击联动设备列表筛选

### 2. 数据可视化模块（ECharts）
- **产量折线图**：计划产量 / 实际产量 / 良品数 3 条曲线
- **OEE 环形图**：双环设计 — 外层整体 OEE + 内层各设备分布
- **温度曲线图**：多设备多色显示，含上下阈值标注
- 时间范围切换：今日 / 7天 / 30天 联动刷新

### 3. 告警管理模块（alarms.html）
- 告警统计摘要（总数 + 紧急/重要/一般）
- 级别/状态/设备 三栏筛选 + 分页
- 确认/清除操作（状态流转校验：active→confirmed→cleared）
- 告警滚动条（悬停暂停）+ CSV 导出（BOM 编码）
- 紧急告警弹窗（localStorage 去重）

### 4. 设备详情模块（detail.html）
- 设备信息头部 + 4 个实时参数（温度/电流/电压/压力）+ 阈值指示条
- 温度趋势图（ECharts 面积图）+ 维修历史表格

### 5. 人员管理模块（personnel.html）
- 值班人员卡片网格 + 职位徽章 + 操作记录表格（按人筛选）+ 绩效柱状图
- 新增/删除值班人员功能

### 6. 系统设置模块（settings.html）
- 7 个配置模块：主题/刷新间隔/时间范围/视图/声音通知/弹窗通知/用户管理
- 用户管理：查看、添加、删除用户，修改密码
- Toast 动画提示 + localStorage 持久化

### 7. 用户认证模块（login.html）
- 登录/注册同页 Tab 切换
- 4 个动态角色（紫/黑/橙/黄），瞳孔跟随鼠标移动
- 眨眼动画、偷看密码按钮、多角色注册选择
- 登录守卫（自动跳转 + 页面拦截）

### 8. 看板模板管理（templates.html）
- 模板卡片网格展示 + 创建/编辑/删除模板
- 模板详情查看（含关联组件列表）
- 布局类型：单栏/双栏/三栏/混合

### 9. 发布管理（publish.html）
- 看板实例管理：创建/编辑/删除基于模板的看板实例
- 发布/下架看板实例（draft↔published↔offline）
- 展示终端管理：注册/编辑/删除终端，终端绑定看板实例

### 10. 看板展示页（display.html）
- 大屏展示模式，隐藏侧边栏和顶部栏
- 根据布局类型动态渲染网格
- 支持组件：数据卡片/实时表格/趋势图/告警列表/进度条
- 自动刷新（按实例配置间隔）+ 实时时钟

### 11. 告警规则引擎（alarm-engine.js）
- 定时扫描所有启用的告警规则（默认 30 秒间隔）
- 读取设备实时参数值与规则阈值比较，超限自动生成告警
- 避免重复告警（同设备同参数未清除前不再生成）

### 12. 已实现的功能扩展
- ✅ 暗色/亮色主题切换（localStorage 持久化）
- ✅ KPI 数字滚动动画（easeOutCubic）
- ✅ 告警滚动条（悬停暂停）
- ✅ 浏览器标签页闪烁（新告警提醒）
- ✅ 数据自动刷新（可配置间隔 + visibilitychange）
- ✅ 键盘快捷键（Ctrl+K 搜索 / ESC 取消 / R 刷新）
- ✅ 导出 CSV 报告（中文 BOM）
- ✅ 全屏模式（Fullscreen API）
- ✅ 底部 Tab 栏（手机端）
- ✅ 侧边栏遮罩层（平板/手机端）
- ✅ 角色权限守卫（侧边栏隐藏 + 页面拦截）
- ✅ 加载进度条（6 步骤跟踪 + 10 秒兜底）
- ✅ 告警提示音（Web Audio API）
- ✅ 多角色用户注册（支持组合角色）
- ✅ 看板模板/实例/终端完整管理流程
- ✅ 告警规则引擎（自动检测参数超限）
- ✅ 数据源管理（第三方 API 集成）
- ✅ SSE 实时数据推送（设备参数/状态/告警/KPI 实时更新）
- ✅ 温度趋势图实时更新（SSE 追加数据点）
- ✅ 设备编号自动生成（EQ-xxx 递增）
- ✅ 添加设备参数自动填充
- ✅ 关注设备按钮角色权限控制（仅普通员工可见）
- ✅ 收藏 API 后端权限校验（requireRole viewer）

## 九、使用说明

### 环境要求
Node.js 14+，现代浏览器

### 安装启动
```shell
cd backend
npm install
npm start
```

### 访问地址
| 页面 | 地址 |
| --- | --- |
| 登录页 | `http://localhost:3000/login.html` |
| 首页看板 | `http://localhost:3000/index.html` |
| 告警管理 | `http://localhost:3000/pages/alarms.html` |
| 设备详情 | `http://localhost:3000/pages/detail.html?id=1` |
| 人员管理 | `http://localhost:3000/pages/personnel.html` |
| 系统设置 | `http://localhost:3000/pages/settings.html` |
| 看板模板 | `http://localhost:3000/pages/templates.html` |
| 发布管理 | `http://localhost:3000/pages/publish.html` |
| 看板展示 | `http://localhost:3000/display.html?instance_id=1` |

### 默认账号
| 用户名 | 密码 | 角色 |
| --- | --- | --- |
| `admin` | `123456` | 系统管理员（看板管理员+车间主管） |
| `supervisor` | `123456` | 张主管（车间主管） |
| `maintainer` | `123456` | 王维修（设备维修员） |
| `viewer` | `123456` | 李员工（普通员工，只读模式） |

## 十、网络访问说明

### 默认绑定
服务默认监听 `0.0.0.0:3000`（所有网络接口），因此不仅本机可访问，同局域网的其他设备也可访问。

| 访问方式 | 示例地址 | 是否可行 |
|---------|---------|---------|
| 本机访问 | `http://localhost:3000` | ✅ |
| 局域网访问 | `http://192.168.x.x:3000` | ✅（需知道服务端局域网 IP） |
| 互联网访问 | 公网 IP 或域名 | ❌ 需额外配置 |

### 局域网访问方法
1. 在服务端运行 `ipconfig`（Windows）或 `ifconfig`（Mac/Linux）查看本机局域网 IP
2. 同一局域网的其他设备通过浏览器访问 `http://<该IP>:3000`

### 互联网访问（如需）
- **端口转发**：在路由器中设置端口映射
- **内网穿透**：使用 frp、ngrok、Tailscale 等工具
- **云服务器部署**：将项目部署到有公网 IP 的云服务器上
- **反向代理**：通过 Nginx 配置域名和反向代理

### 注意事项
- 首次加载页面需要**互联网连接**（从 CDN 加载 ECharts 和 Font Awesome）
- 若需在完全离线的局域网中使用，请将这两个库改为本地引用