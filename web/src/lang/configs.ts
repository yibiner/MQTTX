export default {
  title: {
    zh: '预设管理',
    en: 'Presets',
    ja: 'プリセット',
  },
  serverProfiles: {
    zh: '服务器预设',
    en: 'Server presets',
    ja: 'サーバープリセット',
  },
  clientProfiles: {
    zh: '客户端预设',
    en: 'Client presets',
    ja: 'クライアントプリセット',
  },
  messagePresets: {
    zh: '消息预设',
    en: 'Message presets',
    ja: 'メッセージプリセット',
  },
  topicPresets: {
    zh: 'Topic 预设',
    en: 'Topic presets',
    ja: 'トピックプリセット',
  },
  behaviorTemplates: {
    zh: '行为模板',
    en: 'Behaviour templates',
    ja: '動作テンプレート',
  },
  globalVariables: {
    zh: '全局变量',
    en: 'Global variables',
    ja: 'グローバル変数',
  },
  alias: {
    zh: '别名',
    en: 'Alias',
    ja: '別名',
  },
  host: {
    zh: '地址',
    en: 'Host',
    ja: 'ホスト',
  },
  port: {
    zh: '端口',
    en: 'Port',
    ja: 'ポート',
  },
  protocol: {
    zh: '协议',
    en: 'Protocol',
    ja: 'プロトコル',
  },
  path: {
    zh: '路径',
    en: 'Path',
    ja: 'パス',
  },
  name: {
    zh: '名称',
    en: 'Name',
    ja: '名前',
  },
  clientId: {
    zh: 'Client ID',
    en: 'Client ID',
    ja: 'Client ID',
  },
  username: {
    zh: '用户名',
    en: 'Username',
    ja: 'ユーザー名',
  },
  password: {
    zh: '密码',
    en: 'Password',
    ja: 'パスワード',
  },
  variables: {
    zh: '变量',
    en: 'Variables',
    ja: '変数',
  },
  topic: {
    zh: '主题',
    en: 'Topic',
    ja: 'トピック',
  },
  payload: {
    zh: '报文',
    en: 'Payload',
    ja: 'ペイロード',
  },
  value: {
    zh: '值',
    en: 'Value',
    ja: '値',
  },
  oper: {
    zh: '操作',
    en: 'Actions',
    ja: '操作',
  },
  create: {
    zh: '新建',
    en: 'New',
    ja: '新規',
  },
  edit: {
    zh: '编辑',
    en: 'Edit',
    ja: '編集',
  },
  delete: {
    zh: '删除',
    en: 'Delete',
    ja: '削除',
  },
  cancel: {
    zh: '取消',
    en: 'Cancel',
    ja: 'キャンセル',
  },
  confirm: {
    zh: '确定',
    en: 'OK',
    ja: 'OK',
  },
  empty: {
    zh: '还没有预设，点击右上角新建',
    en: 'No presets yet - use the button above to add one',
    ja: 'プリセットがありません。右上のボタンで追加してください',
  },
  saveSuccess: {
    zh: '已保存',
    en: 'Saved',
    ja: '保存しました',
  },
  deleteConfirm: {
    zh: '确定删除这条预设？',
    en: 'Delete this preset?',
    ja: 'このプリセットを削除しますか？',
  },
  behaviorHint: {
    zh: '在这里编辑行为模板，到连接表单里套用。仍被其他模板继承的模板不能删除。',
    en: 'Edit a behaviour template here, then apply it from the connection form. A template that others still inherit cannot be deleted.',
    ja: 'ここで動作テンプレートを編集し、接続フォームで適用します。他のテンプレートが継承しているものは削除できません。',
  },
  behaviorHasChildren: {
    zh: '还有模板继承这一条，先解除继承再删除',
    en: 'Other templates still inherit this one. Detach them before deleting it.',
    ja: 'このテンプレートを継承しているものがあります。先に継承を解除してください。',
  },
  serverProtocolHint: {
    zh: '浏览器只能连接 ws / wss。',
    en: 'A browser can only connect with ws / wss.',
    ja: 'ブラウザは ws / wss のみ接続できます。',
  },
  messageSequencePresets: {
    zh: '消息序列预设',
    en: 'Sequence presets',
    ja: 'シーケンスプリセット',
  },
  autoReplyPresets: {
    zh: '自动回复预设',
    en: 'Reply presets',
    ja: '自動応答プリセット',
  },
  steps: {
    zh: '步骤数',
    en: 'Steps',
    ja: 'ステップ数',
  },
  sequencePresetNoTopic: {
    zh: '序列至少要有一个带主题的步骤',
    en: 'A sequence needs at least one step with a topic',
    ja: 'シーケンスにはトピック付きのステップが最低 1 つ必要です',
  },
  replyPresetNoTopic: {
    zh: '自动回复规则需要填写匹配主题',
    en: 'A reply rule needs a match topic',
    ja: '自動応答ルールには一致するトピックが必要です',
  },
  variablesHelp: {
    zh: '变量说明',
    en: 'Variable guide',
    ja: '変数の説明',
  },
  variablesHelpTitle: {
    zh: '变量使用说明',
    en: 'How variables work',
    ja: '変数の使い方',
  },
  variablesHelpScopeTitle: {
    zh: '变量来源与优先级',
    en: 'Where a variable comes from, in order of priority',
    ja: '変数の取得元と優先順位',
  },
  variablesHelpScope: {
    zh: '1. 内置变量：名称保留，不能覆盖（${timestamp}、${uuid} 等）\n2. 上下文变量：自动回复里可用 ${msg.字段} 与 ${topic}\n3. 客户端变量：连接设置里为这个连接定义的变量\n4. 全局变量：在这里定义，所有连接共用\n5. 连接字段：连接自身的 clientId、username、name、host、port\n\n同名时靠前的优先；变量值为空等同于没有定义，会继续往下一级查找。',
    en: '1. Built-in variables: reserved names that cannot be overridden (${timestamp}, ${uuid}, ...)\n2. Context variables: ${msg.field} and ${topic} inside an automatic reply\n3. Client variables: defined for one connection in its settings\n4. Global variables: defined here and shared by every connection\n5. Connection fields: clientId, username, name, host and port of the connection\n\nThe first entry that defines a name wins; an empty value counts as "not defined" and falls through.',
    ja: '1. 組み込み変数：名前は予約済みで上書きできません（${timestamp}、${uuid} など）\n2. コンテキスト変数：自動応答の中で ${msg.フィールド} と ${topic} が使えます\n3. クライアント変数：接続設定でその接続に定義した変数\n4. グローバル変数：ここで定義し、すべての接続で共有\n5. 接続フィールド：接続自身の clientId、username、name、host、port\n\n同じ名前は上の順で優先されます。値が空の場合は未定義として次の段へ進みます。',
  },
  variablesGuideTitle: {
    zh: '可用变量',
    en: 'Available variables',
    ja: '利用可能な変数',
  },
  variablesGuideGroupBuiltin: {
    zh: '内置变量',
    en: 'Built-in',
    ja: '組み込み',
  },
  variablesGuideGroupContext: {
    zh: '上下文变量（自动回复 / 连接会话）',
    en: 'Context (replies / connection session)',
    ja: 'コンテキスト（自動応答 / 接続セッション）',
  },
  variablesGuideGroupConnection: {
    zh: '连接字段',
    en: 'Connection fields',
    ja: '接続フィールド',
  },
  variablesHelpBuiltins: {
    zh: '${timestamp} / ${ts}：毫秒时间戳，如 1791979522744\n${timestampSec}：秒时间戳，如 1791979522\n${datetime}：本地日期时间，如 2026-10-17 08:51:32\n${date}：本地日期，如 2026-10-17\n${time}：本地时间，如 08:51:32\n${iso}：UTC ISO 8601，如 2026-10-17T00:51:32.643Z\n${uuid}：每次发送生成新的 UUID v4',
    en: '${timestamp} / ${ts}: epoch milliseconds, e.g. 1791979522744\n${timestampSec}: epoch seconds, e.g. 1791979522\n${datetime}: local date and time, e.g. 2026-10-17 08:51:32\n${date}: local date, e.g. 2026-10-17\n${time}: local time, e.g. 08:51:32\n${iso}: UTC ISO 8601, e.g. 2026-10-17T00:51:32.643Z\n${uuid}: a fresh UUID v4 on every send',
    ja: '${timestamp} / ${ts}：ミリ秒タイムスタンプ（例 1791979522744）\n${timestampSec}：秒タイムスタンプ（例 1791979522）\n${datetime}：ローカルの日時（例 2026-10-17 08:51:32）\n${date}：ローカルの日付（例 2026-10-17）\n${time}：ローカルの時刻（例 08:51:32）\n${iso}：UTC ISO 8601（例 2026-10-17T00:51:32.643Z）\n${uuid}：送信のたびに新しい UUID v4',
  },
  variablesHelpDefinitionsTitle: {
    zh: '变量定义（有状态变量）',
    en: 'Variable definitions (stateful variables)',
    ja: '変数定義（状態を持つ変数）',
  },
  variablesHelpDefinitions: {
    zh: '常量：值是一段模板，可以包含其他占位符，如 A1、${timestamp}\n序列：每次发送后按步长变化，步长可为负数或小数。示例：水重从 200 开始、每次 -20，依次为 200 → 180 → 160（初始值 200、步长 -20、最小 0）\n随机：每次在最小值和最大值之间取一个数，可设置小数位和固定种子以便复现\n随机游走：在上次的值附近 ±range 范围内浮动，适合模拟传感器读数\n加权选择：从若干带权重的候选值中抽取，如 A(1)、B(2)\n会话：每个连接会话只生成一次（UUID 或模板），会话期间保持不变\n抓取值：由自动回复规则的动作写入收到的消息字段，之后保持不变',
    en: 'Constant: the value is a template and may contain other placeholders, e.g. A1 or ${timestamp}\nSequence: changes by the step after every send; the step may be negative or a decimal. Example: a water weight starts at 200 and drops by 20: 200 → 180 → 160 (initial 200, step -20, min 0)\nRandom: a new number between min and max on every send; set decimals and a seed to reproduce it\nRandom walk: drifts by at most ±range around the previous value, useful for sensor readings\nWeighted choice: draws one of the weighted options, e.g. A(1), B(2)\nSession: generated once per connection session (UUID or template) and then kept for that session\nCaptured: written by the variable actions of an automatic reply rule, then kept as it is',
    ja: '定数：値はテンプレートで、他のプレースホルダーを含められます（例 A1、${timestamp}）\nシーケンス：送信のたびにステップ分だけ変化します。ステップは負数や小数も可。例：水の重さが 200 から 20 ずつ減る場合 200 → 180 → 160（初期値 200、ステップ -20、最小 0）\nランダム：送信のたびに最小値と最大値の間の数値を取ります。小数桁とシードで再現できます\nランダムウォーク：前回の値の周辺 ±range の範囲で変動します。センサー値の模擬に適しています\n重み付き選択：重み付きの候補から 1 つ選びます（例 A(1)、B(2)）\nセッション：接続セッションごとに 1 回だけ生成し（UUID またはテンプレート）、そのセッション中は固定です\nキャプチャ値：自動応答ルールのアクションが受信メッセージのフィールドを書き込み、その後は保持されます',
  },
  variablesHelpStateTitle: {
    zh: '当前值与作用域',
    en: 'Current values and scopes',
    ja: '現在値とスコープ',
  },
  variablesHelpState: {
    zh: '常量本身没有运行状态。有状态变量（序列、随机、随机游走、加权选择、会话、抓取值）各自保存一个当前值，并按作用域区分：\n• 全局变量：所有连接共用同一个当前值，在一个连接里改值或重置，其他连接也会看到\n• 客户端变量：每个连接各自保存一份当前值，两个客户端可以独立计数\n当前值在消息真正发出后才推进；重置或修改定义后，下一次发送从默认值重新开始。',
    en: 'A constant has no runtime state. A stateful variable (sequence, random, random walk, choice, session, captured) keeps a current value, scoped by where it is defined:\n• Global variables: every connection shares one current value; changing or resetting it in one connection affects all of them\n• Client variables: each connection keeps its own current value, so two clients can count independently\nThe current value advances only after a message was really sent; a reset or an edited definition makes the next send start from the default again.',
    ja: '定数には実行時の状態がありません。状態を持つ変数（シーケンス、ランダム、ランダムウォーク、重み付き選択、セッション、キャプチャ値）は現在値を保持し、定義されたスコープで共有されます：\n• グローバル変数：すべての接続が同じ現在値を共有します。1 つの接続で変更・リセットすると他の接続にも反映されます\n• クライアント変数：接続ごとに現在値を保持するため、2 つのクライアントが独立してカウントできます\n現在値はメッセージが実際に送信された後にだけ進みます。リセットや定義の変更後は、次の送信が既定値から始まります。',
  },
  variablesHelpResetTitle: {
    zh: '重置时机',
    en: 'When a value resets',
    ja: 'リセットのタイミング',
  },
  variablesHelpReset: {
    zh: '在变量定义的「高级设置」里可以勾选重置时机：\n• 连接成功：CONNACK 之后重置；关闭「自动重连也重置」时，自动重连会保留当前值\n• 断开连接：连接断开时重置\n• 应用启动：应用启动后首次使用该变量时重置一次\n• 手动重置：变量编辑器里的重置按钮、自动回复规则的动作，或设置里的「重置全部变量」\n• 越界重置：序列/随机游走的「越界时」选择「重置为初始值」时生效\n• 定时重置：填写秒数后，距上次重置/使用超过该时长，下次使用时自动重置（无后台定时器）',
    en: 'The reset triggers are in the "advanced settings" of a definition:\n• On connect: resets after the CONNACK; when "also on auto reconnect" is off, an automatic reconnect keeps the current value\n• On disconnect: resets when the connection goes away\n• On app start: resets once the first time the variable is used after the app started\n• Manual: the reset buttons of the variable editors, an automatic reply action, or "reset all variables" in the settings\n• On bound: applies when a sequence / random walk sets "on bound" to "reset to initial"\n• Periodic: after the configured number of seconds since the last reset/use, the next use resets lazily (no background timer)',
    ja: 'リセットのタイミングは定義の「詳細設定」にあります：\n• 接続時：CONNACK 後にリセット。「自動再接続でも」をオフにすると自動再接続では現在値を保持します\n• 切断時：接続が切れたときにリセット\n• アプリ起動時：アプリ起動後にその変数を初めて使うときに 1 回だけリセット\n• 手動：変数エディターのリセットボタン、自動応答ルールのアクション、設定の「すべての変数をリセット」\n• 範囲外時：シーケンス / ランダムウォークの「範囲外のとき」が「初期値に戻す」の場合に適用\n• 定期：最後のリセット/使用から指定秒が経過すると、次に使うときに遅延リセットされます（常駐タイマーなし）',
  },
  variablesHelpSessionTitle: {
    zh: '会话变量',
    en: 'Session variables',
    ja: 'セッション変数',
  },
  variablesHelpSession: {
    zh: '每个连接会话（一次成功连接，含自动重连）都会提供：\n• ${connectedAt}：本次会话开始时的毫秒时间戳；${connectedAtSec} 为对应的秒值\n• ${appStartedAt}：应用启动时的毫秒时间戳\n• ${sessionSentCount}：本次会话已发送消息的序号（从 1 开始，预览不占用）\n例如 ${ts - connectedAt} 是本次连接的在线时长（毫秒）。会话变量名称是保留名，不能用作普通变量。',
    en: 'Every connection session (one successful connect, automatic reconnects included) provides:\n• ${connectedAt}: epoch ms when this session started; ${connectedAtSec} is the same in seconds\n• ${appStartedAt}: epoch ms when the app process started\n• ${sessionSentCount}: the 1-based number of the message being sent in this session (a preview does not consume one)\nFor example ${ts - connectedAt} is the session uptime in milliseconds. The names are reserved and cannot be used for a normal variable.',
    ja: '各接続セッション（自動再接続を含む 1 回の接続成功）で次が使えます：\n• ${connectedAt}：このセッション開始時のミリ秒タイムスタンプ。${connectedAtSec} は秒値\n• ${appStartedAt}：アプリ起動時のミリ秒タイムスタンプ\n• ${sessionSentCount}：このセッションで送信するメッセージの 1 始まりの番号（プレビューでは消費しません）\n例：${ts - connectedAt} はこの接続の稼働時間（ミリ秒）。これらの名前は予約済みで、通常の変数名には使えません。',
  },
  variablesHelpRulesTitle: {
    zh: '其他规则',
    en: 'Other rules',
    ja: 'その他のルール',
  },
  variablesHelpRules: {
    zh: '• 变量用于消息主题与消息内容，发送时解析；历史记录保存原文模板，重发会重新取值。\n• 支持简单运算：${ts-34000} 表示 34 秒前、${base + 60}、${(a + b) * 2}、${msg.ts - 34000}，可用 + - * / % 与括号，参与运算的值必须是数字。\n• 变量值里可以再写变量，例如 device = ${line}-${sn}，但不能引用自己。\n• 写成 "${timestamp}" 时，若取到的是数字会自动去掉引号，保证 JSON 类型正确。\n• 发送前仍有解析不到的变量或算式时会弹框列出名称，可取消，也可坚持按原样发送。',
    en: '• Variables are resolved when the message is sent, in the topic and in the payload; the history keeps the template, so a re-send gets fresh values.\n• Simple arithmetic works: ${ts-34000} is 34 seconds ago, ${base + 60}, ${(a + b) * 2}, ${msg.ts - 34000}; + - * / % and parentheses, and every operand must be a number.\n• A variable value may reference other variables (device = ${line}-${sn}) but not itself.\n• When a placeholder is written as "${timestamp}" and the value is a number, the quotes are dropped so the JSON type stays correct.\n• Placeholders or expressions that cannot be resolved are listed before sending; you can cancel or send them verbatim.',
    ja: '• 変数は送信時にトピックと内容で解決されます。履歴はテンプレートを保存するので、再送信すると新しい値になります。\n• 簡単な計算ができます: ${ts-34000} は 34 秒前、${base + 60}、${(a + b) * 2}、${msg.ts - 34000}。+ - * / % と括弧が使え、各項は数値である必要があります。\n• 変数の値に別の変数を書けます（device = ${line}-${sn}）が、自分自身は参照できません。\n• "${timestamp}" のように書くと、値が数値のとき引用符は外され JSON の型が保たれます。\n• 解決できない変数や式は送信前に一覧表示されます。中止するか、そのまま送信できます。',
  },
  variablesHelpFormatTitle: {
    zh: '格式化',
    en: 'Formatting',
    ja: '書式設定',
  },
  variablesHelpFormat: {
    zh: '数字类型的有状态变量还支持格式化：\n• 补零位数：把数值左侧补 0 到指定宽度，如补零 5 位时 42 输出 00042\n• 小数位：保留固定的小数位，如 2 位时 26 输出 26.00\n格式化只影响输出文本，不影响当前值的推进。',
    en: 'Numeric stateful variables can be formatted:\n• Zero padding: pads the number to a fixed width, e.g. 42 becomes 00042 with 5 digits\n• Decimals: keeps a fixed number of decimal places, e.g. 26 becomes 26.00 with 2\nFormatting only changes the emitted text, not the current value that advances.',
    ja: '数値の状態変数は書式を設定できます：\n• ゼロ埋め：数値を指定桁まで 0 で埋めます。例：5 桁なら 42 → 00042\n• 小数桁：小数点以下を固定桁数で出力します。例：2 桁なら 26 → 26.00\n書式は出力テキストだけを変え、進行する現在値には影響しません。',
  },
  variablesHelpExampleTitle: {
    zh: '示例',
    en: 'Example',
    ja: '例',
  },
  variablesHelpExample: {
    zh: '主题：sensor/${clientId}/data → sensor/my-client/data\n内容：{"sn":"${sn}","weight":${wf116wight}} → {"sn":"A1","weight":200}',
    en: 'Topic: sensor/${clientId}/data → sensor/my-client/data\nPayload: {"sn":"${sn}","weight":${wf116wight}} → {"sn":"A1","weight":200}',
    ja: 'トピック：sensor/${clientId}/data → sensor/my-client/data\n本文：{"sn":"${sn}","weight":${wf116wight}} → {"sn":"A1","weight":200}',
  },
  addProfile: {
    zh: '新增预设',
    en: 'Add Preset',
    ja: 'プリセットを追加',
  },
  addVariable: {
    zh: '添加变量',
    en: 'Add variable',
    ja: '変数を追加',
  },
  variableDefault: {
    zh: '默认值',
    en: 'Default',
    ja: '既定値',
  },
  variableCurrentValue: {
    zh: '当前值',
    en: 'Current value',
    ja: '現在値',
  },
  variableReset: {
    zh: '重置当前值',
    en: 'Reset current value',
    ja: '現在値をリセット',
  },
  variableResetDone: {
    zh: '已重置变量 {name} 的当前值',
    en: 'Reset the current value of {name}',
    ja: '{name} の現在値をリセットしました',
  },
  managePresets: {
    zh: '管理预设',
    en: 'Manage presets',
    ja: 'プリセット管理',
  },
  presetSearchEmpty: {
    zh: '没有匹配的预设',
    en: 'No preset matches',
    ja: '一致するプリセットがありません',
  },
  presetSearchPlaceholder: {
    zh: '搜索预设',
    en: 'Search presets',
    ja: 'プリセットを検索',
  },
  topicPresetsEmpty: {
    zh: '还没有 Topic 预设',
    en: 'No topic presets yet',
    ja: 'トピックプリセットはまだありません',
  },
  messagePresetsEmpty: {
    zh: '还没有消息预设',
    en: 'No message presets yet',
    ja: 'メッセージプリセットはまだありません',
  },
  messageSequencePresetsEmpty: {
    zh: '还没有消息序列预设',
    en: 'No sequence presets yet',
    ja: 'シーケンスプリセットはまだありません',
  },
  sequenceMessagePresetTip: {
    zh: '填入这一步的主题和报文。延时、QoS 和赋值保持不变。主题框上的 Topic 预设只更换主题。',
    en: 'Fills this step topic and payload. Delay, QoS and assignments stay as they are. The topic preset on the topic field changes only the topic.',
    ja: 'このステップのトピックと本文を埋めます。遅延、QoS、代入はそのままです。トピック欄のプリセットはトピックだけを変えます。',
  },
  behaviorClientHint: {
    zh: '改过的项盖过父模板，没改过的继续跟随。新建连接时写入高级和遗嘱。',
    en: 'A field you change overrides the parent. The rest keep following it. A new connection receives the advanced options and the will.',
    ja: '変更した項目は親を上書きし、変更していない項目は親に従います。新規接続に詳細設定と遺言が書き込まれます。',
  },
  credentialInherit: {
    zh: '跟随父模板',
    en: 'Follow the parent',
    ja: '親に従う',
  },
  behaviorInheritHint: {
    zh: '留空则继承父模板',
    en: 'Empty inherits from the parent',
    ja: '空欄なら親テンプレートを継承',
  },
  nameRequired: {
    zh: '请填写名称',
    en: 'A name is required',
    ja: '名前を入力してください',
  },
  behaviorParent: {
    zh: '基于',
    en: 'Based on',
    ja: 'ベース',
  },
  behaviorNoParent: {
    zh: '无',
    en: 'None',
    ja: 'なし',
  },
  defaultServer: {
    zh: '默认服务器',
    en: 'Default server',
    ja: '既定のサーバー',
  },
  credentialUsername: {
    zh: '用户名来源',
    en: 'Username from',
    ja: 'ユーザー名の出所',
  },
  credentialPassword: {
    zh: '密码来源',
    en: 'Password from',
    ja: 'パスワードの出所',
  },
  credentialTemplate: {
    zh: '模板里的固定值',
    en: 'Fixed value on the template',
    ja: 'テンプレートの固定値',
  },
  credentialDevice: {
    zh: '这个客户端',
    en: 'This client',
    ja: 'このクライアント',
  },
  formatPayload: {
    zh: '格式化',
    en: 'Format',
    ja: 'フォーマット',
  },
  variableAddOption: {
    zh: '添加候选值',
    en: 'Add option',
    ja: '候補を追加',
  },
  variableAdvanced: {
    zh: '高级设置',
    en: 'Advanced settings',
    ja: '詳細設定',
  },
  variableDefinition: {
    zh: '变量定义',
    en: 'Definition',
    ja: '変数定義',
  },
  variableFormat: {
    zh: '格式化',
    en: 'Formatting',
    ja: '書式',
  },
  variableGenerator: {
    zh: '生成方式',
    en: 'Generator',
    ja: '生成方法',
  },
  variableGeneratorTemplate: {
    zh: '按模板生成',
    en: 'From a template',
    ja: 'テンプレートから',
  },
  variableGeneratorUuid: {
    zh: '每次会话 UUID',
    en: 'UUID per session',
    ja: 'セッションごとの UUID',
  },
  variableInitial: {
    zh: '初始值',
    en: 'Initial value',
    ja: '初期値',
  },
  variableKind: {
    zh: '变量类型',
    en: 'Kind',
    ja: '種類',
  },
  variableKindCaptured: {
    zh: '抓取值',
    en: 'Captured',
    ja: 'キャプチャ値',
  },
  variableKindChoice: {
    zh: '加权选择',
    en: 'Weighted choice',
    ja: '重み付き選択',
  },
  variableKindConstant: {
    zh: '常量',
    en: 'Constant',
    ja: '定数',
  },
  variableKindRandom: {
    zh: '随机',
    en: 'Random',
    ja: 'ランダム',
  },
  variableKindRandomWalk: {
    zh: '随机游走',
    en: 'Random walk',
    ja: 'ランダムウォーク',
  },
  variableKindRunStart: {
    zh: '开始时间',
    en: 'Start time',
    ja: '開始時刻',
  },
  variableKindSequence: {
    zh: '序列',
    en: 'Sequence',
    ja: 'シーケンス',
  },
  variableKindSession: {
    zh: '会话',
    en: 'Session',
    ja: 'セッション',
  },
  variableMax: {
    zh: '最大值',
    en: 'Max',
    ja: '最大値',
  },
  variableMin: {
    zh: '最小值',
    en: 'Min',
    ja: '最小値',
  },
  variableName: {
    zh: '变量名',
    en: 'Variable name',
    ja: '変数名',
  },
  variableOnBound: {
    zh: '越界时',
    en: 'On bound',
    ja: '範囲外のとき',
  },
  variableOptionValue: {
    zh: '候选值',
    en: 'Option',
    ja: '候補値',
  },
  variableOptionWeight: {
    zh: '权重',
    en: 'Weight',
    ja: '重み',
  },
  variableOptions: {
    zh: '候选值',
    en: 'Options',
    ja: '候補値',
  },
  variablePad: {
    zh: '补零位数',
    en: 'Zero padding',
    ja: 'ゼロ埋め桁数',
  },
  variablePrecision: {
    zh: '小数位',
    en: 'Decimals',
    ja: '小数桁',
  },
  variableRange: {
    zh: '单次浮动范围',
    en: 'Step range',
    ja: '1 回の変動幅',
  },
  variableResetAppStart: {
    zh: '应用启动',
    en: 'On app start',
    ja: 'アプリ起動時',
  },
  variableResetConnect: {
    zh: '连接成功',
    en: 'On connect',
    ja: '接続時',
  },
  variableResetDisconnect: {
    zh: '断开连接',
    en: 'On disconnect',
    ja: '切断時',
  },
  variableResetEverySec: {
    zh: '定时重置（秒）',
    en: 'Periodic reset (s)',
    ja: '定期リセット（秒）',
  },
  variableResetOnReconnect: {
    zh: '自动重连也重置',
    en: 'Also on auto reconnect',
    ja: '自動再接続でも',
  },
  variableResetTriggers: {
    zh: '重置时机',
    en: 'Reset on',
    ja: 'リセットのタイミング',
  },
  variableRunStartHint: {
    zh: '写在客户端变量上。这条连接的消息序列一开始，就把当时的毫秒时间戳写进来。同一次运行里每条消息读到的是同一次开始时间，再次运行会重新写入。',
    en: 'Use it as a client variable. When a message sequence on this connection starts, the variable becomes that moment in epoch milliseconds. Every message in the same run reads the same time, and starting the sequence again writes a new one.',
    ja: 'クライアント変数として使います。この接続のメッセージシーケンスが始まると、その瞬間のミリ秒タイムスタンプが書き込まれます。同じ実行中の各メッセージは同じ時刻を読み、もう一度実行すると新しい時刻になります。',
  },
  variableSeed: {
    zh: '随机种子',
    en: 'Random seed',
    ja: '乱数シード',
  },
  variableStep: {
    zh: '步长',
    en: 'Step',
    ja: 'ステップ',
  },
  variableStepTip: {
    zh: '可为负数或小数。',
    en: 'Negative values and decimals are allowed.',
    ja: '負数と小数が使えます。',
  },
  variableTemplate: {
    zh: '会话模板',
    en: 'Session template',
    ja: 'セッションテンプレート',
  },
  variableValue: {
    zh: '变量值',
    en: 'Variable value',
    ja: '変数の値',
  },
  variableValueTip: {
    zh: '变量值里也可以写占位符，例如 ${uuid}、${anotherVariable}。',
    en: 'A value may contain placeholders too, e.g. ${uuid} or ${anotherVariable}.',
    ja: '値にも ${uuid}、${anotherVariable} などのプレースホルダーを書けます。',
  },

  variableBoundClamp: {
    zh: '截断到边界',
    en: 'Clamp to bound',
    ja: '境界値に丸める',
  },
  variableBoundKeep: {
    zh: '保持越界值',
    en: 'Keep the value',
    ja: '値を保持',
  },
  variableBoundReset: {
    zh: '重置为初始值',
    en: 'Reset to initial',
    ja: '初期値に戻す',
  },
  variableBoundWrap: {
    zh: '循环回绕',
    en: 'Wrap around',
    ja: '折り返す',
  },
  variableNameInvalid: {
    zh: '只能使用字母、数字和下划线，且不能以数字开头',
    en: 'Use letters, digits and underscores only, and do not start with a digit',
    ja: '英数字とアンダースコアのみ使用でき、数字で始めることはできません',
  },
  variableNameReserved: {
    zh: '该名称是内置变量（如 ${timestamp}），不能重复定义',
    en: 'This name is a built-in variable (e.g. ${timestamp}) and cannot be redefined',
    ja: 'この名前は組み込み変数（例：${timestamp}）のため再定義できません',
  },
  variableNameDuplicate: {
    zh: '该变量名已存在',
    en: 'This variable name already exists',
    ja: 'この変数名は既に存在します',
  },
}
