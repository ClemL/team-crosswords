import type { Metadata, Viewport } from "next";
import { THEME_BOOT_SCRIPT } from "@/client/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rotating Co-op Crossword",
  description: "A ring of mini crosswords that rotate around the table.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme is set by the boot script before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
