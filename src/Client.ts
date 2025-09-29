
import {
	AuthorizationClient,
	Federation,
	FederationConfiguration, Namespace,
	OidcConfiguration, QueuedRequest, ObjectList
} from "./types"
import {
	fetchOpenIDConfiguration,
	fetchNamespaceMetadata,
	getObjectToken,
	parsePelicanObjectUrl, fetchFederationConfiguration
} from "./pelican";
import {downloadResponse} from "./download";
import {
	generateCodeChallengeFromVerifier,
	generateCodeVerifier,
	getToken,
	getAuthorizationCode, registerClient
} from "./security";
import {parseOauthState, parseWebDavXmlToJson} from "./util"
import sessionObject, {ProxiedValue} from "./sessionObject";

export default class Client {

	federations: Record<string, Federation>
	requestQueue: ProxiedValue<QueuedRequest[]>
  codeVerifier: ProxiedValue<string>

	constructor() {
		// Set up and load/initialize session storage objects
		this.federations = sessionObject<Record<string, Federation>>("federations")
		this.requestQueue = sessionObject<ProxiedValue<QueuedRequest[]>>("requestQueue", {value: []})
		this.codeVerifier = sessionObject<ProxiedValue<string>>("codeVerifier", {value: generateCodeVerifier()})

		// If there is a code in the URL, exchange it for a token
		this.exchangeCodeForToken()
	}

	/**
	 * Get an object from a pelican federation
	 * @param objectUrl pelican://<federation-hostname>/<object-path>
	 * @param token Optional token to use for the request if resource is protected
	 */
	async get(objectUrl: string, token?: string) : Promise<void> {

		const {federationHostname, objectPath} = parsePelicanObjectUrl(objectUrl)
		const federation = await this.getFederation(federationHostname)

		// Check for and use a token if we have one
		if(token === undefined){
			token = await getObjectToken(objectPath, federation)
		}

		const objectHttpUrl = new URL(`${federation.configuration.director_endpoint}${objectPath}`)
		const response = await fetch(objectHttpUrl, {
			headers: {
				"Authorization": `Bearer ${token}`
			}
		})

		if(response.status === 200){
			downloadResponse(response)

			// If we get a 403, queue this request call it after getting a token
		} else if(response.status === 403 && !token){
			await this.queueRequestAndStartFlow(objectPath, federation)
		} else {
			throw new Error(`Could not get object: ${response.status} ${response.statusText}`)
		}
	}

	async list(federationPath: string, token?: string) : Promise<ObjectList[] | undefined> {
		const {federationHostname, objectPath} = parsePelicanObjectUrl(federationPath)
		const federation = await this.getFederation(federationHostname)

		// Check for and use a token if we have one
		if(token === undefined){
			token = await getObjectToken(objectPath, federation)
		}

		const objectHttpUrl = new URL(`${federation.configuration.director_endpoint}${objectPath}`)
		const response = await fetch(objectHttpUrl, {
			method: "PROPFIND",
			headers: {
				"Authorization": `Bearer ${token}`,
				"Depth": "4"
			}
		})

		if(response.status === 207){
			return parseWebDavXmlToJson(await response.text())

			// If we get a 403, queue this request call it after getting a token
		} else if(response.status === 403){
			await this.queueRequestAndStartFlow(objectPath, federation)
		} else {
			throw new Error(`Could not list directory: ${response.status} ${response.statusText}`)
		}
	}

	async put(objectUrl: string, file: File, token?: string) : Promise<void> {

		const { federationHostname, objectPath } = parsePelicanObjectUrl(objectUrl)
		const federation = await this.getFederation(federationHostname)

		// Check for and use a token if we have one
		if (token === undefined) {
			token = await getObjectToken(objectPath, federation)
		}

		const objectHttpUrl = new URL(`${federation.configuration.director_endpoint}${objectPath}`) // TODO: ${federation.configuration.director_endpoint}
		const response = await fetch(objectHttpUrl, {
			method: "PUT",
			headers: {
				"Authorization": `Bearer ${token}`
			},
			body: file
		})

		if (response.status === 200 || response.status === 201) {
			return
		} else if (response.status === 403) {
			await this.queueRequestAndStartFlow(objectPath, federation)
		} else {
			throw new Error(`Could not upload object: ${response.status} ${response.statusText}`)
		}
	}

	/**
	 *
	 */

