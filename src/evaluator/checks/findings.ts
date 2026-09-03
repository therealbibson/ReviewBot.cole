import type { EvaluationContext, Finding } from '../types.js';

export function generateFindings(context: EvaluationContext): Finding[] {
  const findings: Finding[] = [];
  const { repo, runtime, celo } = context;

  if (!repo.readme) {
    findings.push({
      title: 'Missing project README',
      severity: 'medium',
      category: 'usefulness',
      summary: 'The project does not expose basic onboarding or value explanation through a README.',
      evidence: ['README.md was not found on main or master.'],
      fix: 'Add a README with setup, purpose, architecture, and demo instructions.'
    });
  }

  if (!repo.signals.hasTests) {
    findings.push({
      title: 'No obvious automated tests',
      severity: 'high',
      category: 'engineeringMaturity',
      summary: 'Lightweight repo inspection did not find a clear automated test suite.',
      evidence: ['No test directories or *.test/*spec files detected.'],
      fix: 'Add smoke and integration tests for the core agent workflow and evaluation paths.'
    });
  }

  if (!runtime.reachable && (context.request.askBotUrl || context.request.askBot)) {
    findings.push({
      title: 'AskBot API is not verifiably reachable',
      severity: 'high',
      category: 'usefulness',
      summary: 'The provided AskBot configuration could not be confirmed as a healthy live API.',
      evidence: runtime.notes,
      fix: 'Expose a working public endpoint or provide the correct health/review paths and authentication details.'
    });
  }

  if (!repo.signals.mentionsCelo) {
    findings.push({
      title: 'Celo integration is weakly evidenced',
      severity: 'medium',
      category: 'celoIntegration',
      summary: 'The repo does not clearly demonstrate Celo-specific usage from README and package metadata.',
      evidence: ['No strong Celo keywords detected in lightweight repository inspection.'],
      fix: 'Document and implement concrete Celo flows, network configuration, and contract or wallet interactions.'
    });
  }

  if (celo.providedWallet && !celo.validWalletFormat) {
    findings.push({
      title: 'Invalid wallet address format',
      severity: 'high',
      category: 'safety',
      summary: 'The supplied wallet address is not a valid EVM address.',
      evidence: ['Wallet did not match /^0x[a-fA-F0-9]{40}$/.'],
      fix: 'Validate wallet addresses before analysis and require a proper checksummed or lowercase EVM address.'
    });
  }

  if (context.request.askBot?.reviewPath && (runtime.expectedKeysMatched?.length ?? 0) === 0 && (context.request.askBot.expectedResponseKeys?.length ?? 0) > 0) {
    findings.push({
      title: 'AskBot response contract is weakly matched',
      severity: 'medium',
      category: 'usefulness',
      summary: 'The AskBot probe succeeded or returned a response, but it did not match any expected response keys you configured.',
      evidence: ['Configured expected response keys were not present in the review response payload.'],
      fix: 'Align the configured expected keys with the live API contract or adjust the endpoint response shape.'
    });
  }


  if (!repo.signals.hasCI) {
    findings.push({
      title: 'No CI workflow detected',
      severity: 'medium',
      category: 'engineeringMaturity',
      summary: 'The repository does not appear to run automated checks in CI.',
      evidence: ['No .github/workflows files detected.'],
      fix: 'Add CI for typecheck, tests, and linting to catch regressions early.'
    });
  }

  if (!repo.signals.mentionsAskBot && (context.request.askBotUrl || context.request.askBot)) {
    findings.push({
      title: 'AskBot API provided but integration is not obvious in repo',
      severity: 'medium',
      category: 'usefulness',
      summary: 'The repo materials do not clearly describe the AskBot integration suggested by the provided runtime configuration.',
      evidence: ['AskBot configuration supplied, but lightweight repo inspection found no AskBot/Hypothesis references.'],
      fix: 'Document the AskBot surface area and include example requests, auth expectations, and usage flows.'
    });
  }

  return findings;
}
