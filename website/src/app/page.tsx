import { PelicanClientProvider } from "@pelicanplatform/hooks";
import { AuthenticatedClient } from "@pelicanplatform/components";

/** Root: the /ospool/ap40 client (token-required). Not swappable. */
export default function Page() {
  return (
    <PelicanClientProvider initialObjectUrl="pelican://osg-htc.org/ospool/ap40" enableAuth={true}>
      <AuthenticatedClient />
    </PelicanClientProvider>
  );
}
