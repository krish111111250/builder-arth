# 3-Unit 1BHK Row House – 3D Walkthrough

Next.js + React Three Fiber walkthrough of 3 attached 1BHK row houses (1 unit = 1 ft).

```bash
npm install
npm run dev        # http://localhost:3100
npm run build && npm start
```

## Where things live
- `components/house/HouseShowcase.tsx` – scene, HDRI lighting, loading bar, HUD, controls. `WHATSAPP_NUMBER` is at the top.
- `components/house/buildHouseUnit.ts` – plan, walls with real openings, room list and sizes, and every furniture placement (`place(...)`).
- `src/config/assetManifest.ts` – one slot per furniture item -> `public/models/<key>.glb`.
- `src/utils/modelLoader.ts` – GLTF + Draco loader with caching, `fitObject` / `placeAsset` (auto-scale to the target size, centre, sit flush on the floor).
- `components/house/proceduralAssets.ts` – curved stand-ins used when a slot has no `.glb`.
- `components/house/textures.ts` – materials, finish presets, real PBR maps (`loadPbrTextures`).
- `components/house/collision.ts` / `WalkControls.tsx` – walking.

## Real assets (Poly Haven, CC0)
```bash
node scripts/fetch-assets.mjs          # downloads missing models, textures, HDRIs
node scripts/fetch-assets.mjs --force  # re-download all
```
Files land in `public/models`, `public/textures`, `public/hdri` and are committed, so the deploy never calls the API. Credits: `public/ASSET_CREDITS.md`.

## Swap in a better model (no code change)
Save it as `public/models/<key>.glb` (keys are in `src/config/assetManifest.ts`, e.g. `toilet.glb`, `queenBed.glb`), then rebuild or restart `npm run dev`. It is scaled to fit the space, centred and placed on the floor. If it faces the wrong way, set `rotationOffset` for that key.
