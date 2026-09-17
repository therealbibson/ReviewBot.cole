import { buildAttributionHeaders } from '../../lib/attribution.js';
import type { AskBotConfig, EvidenceItem, ReviewRequest, RuntimeSnapshot } from '../types.js';

export async function collectRuntimeSnapshot(request: ReviewRequest, evidence: EvidenceItem[]): Promise<RuntimeSnapshot> {
  const config = normalizeAskBotConfig(request);

  if (!config) {
    evidence.push({
      type: 'http',
      label: 'Runtime probe skipped',
      detail: 'No AskBot configuration was provided, so live API verification was not attempted.',
      status: 'info'
    });

    return {
      reachable: false,
      notes: ['No AskBot configuration provided.']
    };
  }

  const notes: string[] = [];
  let healthStatusCode: number | undefined;
  let reviewStatusCode: number | undefined;
  let reachable = false;
  let latencyMs: number | undefined;
  let contentType: string | undefined;
  let expectedKeysMatched: string[] = [];

  if (config.healthPath) {
    let healthUrl = new URL(config.healthPath, config.baseUrl).toString();
    try {
      const started = Date.now();
      let response = await fetch(healthUrl, {
        method: 'GET',
        headers: buildHeaders(config, false, request.attributionTag)
      });
      latencyMs = Date.now() - started;
      healthStatusCode = response.status;
      contentType = response.headers.get('content-type') ?? undefined;

      // Fallback: If default /health probe returned 404 and user did not specify a custom path, try root /
      if (!response.ok && response.status === 404 && (!request.askBot?.healthPath || request.askBot.healthPath === '/health')) {
        const rootUrl = new URL('/', config.baseUrl).toString();
        if (rootUrl !== healthUrl) {
          try {
            const rootRes = await fetch(rootUrl, {
              method: 'GET',
              headers: buildHeaders(config, false, request.attributionTag)
            });
            if (rootRes.ok) {
              response = rootRes;
              healthUrl = rootUrl;
              healthStatusCode = rootRes.status;
              contentType = rootRes.headers.get('content-type') ?? undefined;
            }
          } catch {
            // Keep original response
          }
        }
      }

      evidence.push({
        type: 'http',
        label: 'AskBot health probe',
        detail: `Fetched ${healthUrl} with status ${response.status} in ${latencyMs}ms.`,
        source: healthUrl,
        status: response.ok ? 'pass' : 'warn'
      });

      notes.push(response.ok ? 'Health endpoint responded successfully.' : 'Health endpoint responded with a non-2xx status.');
      reachable = reachable || response.ok;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown health probe failure';
      evidence.push({
        type: 'http',
        label: 'AskBot health probe failed',
        detail: message,
        source: healthUrl,
        status: 'fail'
      });
      notes.push(message);
    }
  }

  if (config.reviewPath) {
    const reviewUrl = new URL(config.reviewPath, config.baseUrl).toString();
    const method = config.method ?? 'POST';

    try {
      const started = Date.now();
      const response = await fetch(reviewUrl, {
        method,
        headers: buildHeaders(config, method !== 'GET', request.attributionTag),
        body: method === 'GET' ? undefined : JSON.stringify(config.sampleRequestBody ?? defaultSampleBody(request))
      });
      const bodyText = await response.text();
      const parsedJson = safeJsonParse(bodyText);
      reviewStatusCode = response.status;
      latencyMs = Date.now() - started;
      contentType = response.headers.get('content-type') ?? undefined;
      expectedKeysMatched = matchExpectedKeys(parsedJson, config.expectedResponseKeys ?? []);

      evidence.push({
        type: 'http',
        label: 'AskBot review probe',
        detail: `Called ${reviewUrl} with status ${response.status}; matched response keys: ${expectedKeysMatched.join(', ') || 'none'}.`,
        source: reviewUrl,
        status: response.ok ? 'pass' : 'warn'
      });

      if (response.ok) {
        notes.push('Review endpoint accepted a probe request.');
      } else {
        notes.push(`Review endpoint returned status ${response.status}.`);
      }

      if ((config.expectedResponseKeys?.length ?? 0) > 0 && expectedKeysMatched.length === 0) {
        evidence.push({
          type: 'heuristic',
          label: 'AskBot response shape mismatch',
          detail: 'The review response did not contain any expected keys from the configured contract.',
          source: reviewUrl,
          status: 'warn'
        });
      }

      reachable = reachable || response.ok;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown review probe failure';
      evidence.push({
        type: 'http',
        label: 'AskBot review probe failed',
        detail: message,
        source: reviewUrl,
        status: 'fail'
      });
      notes.push(message);
    }
  }

  return {
    reachable,
    statusCode: reviewStatusCode ?? healthStatusCode,
    latencyMs,
    contentType,
    notes,
    healthStatusCode,
    reviewStatusCode,
    expectedKeysMatched
  };
}

function normalizeAskBotConfig(request: ReviewRequest): AskBotConfig | undefined {
  if (request.askBot) {
    return {
      ...request.askBot,
      healthPath: request.askBot.healthPath ?? (request.askBot.reviewPath ? undefined : '/health'),
      method: request.askBot.method ?? 'GET'
    };
  }

  if (request.askBotUrl) {
    return {
      baseUrl: request.askBotUrl,
      healthPath: '/health',
      method: 'GET'
    };
  }

  return undefined;
}

function buildHeaders(config: AskBotConfig, includeJson = false, attributionTag?: string): HeadersInit {
  const headers: Record<string, string> = {
    'user-agent': 'reviewbot-celo/0.1'
  };

  if (attributionTag) {
    Object.assign(headers, buildAttributionHeaders(attributionTag));
  }

  if (includeJson) {
    headers['content-type'] = 'application/json';
  }

  if (config.authHeader && config.authToken) {
    headers[config.authHeader] = config.authToken;
  }

  return headers;
}

function defaultSampleBody(request: ReviewRequest): Record<string, unknown> {
  return {
    repoUrl: request.repoUrl,
    projectName: request.projectName,
    notes: request.notes,
    walletAddress: request.walletAddress
  };
}

function safeJsonParse(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function matchExpectedKeys(payload: Record<string, unknown> | undefined, expectedKeys: string[]): string[] {
  if (!payload) {
    return [];
  }

  return expectedKeys.filter((key) => key in payload);
}
