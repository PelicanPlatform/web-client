"use client";

import { Federation, Namespace, QueuedRequest, ObjectList, TokenPermission } from "./types";
import { cloneDeep } from "lodash-es";
import {
    fetchNamespace,
    getObjectToken,
    parseObjectUrl,
    fetchFederation,
    get,
    list,
    put,
    UnauthenticatedError,
} from "./pelican";
import { generateCodeChallengeFromVerifier, generateCodeVerifier, getToken, getAuthorizationCode } from "./security";
import { parseOauthState, parseWebDavXmlToJson, sessionObject, downloadResponse, ProxiedValue } from "./util";
import startAuthorizationCodeFlow from "./security/startAuthorizationCodeFlow";

export class Client {
    federations: ProxiedValue<Record<string, Federation>>;
    prefixToNamespace: Record<string, string>;
    requestQueue: ProxiedValue<QueuedRequest[]>;
    codeVerifier: ProxiedValue<string>;

    constructor() {
        // Set up and load/initialize session storage objects
        this.federations = sessionObject<ProxiedValue<Record<string, Federation>>>("federations", { value: {} });
        this.prefixToNamespace = sessionObject<Record<string, string>>("prefixToNamespace");
        this.requestQueue = sessionObject<ProxiedValue<QueuedRequest[]>>("requestQueue", { value: [] });
        this.codeVerifier = sessionObject<ProxiedValue<string>>("codeVerifier", { value: generateCodeVerifier() });

        // If there is a code in the URL, exchange it for a token
        this.exchangeCodeForToken();
    }

    /**
     * Get an object from a pelican federation
     * @param objectUrl pelican://<federation-hostname>/<object-path>
     */
    async get(objectUrl: string): Promise<void> {
        const { federationHostname } = parseObjectUrl(objectUrl);
        const federation = await this.getFederation(federationHostname);
        const namespace = await this.getNamespace(objectUrl, federation);

        try {
            const response = await get(objectUrl, federation, namespace);
            downloadResponse(response);
        } catch (error) {
            if (error instanceof UnauthenticatedError) {
                await this.queueRequestAndStartFlow(objectUrl, federation);
            } else {
                throw error;
            }
        }
    }

    async list(collectionUrl: string): Promise<ObjectList[] | undefined> {
        const { federationHostname } = parseObjectUrl(collectionUrl);
        const federation = await this.getFederation(federationHostname);
        const namespace = await this.getNamespace(collectionUrl, federation);

        try {
            return list(collectionUrl, federation, namespace);
        } catch (error) {
            if (error instanceof UnauthenticatedError) {
                await this.queueRequestAndStartFlow(collectionUrl, federation);
            } else {
                throw error;
            }
        }
    }

    async put(objectUrl: string, file: File): Promise<void> {
        const { federationHostname, objectPath } = parseObjectUrl(objectUrl);
        const federation = await this.getFederation(federationHostname);
        const namespace = await this.getNamespace(objectUrl, federation);

        try {
            await put(objectUrl, file, federation, namespace);
        } catch (error) {
            if (error instanceof UnauthenticatedError) {
                await this.queueRequestAndStartFlow(objectUrl, federation);
            } else {
                throw error;
            }
        }
    }

    /**
     * Test if we have a valid token for the object URL
     * @param objectUrl
     */
    async permissions(objectUrl: string): Promise<TokenPermission[]> {
        const { federationHostname } = parseObjectUrl(objectUrl);
        const federation = await this.getFederation(federationHostname);
        const namespace = await this.getNamespace(objectUrl, federation);
        const token = await getObjectToken(namespace);

        if (!token) return [];

        return token.value
            .split(" ")
            .filter((scope) => scope.startsWith("storage."))
            .map((scope) => scope.split(":")[0] as TokenPermission);
    }

