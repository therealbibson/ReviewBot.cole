import { collectCeloSnapshot } from './collectors/celo.js';
import { collectRepoSnapshot } from './collectors/repo.js';
import { collectRuntimeSnapshot } from './collectors/runtime.js';
import { generateFindings } from './checks/findings.js';
import { buildReviewReport } from './report.js';
import { scoreEvaluation } from './scoring.js';
import type { EvaluationContext, ReviewReport, ReviewRequest } from './types.js';

export async function evaluateProject(request: ReviewRequest): Promise<ReviewReport> {
  const evidence = [] as EvaluationContext['evidence'];
  const repo = await collectRepoSnapshot(request, evidence);
  const runtime = await collectRuntimeSnapshot(request, evidence);
  const celo = await collectCeloSnapshot(request, repo, evidence);

  const context: EvaluationContext = {
    request,
    repo,
    runtime,
    celo,
    evidence,
    findings: []
  };

  context.findings = generateFindings(context);
  const scores = scoreEvaluation(context);
  return buildReviewReport(context, scores);
}
