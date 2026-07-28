import { Namespace } from "@/types";
import { fetchFederation, list } from "@pelicanplatform/web-client";
import { PelicanClientProvider } from "@pelicanplatform/hooks";
import { AuthenticatedClient } from "@pelicanplatform/components";
import { unstable_cache } from "next/cache";
import fs from "fs";
import path from "path";

const CACHE_FILE = path.join(process.cwd(), ".namespace-cache.json");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function readFileCache(): Namespace[] | null {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    const { timestamp, data } = JSON.parse(raw);
    if (Date.now() - timestamp < CACHE_TTL_MS) {
      return data as Namespace[];
    }
  } catch {}
  return null;
}

function writeFileCache(data: Namespace[]) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ timestamp: Date.now(), data }), "utf-8");
  } catch {}
}

/**
 * Public demo: discovers the federation's public namespaces and hardcodes the client to the
 * first one. There is no selector, so the namespace cannot be swapped from the UI.
 */
export default async function Page() {
  const namespaces = await getCachedPublicNamespaces();
  const namespace = namespaces[0];

  if (!namespace) {
    return <p>No public namespaces are currently available.</p>;
  }

  return (
    <PelicanClientProvider initialObjectUrl={`pelican://osg-htc.org/ucsd/physics`} enableAuth={true}>
      <AuthenticatedClient />
    </PelicanClientProvider>
  );
}

const getValidPublicNamespaces = async () => {
  const cached = readFileCache();
  if (cached) {
    return cached;
  }

  const response = await fetch("https://osdf-director.osg-htc.org/api/v1.0/director_ui/namespaces");
  const allNamespaces = (await response.json()) as Namespace[];
  // Keep namespaces with public read access...
  const publicNamespaces = allNamespaces.filter((ns: Namespace) => ns.capabilities.PublicRead);

  const federation = await fetchFederation("osg-htc.org");

  // ...that actually contain objects (a listing of more than just the collection itself).
  const validPublicNamespaces = await Promise.all(
    publicNamespaces.map(async (ns: Namespace) => {
      try {
        const objectList = await list(`pelican://osg-htc.org${ns.path}`, federation);
        return objectList.length > 1 ? ns : null;
      } catch {
        return null;
      }
    })
  ).then((results) => results.filter((ns): ns is Namespace => ns !== null));

  writeFileCache(validPublicNamespaces);
  return validPublicNamespaces;
};

const getCachedPublicNamespaces = unstable_cache(
  getValidPublicNamespaces,
  ["valid-public-namespaces"],
  { revalidate: 3600 } // re-run at most once per hour
);
