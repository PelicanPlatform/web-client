import { Box, Chip, FormControlLabel, Switch, Typography } from "@mui/material";

interface ClientMetadataProps {
	permissions: string[] | null;
	showDirectories: boolean;
	setShowDirectories: (show: boolean) => void;
}

function ClientMetadata({ permissions, showDirectories, setShowDirectories }: ClientMetadataProps) {
	return (
		<Box
			display={"flex"}
			alignItems={"center"}
			justifyContent={"space-between"}
			gap={2}
			my={1}
			flexDirection="row-reverse"
		>
			{permissions && (
				<Box display={"flex"} alignItems={"center"} gap={1}>
					<Typography variant="body2">Permissions:</Typography>
					{permissions.map((perm) => (
						<Chip key={perm} label={perm} size="small" />
					))}
				</Box>
			)}
			<FormControlLabel
				control={
					<Switch
						checked={showDirectories}
						onChange={(e) => setShowDirectories(e.target.checked)}
						name="show-directories"
						color="primary"
						size="small"
					/>
				}
				label="Show Directories"
				slotProps={{
					typography: { variant: "body2" },
				}}
			/>
		</Box>
	);
}

export default ClientMetadata;
