
import {
	AuthorizationClient,
	Federation,
	FederationConfiguration, Namespace,
	OidcConfiguration, QueuedRequest
} from "./types"
import {
	fetchIssuerConfiguration,
	getPathMetadataFromDirector,
	namespaceFitness,
	parsePelicanObjectUrl
} from "./pelican";
import {downloadResponse} from "./download";
import {generateCodeChallengeFromVerifier, generateCodeVerifier, getToken} from "./security";

export default class Client {

	constructor() {
		// Generate a code verifier to use/store
		const sessionCodeVerifier = sessionStorage.getItem("code_verifier")
		if(sessionCodeVerifier === null){
			this.codeVerifier = generateCodeVerifier()
			sessionStorage.setItem("code_verifier", this.codeVerifier)
		}

		// Read the authorization code from the URL
		this.processQueuedObjectRequest()
	}

	get codeVerifier() {
		let sessionCodeVerifier = sessionStorage.getItem("code_verifier")
		if(sessionCodeVerifier !== null){
			return sessionCodeVerifier
		}

		// Create and save a new code verifier
		const codeVerifier = generateCodeVerifier()
		this.codeVerifier = codeVerifier
		return codeVerifier
	}

	set codeVerifier(codeVerifier: string) {
		sessionStorage.setItem("code_verifier", codeVerifier)
	}

	get federations(): Record<string, Federation> {
		let sessionFederations = sessionStorage.getItem("federations")
		if(sessionFederations !== null){
			return JSON.parse(sessionFederations)
		}
		return {}
	}

	set federations(federations: Record<string, Federation>) {
		sessionStorage.setItem("federations", JSON.stringify(federations))
	}

	get queuedRequest(): QueuedRequest | null {
		let sessionQueuedRequest = sessionStorage.getItem("queued_request")
		if(sessionQueuedRequest !== null){
			return JSON.parse(sessionQueuedRequest)
		}
		return null
	}

	set queuedRequest(queuedRequest: QueuedRequest | null) {
		sessionStorage.setItem("queued_request", JSON.stringify(queuedRequest))
	}

	/**
	 * Register a client via the dynamic client registration endpoint on the Origin's issuer
	 * @param issuerConfiguration Issuer's OIDC configuration
	 */
	async registerAuthorizationClient(issuerConfiguration: OidcConfiguration): Promise<AuthorizationClient> {

		const dynamicClientPayload = {
			redirect_uris: ["http://localhost:3000"],
			grant_types: ["authorization_code"],
			response_types: ["code"],
			client_name: "OSDF Web Client"
		}

		const response = await fetch(issuerConfiguration.registration_endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify(dynamicClientPayload)
		})

		if(response.status === 201){
			const {client_id, client_secret, ..._} = await response.json()
			return {
				clientId: client_id,
				clientSecret: client_secret
			}
		}

