import type { Page, Response } from "@playwright/test";
import { V1_01 } from "./fixtures/v1-01";

export type StateView = {
  status: string;
  you: { isMaster: boolean; seat: number; canGuess: boolean };
  board: { index: number; lockedCount: number; entries: Record<string, string> } | null;
  rotation: { count: number; cooldownUntil: number };
  seating: { nextIfLeft: { emoji: string } };
  now: number;
};

export type Recorded = { url: string; body: string }[];

/** Records every API response body; keeps the latest PlayerView in `latest.view`. */
export function recordApi(page: Page, sink: Recorded, latest: { view: StateView | null }) {
  page.on("response", async (res: Response) => {
    if (!res.url().includes("/api/") || res.status() === 304) return;
    const body = await res.text().catch(() => "");
    sink.push({ url: res.url(), body });
    if (res.url().includes("/state") && res.status() === 200)
      latest.view = JSON.parse(body) as StateView;
  });
}

/** Types every across answer of `board` with the physical keyboard. */
export async function typeBoard(page: Page, board: number) {
  for (const word of V1_01.across[board]) {
    await page.locator(`[data-clue="${word.id}"]`).click();
    const cell = page.getByRole("button", {
      name: new RegExp(`^Row ${word.r + 1}, column ${word.c + 1},`),
    });
    if ((await cell.getAttribute("aria-pressed")) !== "true") await cell.click();
    await page.keyboard.type(word.answer);
  }
}

export const openCells = (board: number) => V1_01.boards[board].join("").replace(/#/g, "").length;
