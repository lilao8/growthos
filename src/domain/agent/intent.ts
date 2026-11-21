/**
 * Whether a question asks the agent to change something.
 *
 * The agent can change nothing, so the answer to such a question is always
 * "not executed" — and GrowthOS says so itself, whatever the model writes or
 * tries. Imperatives only: "How did conversion change?" is a question about
 * the data, not a request to change it.
 */
const CN_ACTION = '(标记|标为|删除|修改|改成|改为|暂停|关闭|发送|调整|设置|更新|上线|下线|提交)';
const EN_ACTION = '(mark|delete|remove|pause|send|apply|update|change|set|disable|enable|turn off|turn on|publish|archive)';

const ACTION_REQUEST = new RegExp(
  [
    `(把|将)[^。？?！!]{0,20}${CN_ACTION}`,
    `^(请|帮我|麻烦|请帮我)?${CN_ACTION}`,
    `(帮我|请你|麻烦你)[^。？?！!]{0,10}${CN_ACTION}`,
    `^(please\\s+)?${EN_ACTION}\\b`,
    `\\b(can|could|would|will) you\\s+(please\\s+)?${EN_ACTION}\\b`,
    `\\bplease\\s+${EN_ACTION}\\b`,
  ].join('|'),
  'i',
);

export function looksLikeActionRequest(question: string): boolean {
  return ACTION_REQUEST.test(question.normalize('NFKC').trim());
}
