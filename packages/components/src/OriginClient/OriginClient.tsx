"use client";

import { useEffect, useRef, useState } from "react";
import { Box, FormControl, InputLabel, MenuItem, Select, SelectChangeEvent, Skeleton } from "@mui/material";
import {
  OriginNamespaceConfig,
  PelicanClientProvider,
  usePelicanClient,
} from "@pelicanplatform/hooks";
import AuthenticatedClient from "../AuthenticatedClient";

export interface OriginClientProps {
  /** Base URL of the Origin's data (XRootD) endpoint, e.g. `https://origin.example.org:8443`. */
  originBaseUrl: string;
  /**
   * Stable internal key used in object URLs and service-worker token routing — not a network
   * target. Defaults to the host (incl. port) of `originBaseUrl`. Only set this when `originBaseUrl`
   * is relative (e.g. a same-origin proxy path) or you need a key independent of the data URL.
   */
  originHost?: string;
  /** Namespaces served by the Origin, with their issuers. */
  namespaces: OriginNamespaceConfig[];
  /** Namespace prefix to open initially. Defaults to the first supplied namespace. */
  initialPrefix?: string;
  /** Whether to enable authentication features. Defaults to true. */
  enableAuth?: boolean;
  /** OAuth client id used for every issuer (a public, PKCE-only client). */
  publicClientId?: string;
  /**
   * Redirect to the issuer to log in automatically as soon as the active namespace is ready
   * and the user isn't already authorized. Defaults to true. Fires at most once per namespace
   * per tab session, so a failed/declined login won't loop.
   */
  autoLogin?: boolean;
}

/**
 * Auto-login gate.
 *
 * When `enabled`, kicks off the authorization-code flow as soon as the active namespace's OIDC
 * config is ready and the user isn't authorized — and shows a loading state (instead of the
 * login UI) until auth is established, so the login page never flashes before the redirect.
 *
 * It reveals `children` once auth has *settled* for the active namespace, so it never spins
 * forever: settled = authorized, OR issuer can't be discovered, OR we returned from the issuer
 * and the exchange didn't produce a token, OR login threw.
 *
 * State is per-namespace and per-page-load (resets on reload), which both prevents a redirect
 * loop within one load and lets a fresh load re-attempt after the SW lost its token.
 */
