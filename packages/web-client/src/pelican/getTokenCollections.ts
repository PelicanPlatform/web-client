import {Collection, CollectionPermission, Namespace} from "../types";

const getTokenCollections = (namespace: Namespace) => {
  const collectionRecord = namespace.token?.scope.split(" ").reduce((cols: Record<string, Collection>, scopeStr: string) => {
    const storageMatch = scopeStr.match(/^storage\.(create|modify|read):(.+)$/);
    if (storageMatch) {
      const permission = storageMatch[1] as CollectionPermission;
      const collectionPath = storageMatch[2];

      // Find or create the collection entry
      let collection = cols?.[collectionPath];
      if (!collection) {
        collection = {
          href: collectionPath,
          objectPath: collectionPath.replace(new RegExp(`^/${namespace.prefix}`), ""),
          permissions: [],
        };
        cols[collectionPath] = collection;
      }

      // Add the permission if not already present
      if (!collection.permissions.includes(permission)) {
        collection.permissions.push(permission);
      }
    }
    return cols;
  }, {} as Record<string, Collection>);

  return Object.values(collectionRecord);
}

export default getTokenCollections;
