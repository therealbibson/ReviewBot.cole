export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Category =
  | 'usefulness'
  | 'safety'
  | 'economicViability'
  | 'celoIntegration'
  | 'engineeringMaturity';

export interface AskBotConfig {
  baseUrl: string;
  healthPath?: string;
  reviewPath?: string;
  method?: 'GET' | 'POST';
  authHeader?: string;
  authToken?: string;
  sampleRequestBody?: Record<string, unknown>;
  expectedResponseKeys?: string[];
}

export interface ReviewRequest {
  repoUrl: string;
  askBotUrl?: string;
  askBot?: AskBotConfig;
  walletAddress?: string;
  projectName?: string;
  notes?: string;
  attributionTag?: string;
}

export interface EvidenceItem {
  type: 'info' | 'command' | 'http' | 'file' | 'heuristic';
  label: string;
  detail: string;
  source?: string;
  status: 'pass' | 'fail' | 'warn' | 'info';
}

export interface Finding {
  title: string;
  severity: Severity;
  category: Category;
  summary: string;
  evidence: string[];
  fix: string;
}

export interface CategoryScore {
  score: number;
  summary: string;
}

export interface ScoreBreakdown {
  usefulness: CategoryScore;
  safety: CategoryScore;
  economicViability: CategoryScore;
  celoIntegration: CategoryScore;
  engineeringMaturity: CategoryScore;
  overall: number;
  confidence: number;
}

export interface ImprovementStep {
  priority: 1 | 2 | 3 | 4 | 5;
  title: string;
  rationale: string;
}

export interface ReviewReport {
  project: {
    name: string;
    repoUrl: string;
    askBotUrl?: string;
    walletAddress?: string;
  };
  summary: string;
  whatWorks: string[];
  whatIsBroken: string[];
  evidence: EvidenceItem[];
  findings: Finding[];
  scores: ScoreBreakdown;
  improvementPlan: ImprovementStep[];
  markdown: string;
}

export interface RepoSnapshot {
  owner: string;
  repo: string;
  files: string[];
  readme?: string;
  packageJson?: {
    name?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  signals: {
    hasTests: boolean;
    hasCI: boolean;
    hasDocker: boolean;
    hasEnvExample: boolean;
    mentionsCelo: boolean;
    mentionsAskBot: boolean;
    likelyStack: string[];
  };
}

export interface RuntimeSnapshot {
  reachable: boolean;
  statusCode?: number;
  latencyMs?: number;
  contentType?: string;
  notes: string[];
  healthStatusCode?: number;
  reviewStatusCode?: number;
  expectedKeysMatched?: string[];
}

export interface CeloSnapshot {
  providedWallet: boolean;
  validWalletFormat: boolean;
  repoMentions: string[];
  inferredNetworks: string[];
  notes: string[];
}

export interface EvaluationContext {
  request: ReviewRequest;
  repo: RepoSnapshot;
  runtime: RuntimeSnapshot;
  celo: CeloSnapshot;
  evidence: EvidenceItem[];
  findings: Finding[];
}
