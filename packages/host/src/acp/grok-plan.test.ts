import { describe, expect, it } from 'vitest';
import { grokPlanSchema, permissionOfGrokPlan, grokPlanResponseOf } from '#acp/grok-plan.js';

describe('Grok plan approval', () => {
  it('should carry the plan and session identity into the existing permission gate', () => {
    const request = permissionOfGrokPlan(
      grokPlanSchema.parse({ sessionId: 's1', toolCallId: 'p1', planContent: 'Build a cube.' }),
    );
    expect(request.sessionId).toBe('s1');
    expect(request.toolCall).toMatchObject({
      toolCallId: 'p1',
      content: [{ type: 'content', content: { type: 'text', text: 'Build a cube.' } }],
    });
    expect(request.options.map((option) => option.kind)).toEqual(['allow_once', 'reject_once']);
  });
  it('should approve only the exact approval choice and cancel every refusal', () => {
    expect(grokPlanResponseOf({ outcome: { outcome: 'selected', optionId: 'approve-plan' } })).toEqual({
      outcome: 'approved',
    });
    expect(grokPlanResponseOf({ outcome: { outcome: 'selected', optionId: 'reject-plan' } })).toEqual({
      outcome: 'cancelled',
    });
    expect(grokPlanResponseOf({ outcome: { outcome: 'cancelled' } })).toEqual({ outcome: 'cancelled' });
    expect(grokPlanResponseOf({ outcome: { outcome: 'selected', optionId: 'unexpected' } })).toEqual({
      outcome: 'cancelled',
    });
  });
});
