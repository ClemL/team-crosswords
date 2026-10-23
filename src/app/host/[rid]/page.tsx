import type { Metadata } from "next";
import { HostApp } from "@/components/host/HostApp";

export const metadata: Metadata = { title: "Host · Rotating Co-op Crossword" };

export default async function HostPage({ params }: { params: Promise<{ rid: string }> }) {
  const { rid } = await params;
  return <HostApp rid={rid.toUpperCase()} />;
}
