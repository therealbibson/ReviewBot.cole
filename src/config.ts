import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().optional(),
  ASK_BOT_BASE_URL: z.string().url().optional(),
  ASK_BOT_HEALTH_PATH: z.string().optional(),
  ASK_BOT_REVIEW_PATH: z.string().optional(),
  ASK_BOT_METHOD: z.enum(['GET', 'POST']).optional(),
  ASK_BOT_AUTH_HEADER: z.string().optional(),
  ASK_BOT_AUTH_TOKEN: z.string().optional(),
  ASK_BOT_SAMPLE_REQUEST_BODY: z.string().optional(),
  ASK_BOT_EXPECTED_RESPONSE_KEYS: z.string().optional(),
  CELO_ATTRIBUTION_TAG: z.string().min(1).optional(),
  CELO_NETWORK: z.enum(['celo-mainnet', 'celo-sepolia', 'not-applicable']).optional(),
  GITHUB_TOKEN: z.string().optional(),
  GH_TOKEN: z.string().optional()
});

export type AppConfig = {
  port: number;
  askBot?: {
    baseUrl: string;
    healthPath?: string;
    reviewPath?: string;
    method?: 'GET' | 'POST';
    authHeader?: string;
    authToken?: string;
    sampleRequestBody?: Record<string, unknown>;
    expectedResponseKeys?: string[];
  };
  celoAttributionTag?: string;
  celoNetwork?: 'celo-mainnet' | 'celo-sepolia' | 'not-applicable';
  gitHubToken?: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);

  return {
    port: Number(parsed.PORT ?? 3000),
    askBot: parsed.ASK_BOT_BASE_URL
      ? {
          baseUrl: parsed.ASK_BOT_BASE_URL,
          healthPath: parsed.ASK_BOT_HEALTH_PATH,
          reviewPath: parsed.ASK_BOT_REVIEW_PATH,
          method: parsed.ASK_BOT_METHOD,
          authHeader: parsed.ASK_BOT_AUTH_HEADER,
          authToken: parsed.ASK_BOT_AUTH_TOKEN,
          sampleRequestBody: safeJsonRecord(parsed.ASK_BOT_SAMPLE_REQUEST_BODY),
          expectedResponseKeys: parsed.ASK_BOT_EXPECTED_RESPONSE_KEYS
            ? parsed.ASK_BOT_EXPECTED_RESPONSE_KEYS.split(',').map((value) => value.trim()).filter(Boolean)
            : undefined
        }
      : undefined,
    celoAttributionTag: parsed.CELO_ATTRIBUTION_TAG,
    celoNetwork: parsed.CELO_NETWORK,
    gitHubToken: parsed.GITHUB_TOKEN ?? parsed.GH_TOKEN
  };
}

function safeJsonRecord(value?: string): Record<string, unknown> | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
