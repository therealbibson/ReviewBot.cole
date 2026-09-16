const navbar = document.querySelector('.navbar');
const navToggle = document.querySelector('.nav-toggle');
const form = document.getElementById('review-form');
const submitButton = document.getElementById('submit-button');
const statusPanel = document.getElementById('status-panel');
const statusMessage = document.getElementById('status-message');
const resultPanel = document.getElementById('result-panel');
const resultTitle = document.getElementById('result-title');
const resultSummary = document.getElementById('result-summary');
const overallScore = document.getElementById('overall-score');
const safetyIndicator = document.getElementById('safety-indicator');
const safetyStatus = document.getElementById('safety-status');
const safetySummary = document.getElementById('safety-summary');
const trustVerdictText = document.getElementById('trust-verdict-text');
const metricsGrid = document.getElementById('metrics-grid');
const worksList = document.getElementById('works-list');
const brokenList = document.getElementById('broken-list');
const findingsList = document.getElementById('findings-list');
const evidenceList = document.getElementById('evidence-list');
const planList = document.getElementById('plan-list');
const markdownReport = document.getElementById('markdown-report');
const markdownTitle = document.getElementById('markdown-title');
const markdownSummary = document.getElementById('markdown-summary');

const signOwnershipBtn = document.getElementById('sign-ownership-btn');
const walletSignatureBadge = document.getElementById('wallet-signature-badge');
const walletSignatureText = document.getElementById('wallet-signature-text');

setupMobileNav();
setupFormDraftPersistence();
setupWalletProofButton();
void loadHealth();
void hydrateStoredReport();

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton) submitButton.disabled = true;
    if (statusPanel) statusPanel.classList.remove('hidden');
    if (resultPanel) resultPanel.classList.add('hidden');
    if (statusMessage) statusMessage.textContent = 'ReviewBot is gathering repository evidence, runtime signals, and Celo context...';

    try {
      const payload = buildPayload(new FormData(form));
      const response = await fetch('/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Review request failed');
      }

      persistReport(data);
      window.location.href = '/results';
    } catch (error) {
      if (statusMessage) {
        statusMessage.textContent = friendlyErrorMessage(error instanceof Error ? error.message : 'Unexpected error');
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

function setupMobileNav() {
  if (!navbar || !navToggle) {
    return;
  }

  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    navbar.classList.toggle('menu-open', !expanded);
  });
}

function setupFormDraftPersistence() {
  if (!form) return;

  const DRAFT_KEY = 'reviewbot:form-draft';

  // Restore draft if present
  try {
    const storedDraft = sessionStorage.getItem(DRAFT_KEY);
    if (storedDraft) {
      const draft = JSON.parse(storedDraft);
      Object.entries(draft).forEach(([name, val]) => {
        const field = form.querySelector(`[name="${name}"]`);
        if (field && typeof val === 'string' && !field.value) {
          field.value = val;
        }
      });
      if (draft.walletSignature && draft.walletSignatureMessage) {
        setSignatureInputs(draft.walletSignature, draft.walletSignatureMessage);
      }
    }
  } catch {
    // Ignore draft restoration failures
  }

  // Auto-save input changes
  form.addEventListener('input', () => {
    try {
      const formData = new FormData(form);
      const draftObj = {};
      for (const [key, val] of formData.entries()) {
        if (typeof val === 'string' && val.trim()) {
          draftObj[key] = val.trim();
        }
      }
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draftObj));
    } catch {
      // Ignore draft storage quota error
    }
  });
}

