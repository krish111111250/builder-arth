import { existsSync, readdirSync } from "node:fs";

/**
 * Static export so the app can be hosted on GitHub Pages.
 * NEXT_PUBLIC_BASE_PATH is set by the deploy workflow (e.g. "/builder-arth").
 * Locally it is empty, so the app runs at "/".
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/**
 * Model files present in public/models. The asset manifest only requests these,
 * so an empty slot uses its procedural fallback instead of causing a 404.
 * Drop a new <key>.glb in public/models and rebuild to use it.
 */
const modelDir = new URL("./public/models/", import.meta.url);
const availableModels = existsSync(modelDir)
  ? readdirSync(modelDir).filter((f) => /\.(glb|gltf)$/i.test(f))
  : [];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_AVAILABLE_MODELS: availableModels.join(","),
  },
};
export default nextConfig;
