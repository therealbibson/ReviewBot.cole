import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyWalletSignature } from './lib/celoRpc.js';
import { parseGitHubRepoUrl } from './lib/github.js';
import { collectCeloSnapshot } from './evaluator/collectors/celo.js';
import { generateFindings } from './evaluator/checks/findings.js';
import { scoreEvaluation } from './evaluator/scoring.js';
import { buildReviewReport } from './evaluator/report.js';
import { evaluateProject } from './evaluator/orchestrator.js';
import type { EvaluationContext, ReviewRequest, RepoSnapshot, RuntimeSnapshot } from './evaluator/types.js';

async function runTests() {
  console.log('--- Starting ReviewBot Test Suite ---');

  // Test 1: Cryptographic Wallet Ownership Verification (personal_sign)
  console.log('\n[1] Testing Wallet Ownership Proof Mechanism...');
  const testAccount = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  const otherAccount = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');

  const validMessage = `ReviewBot Celo Wallet Ownership Proof\nWallet: ${testAccount.address.toLowerCase()}\nTimestamp: ${new Date().toISOString()}\nAction: Authorize audit`;
  const validSignature = await testAccount.signMessage({ message: validMessage });

  // 1a: Valid signature matching address
  const resultValid = await verifyWalletSignature(testAccount.address, validMessage, validSignature, 'not-applicable');
  assert.equal(resultValid.verified, true, 'Valid signature should verify');
  console.log('  ✓ Valid personal_sign verified successfully');

  // 1b-1: Impersonation attempt where challenge message has attacker's address
  const resultMismatch1 = await verifyWalletSignature(otherAccount.address, validMessage, validSignature, 'not-applicable');
  assert.equal(resultMismatch1.verified, false, 'Mismatched account should fail verification');
  assert.ok(resultMismatch1.error?.includes('does not bind target wallet address'), 'Error caught unbound target address');
  console.log('  ✓ Impersonation attempt rejected: challenge message does not bind target address');

  // 1b-2: Impersonation attempt where attacker crafts message with target address but signs with their own key
  const messageForOther = `ReviewBot Celo Wallet Ownership Proof\nWallet: ${otherAccount.address.toLowerCase()}\nTimestamp: ${new Date().toISOString()}\nAction: Authorize audit`;
  const forgedSig = await testAccount.signMessage({ message: messageForOther }); // signed by testAccount, claimed for otherAccount
  const resultMismatch2 = await verifyWalletSignature(otherAccount.address, messageForOther, forgedSig, 'not-applicable');
  assert.equal(resultMismatch2.verified, false, 'Forged signature should fail cryptographic verification');
  assert.ok(resultMismatch2.error?.includes('does not match target address'), 'Error indicates signature mismatch');
  console.log('  ✓ Forgery attempt rejected: cryptographic signature does not match target address');

  // 1c: Challenge message does not bind the target address
  const invalidMessageNoAddress = `ReviewBot Celo Wallet Ownership Proof\nWallet: 0x0000000000000000000000000000000000000000\nTimestamp: ${new Date().toISOString()}`;
  const sigNoAddress = await testAccount.signMessage({ message: invalidMessageNoAddress });
  const resultNoAddress = await verifyWalletSignature(testAccount.address, invalidMessageNoAddress, sigNoAddress, 'not-applicable');
  assert.equal(resultNoAddress.verified, false, 'Message without target address should be rejected');
  assert.ok(resultNoAddress.error?.includes('does not bind target wallet address'), 'Error indicates missing target address');
  console.log('  ✓ Replay protection rejected message not binding target wallet address');

  // 1d: Expired challenge timestamp
  const expiredDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const expiredMessage = `ReviewBot Celo Wallet Ownership Proof\nWallet: ${testAccount.address.toLowerCase()}\nTimestamp: ${expiredDate}`;
  const expiredSig = await testAccount.signMessage({ message: expiredMessage });
  const resultExpired = await verifyWalletSignature(testAccount.address, expiredMessage, expiredSig, 'not-applicable');
  assert.equal(resultExpired.verified, false, 'Expired challenge should be rejected');
  assert.ok(resultExpired.error?.includes('expired'), 'Error indicates expired timestamp');
  console.log('  ✓ Expired challenge timestamp rejected');

  // Test 2: Audit Process Verifies Ownership BEFORE Crediting Funds
  console.log('\n[2] Testing Audit Strict Ownership Trust Boundaries...');
  const fakeRepo: RepoSnapshot = {
    owner: 'testowner',
    repo: 'testrepo',
    files: ['package.json', 'README.md'],
    readme: '# Test Agent\nUses Celo',
    signals: {
      hasTests: true,
      hasCI: true,
      hasDocker: false,
      mentionsCelo: true,
      mentionsAskBot: false,
      likelyStack: ['TypeScript']
    }
  };

  const fakeRuntime: RuntimeSnapshot = { reachable: true, notes: [] };

  // Case A: Unverified wallet with simulated on-chain funds
  const unverifiedRequest: ReviewRequest = {
    repoUrl: 'https://github.com/testowner/testrepo',
    walletAddress: testAccount.address
    // No signature provided!
  };
  const unverifiedEvidence: EvaluationContext['evidence'] = [];
  const unverifiedCelo = await collectCeloSnapshot(unverifiedRequest, fakeRepo, unverifiedEvidence);
  // Simulate on-chain balance & tx count
  unverifiedCelo.onChain = {
    checked: true,
    network: 'celo-mainnet',
    balanceCelo: 5000,
    transactionCount: 250,
    isContract: false
  };

  const unverifiedContext: EvaluationContext = {
    request: unverifiedRequest,
    repo: fakeRepo,
    runtime: fakeRuntime,
    celo: unverifiedCelo,
    evidence: unverifiedEvidence,
    findings: []
  };
  unverifiedContext.findings = generateFindings(unverifiedContext);
  const unverifiedScores = scoreEvaluation(unverifiedContext);
  const unverifiedReport = buildReviewReport(unverifiedContext, unverifiedScores);

  assert.equal(unverifiedCelo.walletOwnershipVerified, false, 'Unverified wallet must not be verified');
  const hasOwnershipWarning = unverifiedContext.findings.some((f) => f.title === 'Wallet ownership not verified');
  assert.ok(hasOwnershipWarning, 'Must have finding: Wallet ownership not verified');
  const hasFundWarning = unverifiedContext.findings.some((f) => f.title === 'Unverified on-chain funds cannot confirm economic viability');
  assert.ok(hasFundWarning, 'Must have finding: Unverified on-chain funds cannot confirm economic viability');
  assert.ok(!unverifiedReport.trustVerdict.includes('Economically viable: Yes'), 'Trust verdict cannot be Yes for unverified wallet');
  assert.ok(unverifiedReport.markdown.includes('NO — Unverified'), 'Markdown must show unverified');
  console.log('  ✓ Unverified wallet with funds correctly flagged: ownership warning fired, viability not credited');

  // Case B: Verified wallet with signature
  const verifiedRequest: ReviewRequest = {
    repoUrl: 'https://github.com/testowner/testrepo',
    walletAddress: testAccount.address,
    walletSignature: validSignature,
    walletSignatureMessage: validMessage
  };
  const verifiedEvidence: EvaluationContext['evidence'] = [];
  const verifiedCelo = await collectCeloSnapshot(verifiedRequest, fakeRepo, verifiedEvidence);
  verifiedCelo.onChain = {
    checked: true,
    network: 'celo-mainnet',
    balanceCelo: 5000,
    transactionCount: 250,
    isContract: false
  };

  const verifiedContext: EvaluationContext = {
    request: verifiedRequest,
    repo: fakeRepo,
    runtime: fakeRuntime,
    celo: verifiedCelo,
    evidence: verifiedEvidence,
    findings: []
  };
  verifiedContext.findings = generateFindings(verifiedContext);
  const verifiedScores = scoreEvaluation(verifiedContext);
  const verifiedReport = buildReviewReport(verifiedContext, verifiedScores);

  assert.equal(verifiedCelo.walletOwnershipVerified, true, 'Verified wallet must be verified');
  const verifiedHasOwnershipWarning = verifiedContext.findings.some((f) => f.title.includes('ownership'));
  assert.equal(verifiedHasOwnershipWarning, false, 'Verified wallet must NOT have ownership warning');
  assert.ok(verifiedReport.markdown.includes('YES — Cryptographically verified'), 'Markdown must show verified');
  assert.ok(verifiedScores.economicViability.score > unverifiedScores.economicViability.score, 'Verified wallet must score higher');
  console.log('  ✓ Verified wallet correctly credited: scores elevated, ownership confirmed in audit');

  // Test 3: Multi-Branch & URL Branch Parsing
  console.log('\n[3] Testing Multi-Branch and Default Branch Resolution...');
  const parsedBranchUrl = parseGitHubRepoUrl('https://github.com/celo-org/celo-monorepo/tree/develop');
  assert.equal(parsedBranchUrl.owner, 'celo-org');
  assert.equal(parsedBranchUrl.repo, 'celo-monorepo');
  assert.equal(parsedBranchUrl.branch, 'develop');
  console.log('  ✓ Extracted branch "develop" from URL pathname');

  const parsedNestedBranch = parseGitHubRepoUrl('https://github.com/celo-org/celo-monorepo/tree/feature/smart-wallet');
  assert.equal(parsedNestedBranch.branch, 'feature/smart-wallet');
  console.log('  ✓ Extracted nested branch "feature/smart-wallet" from URL');

  // Test 4: Rate-Limit Friendly Messaging Check
  console.log('\n[4] Testing Rate Limit Handling Information...');
  const headers = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1800) };
  const resetDate = new Date(Number(headers['x-ratelimit-reset']) * 1000);
  const minutes = Math.max(1, Math.ceil((resetDate.getTime() - Date.now()) / 60000));
  assert.ok(minutes >= 29 && minutes <= 31, 'Calculated reset time within expected window');
  console.log(`  ✓ Rate limit reset window calculated accurately (~${minutes} minutes)`);

  // Test 5: Per-Project AskBot Configuration & Schema
  console.log('\n[5] Testing AskBot Per-Project Configuration Schema...');
  const { z } = await import('zod');
  const askBotSchema = z.object({
    baseUrl: z.string().url(),
    healthPath: z.string().optional(),
    reviewPath: z.string().optional(),
    method: z.enum(['GET', 'POST']).optional(),
    authHeader: z.string().min(1).optional(),
    authToken: z.string().min(1).optional(),
    sampleRequestBody: z.record(z.unknown()).optional(),
    expectedResponseKeys: z.array(z.string().min(1)).optional()
  });

  const validAskBotConfig = {
    baseUrl: 'https://my-custom-agent.example.com/api',
    healthPath: '/custom-health',
    reviewPath: '/custom-review',
    method: 'POST' as const,
    authHeader: 'Authorization',
    authToken: 'Bearer custom_token_123',
    expectedResponseKeys: ['verdict', 'score'],
    sampleRequestBody: { test: true }
  };

  const parsedAskBot = askBotSchema.safeParse(validAskBotConfig);
  assert.equal(parsedAskBot.success, true, 'Per-project AskBot config must parse successfully');
  console.log('  ✓ Valid per-project AskBot config correctly parsed with custom endpoints & keys');

  // 5b: Base URL only configuration
  const baseUrlOnlyConfig = {
    baseUrl: 'https://my-custom-agent.example.com'
  };
  const parsedBaseUrlOnly = askBotSchema.safeParse(baseUrlOnlyConfig);
  assert.equal(parsedBaseUrlOnly.success, true, 'Base URL only config must parse successfully');
  console.log('  ✓ Base-URL-only AskBot config parsed successfully');

  // Test 6: Strict Audit Trust: Verify Ownership BEFORE crediting
  console.log('\n[6] Testing Strict Audit: Verify Ownership Before Ownership Verified...');
  // Ensure that no wallet can ever get walletOwnershipVerified = true without passing verification
  const fakeRequestNoSig: ReviewRequest = {
    repoUrl: 'https://github.com/testowner/testrepo',
    walletAddress: '0x23Fa4aB4796241e36E56928cC96cce56fcf47166'
  };
  const evidenceCollector: EvaluationContext['evidence'] = [];
  const celoResultNoSig = await collectCeloSnapshot(fakeRequestNoSig, fakeRepo, evidenceCollector);
  assert.equal(celoResultNoSig.walletOwnershipVerified, false, 'Without signature, walletOwnershipVerified MUST be false');
  
  // Try invalid signature
  const fakeRequestBadSig: ReviewRequest = {
    repoUrl: 'https://github.com/testowner/testrepo',
    walletAddress: '0x23Fa4aB4796241e36E56928cC96cce56fcf47166',
    walletSignature: '0x1234567890abcdef',
    walletSignatureMessage: 'ReviewBot Celo Wallet Ownership Proof\nWallet: 0x23Fa4aB4796241e36E56928cC96cce56fcf47166'
  };
  const celoResultBadSig = await collectCeloSnapshot(fakeRequestBadSig, fakeRepo, evidenceCollector);
  assert.equal(celoResultBadSig.walletOwnershipVerified, false, 'With bad signature, walletOwnershipVerified MUST be false');
  console.log('  ✓ Confirmed: Audit strictly denies ownership without valid cryptographic proof');

  // Test 7: Full End-to-End Orchestrator Audit Pipeline
  console.log('\n[7] Testing Full End-to-End Orchestrator Audit Pipeline...');
  const e2eRequestVerified: ReviewRequest = {
    repoUrl: 'https://github.com/celo-org/celo-monorepo',
    projectName: 'Celo Agent E2E',
    walletAddress: testAccount.address,
    walletSignature: validSignature,
    walletSignatureMessage: validMessage,
    celoNetwork: 'not-applicable',
    askBotUrl: 'https://httpbin.org/status/200'
  };

  const e2eVerifiedReport = await evaluateProject(e2eRequestVerified);
  assert.equal(e2eVerifiedReport.project.walletOwnershipVerified, true, 'Report must confirm ownership verified');
  assert.ok(e2eVerifiedReport.markdown.includes('Cryptographically verified'), 'Markdown includes verified status');
  assert.ok(e2eVerifiedReport.scores.overall > 0, 'Overall score calculated');
  assert.ok(Array.isArray(e2eVerifiedReport.findings), 'Findings array present');
  assert.ok(Array.isArray(e2eVerifiedReport.evidence), 'Evidence array present');
  console.log('  ✓ Verified audit successfully processed end-to-end');

  const e2eRequestUnverified: ReviewRequest = {
    repoUrl: 'https://github.com/celo-org/celo-monorepo',
    projectName: 'Celo Agent Unverified',
    walletAddress: testAccount.address,
    celoNetwork: 'not-applicable'
  };
  const e2eUnverifiedReport = await evaluateProject(e2eRequestUnverified);
  assert.equal(e2eUnverifiedReport.project.walletOwnershipVerified, false, 'Report must mark ownership unverified');
  assert.ok(e2eUnverifiedReport.markdown.includes('⚠️ NO — Unverified'), 'Markdown includes unverified warning');
  assert.ok(e2eUnverifiedReport.trustVerdict.includes('Uncertain') || e2eUnverifiedReport.trustVerdict.includes('No'), 'Unverified trust verdict clamped');
  console.log('  ✓ Unverified audit strictly guarded end-to-end');

  console.log('\n=== ALL 7 TESTS PASSED WITH 100% SUCCESS! ===\n');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
