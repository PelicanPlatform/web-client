'use client'

import Box from "@mui/material/Box";
import {TextField, Typography, Autocomplete, createFilterOptions} from "@mui/material";
import { Button} from "@mui/material";
import {Grid} from "@mui/material";
import {useEffect, useState} from "react";
import Client from "../../../src/Client";

interface FederationName {
  label: string,
  value: string
}

const filter = createFilterOptions<FederationName>();

export default function Home() {

  let [objectPath, setObjectPath] = useState<string>("pelican://osg-htc.org/ospool/ap40/data/cannon.lock/protected.txt");
  let [object, setObject] = useState<File | undefined>(undefined);
  let [objectPathError, setObjectPathError] = useState<string | undefined>(undefined);
  let [client, setClient] = useState<Client | undefined>(undefined);

  useEffect(() => {
    setClient(new Client());
  }, []);

  let [submitError, setSubmitError] = useState<string | undefined>(undefined);

  const submit = async () => {

    let isValid = true;
    if(objectPath === "") {
      setObjectPathError("Object Name is required");
      isValid = false
    }

    if(!isValid) return;

    if(object){
      await client.putObject(objectPath, object)
    } else {
      await client.getObject(objectPath)
    }
  }


  return (
      <Box height={"90vh"}>
        <Grid height={"100%"} justifyContent={"center"} container>
          <Grid item xl={4} md={8} xs={11} display={"flex"}>
            <Box mt={6} mx={"auto"} width={"100%"} display={"flex"} flexDirection={"column"}>
              <Box pt={2}>
                <TextField fullWidth onChange={e => {setObjectPath(e.target.value)}} value={objectPath} id="outlined-basic" label="Object Name" variant="outlined" />
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
                <Button onClick={async () => { console.log(client?.getListing(objectPath))}}>List</Button>
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
                    client.federations = {};
                  }
                }}>Clear Federations</Button>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Box>
  )
}
