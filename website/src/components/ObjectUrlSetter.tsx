"use client";

import React from "react";
import { TextField, Box } from "@mui/material";
import { usePelicanClient } from "@pelicanplatform/hooks";

/**
 * ObjectUrlSetter component provides an input field to set the current object URL
 * in the PelicanClientProvider context.
 */
export default function ObjectUrlSetter() {
  const {
    objectUrl,
    setObjectUrl,
    loading
  } = usePelicanClient();

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setObjectUrl(event.target.value);
  };

  return (
    <Box mb={2}>
      <TextField
        fullWidth
        label="Object URL"
        value={objectUrl}
        onChange={handleChange}
        disabled={loading}
        placeholder="pelican://federation/namespace/path"
        variant="outlined"
        helperText="Enter a Pelican object URL"
      />
    </Box>
  );
}