function OriginAutoLoginGate({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const { enableAuth, authorized, authReconciled, namespace, loading, handleLogin, handleSilentLogin } = usePelicanClient();
  const active = enabled && enableAuth;

  const started = useRef<Set<string>>(new Set()); // prefixes we've kicked off a login for this load
  const sawCode = useRef(false);                   // we returned from an interactive redirect
  const [settled, setSettled] = useState<Set<string>>(new Set());
  const markSettled = (prefix: string) =>
    setSettled((prev) => (prev.has(prefix) ? prev : new Set(prev).add(prefix)));

  const prefix = namespace?.prefix;

  useEffect(() => {
    if (!active || authorized || !prefix) return;
    if (settled.has(prefix)) return;
    // Don't trust cached auth until the SW reconcile has run once — otherwise a stale token races
    // us and briefly renders the viewer.
    if (!authReconciled) return;

    const hasCode = !!new URLSearchParams(window.location.search).get("code");
    if (hasCode) {
      // Returned from the interactive redirect; useAuthExchange is exchanging the code. Stay on
      // the skeleton until it resolves — don't start another login.
      sawCode.current = true;
      return;
    }
    // The post-redirect exchange finished but we're still not authenticated → reveal the UI.
    if (sawCode.current && !loading) {
      console.log("[Pelican AutoLogin] interactive login did not authenticate", prefix);
      markSettled(prefix);
      return;
    }
    // Wait for metadata / OIDC discovery to settle. `namespace` can lag a render behind `loading`
    // flipping false, so also wait for the config rather than settling early.
    if (loading || !namespace?.oidcConfiguration) return;

    // Kick off the silent→redirect attempt exactly once. Crucially, stay on the skeleton for the
    // whole attempt: we either become authorized (→ children) or navigate away on the redirect.
    // Never reveal here, or the client would flash (and fire failing requests) mid-attempt.
    if (started.current.has(prefix)) return;
    started.current.add(prefix);

    (async () => {
      try {
        if (await handleSilentLogin()) {
          console.log("[Pelican AutoLogin] silent login succeeded for", prefix);
          return; // `authorized` flips via stored claims → children, no flash
        }
        console.log("[Pelican AutoLogin] silent unavailable; redirecting for", prefix);
      } catch (e) {
        console.log("[Pelican AutoLogin] silent needs interaction; redirecting for", prefix, (e as { reason?: string })?.reason ?? e);
      }
      try {
        await handleLogin(); // full-page redirect — navigates away, skeleton stays until then
      } catch (e) {
        console.error("[Pelican AutoLogin] redirect login failed:", e);
        markSettled(prefix);
      }
    })();
  }, [active, authorized, authReconciled, prefix, loading, namespace, handleLogin, handleSilentLogin, settled]);

  // Safety net: never trap the user on a spinner if something unforeseen hangs (incl. the
  // namespace never resolving, when `prefix` stays undefined). Re-arms whenever the active
  // namespace changes so switching gets a fresh window.
  const [forceReveal, setForceReveal] = useState(false);
  useEffect(() => {
    setForceReveal(false);
    if (!active || authorized) return;
    const t = setTimeout(() => setForceReveal(true), 15000);
    return () => clearTimeout(t);
  }, [active, authorized, prefix]);

  // Hold the skeleton until auth is settled. Children show only when we're *confidently*
  // authorized (after the SW reconcile, so a stale cached token can't flash the viewer), or
  // we've settled to an unauthenticated UI, or the safety timeout fired.
  const isSettled = forceReveal || (prefix ? settled.has(prefix) : false);
  const showLoader = active && !isSettled && !(authReconciled && authorized);
  if (showLoader) {
    // Minimal skeleton standing in for the namespace selector + viewer. Sign-in is usually fast,
    // so this just avoids a layout pop rather than announcing "Signing in…".
    return (
      <Box>
        <Skeleton variant="rounded" height={56} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={350} />
      </Box>
    );
  }

  return <>{children}</>;
}

/**
 * A namespace picker wired to the Origin-local client. Mirrors the federation UI's
 * selector but is seeded from the supplied namespaces instead of a federation listing.
 */
function OriginNamespaceSelector({ originHost, namespaces }: { originHost: string; namespaces: OriginNamespaceConfig[] }) {
  const { namespace, setObjectUrl } = usePelicanClient();

  const handleChange = (event: SelectChangeEvent<string>) => {
    const selected = namespaces.find((ns) => ns.prefix === event.target.value);
    if (!selected) return;
    // Drop any ?url= deep link when switching namespaces so we land at the namespace root.
    const params = new URLSearchParams(window.location.search);
    params.delete("url");
    const search = params.toString();
    window.history.replaceState({}, "", search ? `?${search}` : window.location.pathname);
    setObjectUrl(`pelican://${originHost}${selected.prefix}`);
  };

  const value = namespaces.find((ns) => ns.prefix === namespace?.prefix)?.prefix ?? namespaces[0]?.prefix ?? "";

  return (
    <FormControl fullWidth>
      <InputLabel>Select Namespace</InputLabel>
      <Select value={value} label="Select Namespace" onChange={handleChange}>
        {namespaces.map((ns) => (
          <MenuItem key={ns.prefix} value={ns.prefix}>
            {ns.prefix}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

/**
 * Drop-in client for a UI hosted on (or alongside) a single Pelican Origin. Keeps every
 * call local to the Origin — no federation/director discovery — by supplying namespaces and
 * their issuers directly. Reuses the same data, auth, and service-worker layer as the
 * federation client.
 */
export function OriginClient({
  originBaseUrl,
  originHost,
  namespaces,
  initialPrefix,
  enableAuth = true,
  publicClientId,
  autoLogin = true,
}: OriginClientProps) {
  // Stable internal key for object URLs / SW token routing. Defaults to the data endpoint's host;
  // callers only pass `originHost` when `originBaseUrl` is relative or they want a custom key.
  const host = originHost ?? new URL(originBaseUrl).host;
  const startPrefix = initialPrefix ?? namespaces[0]?.prefix;
  const initialObjectUrl = startPrefix ? `pelican://${host}${startPrefix}` : "";

  return (
    <PelicanClientProvider
      localOnly
      enableAuth={enableAuth}
      originHost={host}
      originBaseUrl={originBaseUrl}
      namespaces={namespaces}
      publicClientId={publicClientId}
      initialObjectUrl={initialObjectUrl}
    >
      <OriginAutoLoginGate enabled={autoLogin}>
        <Box mb={2}>
          <OriginNamespaceSelector originHost={host} namespaces={namespaces} />
        </Box>
        <AuthenticatedClient />
      </OriginAutoLoginGate>
    </PelicanClientProvider>
  );
}

export default OriginClient;
