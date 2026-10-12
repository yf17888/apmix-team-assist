# 设计方案

## 0. 已确认的决策（2026-10-12）

- 模式 A（同事自助）与模式 B（管理员代办）都做
- 规模约 1000 人：以模式 A 为主（每人在自己电脑上完成，几分钟/人，可并行推进）；模式 B 用于少量需要代办的情况。1000 人一个个代办不现实
- 规模较大，建议同时评估 apmix 官方 Business 方案（统一计费与管理）
- UI 不引入框架：侧栏只有名单、任务卡、设置三块，原生 TypeScript 足够，包体约 90 KB、无运行时依赖；名单分页（每页 50）支撑 1000+ 条

## 1. 使用模式

**模式 A：同事自助（推荐）** 同事安装插件 → 设置公司域名（或由管理员预置）→ 导入/填写自己的那一行 → 开始 → 插件填邮箱、勾条款 → 本人过人机验证、发送 → 在自己邮箱打开链接 → 插件引导创建 Key、捕获、生成配置。Key 只在本人电脑。

**模式 B：管理员代办** 管理员按名单逐个处理；同事把链接转给管理员粘贴打开（需本人同意）；导出交付文件发给本人后删除本地 Key。处理下一位前清除 apmix 登录状态（可选 `cookies` 权限）。

## 2. 单人状态机

| 状态 | 插件 | 人 |
|---|---|---|
| pending 待开始 | 校验域名白名单、未注册 | 点开始 |
| filling 待提交 | 打开登录页，填邮箱、勾条款，高亮发送按钮 | 过人机验证，点 Send magic link |
| awaiting_link 待登录链接 | 识别"已发送"提示；模式 B 提供链接粘贴框（只接受 apmix.ai https） | 打开或粘贴链接 |
| signed_in 已登录 | 进入 dashboard 后跳到 Keys 页，预填 Key 名 | 点 Create key |
| key_captured 已取得 | 只捕获新出现的完整 `apx_live_` Key，加密保存；核对页面上是否出现该邮箱 | 复制 / 导出交付 |
| delivered 已交付 | 删除本地 Key | 确认 |
| failed 失败 | 记录原因（如邮箱被拒），不自动重试 | 手动重置 |

同一时间只允许一个进行中的任务；非法状态跳转在后台被拒绝。

## 3. 架构

```
entrypoints/
  background.ts       状态机、存储、消息校验、标签页管理、Cookie 清理（模式 B）
  sidepanel/          名单（搜索/筛选/分页/统计）、任务卡、Key 详情、设置
  login.content.ts    登录页：填邮箱、勾条款、监听"已发送/被拒"提示、右下角浮层
  keys.content.ts     Keys 页：预填 Key 名、MutationObserver 捕获新 Key
utils/
  types.ts            数据结构
  roster.ts           CSV 导入导出、去重、域名校验、Key 命名
  flow.ts             状态迁移规则与提示语
  selectors.ts        apmix 页面选择器与 URL 校验（改版只改这里）
  dom.ts              表单写入（兼容 React 受控组件）、高亮
  vault.ts            PBKDF2(25 万次) + AES-GCM 加密
  export.ts           配置模板、交付文件、/v1/models 连通性检测
  overlay.ts          页面浮层（Shadow DOM）
tests/                Vitest + happy-dom
```

## 4. 安全

- Key 用本地口令加密存 `storage.local`；解锁后的密钥只放 `storage.session`，关闭浏览器即失效
- 未解锁时捕获的 Key 暂存 session，解锁后自动加密落盘
- 后台只接受本扩展与 apmix.ai 页面的消息；名单导出不含 Key
- 不读取邮箱、不接入打码平台、不使用代理、不向第三方发送任何数据

## 5. 进度

- [x] M1 脚手架、名单导入与校验、登录页填表、状态机
- [x] M2 Keys 页捕获、加密存储、配置导出、连通性检测
- [x] M3 模式 B（链接粘贴、会话清理）、页面浮层、异常处理、分页
- [x] M4 Chrome / Edge / Firefox 构建、单测、GitHub Actions
- [ ] 在真实 apmix 页面上核对 `utils/selectors.ts` 的选择器与提示语
