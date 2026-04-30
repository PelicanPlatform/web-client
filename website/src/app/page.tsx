import HomePageClient from "./HomePageClient";
import {Namespace} from "@/types";
import {fetchFederation, list} from "@pelicanplatform/web-client";
import { unstable_cache } from "next/cache";

export default async function Page() {
  const ns = await getCachedPublicNamespaces();
  return <HomePageClient namespaces={ns} />
}

const getValidPublicNamespaces = async () => {
  const response = await fetch("https://osdf-director.osg-htc.org/api/v1.0/director_ui/namespaces");
  const allNamespaces = await response.json() as Namespace[];
  // Filter to keep namespaces with public read access
  const publicNamespaces =  allNamespaces.filter((ns: Namespace) => ns.capabilities.PublicRead);

  const federation = await fetchFederation("osg-htc.org")

  const validPublicNamespaces = await Promise.all(
    publicNamespaces.map(async (ns: Namespace) => {
      try {
        const objectList = await list(`pelican://osg-htc.org${ns.path}`, federation);
        return objectList.length > 0 ? ns : null;
      } catch (error) {
        return null;
      }
    })
  ).then(results => results.filter((ns): ns is Namespace => ns !== null));

  return validPublicNamespaces;
}

const getCachedPublicNamespaces = unstable_cache(
  getValidPublicNamespaces,
  ["valid-public-namespaces"],
  { revalidate: 3600 } // re-run at most once per hour
);


