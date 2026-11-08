# MQTTX Plus → Web 移植进度

把桌面端（`src/`）MQTTX Plus 新增的能力移植到浏览器版（`web/`）的工作记录。
**阶段一（逻辑层）已完成并通过构建与单测**，界面接线与其余引擎尚在进行。

## 移植原则

- 桌面端原文件不动，`web/` 内新增同名模块；
- 浏览器没有 Electron：`electron-store`（JSON 文件）换成 `localStorage` 适配层 `web/src/utils/persistentStore.ts`，调用面保持一致（`get` / `set` / `has` / `delete` / `clear`）；
- 类型用声明合并隔离：新增模型集中在 `web/src/types/plusModels.d.ts`，只对 `ConnectionModel`、`SubscriptionModel` 补充增量字段，不改动上游 `global.d.ts`；
- 依赖浏览器无法实现的能力一律不搬（见文末「无法移植」）。

## 阶段一：逻辑层（已完成 ✅）

| 模块 | 文件 | 状态 |
| --- | --- | --- |
| 存储适配 | `web/src/utils/persistentStore.ts` | 新增，localStorage 实现 |
| 预设管理 | `web/src/utils/configProfiles.ts` | 已移植，存储已改造 |
| 模板变量 | `web/src/utils/variables/`（15 个文件） | 已移植，`state.ts` 存储已改造 |
| 变量解析桥接 | `web/src/utils/connectionVariables.ts`、`payloadVariables.ts` | 已移植 |
| 自动订阅规划 | `web/src/utils/autoSubscribe.ts`、`subscribeOptions.ts` | 已移植 |
| 连接后上报 | `web/src/utils/connectReports.ts`、`timedReports.ts` | 已移植 |
| 自动回复匹配 | `web/src/utils/autoReply.ts`、`jmesPathCondition.ts` | 已移植 |
| 行为模板 | `web/src/utils/behaviorTemplates.ts` | 已移植 |
| 消息序列示例 | `web/src/utils/messageSequenceExamples.ts` | 已移植 |
| 类型声明 | `web/src/types/plusModels.d.ts`、`jmesPath` 声明 | 新增 29 个模型 |

验证：

```bash
cd web && npx tsc --noEmit -p tsconfig.json   # 0 error
cd web && yarn build                          # 15s，构建通过
cd web && yarn test:unit                      # 89 passing
```

单测覆盖：存储适配（命名空间隔离 / CRUD）、预设增删改、全局变量、模板变量解析与未解析上报、
自动订阅分组规划、连接后订阅执行器（合并包 / 分组延时 / 跳过未解析主题 / 自动标记）、
连接后上报（计划过滤、变量替换、延时发送、取消）、变量行转换（保留名 / 重名 / 未知定义保留）、
发布变量（未解析检查不推进计数器、单条消息计数器只推进一次、非模板载荷类型不替换）、
自动回复（主题匹配、去重窗口、自触发抑制、每秒限流、延时回复、dispose 取消）、
消息序列（顺序发送、步骤延时、变量替换、连接/消息触发、空转保护、stopWhen、停止与 dispose）、
定时消息（启用过滤、间隔/主题校验、每次 tick 变量解析、并发上限、stop/dispose 后不再发送）、
行为模板（列表新 id、变量优先、清空恢复、切换不叠加、未知模板不生效、父链追加语义）、
预设套用（协议/地址/端口、拒绝 mqtt 协议、未设置字段不覆盖、变量优先、跳过 3.1）。

`jmespath` 已加入 `web/package.json` 依赖（原先只是从外层仓库的 node_modules 意外解析到）。

## 阶段二：界面接线（进行中）

已完成的三个闭环（都在连接表单的「自动化」区块里）：

**1. 客户端变量**

