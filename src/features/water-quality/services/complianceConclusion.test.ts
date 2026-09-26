import { describe, expect, it } from 'vitest';
import { concludeCompliance } from './complianceConclusion';

describe('concludeCompliance', () => {
  it('does not treat a finished analysis without measurements as compliant', () => {
    const decision = concludeCompliance({
      measuredCount: 0,
      exceededCount: 0,
      normsChecked: true,
    });
    expect(decision.conclusion).toBe('unchecked');
  });

  it('marks exceeded results as non-compliant even when the analysis is finished', () => {
    const decision = concludeCompliance({
      measuredCount: 2,
      exceededCount: 1,
      normsChecked: true,
    });
    expect(decision.conclusion).toBe('non_compliant');
  });

  it('rejects a manual conclusion without a basis', () => {
    const decision = concludeCompliance({
      measuredCount: 1,
      exceededCount: 1,
      normsChecked: true,
      manualConclusion: 'compliant',
      manualBasis: '  ',
    });
    expect(decision.ok).toBe(false);
    expect(decision.conclusion).toBe('unchecked');
  });
});
