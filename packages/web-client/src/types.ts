export type ObjectPrefixStore = Record<string, { federation: string; namespace: string } | undefined>;

export interface FederationStore {
    [hostname: string]: Federation;
}

export interface Namespace {
    prefix: string;
    token?: Token;
    clientSecret?: string;
    clientId?: string;
    oidcConfiguration?: OidcConfiguration;
}

export interface AuthorizationClient {
    clientId: string;
    clientSecret: string;
}

export interface Token {
    /**
     * The raw access-token JWT. Present only transiently; in the service-worker auth
     * model the JWT lives solely in SW memory and the page holds the claims below
     * (scope/exp/…) without `value`. Treat as optional on the page side.
     */
    value?: string;
    iss: string;
    sub: string;
    aud: string;
    exp: number;
    iat: number;
    scope: string;
}

export interface FederationConfiguration {
    director_endpoint?: string;
    namespace_registration_endpoint?: string;
    jwks_uri?: string;
}

export interface OidcConfiguration {
    issuer: string;
    authorization_endpoint?: string;
    token_endpoint?: string;
    registration_endpoint?: string;
    jwks_uri: string;
}

export interface Federation {
    hostname: string;
    configuration: FederationConfiguration;
    namespaces: Record<string, Namespace>;
}

export interface DirectorNamespaceMetadata {
    issuer: string;
    namespace: {
        namespace: string;
        requireToken: boolean;
        collectionUrl: string;
    };
    tokenGeneration: {
        issuer: string;
        maxScopeDepth: number;
        strategy: string;
        basePath: string;
    };
}

export interface QueuedRequest {
    objectUrl: string;
    federationHostname: string;
    path: string;
    namespace: string;
    type: "GET" | "PUT" | "PROPFIND";
    createdAt: number;
}

export interface TokenSuccessResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    id_token: string;
}

export interface ObjectList {
    href: string;
    getcontentlength: number;
    getlastmodified: string;
    resourcetype: string;
    iscollection: boolean;
    executable: string;
    status: string;
}

export interface DynamicClientPayload {
    redirect_uris: string[];
    token_endpoint_auth_method: string;
    grant_types: string[];
    response_types: string[];
    client_name: string;
    scope: string;
}

export type TokenPermission = `storage.read:${string}` | `storage.create:${string}` | `storage.modify:${string}`;

export type CollectionPermission = 'create' | 'modify' | 'read';

export interface Collection {
    href: string;
    objectPath: string;
    permissions: CollectionPermission[];
}

export type UrlType = "collection" | "object";
