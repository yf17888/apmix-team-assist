import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'APMIX Team Assist',
    description: '团队辅助注册 apmix.ai：一人一号，人工验证，本地加密保存 Key',
    permissions: ['storage', 'sidePanel', 'tabs'],
    optional_permissions: ['cookies'],
    host_permissions: ['https://apmix.ai/*', 'https://api.apmix.ai/*'],
    action: { default_title: 'APMIX Team Assist' },
  },
});
