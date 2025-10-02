'use client'

import Box from "@mui/material/Box";
import {IconButton, TextField, Typography} from "@mui/material";
import { Button} from "@mui/material";
import {Grid} from "@mui/material";
import {useCallback, useEffect, useMemo, useState} from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import { useSessionStorage } from "usehooks-ts";
import {Lock} from "@mui/icons-material";

import {
	ObjectList,
	TokenPermission,
	Federation,
	ObjectPrefixToNamespaceKeyMap,
	UnauthenticatedError,
	generateCodeVerifier,
	getAuthorizationCode,
	getToken,
	startAuthorizationCodeFlow,
	parseObjectUrl,
	fetchFederation,
	fetchNamespace,
	list,
	get,
	put,
	permissions
} from "@pelicanplatform/web-client";

function Page() {

	// Pelican client state
	const [federations, setFederations, removeFederations] = useSessionStorage<Record<string, Federation>>('federations', {})
	const [prefixToNamespace, setPrefixToNamespace, removePrefixToNamespace] = useSessionStorage<ObjectPrefixToNamespaceKeyMap>('prefixToNamespace', {})
	const [codeVerifier, setCodeVerifier, removeCodeVerifier] = useSessionStorage<string | undefined>('codeVerifier', undefined)

	// Initialize code verifier if not present
	useEffect(() => {
		if(!codeVerifier){
			setCodeVerifier(generateCodeVerifier())
		}
	}, [codeVerifier])

	// Run list on load
	useEffect(() => {
		(async () => {
			await onObjectUrlChange(objectUrl, federations, setFederations, prefixToNamespace, setPrefixToNamespace, setPermissions, setLoginRequired, setObjectList)
		})()
	}, [])

	// On load, check if there is a code in the URL to exchange for a token
	useEffect(() => {(async () => {

		const {federationHostname, namespacePrefix, code} = getAuthorizationCode()

		// If there is a code in the URL, exchange it for a token
		if (code && federationHostname && namespacePrefix && codeVerifier) {
			const namespace = federations[federationHostname]?.namespaces[namespacePrefix]
			const token = await getToken(namespace?.oidcConfiguration, codeVerifier, namespace?.clientId, namespace?.clientSecret, code)
			setFederations({
				...federations,
				[federationHostname]: {
					...federations[federationHostname],
					namespaces: {
						...federations[federationHostname]?.namespaces,
						[namespacePrefix]: {
							...federations[federationHostname]?.namespaces[namespacePrefix],
							token: token.accessToken
						}
					}
				}
			})
		}

	})()}, [federations, codeVerifier])

	// UI State
	let [loginRequired, setLoginRequired] = useState<boolean>(false);
	let [objectUrl, setObjectUrl] = useState<string>("pelican://osg-htc.org/ncar");
	let [permissions, setPermissions] = useState<TokenPermission[] | undefined>(undefined);
	let [object, setObject] = useState<File | undefined>(undefined);
	let [objectList, setObjectList] = useState<ObjectList[] | undefined>([]);

	return (
		<Box minHeight={"90vh"}>
			<Grid height={"100%"} justifyContent={"center"} container gap={2}>
				<Grid size={{xl: 4, md: 8, xs: 11}} display={"flex"} flexDirection={"column"}>
					<Box mt={6} mx={"auto"} width={"100%"} display={"flex"} flexDirection={"column"}>
						<Box pt={2}>
							<TextField fullWidth onChange={async (e) => {
								setObjectUrl(e.target.value)
								await onObjectUrlChange(e.target.value, federations, setFederations, prefixToNamespace, setPrefixToNamespace, setPermissions, setLoginRequired, setObjectList)
							}} value={objectUrl} id="outlined-basic" label="Object Name" variant="outlined"/>
							{loginRequired && codeVerifier && (
								<IconButton
									onClick={async () => {
										const {federationHostname, objectPrefix} = parseObjectUrl(objectUrl)

										const federation = federations[federationHostname]
										const namespaceKey = prefixToNamespace[objectPrefix]
										const namespace = federation.namespaces[namespaceKey.namespace]

										startAuthorizationCodeFlow(codeVerifier, namespace, federation)
									}}
								>
									<Lock/>
								</IconButton>
							)}
							<Typography variant={'subtitle2'}>
								Namespace Permissions: {permissions ? permissions.join(", ") : "Unknown"}
							</Typography>
							<Box mt={2}>
								<input
									type="file"
									onChange={e => {
										if (e.target.files && e.target.files[0]) {
											setObjectUrl(`pelican://localhost:80/mnt/${e.target.files[0].name}`);
											setObject(e.target.files?.[0])
										}
									}}
								/>
							</Box>
						</Box>
					</Box>
					<Box mt={6} mx={"auto"} width={"100%"} display={"flex"} flexDirection={"column"}>
						<Box pt={2}>
							{objectList?.length === 0 ? (
								<Typography variant="body2" color="textSecondary">No objects found.</Typography>
							) : (
								objectList?.map((obj, index) => (
									<Card key={index} sx={{mb: 2}} variant="outlined">
										<CardContent>
											<Typography variant="h6" gutterBottom>{obj.href}</Typography>
											<Divider sx={{my: 1}}/>
											<Typography
												variant="body2"><strong>Type:</strong> {obj.resourcetype}{obj.iscollection ? " (Collection)" : ""}
											</Typography>
											<Typography variant="body2"><strong>Size:</strong> {obj.getcontentlength} bytes</Typography>
											<Typography variant="body2"><strong>Last Modified:</strong> {obj.getlastmodified}</Typography>
											<Typography variant="body2"><strong>Executable:</strong> {obj.executable}</Typography>
											<Typography variant="body2"><strong>Status:</strong> {obj.status}</Typography>
										</CardContent>
									</Card>
								))
							)}
						</Box>
					</Box>
				</Grid>
				<Grid size={{xl: 7, md: 8, xs: 11}} display={"flex"} flexDirection={"column"}>
					<Box pt={1} mx={"auto"}>
						{/*<Button variant="contained" onClick={submit}>{object ? 'Upload' : 'Download'}</Button>*/}
						<Button onClick={() => {
							setFederations({})
							setPrefixToNamespace({})
						}}>Clear Federations</Button>
					</Box>
					<Box mt={6} mx={"auto"} width={"100%"} display={"flex"} flexDirection={"column"}>
						<Typography variant="h6" gutterBottom>Client Federations ( for debug only )</Typography>
						<Box overflow={'auto'}>
								<pre>
									<code>
										{JSON.stringify(federations, null, 2)}
									</code>
								</pre>
						</Box>
					</Box>
				</Grid>
			</Grid>
		</Box>
	)
}

