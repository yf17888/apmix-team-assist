export default defineBackground(() => {
  // 点击工具栏图标打开侧栏
  browser.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
  // TODO(M1): 状态机消息处理、名单存储
});
