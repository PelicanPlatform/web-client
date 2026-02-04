"use client";

import AuthenticatedClient from "../AuthenticatedClient";
import PublicClient from "../PublicClient";
import {PelicanClientProvider} from "../PelicanClientProvider";

export interface ClientProps {
  /** The initial object URL to load */
  objectUrl: string;
  /** Whether to enable authentication features */
  enableAuth?: boolean;
}

/**
 * A Pelican web-client, which can be either authenticated or public based on props
 */
const Client = (props: ClientProps) => {
  return (
    <PelicanClientProvider initialObjectUrl={props.objectUrl} enableAuth={props.enableAuth}>
      {props.enableAuth ? <AuthenticatedClient /> : <PublicClient />}
    </PelicanClientProvider>
  )
};

export default Client;