function setupWalletProofButton() {
  if (!signOwnershipBtn) return;

  signOwnershipBtn.addEventListener('click', async () => {
    const walletInput = form?.querySelector('[name="walletAddress"]');
    let address = walletInput ? walletInput.value.trim() : '';

    if (typeof window.ethereum === 'undefined') {
      if (walletSignatureText) {
        walletSignatureText.textContent = '❌ Web3 wallet not detected in browser. Please install MetaMask, MiniPay, or use a Web3 browser.';
        walletSignatureText.style.color = '#ef4444';
      }
      return;
    }

    try {
      if (walletSignatureText) {
        walletSignatureText.textContent = 'Connecting to Web3 wallet…';
        walletSignatureText.style.color = '';
      }

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        throw new Error('No account returned from Web3 wallet.');
      }

      const walletAccount = accounts[0];
      if (walletInput) {
        walletInput.value = walletAccount;
        address = walletAccount;
      }

      const timestamp = new Date().toISOString();
      const challengeMessage = `ReviewBot Celo Wallet Ownership Proof\nWallet: ${address}\nTimestamp: ${timestamp}`;

      if (walletSignatureText) {
        walletSignatureText.textContent = 'Please approve the personal_sign signature request in your wallet…';
      }

      let signature;
      try {
        signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [challengeMessage, address]
        });
      } catch {
        // Retry with inverted param order if wallet expects [address, message]
        signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [address, challengeMessage]
        });
      }

      if (!signature) {
        throw new Error('Signature was not returned.');
      }

      setSignatureInputs(signature, challengeMessage);

      if (walletSignatureBadge) walletSignatureBadge.classList.remove('hidden');
      if (walletSignatureText) {
        walletSignatureText.textContent = '✓ Signature attached! ReviewBot will verify wallet ownership on-chain during analysis.';
        walletSignatureText.style.color = '#10b981';
      }
    } catch (err) {
      if (walletSignatureText) {
        walletSignatureText.textContent = `❌ Signature failed: ${err instanceof Error ? err.message : 'User rejected signature.'}`;
        walletSignatureText.style.color = '#ef4444';
      }
    }
  });
}

function setSignatureInputs(signature, message) {
  const sigInput = document.getElementById('walletSignature');
  const msgInput = document.getElementById('walletSignatureMessage');
  if (sigInput) sigInput.value = signature;
  if (msgInput) msgInput.value = message;
  if (walletSignatureBadge) walletSignatureBadge.classList.remove('hidden');
}

function buildPayload(formData) {
  let projectName = stringOrUndefined(formData.get('projectName'));
  const repoUrl = String(formData.get('repoUrl'));
  if (!projectName) {
    const m = repoUrl.match(/github\.com\/[^/]+\/([^/]+)/);
    if (m) projectName = m[1].replace(/\.git$/, '');
  }

  const payload = {
    projectName,
    repoUrl,
    walletAddress: stringOrUndefined(formData.get('walletAddress')),
    walletSignature: stringOrUndefined(formData.get('walletSignature')),
    walletSignatureMessage: stringOrUndefined(formData.get('walletSignatureMessage')),
    notes: stringOrUndefined(formData.get('notes'))
  };

  const askBotBaseUrl = stringOrUndefined(formData.get('askBotBaseUrl'));
  if (askBotBaseUrl) {
    const rawKeys = stringOrUndefined(formData.get('askBotExpectedKeys'));
    const expectedResponseKeys = rawKeys
      ? rawKeys.split(',').map((k) => k.trim()).filter(Boolean)
      : undefined;

    payload.askBot = {
      baseUrl: askBotBaseUrl,
      healthPath: stringOrUndefined(formData.get('askBotHealthPath')),
      reviewPath: stringOrUndefined(formData.get('askBotReviewPath')),
      method: (formData.get('askBotMethod') as string) === 'POST' ? 'POST' : 'GET',
      authHeader: stringOrUndefined(formData.get('askBotAuthHeader')),
      authToken: stringOrUndefined(formData.get('askBotAuthToken')),
      expectedResponseKeys
    };
  }

  return payload;
}

function hydrateStoredReport() {
  const report = readStoredReport();

  if (markdownTitle && markdownSummary && markdownReport) {
    hydrateMarkdownPage(report);
    return;
  }

  if (!resultTitle || !metricsGrid) {
    return;
  }

  if (!report) {
    renderEmptyResults();
    return;
  }

  renderReport(report);
  if (statusPanel) statusPanel.classList.remove('hidden');
  if (statusMessage) statusMessage.textContent = 'Showing the most recent generated review.';
}

function hydrateMarkdownPage(report) {
  if (!report) {
    if (markdownTitle) markdownTitle.textContent = 'No report yet';
    if (markdownSummary) markdownSummary.textContent = 'Generate a review first, then open the markdown report from the Results page.';
    if (markdownReport) markdownReport.textContent = '';
    return;
  }

  if (markdownTitle) markdownTitle.textContent = `${report.project.name} markdown report`;
  if (markdownSummary) markdownSummary.textContent = report.summary || 'Structured review report.';
  if (markdownReport) markdownReport.textContent = report.markdown || '';
}

