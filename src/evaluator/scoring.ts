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
  const safety = scoreCategory(context, 'safety', 78);
  const economicViability = scoreCategory(context, 'economicViability', 60);
  const celoIntegration = scoreCategory(context, 'celoIntegration', context.repo.signals.mentionsCelo ? 78 : 45);
  const engineeringMaturity = scoreCategory(context, 'engineeringMaturity', 68);

  const weighted =
    usefulness.score * (WEIGHTS.usefulness / 100) +
    safety.score * (WEIGHTS.safety / 100) +
    economicViability.score * (WEIGHTS.economicViability / 100) +
    celoIntegration.score * (WEIGHTS.celoIntegration / 100) +
    engineeringMaturity.score * (WEIGHTS.engineeringMaturity / 100);

  const confidence = Math.max(0.35, Math.min(0.95, (context.evidence.length * 0.06) + (context.request.askBotUrl ? 0.1 : 0) + (context.request.walletAddress ? 0.08 : 0)));

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
