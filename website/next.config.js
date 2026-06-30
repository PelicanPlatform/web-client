/** @type {import('next').NextConfig} */

// ─── Dev-only silent-login proxy ──────────────────────────────────────────────
// In local dev the Pelican Origin/issuer runs on a different port than this dev server, so the
// page and issuer are cross-origin. Silent login is a *credentialed* fetch, and browsers reject
// a wildcard `Access-Control-Allow-Origin` on credentialed requests — hence the CORS error. In
// production the page and issuer share an origin, so none of this is needed. To exercise silent
// login locally we proxy the issuer's API under this dev server's own origin so the browser sees
// a same-origin request. Rewrites only apply under `next dev` (a static `output: export` build
// has no server), which is exactly the scope we want.
const PELICAN_ORIGIN = process.env.PELICAN_ORIGIN_URL || "http://localhost:8443";
const isDev = process.env.NODE_ENV !== "production";

// NOTE: the proxy's server-side fetch goes to the Origin's HTTPS cert. Next's rewrite proxy uses
// Node's built-in fetch (undici), which does NOT honor NODE_TLS_REJECT_UNAUTHORIZED — you have to
// actually trust the cert. The "dev" npm script sets NODE_EXTRA_CA_CERTS to the Pelican dev CA so
// Node trusts the Origin's self-signed cert. That path is machine-specific (your ~/.config/pelican
// CA) — adjust it for your environment; it's a local-dev convenience and not used by the static
// production build.

const nextConfig = {
    output: "export",
    async rewrites() {
        if (!isDev) return [];
        // Proxy the issuer API (authorize/token/discovery live under here) to the real Origin.
        return [
            { source: "/api/v1.0/:path*", destination: `${PELICAN_ORIGIN}/api/v1.0/:path*` },
        ];
    },
    basePath: process.env.NODE_ENV === "production" ? "/web-client" : "",
    images: {
        loader: "custom",
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
        deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    },
    transpilePackages: ["next-image-export-optimizer", "@pelicanplatform/components", "@pelicanplatform/web-client"],
    env: {
        nextImageExportOptimizer_imageFolderPath: "public/images",
        nextImageExportOptimizer_exportFolderPath: "out",
        nextImageExportOptimizer_quality: "75",
        nextImageExportOptimizer_storePicturesInWEBP: "true",
        nextImageExportOptimizer_exportFolderName: "nextImageExportOptimizer",

        // If you do not want to use blurry placeholder images, then you can set
        // nextImageExportOptimizer_generateAndUseBlurImages to false and pass
        // `placeholder="empty"` to all <ExportedImage> components.
        nextImageExportOptimizer_generateAndUseBlurImages: "true",
    },
};

module.exports = nextConfig;