/**
 * Pull in objectUrl related information into React state
 * @param objectUrl
 * @param federations
 * @param setFederations
 * @param prefixToNamespace
 * @param setPrefixToNamespace
 * @param setPermissions
 * @param setLoginRequired
 * @param setObjectList
 */
const onObjectUrlChange = async (objectUrl: string, federations: Record<string, Federation>, setFederations: (f: Record<string, Federation>) => void, prefixToNamespace: ObjectPrefixToNamespaceKeyMap, setPrefixToNamespace: (m: ObjectPrefixToNamespaceKeyMap) => void, setPermissions: (p: TokenPermission[]) => void, setLoginRequired: (b: boolean) => void, setObjectList: (l: ObjectList[]) => void) => {

	let {federationHostname, objectPrefix, objectPath} = parseObjectUrl(objectUrl)

	// If we haven't registered the federation
	try {
		if(!(federationHostname in federations)) {
			const federation = await fetchFederation(federationHostname)
			federations = {
				...federations,
				[federationHostname]: federation
			}
			setFederations(federations)
		}
	} catch {}


	// If we haven't mapped this prefix to a namespace
	try {
		if(!(objectPrefix in prefixToNamespace)) {
			const namespace = await fetchNamespace(objectPath, federations[federationHostname])
			prefixToNamespace = {
				...prefixToNamespace,
				[objectPrefix]: {
					federation: federationHostname,
					namespace: namespace.prefix
				}
			}
			setPrefixToNamespace(prefixToNamespace)

			// If we haven't registered this namespace
			if(!(namespace.prefix in federations[federationHostname].namespaces)) {
				setFederations({
					...federations,
					[federationHostname]: {
						...federations[federationHostname],
						namespaces: {
							...federations[federationHostname]?.namespaces,
							[namespace.prefix]: namespace
						}
					}
				})
			}
		}
	} catch {}


	// Check permissions
	try {
		if(federations[federationHostname].namespaces?.[prefixToNamespace[objectPrefix]?.namespace]){
			const perms = await permissions(objectUrl, federations[federationHostname].namespaces?.[prefixToNamespace[objectPrefix]?.namespace])
			setPermissions(perms)
		}
	} catch {}


	// Try to list
	try {
		try {
			setObjectList(await list(`pelican://${objectPrefix}`, federations[federationHostname], federations[federationHostname].namespaces?.[prefixToNamespace[objectPrefix]?.namespace]))
			setLoginRequired(false)
		} catch (e) {
			setObjectList(await list(`pelican:/${objectPath}`, federations[federationHostname], federations[federationHostname].namespaces?.[prefixToNamespace[objectPrefix]?.namespace]))
			setLoginRequired(false)
		}
	} catch (e) {
		if(e instanceof UnauthenticatedError) {
			setLoginRequired(true)
			setObjectList([])
		}
	}
}

export default Page;
