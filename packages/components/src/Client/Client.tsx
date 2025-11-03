import AuthenticatedClient from "../AuthenticatedClient";
import PublicClient from "../PublicClient";
import { UsePelicanClientOptions } from "../usePelicanClient";

interface ClientProps extends UsePelicanClientOptions {
    /** Whether to enable authentication features */
    enableAuth: boolean;
}

const Client = ({ enableAuth, ...rest }: ClientProps) => {
    if (enableAuth) {
        return <AuthenticatedClient {...rest} />;
    } else {
        return <PublicClient {...rest} />;
    }
};

export default Client;