		throw new Error("Was not able to register client at " + issuerConfiguration.registration_endpoint)
	}

	async processQueuedObjectRequest() {

		// Check if we have a queued request
		if(this.queuedRequest === null) return;

		const federations = this.federations
		const federation = federations[this.queuedRequest.federationHostname]
		const namespace = federation?.namespaces[this.queuedRequest.namespace]

		if(federation === undefined || namespace === undefined){
			this.queuedRequest = null
			console.log("No federation or namespace found for queued request, clearing it")
			return
		}

		console.log("Federation", JSON.stringify(federation))
		console.log("Namespace", JSON.stringify(namespace))

		// Check if we have a token to exchange and update if so
		namespace['token'] = await getToken(namespace.oidcConfiguration, this.codeVerifier, namespace.clientId, namespace.clientSecret)
		console.log("Namespace Post Token Addition;", JSON.stringify(namespace))
		this.federations = federations

		console.log("Federations", JSON.stringify(this.federations))
		const objectToken = await getObjectToken(this.queuedRequest.path, federation)
		console.log("Object Token", objectToken)

		await this.getObject(this.queuedRequest.objectUrl)
	}

	async getFederation(federationHostname: string) {

		// If the federation is already loaded, return it
		if(federationHostname in this.federations) {
			return this.federations[federationHostname]
		}

		// Load in the federation configuration and save to the session
		const configurationEndpoint = `https://${federationHostname}/.well-known/pelican-configuration`
		const res = await fetch(configurationEndpoint)
		if(res.status !== 200){
			throw new Error(`Metadata endpoint returned ${res.status}: ` + configurationEndpoint)
		}
		const federationConfiguration = await res.json() as FederationConfiguration
		const federation = {
			hostname: federationHostname,
			configuration: federationConfiguration,
			namespaces: {}
		}
		this.federations = {
			...this.federations,
			[federationHostname]: federation
		}

		return federation
	}

	async getObject(objectUrl: string, token?: string) : Promise<void> {

		const {federationHostname, objectPath} = parsePelicanObjectUrl(objectUrl)
		const federation = await this.getFederation(federationHostname)

		// Check for and use a token if we have one
		if(token === undefined){
			token = await getObjectToken(objectPath, federation)
		}

		const objectHttpUrl = new URL(`${federation.configuration.director_endpoint}${objectPath}`) // TODO: ${federation.configuration.director_endpoint}
		const response = await fetch(objectHttpUrl, {
			headers: {
				"Authorization": `Bearer ${token}`
			}
		})


		if(response.status === 200){
			downloadResponse(response)

		// If we get a 403, queue this request call it after getting a token
		} else if(response.status === 403){
			await this.queueRequestAndGetToken(objectPath, federation)
		}

		throw new Error(`Director endpoint returned ${response.status}: ${objectHttpUrl}`)
	}

	async getListing(federationPath: string, token?: string) : Promise<any> {
		const {federationHostname, objectPath} = parsePelicanObjectUrl(federationPath)
		const federation = await this.getFederation(federationHostname)

		// Check for and use a token if we have one
		if(token === undefined){
			token = await getObjectToken(objectPath, federation)
		}

		const objectHttpUrl = new URL(`${federation.configuration.director_endpoint}${objectPath}`)
		const response = await fetch("https://localhost:8201/mnt", {
			method: "PROPFIND",
			headers: {
				"Authorization": `Bearer ${token}`,
				"Depth": "4"
			}
		})

		if(response.status === 200){
			return await response.json()

			// If we get a 403, queue this request call it after getting a token
		} else if(response.status === 403){
			await this.queueRequestAndGetToken(objectPath, federation)
			return
		}

		throw new Error(`Director endpoint returned ${response.status}: ${objectHttpUrl}`)
	}

	async putObject(objectUrl: string, file: File, token?: string) : Promise<void> {

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
			console.log("File uploaded successfully")
			return
		} else if (response.status === 403) {
			await this.queueRequestAndGetToken(objectPath, federation)
			return
		}

		throw new Error(`Director endpoint returned ${response.status}: ${objectHttpUrl}`)
	}

	async queueRequestAndGetToken(objectPath: string, federation: Federation) : Promise<void> {

		// Get metadata from the director
		const namespaceMetadata = await getPathMetadataFromDirector(objectPath, federation)
		const issuerOidcConfiguration = await fetchIssuerConfiguration(namespaceMetadata.issuer)
		const authorizationClient = await this.registerAuthorizationClient(issuerOidcConfiguration)

		// Check that the issuer has the expected data
		if(issuerOidcConfiguration.authorization_endpoint === undefined){
			throw new Error(`Issuer ${namespaceMetadata.issuer} does not have an authorization endpoint`)
		}

		// Save the namespace information
		this.federations = {
			...this.federations,
			[federation.hostname]: {
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

		// Queue the file request
		this.queuedRequest = {
			objectUrl: `pelican://${federation.hostname}${objectPath}`,
			federationHostname: federation.hostname,
			path: objectPath,
			namespace: namespaceMetadata.namespace.namespace,
			type: "GET",
			createdAt: new Date().getTime()
		}

		// Build the Oauth URL
		const codeChallenge = await generateCodeChallengeFromVerifier(this.codeVerifier)
		const authorizationUrl = new URL(issuerOidcConfiguration.authorization_endpoint)
		authorizationUrl.searchParams.append("client_id", authorizationClient.clientId)
		authorizationUrl.searchParams.append("response_type", "code")
		authorizationUrl.searchParams.append("scope", "openid storage.read:/ storage.modify:/ storage.create:/")
		authorizationUrl.searchParams.append("redirect_uri", "http://localhost:3000")
		authorizationUrl.searchParams.append("code_challenge", codeChallenge)
		authorizationUrl.searchParams.append("code_challenge_method", "S256")
		authorizationUrl.searchParams.append("state", "state")
		authorizationUrl.searchParams.append("action", "")

		// Begin the authorization code flow to get a token
		window.location.href = authorizationUrl.toString()
	}
}

/**
 * Get the best fit token for the given object path and federation or undefined if none are readily available
 *
 * @param objectPath Object path - pelican://<federation-hostname>/<object-path>
 * @param federation Federation hosting the requested object
 */
const getObjectToken = async (objectPath: string, federation: Federation) : Promise<string | undefined> => {

	const matchingNamespaces = Object.values(federation.namespaces)
			// Only keep namespaces that match the object path
			.filter(namespace => objectPath.startsWith(namespace.prefix))
			// Sort by best match
			.sort((a, b) => {
				return namespaceFitness(a.prefix, objectPath) - namespaceFitness(b.prefix, objectPath)
			})

	// Return the token from the best matching namespace or undefined if none matched
	return matchingNamespaces?.[0]?.token?.accessToken
}