- [x] 编辑器 `web/src/components/VariableListEditor.vue`：固定值 / 自增自减（起始、步长、上下限）
- [x] 行与存储的转换抽成纯函数 `web/src/utils/variableRows.ts`（可单测）
- [x] 复用上游的 `validateVariableName`：非法名、保留名（`uuid`/`timestamp` 等）、重名都会被拦下
- [x] 编辑器不认识的定义（random / choice / session 等）原样保留，不会被覆盖丢失
- [x] 变量写入 `connection.variables`，自动订阅与连接后上报的 `${变量}` 即刻生效

**2. 自动订阅**

- [x] 编辑器 `web/src/components/AutoSubscribeEditor.vue`：分组、延时、合并、多条主题、QoS
- [x] 连上后执行 `web/src/utils/connectSubscriptions.ts`：按分组延时订阅、合并组走单个 SUBSCRIBE 包、无法解析的占位符跳过并提示
- [x] 订阅行持久化并带 `autoSubscribed` 标记（供列表显示「自动」角标）

**3. 连接后上报**

- [x] 编辑器 `web/src/components/ConnectReportEditor.vue`：启用、延时（秒）、QoS、retain、主题、报文
- [x] 执行器 `web/src/utils/connectReportRunner.ts`：拆成纯计划 `planConnectReports` + 调度 `runConnectReports`
- [x] 主题与报文都做变量替换；主题里还有无法解析占位符的行直接不发（避免发到字面量 `${...}`）
- [x] 定时器可取消：断线（`onClose`）时停掉还没发出去的上报
- [x] 发出的上报记入连接消息列表，与手动发布一致

**4. 发布面板：消息预设 + 变量解析**

- [x] 消息预设下拉（`MsgPublish.vue`）：选中即填入 topic 与报文，之后仍可编辑
- [x] 变量解析预览：主题/报文含 `${...}` 时显示解析结果，未解析的占位符单独标出
- [x] 发送时真正替换：`web/src/utils/publishVariables.ts`
  - 未解析占位符**先确认再发**（不静默发字面量 `${name}`），与桌面端行为一致
  - 校验不推进计数器；真正发送时才推进，且一条消息里主题与报文共用一个值
  - Hex / Base64 报文不做变量替换（避免破坏编码）

**5. 自动回复**

- [x] 规则编辑器 `web/src/components/AutoReplyEditor.vue`：匹配主题（支持通配符）、JMESPath 条件、回复方式（合并收到报文 / 固定报文）、回复主题与报文、QoS、retain、延时
- [x] 执行器 `web/src/utils/autoReplyRunner.ts`：匹配逻辑复用桌面端 `autoReply.ts`，本模块只加连接级防护
  - 自触发抑制：本连接刚发出的主题 5 秒内不再参与匹配
  - 重复抑制：同「主题 + 规则」60 秒内只回一次（应对重投递）
  - 限流：每秒最多 20 条，超出直接丢弃（不排队，避免迟到回复）
  - 延时回复上限 100 条，断线时全部取消
- [x] 挂在 `onMessageArrived`：收到消息先跑规则再渲染，回复走与手动发布相同的 `client.publish`，因此会记入消息列表与历史

**6. 消息序列**

- [x] 编辑器 `web/src/components/MessageSequenceEditor.vue`：序列名、触发方式（手动 / 连上后 / 收到消息）、循环、步骤（主题、报文、QoS、retain、相对延时）
- [x] 执行器 `web/src/utils/messageSequenceRunner.ts`
  - 步骤顺序发送，延时相对上一步；主题与报文逐步骤做变量替换
  - 空转保护：每秒超过 20 步直接停止（延时 0 的循环）
  - 自触发抑制：序列自己发出的报文 5 秒内不再触发自己（按序列，不按连接，兄弟序列仍可匹配）
  - `loop` + `stopWhen`（变量数值比较 `lt/lte/gt/gte/eq`），变量非数字则停止并提示
  - 单步长达 2^31-1 ms 的延时会被截断（否则 `setTimeout` 会当 1ms 立即触发）
- [x] 触发匹配复用 `matchesAutoReplyRule`：与自动回复同一套主题/条件语义
- [x] 挂在连接生命周期：连上时启动 `connect` 触发型，收到消息时匹配 `message` 触发型，断线全部停止