    /**
     * Parse an object URL for its federation and namespace
     */
    async parseObjectUrl(objectUrl: string): Promise<{ federation: string; namespace: string }> {
        const { federationHostname } = parseObjectUrl(objectUrl);
        const federation = await this.getFederation(federationHostname);
        const namespace = await this.getNamespace(objectUrl, federation);
        return { federation: federation.hostname, namespace: namespace.prefix };
    }

    /**
     * If there is an authorization code in the URL, exchange it for a token and save it to the appropriate namespace
     */
    async exchangeCodeForToken() {
        const authCode = getAuthorizationCode();
        if (authCode.code === null) return;

        try {
            // Get the namespace and federation from the state parameter
            const { federation: federationHostname, namespace: namespacePrefix } = parseOauthState(
                new URL(window.location.href),
            );
            const namespace = this.federations.value[federationHostname]?.namespaces[namespacePrefix];

            // Check if we have an auth code to exchange for a token
            const token = await getToken(
                namespace.oidcConfiguration,
                this.codeVerifier.value,
                namespace.clientId,
                namespace.clientSecret,
                authCode.code,
            );

            // Save the token to the namespace
            const federationsClone = cloneDeep(this.federations.value);
            federationsClone[federationHostname].namespaces[namespacePrefix].token = token.accessToken;
            this.federations.value = federationsClone;
        } catch {}

        // Clean up the window
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    /**
     * Get a federation's configuration from the registry and save it to session cache
     * @param federationHostname
     */
    async getFederation(federationHostname: string): Promise<Federation> {
        if (!this.federations.value?.[federationHostname]) {
            this.federations.value = {
                ...this.federations.value,
                [federationHostname]: await fetchFederation(federationHostname),
            };
        }
        return this.federations.value[federationHostname];
    }

    /**
     * Get a namespace's configuration from the federation and save it to session cache
     * @param objectUrl
     * @param federation
     */
    async getNamespace(objectUrl: string, federation: Federation): Promise<Namespace> {
        const { objectPrefix, objectPath } = parseObjectUrl(objectUrl);

        // Check if we have already cached the namespace for this prefix
        if (this.prefixToNamespace?.[objectPrefix]) {
            const namespacePrefix = this.prefixToNamespace[objectPrefix];
            if (federation.namespaces?.[namespacePrefix]) {
                return federation.namespaces[namespacePrefix];
            }
        }

        // Fetch and save the namespace information
        const requestNamespace = await fetchNamespace(objectPath, federation);
        this.prefixToNamespace[objectPrefix] = requestNamespace.prefix;
        const federationsClone = cloneDeep(this.federations.value);
        federationsClone[federation.hostname].namespaces[requestNamespace.prefix] = requestNamespace;
        this.federations.value = federationsClone;

        return requestNamespace;
    }

    /**
     * Queue a request that needs authorization and start the authorization code flow
     * @param objectUrl
     * @param federation
     */
    async queueRequestAndStartFlow(objectUrl: string, federation: Federation): Promise<void> {
        // Fetch and save the namespace information
        const namespace = await this.getNamespace(objectUrl, federation);

        const { objectPath } = parseObjectUrl(objectUrl);

        // Queue the file request
        this.requestQueue.value.push({
            objectUrl,
            federationHostname: federation.hostname,
            path: objectPath,
            namespace: namespace.prefix,
            type: "GET",
            createdAt: new Date().getTime(),
        });

        // Start the authorization code flow
        await startAuthorizationCodeFlow(this.codeVerifier.value, namespace, federation);
    }

    /**
     * Process any queued requests that were waiting for a token
     */
    async processQueuedObjectRequest() {
        for (const req of this.requestQueue.value) {
            switch (req.type) {
                case "GET":
                    await this.get(req.objectUrl);
                    break;
                case "PUT":
                    console.log("You will need to re-submit your upload now that you have a token");
                    break;
                case "PROPFIND":
                    await this.list(req.objectUrl);
                    break;
            }
        }
    }
}

export default Client;
