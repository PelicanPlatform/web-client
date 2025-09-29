'use client'

import Box from "@mui/material/Box";
import {TextField, Typography, Autocomplete, createFilterOptions} from "@mui/material";
import { Button} from "@mui/material";
import {Grid} from "@mui/material";
import {useEffect, useMemo, useState} from "react";
import Client from "../../../src/Client";
import { ObjectList, TokenPermission } from "../../../src/types"
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";

export default function Home() {

  let [objectPath, setObjectPath] = useState<string>("pelican://osg-htc.org/ospool/ap40/data/cannon.lock/protected.txt");
	let [permissions, setPermissions] = useState<TokenPermission[] | undefined>(undefined);
  let [object, setObject] = useState<File | undefined>(undefined);
  let [objectPathError, setObjectPathError] = useState<string | undefined>(undefined);
  let [client, setClient] = useState<Client | undefined>(undefined);
	let [ObjectList, setObjectList] = useState<ObjectList[] | undefined>([]);
	let [submitError, setSubmitError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setClient(new Client());
  }, []);

	// Check your file permissions for the entered object
	useEffect(() => {
		(async () => {
			setPermissions(await client?.permissions(objectPath))
		})()
	}, [objectPath, client])

  const submit = async () => {

    let isValid = true;
    if(objectPath === "") {
      setObjectPathError("Object Name is required");
      isValid = false
    }

    if(!isValid) return;

    if(object){
      await client?.put(objectPath, object)
    } else {
      await client?.get(objectPath)
    }
  }

	const federations = useMemo(() => client?.federations.value, [client?.federations.value]);

  return (
      <Box minHeight={"90vh"}>
        <Grid height={"100%"} justifyContent={"center"} container gap={2}>
          <Grid item xl={4} md={8} xs={11} display={"flex"} flexDirection={"column"}>
            <Box mt={6} mx={"auto"} width={"100%"} display={"flex"} flexDirection={"column"}>
              <Box pt={2}>
                <TextField fullWidth onChange={e => {setObjectPath(e.target.value)}} value={objectPath} id="outlined-basic" label="Object Name" variant="outlined" />
								<Typography variant={'subtitle2'}>
									Namespace Permissions: {permissions ? permissions.join(", ") : "Unknown"}
								</Typography>
                <Box mt={2}>
                  <input
                      type="file"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          setObjectPath(`pelican://localhost:80/mnt/${e.target.files[0].name}`);
                          setObject(e.target.files?.[0])
                        }
                      }}
                  />
                </Box>
                <Button onClick={async () => { setObjectList(await client?.list(objectPath))}}>List</Button>
              </Box>
              { submitError ?
                <Box>
                  <Typography variant={"subtitle1"} color={"error"}>{submitError}</Typography>
                </Box> : undefined
              }
              <Box pt={1} mx={"auto"}>
                <Button variant="contained" onClick={submit}>{object ? 'Upload' : 'Download'}</Button>
                <Button onClick={() => {
                  if(client) {
                    client.federations.value = {};
                  }
                }}>Clear Federations</Button>
              </Box>
            </Box>
						<Box mt={6} mx={"auto"} width={"100%"} display={"flex"} flexDirection={"column"}>
							<Box pt={2}>
								{ObjectList?.length === 0 ? (
									<Typography variant="body2" color="textSecondary">No objects found.</Typography>
								) : (
									ObjectList?.map((obj, index) => (
										<Card key={index} sx={{ mb: 2 }} variant="outlined">
											<CardContent>
												<Typography variant="h6" gutterBottom>{obj.href}</Typography>
												<Divider sx={{ my: 1 }} />
												<Typography variant="body2"><strong>Type:</strong> {obj.resourcetype}{obj.iscollection ? " (Collection)" : ""}</Typography>
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
					<Grid item xl={7} md={8} xs={11} display={"flex"}>
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