	/**
	 * Register a client via the dynamic client registration endpoint on the Origin's issuer
	 * @param issuerConfiguration Issuer's OIDC configuration
	 */
	async registerAuthorizationClient(issuerConfiguration: OidcConfiguration): Promise<AuthorizationClient> {
		const dynamicClientPayload = {
			redirect_uris: [window.location.origin],
			token_endpoint_auth_method: "client_secret_basic",
			grant_types: ["refresh_token", "authorization_code"],
			response_types: ["code"],
			client_name: "Pelican Web Client",
			scope: "openid storage.create:/ storage.modify:/ storage.read:/",
		}

		return await registerClient(issuerConfiguration.registration_endpoint, dynamicClientPayload)
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
			const namespace = this.federations[federationHostname]?.namespaces[namespacePrefix]

			// Check if we have a auth code to exchange for a token
			const token = await getToken(namespace.oidcConfiguration, this.codeVerifier.value, namespace.clientId, namespace.clientSecret, authCode)

			// Save the token to the namespace
			this.federations[federationHostname].namespaces = {
				...this.federations[federationHostname],
				namespaces: {
					...this.federations[federationHostname].namespaces,
					[namespacePrefix]: {
						...namespace,
						token: token
					}
				}
			}
		} catch {}

		// Clean up the window
		window.history.replaceState({}, document.title, window.location.pathname)
	}

	/**
	 * Queries the director for a namespaces metadata and saves it to the session
	 * @param objectPath
	 * @param federationHostname
	 */
	async registerNamespace(objectPath: string, federationHostname: string) {

		const federation = await this.getFederation(federationHostname)
		const namespaceMetadata = await fetchNamespaceMetadata(objectPath, federation)
		const issuerOidcConfiguration = await fetchOpenIDConfiguration(namespaceMetadata.issuer)
		const authorizationClient = await this.registerAuthorizationClient(issuerOidcConfiguration)

		// Check that the issuer has the expected data
		if(issuerOidcConfiguration.authorization_endpoint === undefined){
			throw new Error(`Issuer ${namespaceMetadata.issuer} does not have an authorization endpoint`)
		}

		// Save the namespace information
		this.federations[federation.hostname] = {
			...federation,
			namespaces: {
				...federation.namespaces,
				[namespaceMetadata.namespace.namespace]: {
					prefix: namespaceMetadata.namespace.namespace,
					token: undefined,
					clientId: authorizationClient.clientId,
					clientSecret: authorizationClient.clientSecret,
					oidcConfiguration: issuerOidcConfiguration
				}
			}
		}
	}

	/**
	 * Get a federation's configuration from the registry and save it to session cache
	 * @param federationHostname
	 */
	async getFederation(federationHostname: string) : Promise<Federation> {
		if(!this.federations?.[federationHostname]) {
			this.federations[federationHostname] = await fetchFederationConfiguration(federationHostname)
		}
		return this.federations[federationHostname]
	}

	async queueRequestAndStartFlow(objectPath: string, federation: Federation) : Promise<void> {

		// Get metadata from the director
		const namespaceMetadata = await fetchNamespaceMetadata(objectPath, federation)
		const issuerOidcConfiguration = await fetchOpenIDConfiguration(namespaceMetadata.issuer)
		const authorizationClient = await this.registerAuthorizationClient(issuerOidcConfiguration)

		// Check that the issuer has the expected data
		if(issuerOidcConfiguration.authorization_endpoint === undefined){
			throw new Error(`Issuer ${namespaceMetadata.issuer} does not have an authorization endpoint`)
		}



		// Queue the file request
		this.requestQueue.value = [
			...this.requestQueue.value,
			{
				objectUrl: `pelican://${federation.hostname}${objectPath}`,
				federationHostname: federation.hostname,
				path: objectPath,
				namespace: namespaceMetadata.namespace.namespace,
				type: "GET",
				createdAt: new Date().getTime()
			}
		]

		// Determine the token scopes
		const scope = objectPath
			.replace('pelican://', '')
			.replace(federation.hostname, '')
			.replace(namespaceMetadata.namespace.namespace, '')
			.trim()

		// Build the Oauth URL
		const codeChallenge = await generateCodeChallengeFromVerifier(this.codeVerifier.value)
		const authorizationUrl = new URL(issuerOidcConfiguration.authorization_endpoint)
		authorizationUrl.searchParams.append("client_id", authorizationClient.clientId)
		authorizationUrl.searchParams.append("response_type", "code")
		authorizationUrl.searchParams.append("scope", `storage.read:${scope} storage.create:${scope}`)
		authorizationUrl.searchParams.append("redirect_uri", "http://localhost:3000")
		authorizationUrl.searchParams.append("code_challenge", codeChallenge)
		authorizationUrl.searchParams.append("code_challenge_method", "S256")
		authorizationUrl.searchParams.append("state", `namespace:${namespaceMetadata.namespace.namespace};federation:${federation.hostname}`)
		authorizationUrl.searchParams.append("action", "")

		// Begin the authorization code flow to get a token
		window.location.href = authorizationUrl.toString()
	}

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
