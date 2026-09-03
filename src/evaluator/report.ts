import type { EvaluationContext, ImprovementStep, ReviewReport, ScoreBreakdown } from './types.js';

export function buildReviewReport(context: EvaluationContext, scores: ScoreBreakdown): ReviewReport {
  const whatWorks = inferWhatWorks(context);
  const whatIsBroken = context.findings.map((finding) => finding.title);
  const improvementPlan = buildImprovementPlan(context);
  const projectName = context.request.projectName ?? context.repo.packageJson?.name ?? context.repo.repo;
  const summary = summarize(scores.overall, context.findings.length, scores.confidence);

  const markdown = [
    `# Review Summary`,
    ``,
    `## Final Score`,
    `${scores.overall}/100`,
    ``,
    `## Verdict`,
    summary,
    ``,
    `## What Works`,
    ...whatWorks.map((item) => `- ${item}`),
    ``,
    `## What Is Broken`,
    ...whatIsBroken.map((item) => `- ${item}`),
    ``,
    `## Evidence`,
    ...context.evidence.map((item) => `- **${item.label}** (${item.status}): ${item.detail}`),
    ``,
    `## Findings by Severity`,
    ...['critical', 'high', 'medium', 'low'].flatMap((severity) => {
      const matching = context.findings.filter((finding) => finding.severity === severity);
      if (matching.length === 0) return [];
      return [
        `### ${capitalize(severity)}`,
        ...matching.map(
          (finding) => `- **${finding.title}** (${finding.category}): ${finding.summary} Fix: ${finding.fix}`
        ),
        ``
      ];
    }),
    `## Score Breakdown`,
    `- Usefulness: ${scores.usefulness.score}`,
    `- Safety: ${scores.safety.score}`,
    `- Economic viability: ${scores.economicViability.score}`,
    `- Celo integration: ${scores.celoIntegration.score}`,
    `- Engineering maturity: ${scores.engineeringMaturity.score}`,
    `- Confidence: ${scores.confidence}`,
    ``,
    `## Prioritized Improvement Plan`,
    ...improvementPlan.map((step) => `${step.priority}. **${step.title}** — ${step.rationale}`)
  ].join('\n');

  return {
    project: {
      name: projectName,
      repoUrl: context.request.repoUrl,
      askBotUrl: context.request.askBotUrl,
      walletAddress: context.request.walletAddress
    },
    summary,
    whatWorks,
    whatIsBroken,
    evidence: context.evidence,
    findings: context.findings,
    scores,
    improvementPlan,
    markdown
  };
}

function inferWhatWorks(context: EvaluationContext): string[] {
  const works = new Set<string>();
  if (context.repo.readme) works.add('The project has discoverable documentation through a README.');
  if (context.runtime.reachable) works.add('The provided AskBot endpoint is reachable.');
  if (context.repo.signals.mentionsCelo) works.add('The repository shows concrete signs of Celo-related implementation or configuration.');
  if (context.repo.signals.hasCI) works.add('The repository appears to include automated CI workflows.');
  if (context.repo.signals.hasTests) works.add('The repository appears to include automated tests.');
  if (works.size === 0) works.add('The repository is publicly inspectable, enabling evidence-driven review.');
  return Array.from(works);
}

function buildImprovementPlan(context: EvaluationContext): ImprovementStep[] {
  return context.findings
    .slice()
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 5)
    .map((finding, index) => ({
      priority: (index + 1) as 1 | 2 | 3 | 4 | 5,
      title: finding.title,
      rationale: finding.fix
    }));
}

function severityRank(severity: 'critical' | 'high' | 'medium' | 'low'): number {
  switch (severity) {
    case 'critical':
      return 0;
    case 'high':
      return 1;
    case 'medium':
      return 2;
    case 'low':
      return 3;
  }
}

function summarize(overall: number, findingCount: number, confidence: number): string {
  if (overall >= 80) return `Strong foundation with ${findingCount} notable issues. Confidence ${confidence}.`;
  if (overall >= 60) return `Promising but not production-ready; ${findingCount} issues require attention. Confidence ${confidence}.`;
  if (overall >= 40) return `Partially convincing, but material gaps remain across product, safety, or execution. Confidence ${confidence}.`;
  return `Currently weak based on collected evidence; substantial remediation is needed. Confidence ${confidence}.`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
