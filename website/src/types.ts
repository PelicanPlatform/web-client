export interface TokenGeneration {
  strategy: string;
  vaultServer: string;
  maxScopeDepth: number;
  issuer: string;
}

export interface TokenIssuer {
  basePaths: string[];
  restrictedPaths: string[] | null;
  issuer: string;
}

export interface Capabilities {
  PublicRead: boolean;
  Read: boolean;
  Write: boolean;
  Listing: boolean;
  FallBackRead: boolean;
}

export interface Namespace {
  path: string;
  capabilities: Capabilities;
  tokenGeneration: TokenGeneration[];
  tokenIssuer: TokenIssuer[];
  fromTopology: boolean;
  origins: string[];
  caches: string[];
}
