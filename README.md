# 3-Unit 1BHK Row House – 3D Walkthrough

Next.js + React Three Fiber walkthrough of 3 attached 1BHK row houses (1 unit = 1 ft).

```bash
npm install
npm run dev        # http://localhost:3100
npm run build && npm start
```

## Where things live
- `components/house/HouseShowcase.tsx` – scene, HUD, controls. `WHATSAPP_NUMBER` is at the top.
- `components/house/buildHouseUnit.ts` – plan, walls with real openings, furniture, room list and sizes.
- `components/house/textures.ts` – canvas textures, materials and the 3 finish presets.
- `components/house/collision.ts` – 2D wall collision.
- `components/house/WalkControls.tsx` – first-person look and walk.
- `components/house/models.tsx` – swap any furniture for a `.glb` (Draco decoder served from `public/draco`).
