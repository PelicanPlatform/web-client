"use client";

import AuthenticatedClient from "../AuthenticatedClient";
import PublicClient from "../PublicClient";
import { UsePelicanClientOptions } from "../usePelicanClient";
import {PelicanClientProvider} from "../PelicanClientProvider";

/**
 * A Pelican web-client, which can be either authenticated or public based on props
 */
const Client = (props: UsePelicanClientOptions) => {
  return (
    <PelicanClientProvider initialObjectUrl={props.objectUrl} enableAuth={props.enableAuth}>
      {props.enableAuth ? <AuthenticatedClient {...props} /> : <PublicClient {...props} />}
    </PelicanClientProvider>
  )
};

export default Client;
