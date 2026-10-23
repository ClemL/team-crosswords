import { expect, test, type Browser, type Page } from "@playwright/test";
import { recordApi, openCells, typeBoard, type Recorded, type StateView } from "./helpers";

type Player = { page: Page; latest: { view: StateView | null }; responses: Recorded };

async function phone(browser: Browser, rid: string, name: string): Promise<Player> {
  const context = await browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const player: Player = { page, latest: { view: null }, responses: [] };
  recordApi(page, player.responses, player.latest);
  await page.goto(`/play/${rid}`);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByText("You hold")).toBeVisible();
  return player;
}

/** Fills the board at the player's seat and waits until the server holds every letter. */
async function fillMyBoard(p: Player) {
  const board = p.latest.view!.board.index;
  await typeBoard(p.page, board);
  await expect
    .poll(() =>
      p.latest.view?.board.index === board ? Object.keys(p.latest.view.board.entries).length : -1,
    )
    .toBe(openCells(board));
}

/** The Capt. rotates left; both phones see the warning, then the shift. */
async function captRotates(capt: Player, other: Player) {
  const count = capt.latest.view!.rotation.count;
  const rotate = capt.page.getByRole("button", { name: /^Rotate left/ });
  await expect(rotate).toBeEnabled({ timeout: 10_000 });
  await expect(other.page.getByRole("button", { name: /^Rotate left/ })).toHaveCount(0);
  await rotate.click();
  await expect(other.page.getByText(/Rotating ⟲ in/)).toBeVisible();
  for (const p of [capt, other]) {
    await expect.poll(() => p.latest.view?.rotation.count, { timeout: 10_000 }).toBe(count + 1);
  }
}

test("two players: join, ready, Capt. hand-off, results with MVPs and leaderboard", async ({
  browser,
  request,
}) => {
  expect(
    (
      await request.post("/api/admin/seed", { headers: { "x-seed-secret": "e2e-secret" } })
    ).status(),
  ).toBe(200);
  const { rid } = (await (
    await request.post("/api/rooms", { data: { puzzleId: "v1-01" } })
  ).json()) as { rid: string };

  const clem = await phone(browser, rid, "Clem Leung");
  const kris = await phone(browser, rid, "Kris");
  await expect(clem.page.getByText("Kris")).toBeVisible();

  // The timer starts only once both are ready.
  await clem.page.getByRole("button", { name: "I'm ready" }).click();
  await expect(clem.page.getByRole("button", { name: "Ready ✓" })).toBeVisible();
  await expect(clem.page.getByRole("heading", { name: "ACROSS" })).toHaveCount(0);
  await kris.page.getByRole("button", { name: "I'm ready" }).click();
  for (const p of [clem, kris]) {
    await expect(p.page.getByRole("heading", { name: "ACROSS" })).toBeVisible();
    await expect.poll(() => p.latest.view?.status).toBe("playing");
  }
  expect(clem.latest.view!.you.isMaster).toBe(true);
  expect(kris.latest.view!.you.isMaster).toBe(false);

  // Round 1: each fills the board at their seat (Clem board 0, Kris board 1); Clem rotates.
  await fillMyBoard(clem);
  await fillMyBoard(kris);
  // Clem spends his single guess on a word whose letters are not even shown yet.
  await clem.page.getByRole("button", { name: /Open meta panel/ }).click();
  await clem.page.keyboard.type("corn");
  await clem.page.keyboard.press("Enter");
  await expect(clem.page.getByText(/Meta word 2 solved: \+7 pts/)).toBeVisible();
  await expect(clem.page.getByLabel("Meta guess")).toBeDisabled();
  await clem.page.keyboard.press("Escape");
  await captRotates(clem, kris);

  // The Capt. role passed to Kris, who now holds board 2.
  await expect.poll(() => kris.latest.view?.you.isMaster).toBe(true);
  expect(kris.latest.view!.board.index).toBe(2);
  await expect(kris.page.getByText("Capt.").first()).toBeVisible();
  await fillMyBoard(kris);
  await captRotates(kris, clem);

  // Every meta word is now obtained: the game is over on both phones.
  for (const p of [clem, kris]) {
    await expect(p.page.getByText("Game 1 complete")).toBeVisible();
    await expect(p.page.getByRole("heading", { name: "Board MVPs" })).toBeVisible();
    await expect(p.page.getByRole("heading", { name: "Tiles leaderboard" })).toBeVisible();
  }
  const board = clem.page.locator("ol").filter({ hasText: "Kris" });
  await expect(board.locator("li").nth(0)).toHaveText(/1\. Kris\s*40/);
  await expect(board.locator("li").nth(1)).toHaveText(/2\. Clem Leung\s*19/);
  await expect(clem.page.getByRole("region", { name: "Scorecard: Clem Leung" })).toContainText(
    "CORN ✓ word 2, +7",
  );
  await expect(kris.page.getByRole("region", { name: "Scorecard: Kris" })).toContainText(
    "Meta guessnot used",
  );

  // The host screen shows every scorecard and no player ids.
  const host = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const hostResponses: Recorded = [];
  recordApi(host, hostResponses, { view: null });
  await host.goto(`/host/${rid}`);
  await expect(host.getByRole("region", { name: "Scorecard: Kris" })).toBeVisible();
  await expect(host.getByRole("region", { name: "Scorecard: Clem Leung" })).toBeVisible();
  for (const { body } of hostResponses) expect(body).not.toMatch(/"pid"|"masterPid"/);
});
