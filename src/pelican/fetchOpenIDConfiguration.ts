/** Fetch the issuer's OIDC configuration from the well-known endpoint */
export async function fetchOpenIDConfiguration(issuer: string) : Promise<any> {
	const response = await fetch(`${issuer}/.well-known/openid-configuration`)
	if(response.status === 200){
		return await response.json()
	}
	throw new Error(`Issuer endpoint returned ${response.status}: ${issuer}/.well-known/openid-configuration`)
}

export default fetchOpenIDConfiguration;