**7. 定时消息**

- [x] 编辑器 `web/src/components/TimedReportEditor.vue`：间隔（夹到 ≥1 秒）、主题、报文、QoS、retain、启用
- [x] 执行器 `web/src/utils/timedReportRunner.ts`
  - 连上后启动已保存的行；同一条不会重复启动；每条连接最多同时 10 条
  - **每次 tick 都重新解析变量**：计数器会递增，`${timestamp}` 是本次发送时间而非连接时间
  - 停止方式：`stop` / `stopAll` / 断线 dispose
- [x] 浏览器限制已写入 UI 提示与本文档：标签页关闭或休眠时不发送，恢复后**不补发**错过的间隔

**8. Topic 预设**

- [x] 发布面板新增 Topic 预设下拉（与消息预设并列），只填主题、保留已输入的报文

**9. 行为模板**

- [x] 连接表单新增「行为模板」区块（`ConnectionForm.vue`）：下拉选择套用、可清空恢复、「保存当前为模板」
- [x] 套用逻辑抽成纯函数 `web/src/utils/behaviorApply.ts`
  - 套用时每条列表都**生成新 id**，模板与连接不共享订阅组 / 定时任务 / 序列的运行态
  - 首次套用前保存基线，切换模板先还原再套用（不会叠加），清空选择则完全恢复
  - 连接自身已定义的变量优先，模板只补空缺
  - 沿父链合并：列表是**追加**语义（父在前、子在後），空列表表示"本层不追加"而非"清空"

**10. 预设管理（服务器 / 客户端）**

- [x] 连接表单新增「预设」区块：服务器预设、客户端预设两个下拉 + 「保存当前为预设」
- [x] 套用逻辑抽成纯函数 `web/src/utils/applyPresets.ts`
  - 服务器预设套用协议、地址、端口、路径
  - **使用 `mqtt` / `mqtts` 的预设会被拒绝并提示**：浏览器只能 ws/wss，静默改成 websocket 端口会连到错误的地方
  - 客户端预设套用 Client ID、账号、会话参数、变量（连接自有变量优先）
  - MQTT 3.1 的预设跳过版本字段（web 只提供 3.1.1 / 5.0）

**11. 消息序列手动启动**

- [x] 连接详情工具栏新增序列按钮（仅显示 `manual` 触发型且已连接时）：下拉选择启动、显示运行中、可「停止全部」

语言包：`web/src/lang/connections.ts` 累计新增 96 条（zh / en / ja）。

剩余可选项（不影响目标达成）：

- [ ] 行为模板的独立新建/编辑页面（当前只能"从现有连接保存为模板"）
- [ ] 服务器/客户端预设的编辑与删除界面（数据层已支持）

## 阶段三：引擎接线（待做）

- [ ] 自动回复引擎 `autoReplyEngine.ts`（依赖连接生命周期）
- [ ] 消息序列引擎 `messageSequenceEngine.ts`（依赖视图管线）
- [ ] 定时消息 `timedMessageManager.ts`（浏览器限制：标签页关闭即停止）

## 无法移植（浏览器环境不具备）

| 能力 | 原因 |
| --- | --- |
| 本机 Agent 桥接（MCP） | 依赖 Electron 主进程在 `127.0.0.1` 起 HTTP 服务，浏览器无法监听端口 |
| 安装 CLI、自动更新、多窗口 | 依赖主进程与文件系统 |
| TCP/TLS 直连（`mqtt://`、`mqtts://`） | 浏览器只能 `ws://` / `wss://` |
| 定时消息的持久可靠性 | 标签页休眠/关闭即中断，无法像桌面端常驻 |

## 预设管理页（`/configs`）

左侧栏入口 → 8 个标签页，与桌面端对齐：服务器 / 客户端 / 消息 / Topic / 消息序列 / 自动回复 / 全局变量 / 行为模板。

