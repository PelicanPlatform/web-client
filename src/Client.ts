'use client';

import {
	Federation,
	Namespace,
	QueuedRequest,
	ObjectList,
	TokenPermission
} from "./types"
import {
	cloneDeep
} from 'lodash-es';
import {
	fetchNamespace,
	getObjectToken,
	parsePelicanObjectUrl,
	fetchFederationConfiguration
} from "./pelican";
import {downloadResponse} from "./download";
import {
	generateCodeChallengeFromVerifier,
	generateCodeVerifier,
	getToken,
	getAuthorizationCode
} from "./security";
import {parseOauthState, parseWebDavXmlToJson} from "./util"
import sessionObject, {ProxiedValue} from "./sessionObject";

export default class Client {

	federations: ProxiedValue<Record<string, Federation>>
	prefixToNamespace: Record<string, string>
	requestQueue: ProxiedValue<QueuedRequest[]>
  codeVerifier: ProxiedValue<string>

	constructor() {
		// Set up and load/initialize session storage objects
		this.federations = sessionObject<ProxiedValue<Record<string, Federation>>>("federations", {value: {}})
		this.prefixToNamespace = sessionObject<Record<string, string>>('prefixToNamespace')
		this.requestQueue = sessionObject<ProxiedValue<QueuedRequest[]>>("requestQueue", {value: []})
		this.codeVerifier = sessionObject<ProxiedValue<string>>("codeVerifier", {value: generateCodeVerifier()})

		// If there is a code in the URL, exchange it for a token
		this.exchangeCodeForToken()
	}

	/**
	 * Get an object from a pelican federation
	 * @param objectUrl pelican://<federation-hostname>/<object-path>
	 */
	async get(objectUrl: string) : Promise<void> {

		const {federationHostname, objectPath} = parsePelicanObjectUrl(objectUrl)
		const federation = await this.getFederation(federationHostname)
		const namespace = await this.getNamespace(objectUrl, federation)
		const token = await getObjectToken(namespace)

		const objectHttpUrl = new URL(`${federation.configuration.director_endpoint}${objectPath}`)
		const response = await fetch(objectHttpUrl, {
			headers: {
				"Authorization": `Bearer ${token?.value}`
			}
		})

		if(response.status === 200){
			downloadResponse(response)

			// If we get a 403, queue this request call it after getting a token
		} else if(response.status === 403 && !token){
			await this.queueRequestAndStartFlow(objectUrl, federation)
		} else {
			throw new Error(`Could not get object: ${response.status} ${response.statusText}`)
		}
	}

	async list(collectionUrl: string) : Promise<ObjectList[] | undefined> {
		const {federationHostname, objectPath} = parsePelicanObjectUrl(collectionUrl)
		const federation = await this.getFederation(federationHostname)
		const namespace = await this.getNamespace(collectionUrl, federation)
		const token = await getObjectToken(namespace)

		const objectHttpUrl = new URL(`${federation.configuration.director_endpoint}${objectPath}`)
		const response = await fetch(objectHttpUrl, {
			method: "PROPFIND",
			headers: {
				"Authorization": `Bearer ${token?.value}`,
				"Depth": "4"
			}
		})

		if(response.status === 207){
			return parseWebDavXmlToJson(await response.text())

			// If we get a 403, queue this request call it after getting a token
		} else if(response.status === 403){
			await this.queueRequestAndStartFlow(collectionUrl, federation)
		} else {
			throw new Error(`Could not list directory: ${response.status} ${response.statusText}`)
		}
	}

	async put(objectUrl: string, file: File) : Promise<void> {

		const { federationHostname, objectPath } = parsePelicanObjectUrl(objectUrl)
		const federation = await this.getFederation(federationHostname)
		const namespace = await this.getNamespace(objectUrl, federation)
		const token = await getObjectToken(namespace)

		const objectHttpUrl = new URL(`${federation.configuration.director_endpoint}${objectPath}`)
		const response = await fetch(objectHttpUrl, {
			method: "PUT",
			headers: {
				"Authorization": `Bearer ${token?.value}`
			},
			body: file
		})

		if (response.status === 200 || response.status === 201) {
			return
		} else if (response.status === 403) {
			await this.queueRequestAndStartFlow(objectUrl, federation)
		} else {
			throw new Error(`Could not upload object: ${response.status} ${response.statusText}`)
		}
	}

	/**
	 * Test if we have a valid token for the object URL
	 * @param objectUrl
	 */
	async permissions(objectUrl: string): Promise<TokenPermission[]> {
		const { federationHostname } = parsePelicanObjectUrl(objectUrl)
		const federation = await this.getFederation(federationHostname)
		const namespace = await this.getNamespace(objectUrl, federation)
		const token = await getObjectToken(namespace)

		if(!token) return []

		return token.value
			.split(' ')
			.filter(scope => scope.startsWith('storage.'))
			.map(scope => scope.split(':')[0] as TokenPermission)
	}

