import { describe, expect, it } from 'vitest';
import { looksLikeActionRequest } from '@/domain/agent/intent';

describe('looksLikeActionRequest', () => {
  it.each([
    '把第一条建议标记为完成',
    '帮我暂停 Meta 的广告',
    '请删除这条建议',
    '将这个商品下线',
    '修改 Ridgeline 的标题',
    'Please mark the first recommendation as done.',
    'Mark it done',
    'Can you pause the Meta campaign?',
    'Could you please update the bid?',
    'Turn off the TikTok ads',
  ])('reads "%s" as a request to act', (question) => {
    expect(looksLikeActionRequest(question)).toBe(true);
  });

  it.each([
    'How did conversion change over the last 30 days?',
    'Which channel should I change first?',
    '过去 30 天，独立站最该优先排查什么？',
    '只看自然搜索呢？',
    '过去 30 天 Ridgeline 从自然搜索获得多少购买会话？',
    '标题长度设置得合理吗？',
    'What would change if Meta spend were paused?',
  ])('reads "%s" as a question about the data', (question) => {
    expect(looksLikeActionRequest(question)).toBe(false);
  });

  it('ignores leading spaces before an imperative', () => {
    expect(looksLikeActionRequest('   Mark it done')).toBe(true);
    expect(looksLikeActionRequest('  删除这条建议')).toBe(true);
  });

  it('normalises full-width text first', () => {
    expect(looksLikeActionRequest('Ｐｌｅａｓｅ mark it done')).toBe(true);
  });
});
