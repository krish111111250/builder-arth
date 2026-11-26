"use client";

import dynamic from "next/dynamic";

function LoadingScreen() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/80">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
      <p className="text-sm tracking-wide">Preparing your 3D walkthrough…</p>
    </div>
  );
}

const HouseShowcase = dynamic(() => import("./HouseShowcase"), {
  ssr: false,
  loading: LoadingScreen,
});

export default function ShowcaseLoader() {
  return <HouseShowcase />;
}
