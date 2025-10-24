import { UsePelicanClientOptions } from "../usePelicanClient";
import AuthenticatedClient from "../AuthenticatedClient";
import PublicClient from "../PublicClient";

const Client = ({ startingUrl, enableAuth }: UsePelicanClientOptions) => {
    if (enableAuth) {
        return <AuthenticatedClient startingUrl={startingUrl} />;
    } else {
        return <PublicClient startingUrl={startingUrl} />;
    }
};

export default Client;
