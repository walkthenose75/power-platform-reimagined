export type SourceType = "tenant" | "repository" | "solution-zip" | "new-concept";

export interface InitOptions {
  name: string;
  source: SourceType;
  output: string;
  repository?: string;
  revision?: string;
  zipPath?: string;
  sha256?: string;
}

export interface ScanFinding {
  file: string;
  line: number;
  rule: string;
  excerpt: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