function readStoredReport() {
  const stored = sessionStorage.getItem('reviewbot:last-report');
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

function persistReport(report) {
  sessionStorage.setItem('reviewbot:last-report', JSON.stringify(report));
}

function renderReport(report) {
  if (resultTitle) resultTitle.textContent = report.project.name;
  const repoLinkBlock = document.getElementById('repo-link-block');
  const repoLink = document.getElementById('repo-link');
  if (repoLinkBlock && repoLink && report.project.repoUrl) {
    repoLink.href = report.project.repoUrl;
    repoLinkBlock.style.display = '';
  }
  if (resultSummary) resultSummary.textContent = report.summary || 'Evidence-backed review generated.';
  if (overallScore) {
    overallScore.textContent = String(report.scores.overall);
    overallScore.className = scoreToneClass(report.scores.overall);
  }
  renderSafetyIndicator(report);
  if (trustVerdictText) {
    trustVerdictText.textContent = report.trustVerdict || 'Trust verdict unavailable for this review.';
  }
  if (metricsGrid) {
    metricsGrid.replaceChildren(
      metricCard('Usefulness', report.scores.usefulness.score, report.scores.usefulness.summary),
      metricCard('Safety', report.scores.safety.score, report.scores.safety.summary),
      metricCard('Economic viability', report.scores.economicViability.score, report.scores.economicViability.summary),
      metricCard('Celo integration', report.scores.celoIntegration.score, report.scores.celoIntegration.summary),
      metricCard('Engineering maturity', report.scores.engineeringMaturity.score, report.scores.engineeringMaturity.summary),
      metricCard('Confidence', report.scores.confidence, 'Confidence reflects how much direct evidence was collected.')
    );
  }

  if (worksList) renderList(worksList, report.whatWorks);
  if (brokenList) renderList(brokenList, report.whatIsBroken);
  if (findingsList) renderFindings(report.findings || []);
  if (evidenceList) renderEvidence(report.evidence || []);
  if (planList) renderPlan(report.improvementPlan || []);
}

function renderEmptyResults() {
  if (resultTitle) resultTitle.textContent = 'No review yet';
  if (resultSummary) resultSummary.textContent = 'Run a review on the Review page to populate this screen.';
  if (overallScore) {
    overallScore.textContent = '--';
    overallScore.className = '';
  }
  renderEmptySafetyIndicator();
  if (trustVerdictText) {
    trustVerdictText.textContent = 'Useful, safe, and economically viable status will appear here after a review.';
  }
  if (metricsGrid) metricsGrid.replaceChildren();
  if (worksList) renderList(worksList, []);
  if (brokenList) renderList(brokenList, []);
  if (findingsList) renderFindings([]);
  if (evidenceList) renderEvidence([]);
  if (planList) renderPlan([]);
}

function renderSafetyIndicator(report) {
  if (!safetyIndicator || !safetyStatus || !safetySummary) {
    return;
  }

  safetyIndicator.classList.remove('safe', 'caution', 'unsafe');

  const safetyScore = Number(report?.scores?.safety?.score ?? 0);
  const safetyFindings = (report?.findings ?? []).filter((finding) => finding.category === 'safety');
  const hasCriticalSafety = safetyFindings.some((finding) => finding.severity === 'critical' || finding.severity === 'high');

  if (hasCriticalSafety || safetyScore < 45) {
    safetyIndicator.classList.add('unsafe');
    safetyStatus.textContent = 'Unsafe';
    safetySummary.textContent = 'This review found meaningful safety risk or weak trust boundaries that should be addressed before relying on the agent.';
    return;
  }

  if (safetyScore < 70) {
    safetyIndicator.classList.add('caution');
    safetyStatus.textContent = 'Needs caution';
    safetySummary.textContent = 'The agent is not clearly unsafe, but there are enough safety gaps that careful review and fixes are still needed.';
    return;
  }

  safetyIndicator.classList.add('safe');
  safetyStatus.textContent = 'Looks safe';
  safetySummary.textContent = 'The current review suggests the agent is in a relatively healthy safety range, though further manual verification is always wise.';
}

function renderEmptySafetyIndicator() {
  if (!safetyIndicator || !safetyStatus || !safetySummary) {
    return;
  }

  safetyIndicator.classList.remove('safe', 'caution', 'unsafe');
  safetyStatus.textContent = 'Unknown';
  safetySummary.textContent = 'Run a review to determine whether the agent looks safe, risky, or unsafe.';
}

function renderList(container, items) {
  const values = items.length > 0 ? items : ['No items available.'];
  container.replaceChildren(...values.map((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    return li;
  }));
}

function renderFindings(findings) {
  const items = findings.length > 0
    ? findings.map((finding) => {
        const article = document.createElement('article');
        article.className = 'finding-card';
        article.innerHTML = `
          <div class="badge badge-${finding.severity}">${escapeHtml(finding.severity)}</div>
          <h4>${escapeHtml(finding.title)}</h4>
          <p><strong>Category:</strong> ${escapeHtml(finding.category)}</p>
          <p>${escapeHtml(finding.summary)}</p>
          <p><strong>Suggested fix:</strong> ${escapeHtml(finding.fix)}</p>
        `;
        return article;
      })
    : [emptyStateCard('No findings yet', 'Run a review to see severity-ranked issues and fixes.')];

  findingsList.replaceChildren(...items);
}

function renderEvidence(evidence) {
  const items = evidence.length > 0
    ? evidence.map((item) => {
        const article = document.createElement('article');
        article.className = 'evidence-card';
        article.innerHTML = `
          <div class="badge badge-${item.status}">${escapeHtml(item.status)}</div>
          <h4>${escapeHtml(item.label)}</h4>
          <p>${escapeHtml(item.detail)}</p>
          ${item.source ? `<p><strong>Source:</strong> ${escapeHtml(item.source)}</p>` : ''}
        `;
        return article;
      })
    : [emptyStateCard('No evidence yet', 'Once a review runs, the collected evidence will show up here.')];

  evidenceList.replaceChildren(...items);
}

function renderPlan(plan) {
  const values = plan.length > 0 ? plan : [{ title: 'No plan yet', rationale: 'Run a review to generate a prioritized improvement plan.' }];
  planList.replaceChildren(...values.map((step) => {
    const li = document.createElement('li');
    li.textContent = `${step.title} — ${step.rationale}`;
    return li;
  }));
}

function metricCard(label, value, summary) {
  const div = document.createElement('div');
  div.className = 'metric-card';
  div.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <strong class="${escapeHtml(scoreToneClass(Number(value)))}">${escapeHtml(String(value))}</strong>
    <p>${escapeHtml(summary || '')}</p>
  `;
  return div;
}

function scoreToneClass(value) {
  if (!Number.isFinite(value)) {
    return '';
  }

  if (value >= 70) {
    return 'score-good';
  }

  if (value >= 45) {
    return 'score-caution';
  }

  return 'score-bad';
}

function emptyStateCard(title, message) {
  const article = document.createElement('article');
  article.className = 'evidence-card';
  article.innerHTML = `<h4>${escapeHtml(title)}</h4><p>${escapeHtml(message)}</p>`;
  return article;
}

function friendlyErrorMessage(raw) {
  if (raw.includes('404')) return 'Repository not found. Make sure the URL is correct and the repo is public.';
  if (raw.includes('rate limit') || raw.includes('403')) return 'GitHub API rate limit reached. Configure GITHUB_TOKEN in server .env or try again later.';
  if (raw.includes('503')) return 'The review service is not ready yet. Please try again in a moment.';
  return raw;
}

function stringOrUndefined(value) {
  const normalized = String(value || '').trim();
  return normalized ? normalized : undefined;
}

async function loadHealth() {
  if (!statusPanel || !statusMessage) {
    return;
  }

  try {
    const response = await fetch('/health');
    const data = await response.json();
    if (data.startupWarning) {
      statusPanel.classList.remove('hidden');
      statusMessage.textContent = data.startupWarning;
    }
  } catch {
    // ignore health boot errors in the UI
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
