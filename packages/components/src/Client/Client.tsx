import AuthenticatedClient from "../AuthenticatedClient";
import PublicClient from "../PublicClient";
import { UsePelicanClientOptions } from "../usePelicanClient";

/**
 * A Pelican web-client, which can be either authenticated or public based on props
 */
const Client = (props: UsePelicanClientOptions) => {
    if (props.enableAuth) {
        return <AuthenticatedClient {...props} />;
    } else {
        return <PublicClient {...props} />;
    }
};

export default Client;
