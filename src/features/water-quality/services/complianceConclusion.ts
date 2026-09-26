/**
 * complianceConclusion.ts
 *
 * Статус выполнения анализа и заключение о норме считаются отдельно.
 * «Не проверено» не подменяется словом «норма».
 */

export type ComplianceConclusion = 'unchecked' | 'compliant' | 'non_compliant';

export interface ComplianceDecision {
  ok: boolean;
  conclusion: ComplianceConclusion;
  error?: string;
}

export function concludeCompliance(input: {
  measuredCount: number;
  exceededCount: number;
  normsChecked: boolean;
  manualConclusion?: 'compliant' | 'non_compliant' | null;
  manualBasis?: string;
}): ComplianceDecision {
  if (input.manualConclusion) {
    if (!input.manualBasis?.trim()) {
      return {
        ok: false,
        conclusion: 'unchecked',
        error: 'Ручное заключение требует основание',
      };
    }
    return { ok: true, conclusion: input.manualConclusion };
  }
  if (input.measuredCount === 0 || !input.normsChecked) {
    return { ok: true, conclusion: 'unchecked' };
  }
  if (input.exceededCount > 0) {
    return { ok: true, conclusion: 'non_compliant' };
  }
  return { ok: true, conclusion: 'compliant' };
}
