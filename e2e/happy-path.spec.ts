import { expect, test, type Page, type Response } from "@playwright/test";
import { V1_01 } from "./fixtures/v1-01";

type StateView = {
  status: string;
  board: { index: number; lockedCount: number; entries: Record<string, string> };
  rotation: { count: number; cooldownUntil: number };
  seating: { nextIfLeft: { emoji: string } };
  now: number;
};

/** Records every API response body so the test can assert nothing secret was sent. */
function recordApi(
  page: Page,
  sink: { url: string; body: string }[],
  latest: { view: StateView | null },
) {
  page.on("response", async (res: Response) => {
    if (!res.url().includes("/api/") || res.status() === 304) return;
    const body = await res.text().catch(() => "");
    sink.push({ url: res.url(), body });
    if (res.url().includes("/state") && res.status() === 200)
      latest.view = JSON.parse(body) as StateView;
  });
}

async function typeBoard(page: Page, board: number) {
  for (const word of V1_01.across[board]) {
    await page.locator(`[data-clue="${word.id}"]`).click();
    const cell = page.getByRole("button", {
      name: new RegExp(`^Row ${word.r + 1}, column ${word.c + 1},`),
    });
    if ((await cell.getAttribute("aria-pressed")) !== "true") await cell.click();
    await page.keyboard.type(word.answer);
  }
}

test("single player: seed → room → join → ready → solve → grade", async ({
  page,
  browser,
  request,
}) => {
  // Seed.
  const seed = await request.post("/api/admin/seed", {
    headers: { "x-seed-secret": "e2e-secret" },
  });
  expect(seed.status()).toBe(200);
  expect((await request.post("/api/admin/seed")).status()).toBe(401);

  // Create a room for v1-01 from the puzzle picker; it redirects to the host screen.
  const host = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const hostResponses: { url: string; body: string }[] = [];
  recordApi(host, hostResponses, { view: null });
  await host.goto("/");
  await host.getByRole("button", { name: "Game 1", exact: true }).click();
  await host.waitForURL(/\/host\/[A-Z0-9]{4}$/);
  const rid = host.url().split("/").pop()!;
  await expect(host.getByRole("img", { name: /QR code/ })).toBeVisible();

  // Join from the phone.
  const responses: { url: string; body: string }[] = [];
  const latest: { view: StateView | null } = { view: null };
  recordApi(page, responses, latest);
  await page.goto(`/play/${rid}`);
  await page.getByLabel("Your name").fill("Clem Leung");
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByText("You hold")).toBeVisible();
  await page.getByRole("button", { name: "I'm ready" }).click();
  await expect(page.getByRole("heading", { name: "ACROSS" })).toBeVisible();
  await expect.poll(() => latest.view?.status).toBe("playing");

  // The locked crossLetter clue is masked server-side, and no meta answer is sent before a guess.
  const firstState = responses.find((r) => r.url.includes("/state"))!;
  expect(firstState.body).not.toContain(V1_01.lockedClueText);
  for (const m of V1_01.metaAnswers) expect(firstState.body).not.toContain(`"${m}"`);

  // Solve: fill the board at the seat, rotate left, repeat until every word locks.
  for (let round = 0; round < 3; round++) {
    const board = latest.view!.board.index;
    await typeBoard(page, board);
    // Wait until the server holds every letter of this board.
    const openCells = V1_01.boards[board].join("").replace(/#/g, "").length;
    await expect
      .poll(() =>
        latest.view?.board.index === board ? Object.keys(latest.view.board.entries).length : -1,
      )
      .toBe(openCells);
    if (round === 0) {
      // Reloading mid-game returns the player to the same seat and board, with entries intact.
      await page.reload();
      await expect(page.getByRole("heading", { name: "ACROSS" })).toBeVisible();
      await expect.poll(() => latest.view?.board.index).toBe(board);
      const [r, c] = [V1_01.across[board][1].r, V1_01.across[board][1].c];
      await expect(
        page.getByRole("button", { name: new RegExp(`^Row ${r + 1}, column ${c + 1}, letter`) }),
      ).toBeVisible();
    }
    if (round === 2) {
      // Open the meta panel and type with the keyboard, without clicking the field: the field
      // must already have focus, and keep it while the page re-renders on each poll.
      await page.getByRole("button", { name: /Open meta panel/ }).click();
      const field = page.getByLabel("Meta guess");
      await expect(field).toBeFocused();
      await page.keyboard.type("wrongo");
      await page.waitForTimeout(1_500); // at least one poll re-render
      await page.keyboard.type("x");
      await expect(field).toHaveValue("wrongox");
      await page.keyboard.press("Enter");
      await expect(page.getByText(/Not a meta word\. 2 wrong guesses left/)).toBeVisible();
      await page.keyboard.type("Better");
      await page.keyboard.press("Enter");
      await expect(page.getByText(/Meta word 4 solved: \+5\.6 pts/)).toBeVisible();
      await page.keyboard.press("Escape");
    }
    const rotate = page.getByRole("button", { name: /^Rotate left/ });
    await expect(rotate).toBeEnabled();
    // The button shows the board it brings.
    await expect(rotate).toContainText(latest.view!.seating.nextIfLeft.emoji);
    const count = latest.view!.rotation.count;
    await rotate.click();
    // Single player: no countdown, the swap is immediate.
    await expect.poll(() => latest.view?.rotation.count, { timeout: 5_000 }).toBe(count + 1);
  }

  // Results on the phone and on the host screen.
  await expect(page.getByText("Game 1 complete")).toBeVisible();
  await expect(page.getByLabel(/^Grade /)).toBeVisible();
  await expect(page.getByText("Meta words guessed: 1 of 5")).toBeVisible();
  await expect(page.getByText("auto-completed").first()).toBeVisible();
  await expect(host.getByLabel(/^Grade /)).toBeVisible({ timeout: 20_000 });

  // Nothing secret was ever sent: no clue answers, no solution grid. (Meta answers appear once
  // guessed or at the end, by design; the check before the first guess is above.)
  for (const { url, body } of [...responses, ...hostResponses]) {
    expect(body, url).not.toMatch(/"solution"/);
    for (const a of V1_01.allAnswers) {
      if (a.length >= 4 && a !== rid && !V1_01.metaAnswers.includes(a))
        expect(body, `${url} leaks ${a}`).not.toContain(`"${a}"`);
    }
  }
  await host.close();
});
