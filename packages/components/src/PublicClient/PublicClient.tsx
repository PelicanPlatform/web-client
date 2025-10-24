"use client";

import { Box } from "@mui/material";

import ObjectInput from "../ObjectInput";
import ObjectView from "../ObjectView";
import ClientMetadata from "../ClientMetadata";
import usePelicanClient from "../usePelicanClient";

interface PublicClientProps {
	/** The initial object URL to load */
	startingUrl?: string | null | undefined;
}

function PublicClient({ startingUrl }: PublicClientProps = {}) {

	const {
		objectUrl,
		setObjectUrl,
		objectList,
		loading,
		showDirectories,
		setShowDirectories,
		loginRequired,
		handleRefetchObject,
		handleExplore,
		handleDownload,
	} = usePelicanClient({ startingUrl, enableAuth: false });

	return (
		<Box>
			<Box mt={6} mx={"auto"} width={"100%"} display={"flex"} flexDirection={"column"}>
				<Box pt={2}>
					<ObjectInput
						objectUrl={objectUrl}
						setObjectUrl={setObjectUrl}
						onChange={handleRefetchObject}
						loading={loading}
					/>
					<ClientMetadata
						permissions={null}
						showDirectories={showDirectories}
						setShowDirectories={setShowDirectories}
					/>
				</Box>
			</Box>
			<ObjectView
				objectList={objectList}
				showCollections={showDirectories}
				onExplore={handleExplore}
				onDownload={handleDownload}
				loginRequired={loginRequired}
				canLogin={false}
			/>
		</Box>
	);
}

export default PublicClient;
