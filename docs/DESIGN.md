# 设计方案

## 1. 使用模式

**模式 A：同事自助（推荐）** 同事安装插件 → 开始注册 → 插件填邮箱、勾条款 → 本人过 Turnstile、发送 → 在自己邮箱打开链接 → 插件引导创建 Key、捕获、生成配置。Key 只在本人电脑。

**模式 B：管理员代办** 管理员按名单逐个处理；同事把链接转给管理员粘贴打开；导出配置发给本人后删除本地 Key。切换下一个人前清除 apmix 域名 Cookie（需手动确认，`cookies` 为可选权限）。

## 2. 单人状态机

| 状态 | 插件 | 人 |
|---|---|---|
| pending | 校验域名白名单、未注册 | 选中同事 |
| filling | 打开登录页，填邮箱、勾条款，高亮验证区 | 过 Turnstile，点 Send magic link |
| awaiting_link | 监听提示语，记录发送时间；提供粘贴框 | 打开或粘贴链接 |
| signed_in | 跳到 Keys 页，预填 Key 名 | 点 Create key |
| key_captured | 识别 `apx_live_` 值并加密保存，生成配置 | 复制 / 导出 |
| delivered | 一键删除本地 Key，提示退出登录 | 确认 |
| failed | 记录原因，不自动重试 | 决定是否重来 |

## 3. 架构

```
entrypoints/
  background.ts       状态机、存储、连通性检测、标签页管理
  sidepanel/          名单、任务卡、结果、设置
  login.content.ts    登录页：填邮箱、勾条款、监听提示语
  keys.content.ts     Keys 页：预填 Key 名、MutationObserver 捕获 Key
utils/
  roster.ts           CSV 导入、去重、域名校验
  flow.ts             单人状态机
  selectors.ts        apmix 页面选择器集中管理
  vault.ts            PBKDF2 + AES-GCM 加密
  export.ts           配置模板
  messages.ts         background <-> UI 消息类型
tests/                Vitest
```

## 4. 安全

- 名单和 Key 只存 `chrome.storage.local`，Key 加密，口令不落盘
- 日志只含姓名、状态、时间，不含 Key 与链接
- 不向第三方发送任何数据；host 权限仅 apmix 主站与 API 域名

## 5. 里程碑

1. M1：脚手架、名单导入与校验、登录页填表、状态机
2. M2：Keys 页捕获、加密存储、配置导出、连通性检测
3. M3：模式 B（链接粘贴、会话切换）、页面浮层、异常处理
4. M4：多浏览器打包、测试、使用文档
