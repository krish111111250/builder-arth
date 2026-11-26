/**
 * Static export so the app can be hosted on GitHub Pages.
 * NEXT_PUBLIC_BASE_PATH is set by the deploy workflow (e.g. "/builder-arth").
 * Locally it is empty, so the app runs at "/".
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;
