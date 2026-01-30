import { useContext } from "react";
import { PelicanClientContext, PelicanClientContextValue } from "./PelicanClientContext";

/**
 * Hook to access the Pelican client context.
 * Must be used within a PelicanClientProvider.
 *
 * @throws Error if used outside of PelicanClientProvider
 * @returns The Pelican client context value with state and actions
 *
 * @example
 * function MyComponent() {
 *   const { handleDownload, loading, federation } = usePelicanClient();
 *
 *   return (
 *     <button onClick={() => handleDownload('pelican://...')}>
 *       Download {loading ? '...' : ''}
 *     </button>
 *   );
 * }
 */
export function usePelicanClient(): PelicanClientContextValue {
  const context = useContext(PelicanClientContext);

  if (!context) {
    throw new Error(
      "usePelicanClient must be used within a PelicanClientProvider. " +
      "Wrap your component tree with <PelicanClientProvider>."
    );
  }

  return context;
}
