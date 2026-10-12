# APMIX Team Assist

公司内部使用的 apmix.ai **团队辅助注册**浏览器插件（WXT + TypeScript，Chrome / Edge / Firefox MV3）。

为每位同事用其公司邮箱开通**一个** apmix 账号，并把 API Key 安全交付给本人。插件负责填表、跟进状态、捕获 Key、导出配置；验证码和登录链接始终由人完成。

> 非 apmix 官方项目。

## 原则

- 一个同事 = 一个公司邮箱 = 一个账号；名单去重，只允许设置中的公司域名
- Cloudflare Turnstile 由人手动完成，不接入任何打码平台
- 一次只处理一个人：无并发、无代理、无定时批量
- 不读取邮箱；magic link 由本人打开，或经本人同意后由管理员粘贴
- Key 只存本机（加密），交付后建议删除

## 功能

- 名单导入（CSV：姓名, 邮箱, 部门）与状态跟踪
- 登录页自动填邮箱、勾选条款
- Keys 页预填 Key 名、捕获新建的 `apx_live_` Key
- 导出 Claude Code / Codex CLI / Cursor / curl 配置，`/v1/models` 连通性检测

## 开发

需要 Node.js 22+。

```bash
npm install
npm run dev            # Chrome 开发模式
npm run build:all      # 构建 Chrome / Edge / Firefox
npm test
```

加载：Chrome / Edge 扩展管理页开启开发者模式 → 加载已解压的扩展程序 → `.output/chrome-mv3`。

设计详见 [docs/DESIGN.md](docs/DESIGN.md)。
