import type { MetadataRoute } from "next";

/** Portrait only: the phone layout is built for an upright screen (DECISIONS.md K). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Team Crossword",
    short_name: "Team Crossword",
    description: "A ring of mini crosswords that rotate around the table.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f4ef",
    theme_color: "#f6f4ef",
  };
}