	/**
	 * If there is an authorization code in the URL, exchange it for a token and save it to the appropriate namespace
	 */
	async exchangeCodeForToken() {
		const authCode = getAuthorizationCode();
		if(authCode === null) return;

		try {
			// Get the namespace and federation from the state parameter
			const {federation: federationHostname, namespace: namespacePrefix} = parseOauthState(new URL(window.location.href))
			const namespace = this.federations.value[federationHostname]?.namespaces[namespacePrefix]

			// Check if we have an auth code to exchange for a token
			const token = await getToken(namespace.oidcConfiguration, this.codeVerifier.value, namespace.clientId, namespace.clientSecret, authCode)

			// Save the token to the namespace
			const federationsClone = cloneDeep(this.federations.value)
			federationsClone[federationHostname].namespaces[namespacePrefix].token = token.accessToken
			this.federations.value = federationsClone
		} catch {}

		// Clean up the window
		window.history.replaceState({}, document.title, window.location.pathname)
	}

	/**
	 * Get a federation's configuration from the registry and save it to session cache
	 * @param federationHostname
	 */
	async getFederation(federationHostname: string) : Promise<Federation> {
		if(!this.federations.value?.[federationHostname]) {
			this.federations.value = {
				...this.federations.value,
				[federationHostname]: await fetchFederationConfiguration(federationHostname)
			}
		}
		return this.federations.value[federationHostname]
	}

	/**
	 * Get a namespace's configuration from the federation and save it to session cache
	 * @param objectUrl
	 * @param federation
	 */
	async getNamespace(objectUrl: string, federation: Federation) : Promise<Namespace> {

		const {objectPrefix, objectPath} = parsePelicanObjectUrl(objectUrl)

		// Check if we have already cached the namespace for this prefix
		if(this.prefixToNamespace?.[objectPrefix]){
			const namespacePrefix = this.prefixToNamespace[objectPrefix]
			if(federation.namespaces?.[namespacePrefix]){
				return federation.namespaces[namespacePrefix]
			}
		}

		// Fetch and save the namespace information
		const requestNamespace = await fetchNamespace(objectPath, federation)
		this.prefixToNamespace[objectPrefix] = requestNamespace.prefix
		const federationsClone = cloneDeep(this.federations.value)
		federationsClone[federation.hostname].namespaces[requestNamespace.prefix] = requestNamespace
		this.federations.value = federationsClone

		return requestNamespace
	}

	/**
	 * Queue a request that needs authorization and start the authorization code flow
	 * @param objectUrl
	 * @param federation
	 */
	async queueRequestAndStartFlow(objectUrl: string, federation: Federation) : Promise<void> {

		// Fetch and save the namespace information
		const namespace = await this.getNamespace(objectUrl, federation)

		const {objectPath} = parsePelicanObjectUrl(objectUrl)

		// Queue the file request
		this.requestQueue.value.push({
			objectUrl,
			federationHostname: federation.hostname,
			path: objectPath,
			namespace: namespace.prefix,
			type: "GET",
			createdAt: new Date().getTime()
		})

		// Start the authorization code flow
		await this.startAuthorizationCodeFlow(objectPath, namespace, federation)
	}

	/**
	 * Start the OIDC authorization code flow to get a token for a namespace
	 * @param objectPath
	 * @param namespace
	 * @param federation
	 */
	async startAuthorizationCodeFlow(objectPath: string, namespace: Namespace, federation: Federation) : Promise<void> {

		// Determine the token scopes
		const scope = objectPath
			.replace('pelican://', '')
			.replace(federation.hostname, '')
			.replace(namespace.prefix, '')
			.trim()

		// Build the Oauth URL
		const codeChallenge = await generateCodeChallengeFromVerifier(this.codeVerifier.value)
		const authorizationUrl = new URL(namespace.oidcConfiguration.authorization_endpoint)
		authorizationUrl.searchParams.append("client_id", namespace.clientId)
		authorizationUrl.searchParams.append("response_type", "code")
		authorizationUrl.searchParams.append("scope", `storage.read:${scope} storage.create:${scope}`)
		authorizationUrl.searchParams.append("redirect_uri", "http://localhost:3000")
		authorizationUrl.searchParams.append("code_challenge", codeChallenge)
		authorizationUrl.searchParams.append("code_challenge_method", "S256")
		authorizationUrl.searchParams.append("state", `namespace:${namespace.prefix};federation:${federation.hostname}`)
		authorizationUrl.searchParams.append("action", "")

		// Begin the authorization code flow to get a token
		window.location.href = authorizationUrl.toString()
	}

	/**
	 * Process any queued requests that were waiting for a token
	 */
	async processQueuedObjectRequest() {
		for(const req of this.requestQueue.value) {
			switch (req.type) {
				case "GET":
					await this.get(req.objectUrl)
					break
				case "PUT":
					console.log("You will need to re-submit your upload now that you have a token")
					break
				case "PROPFIND":
					await this.list(req.objectUrl)
					break
			}
		}
	}
}
