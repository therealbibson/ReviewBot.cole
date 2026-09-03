import express from 'express';
import type { Request, Response } from 'express';
import { join } from 'node:path';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { evaluateProject } from './evaluator/orchestrator.js';
import { assertAttributionTag, buildTransactionGuidance } from './lib/attribution.js';
import { loadDotEnv } from './lib/env.js';

loadDotEnv();
const config = loadConfig();
const attributionTag = config.celoAttributionTag ? assertAttributionTag(config.celoAttributionTag) : undefined;
const startupWarning = attributionTag
  ? undefined
  : 'CELO_ATTRIBUTION_TAG is not configured. The frontend can load, but review execution is disabled until you set it in .env.';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(join(process.cwd(), 'src/public')));

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

const reviewRequestSchema = z.object({
  repoUrl: z.string().url(),
  askBotUrl: z.string().url().optional(),
  askBot: askBotSchema.optional(),
  walletAddress: z.string().optional(),
  celoNetwork: z.enum(['celo-mainnet', 'celo-sepolia', 'not-applicable']).optional(),
  projectName: z.string().min(1).optional(),
  notes: z.string().max(5000).optional()
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: 'reviewbot-celo',
    attributionTag,
    startupWarning,
    askBotConfigured: Boolean(config.askBot)
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.sendFile(join(process.cwd(), 'src/public/index.html'));
});

app.get('/results', (_req: Request, res: Response) => {
  res.sendFile(join(process.cwd(), 'src/public/results.html'));
});

app.get('/how-it-works', (_req: Request, res: Response) => {
  res.sendFile(join(process.cwd(), 'src/public/how-it-works.html'));
});

app.get('/markdown-report', (_req: Request, res: Response) => {
  res.sendFile(join(process.cwd(), 'src/public/markdown-report.html'));
});

app.post('/review', async (req: Request, res: Response) => {
  if (!attributionTag) {
    res.status(503).json({
      error: 'Review execution is disabled until CELO_ATTRIBUTION_TAG is configured in .env.',
      setup: {
        requiredEnv: ['CELO_ATTRIBUTION_TAG'],
        example: 'CELO_ATTRIBUTION_TAG=celo_your_assigned_tag'
      }
    });
    return;
  }

  const parsed = reviewRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid review request',
      details: parsed.error.flatten()
    });
    return;
  }

  try {
    const report = await evaluateProject({
      ...parsed.data,
      askBot: parsed.data.askBot ?? config.askBot,
      celoNetwork: parsed.data.celoNetwork ?? config.celoNetwork ?? 'celo-mainnet',
      attributionTag
    });

    res.json({
      ...report,
      attribution: {
        tag: attributionTag,
        guidance: buildTransactionGuidance(attributionTag)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected evaluation failure';
    res.status(500).json({ error: message });
  }
});

app.listen(config.port, () => {
  console.log(`ReviewBot Celo listening on http://localhost:${config.port}`);
});
