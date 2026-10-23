import type { Metadata } from "next";
import { PlayApp } from "@/components/play/PlayApp";

export const metadata: Metadata = { title: "Play · Rotating Co-op Crossword" };

export default async function PlayPage({ params }: { params: Promise<{ rid: string }> }) {
  const { rid } = await params;
  return <PlayApp rid={rid.toUpperCase()} />;
}
