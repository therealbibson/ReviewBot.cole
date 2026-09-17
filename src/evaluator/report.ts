import type { EvaluationContext, ImprovementStep, ReviewReport, ScoreBreakdown } from './types.js';

export function buildReviewReport(context: EvaluationContext, scores: ScoreBreakdown): ReviewReport {
  const whatWorks = inferWhatWorks(context);
  const whatIsBroken = context.findings.map((finding) => finding.title);
  const improvementPlan = buildImprovementPlan(context);
  const projectName = context.request.projectName || context.repo.packageJson?.name || context.repo.repo || 'Unnamed Celo Project';
  const summary = summarize(scores.overall, context.findings.length, scores.confidence);

  const trustVerdict = buildTrustVerdict(scores, context);

  const walletAuditSection = context.celo.providedWallet
    ? [
        `## Celo Wallet & Ownership Audit`,
        `- **Address**: ${context.request.walletAddress}`,
        `- **Ownership Verified**: ${
          context.celo.walletOwnershipVerified
            ? '✓ YES — Cryptographically verified via personal_sign signature on Celo'
            : '⚠️ NO — Unverified (no valid cryptographic proof of private key control)'
        }`,
        `- **Network**: ${context.celo.onChain.network}`,
        `- **On-Chain Balance**: ${context.celo.onChain.balanceCelo ?? 0} CELO`,
        `- **Transaction Count**: ${context.celo.onChain.transactionCount ?? 0}`,
        `- **Account Type**: ${context.celo.onChain.isContract ? 'Smart Contract' : 'Standard EOA'}`,
        ``
      ]
    : [
        `## Celo Wallet & Ownership Audit`,
        `- **Status**: No wallet provided. On-chain balance, activity, and economic viability could not be audited.`,
        ``
      ];

  const markdown = [
    `# On-Chain Agent Audit`,
    ``,
    `## Final Score`,
    `${scores.overall}/100`,
    ``,
    `## Trust Verdict`,
    trustVerdict,
    ``,
    `## Verdict`,
    summary,
    ``,
    ...walletAuditSection,
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
      walletAddress: context.request.walletAddress,
      walletOwnershipVerified: context.celo.walletOwnershipVerified,
      walletSignature: context.request.walletSignature,
      walletSignatureMessage: context.request.walletSignatureMessage,
      celoNetwork: context.celo.onChain.network
    },
    summary,
    trustVerdict,
    whatWorks,
    whatIsBroken,
    evidence: context.evidence,
    findings: context.findings,
    scores,
    improvementPlan,
    markdown
  };
}

function buildTrustVerdict(scores: ScoreBreakdown, context: EvaluationContext): string {
  let usefulLabel = tierLabel(scores.usefulness.score);
  let safeLabel = tierLabel(scores.safety.score);
  let viableLabel = tierLabel(scores.economicViability.score);

  // If a wallet was submitted without verified cryptographic ownership,
  // safety and viability cannot be marked "Yes"
  if (context.celo.providedWallet && !context.celo.walletOwnershipVerified) {
    if (safeLabel === 'Yes') safeLabel = 'Uncertain';
    if (viableLabel === 'Yes') viableLabel = 'Uncertain';
  }

  return `Useful: ${usefulLabel}. Safe: ${safeLabel}. Economically viable: ${viableLabel}.`;
}

function tierLabel(score: number): string {
  if (score >= 70) return 'Yes';
  if (score >= 45) return 'Uncertain';
  return 'No';
}

function inferWhatWorks(context: EvaluationContext): string[] {
  const works = new Set<string>();
  if (context.repo.readme) works.add('The project has discoverable documentation through a README.');
  if (context.runtime.reachable) works.add('The provided AskBot endpoint is reachable.');
  if (context.repo.signals.mentionsCelo) works.add('The repository shows concrete signs of Celo-related implementation or configuration.');
  if (context.repo.signals.hasCI) works.add('The repository appears to include automated CI workflows.');
  if (context.repo.signals.hasTests) works.add('The repository appears to include automated tests.');

  if (context.celo.onChain.checked) {
    if ((context.celo.onChain.transactionCount ?? 0) > 0 || (context.celo.onChain.balanceCelo ?? 0) > 0) {
      if (context.celo.walletOwnershipVerified) {
        works.add(`The agent's verified Celo wallet has on-chain balance (${context.celo.onChain.balanceCelo ?? 0} CELO) and verifiable transaction history.`);
      }
    }
  }

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
