export interface Namespace {
	prefix: string;
	token?: Token;
	clientSecret: string;
	clientId: string;
	oidcConfiguration: OidcConfiguration;
}

export interface AuthorizationClient {
	clientId: string;
	clientSecret: string;
}

export interface Token {
	expiration: number;
  accessToken: string;
	refreshToken: string;
}

export interface FederationConfiguration {
	director_endpoint?: string;
	namespace_registration_endpoint?: string;
	jwks_uri?: string;
}

export interface OidcConfiguration {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	registration_endpoint: string;
	jwks_uri: string;
}

export interface Federation {
	hostname: string;
	configuration: FederationConfiguration;
	namespaces: Record<string, Namespace>;
}

export interface DirectorNamespaceMetadata {
	issuer: string;
	namespace : {
		namespace: string;
		requireToken: boolean;
		collectionUrl: string;
	}
	tokenGeneration: {
		issuer: string;
		maxScopeDepth: number
		strategy: string;
		basePath: string;
	}
}

export interface QueuedRequest {
	objectUrl: string;
	federationHostname: string;
	path: string;
	namespace: string;
	type: "GET" | "PUT"
	createdAt: number;
}

export interface TokenSuccessResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	scope: string;
	id_token: string;
}