import { LOGIN } from '@/utils/selectors';

export default defineContentScript({
  matches: ['https://apmix.ai/login*'],
  main() {
    // TODO(M1): 收到 background 指令后填邮箱、勾条款；Turnstile 与提交由人完成
    void LOGIN;
  },
});
