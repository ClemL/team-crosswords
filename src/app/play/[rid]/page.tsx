import type { Metadata } from "next";
import { PlayApp } from "@/components/play/PlayApp";
import { PortraitOnly } from "@/components/play/Overlays";

export const metadata: Metadata = { title: "Play · Team Crossword" };

export default async function PlayPage({ params }: { params: Promise<{ rid: string }> }) {
  const { rid } = await params;
  return (
    <>
      <PlayApp rid={rid.toUpperCase()} />
      <PortraitOnly />
    </>
  );
}
