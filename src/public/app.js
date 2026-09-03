const form = document.getElementById('review-form');
const submitButton = document.getElementById('submit-button');
const statusPanel = document.getElementById('status-panel');
const statusMessage = document.getElementById('status-message');
const resultPanel = document.getElementById('result-panel');
const resultTitle = document.getElementById('result-title');
const resultSummary = document.getElementById('result-summary');
const overallScore = document.getElementById('overall-score');
const metricsGrid = document.getElementById('metrics-grid');
const worksList = document.getElementById('works-list');
const brokenList = document.getElementById('broken-list');
const findingsList = document.getElementById('findings-list');
const evidenceList = document.getElementById('evidence-list');
const planList = document.getElementById('plan-list');
const markdownReport = document.getElementById('markdown-report');

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
        statusMessage.textContent = error instanceof Error ? error.message : 'Unexpected error';
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

function buildPayload(formData) {
  return {
    projectName: stringOrUndefined(formData.get('projectName')),
    repoUrl: String(formData.get('repoUrl')),
    walletAddress: stringOrUndefined(formData.get('walletAddress')),
    notes: stringOrUndefined(formData.get('notes'))
  };
}

function hydrateStoredReport() {
  if (!resultTitle || !metricsGrid) {
    return;
  }

  const stored = sessionStorage.getItem('reviewbot:last-report');
  if (!stored) {
    renderEmptyResults();
    return;
  }

  try {
    const report = JSON.parse(stored);
    renderReport(report);
    if (statusPanel) statusPanel.classList.remove('hidden');
    if (statusMessage) statusMessage.textContent = 'Showing the most recent generated review.';
  } catch {
    renderEmptyResults();
  }
}

function persistReport(report) {
  sessionStorage.setItem('reviewbot:last-report', JSON.stringify(report));
}

function renderReport(report) {
  if (resultTitle) resultTitle.textContent = report.project.name;
  if (resultSummary) resultSummary.textContent = report.summary || 'Evidence-backed review generated.';
  if (overallScore) overallScore.textContent = String(report.scores.overall);
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
  if (markdownReport) markdownReport.textContent = report.markdown || '';
}

function renderEmptyResults() {
  if (resultTitle) resultTitle.textContent = 'No review yet';
  if (resultSummary) resultSummary.textContent = 'Run a review on the Review page to populate this screen.';
  if (overallScore) overallScore.textContent = '--';
  if (metricsGrid) metricsGrid.replaceChildren();
  if (worksList) renderList(worksList, []);
  if (brokenList) renderList(brokenList, []);
  if (findingsList) renderFindings([]);
  if (evidenceList) renderEvidence([]);
  if (planList) renderPlan([]);
  if (markdownReport) markdownReport.textContent = '';
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
    <strong>${escapeHtml(String(value))}</strong>
    <p>${escapeHtml(summary || '')}</p>
  `;
  return div;
}

function emptyStateCard(title, message) {
  const article = document.createElement('article');
  article.className = 'evidence-card';
  article.innerHTML = `<h4>${escapeHtml(title)}</h4><p>${escapeHtml(message)}</p>`;
  return article;
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
