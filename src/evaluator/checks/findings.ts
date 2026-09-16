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

  if (!celo.providedWallet) {
    findings.push({
      title: 'No wallet provided for on-chain audit',
      severity: 'high',
      category: 'economicViability',
      summary: 'Without a Celo wallet address, this audit cannot verify real on-chain activity, balance, or economic viability before trusting this agent with money.',
      evidence: ['No walletAddress was supplied in the review request.'],
      fix: 'Provide the agent\'s Celo wallet address so ReviewBot can verify balance, transaction history, and account type on-chain.'
    });
  } else if (celo.validWalletFormat && celo.onChain.checked) {
    if ((celo.onChain.transactionCount ?? 0) === 0 && (celo.onChain.balanceCelo ?? 0) === 0) {
      findings.push({
        title: 'No on-chain track record',
        severity: 'high',
        category: 'economicViability',
        summary: 'The provided wallet has zero CELO balance and zero outgoing transactions, so there is no verifiable on-chain history to support trust.',
        evidence: [`Balance: ${celo.onChain.balanceCelo ?? 0} CELO. Transaction count: ${celo.onChain.transactionCount ?? 0}.`],
        fix: 'Do not rely on this agent with real funds until it has demonstrated verifiable on-chain activity and a track record.'
      });
    }

    if (celo.onChain.isContract) {
      findings.push({
        title: 'Wallet address is a smart contract',
        severity: 'medium',
        category: 'safety',
        summary: 'The supplied address is a smart contract rather than a simple wallet, so it may execute arbitrary logic when receiving funds or calls.',
        evidence: ['eth_getCode returned non-empty bytecode for this address.'],
        fix: 'Review the contract source and permissions before trusting it with funds, and confirm it has been audited if it manages user assets.'
      });
    }
  } else if (celo.validWalletFormat && !celo.onChain.checked && celo.onChain.network !== 'not-applicable') {
    findings.push({
      title: 'On-chain audit could not be completed',
      severity: 'medium',
      category: 'economicViability',
      summary: 'ReviewBot could not reach the Celo RPC endpoint to verify this wallet, so economic viability could not be confirmed on-chain.',
      evidence: [celo.onChain.error ?? 'RPC request failed.'],
      fix: 'Retry the review, or verify the wallet address and network manually before trusting this agent with funds.'
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



  if (celo.providedWallet && celo.validWalletFormat && celo.onChain.checked) {
    findings.push({
      title: 'Wallet ownership not verified',
      severity: 'high',
      category: 'safety',
      summary: 'The wallet balance and activity were checked, but ReviewBot did not verify that this wallet actually belongs to the project submitter. Anyone can provide any public wallet address.',
      evidence: ['No signature or on-chain registration was used to prove the submitter controls this wallet.'],
      fix: 'Require a signed message from the wallet (e.g. personal_sign) or cross-check the wallet against a registered agent address on askbots.ai before trusting it.'
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