- 页面：`web/src/views/configs/index.vue`；文案模块：`web/src/lang/configs.ts`（注册于 `lang/index.ts` 与 `types/locale.d.ts`）
- 列表与编辑弹窗由一个标签页定义表驱动，新增一种预设只需加一条定义
- **序列/回复预设可被连接表单取用**：两个编辑器都有「从预设载入」，载入时生成新 id 的副本；
  在预设编辑弹窗里该入口被关闭（那里只保存单条，载入第二条会被丢弃）

### 编辑预设时的字段保留

对话框只编辑部分字段，保存时**与已存记录合并**，避免静默丢数据：

| 预设 | 只显示 | 必须保留 |
| --- | --- | --- |
| 客户端预设 | 别名 / Client ID / 账号 | 变量、自动订阅、自动回复、消息序列列表 |
| 全局变量 | 名称 / 值 | `definition`（计数器、随机等有状态配置） |
| 消息序列预设 | 名称 + 序列 | `variables` |
| 自动回复预设 | 名称 + 规则 | `variables` |

## i18n 自检

`web/scripts/check-i18n.js` + `yarn check:i18n`：扫描源码里所有 `$t('module.key')`，核对 key 是否在对应语言模块中定义。

存在的理由：vue-i18n 对未知 key **不报错，直接把 key 渲染到界面**。移植过程中曾有一批组件写成
`$t('variable.add')`（点号路径），而语言包是扁平的 `connections.variableAdd`，界面因此显示原始 key。
该脚本已验证能抓到这类错误（退出码 1）。

## 已知未完成

- 左侧栏入口沿用 web 原有图标集，未做桌面端整套菜单（预设入口已与桌面端同组：连接 / 新建 / 预设）

## 已完成：全局变量的有状态编辑

配置页 → 全局变量 → 新建/编辑，改用移植自桌面端的 `VariableDefinitionEditor`：

- 支持常量与全部有状态形式（计数、随机、随机游走、加权选择、会话、抓取值等），含上下限、
  越界策略、重置时机、精度与种子等高级项
- 变量名校验与桌面端同一套规则（`validateVariableName`：非法 / 保留名 / 重名）
- 保存时：常量写回字符串，有状态变量写回 `definition` 对象；从有状态改回常量会**清掉旧定义**
- 列表新增「类型」列，与桌面端一致（默认值 / 当前值两列早前已加）

新增单测 `web/tests/unit/utils/globalVariables.spec.ts`：定义往返、常量不残留定义、状态切换时定义被替换。

## 已完成：消息预设的 Monaco 编辑器

配置页 → 消息预设 → 新建/编辑，报文改用与发布面板同一个 `Editor.vue`：

- JSON 高亮、可拖动高度（`resize: vertical`，240px 起、70vh 上限）
- 「格式化」按钮，内部走 `validFormatJson`（与桌面端同一套格式化和报错行为）
- 弹窗宽度按标签变化：消息 760px、序列/回复/行为模板 720px、客户端 560px、其余 480px
- Monaco 在弹窗里创建时容器还没有尺寸，因此用 `el-dialog` 的 `@opened` 调一次 `editorLayout()`，
  而不是靠固定延时

## 已完成：行为模板编辑弹窗

配置页的行为模板标签页现在可新建/编辑完整模板：

- 父模板（下拉已排除会造成环的候选）、默认服务器、凭据来源（模板 / 设备）与账号密码
- 客户端参数与 Will：移植了桌面端的 `BehaviorClientOptions.vue`（含 `PresetPicker` / `TopicPresetPicker`）
- 五类自动化列表 + 客户端变量，全部复用连接表单里的同一批编辑器
- 保存时 `compactBehaviorConfig` 只写用户真正设置过的字段，其余继续沿父链继承

## 注意

- `web/` 其余部分仍是上游 MQTTX Web 代码，与桌面端持续分叉；本次移植只覆盖 MQTTX Plus 新增能力。
- 存储从文件改为 localStorage，受浏览器 ~5MB 配额限制，海量预设或变量需要另行设计。
