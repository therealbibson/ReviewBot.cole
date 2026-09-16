import type { Category, CategoryScore, EvaluationContext, ScoreBreakdown } from './types.js';

const WEIGHTS: Record<Category, number> = {
  usefulness: 30,
  safety: 25,
  economicViability: 20,
  celoIntegration: 15,
  engineeringMaturity: 10
};

export function scoreEvaluation(context: EvaluationContext): ScoreBreakdown {
  const usefulness = scoreCategory(context, 'usefulness', 75);
  const safety = scoreCategory(context, 'safety', safetyStartingScore(context));
  const economicViability = scoreCategory(context, 'economicViability', economicViabilityStartingScore(context));
  const celoIntegration = scoreCategory(context, 'celoIntegration', context.repo.signals.mentionsCelo ? 78 : 45);
  const engineeringMaturity = scoreCategory(context, 'engineeringMaturity', 68);

  const weighted =
    usefulness.score * (WEIGHTS.usefulness / 100) +
    safety.score * (WEIGHTS.safety / 100) +
    economicViability.score * (WEIGHTS.economicViability / 100) +
    celoIntegration.score * (WEIGHTS.celoIntegration / 100) +
    engineeringMaturity.score * (WEIGHTS.engineeringMaturity / 100);

  const onChainVerified = context.celo.onChain.checked;
  const confidence = Math.max(
    0.3,
    Math.min(
      0.95,
      (context.evidence.length * 0.05) +
        (context.request.askBotUrl || context.request.askBot ? 0.1 : 0) +
        (onChainVerified ? 0.15 : 0) + (context.celo.walletOwnershipVerified ? 0.1 : 0)
    )
  );

  return {
    usefulness,
    safety,
    economicViability,
    celoIntegration,
    engineeringMaturity,
    overall: Math.round(weighted),
    confidence: Number(confidence.toFixed(2))
  };
}

function safetyStartingScore(context: EvaluationContext): number {
  if (!context.celo.providedWallet) return 60;
  if (context.celo.walletOwnershipVerified) return 88;
  if (context.celo.onChain.checked) return context.celo.onChain.isContract ? 68 : 78;
  return 65;
}

function economicViabilityStartingScore(context: EvaluationContext): number {
  if (!context.celo.providedWallet) return 35;
  if (!context.celo.onChain.checked) return 45;

  const hasActivity = (context.celo.onChain.transactionCount ?? 0) > 0 || (context.celo.onChain.balanceCelo ?? 0) > 0;
  return hasActivity ? 75 : 40;
}

function scoreCategory(context: EvaluationContext, category: Category, startingScore: number): CategoryScore {
  const penalties = context.findings
    .filter((finding) => finding.category === category)
    .reduce((sum, finding) => sum + severityPenalty(finding.severity), 0);

  const score = clamp(startingScore - penalties, 5, 95);

  return {
    score,
    summary: categorySummary(category, score)
  };
}

function severityPenalty(severity: 'critical' | 'high' | 'medium' | 'low'): number {
  switch (severity) {
    case 'critical':
      return 35;
    case 'high':
      return 20;
    case 'medium':
      return 10;
    case 'low':
      return 5;
  }
}

function categorySummary(category: Category, score: number): string {
  const tier = score >= 81 ? 'strong' : score >= 61 ? 'solid' : score >= 41 ? 'partial' : score >= 21 ? 'weak' : 'critical';
  return `${labelForCategory(category)} is ${tier}.`;
}

function labelForCategory(category: Category): string {
  switch (category) {
    case 'usefulness':
      return 'Usefulness';
    case 'safety':
      return 'Safety';
    case 'economicViability':
      return 'Economic viability';
    case 'celoIntegration':
      return 'Celo integration';
    case 'engineeringMaturity':
      return 'Engineering maturity';
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
