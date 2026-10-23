import type { GameResult, PlayerCard } from "@/game/types";
import type { SeatingView } from "@/game/views";
import { formatClock } from "@/client/usePoll";
import { metaLabel } from "./MetaBar";
import ui from "./ui.module.css";

/** Board emoji by board index, from the seating view. */
export function boardEmojis(seating: SeatingView): string[] {
  return seating.boards.map((b) => b.emoji);
}

function Scorecard({ card, emojis, you }: { card: PlayerCard; emojis: string[]; you: boolean }) {
  // Results are frozen when a game ends; ones frozen by an older build lack the newer fields.
  const guesses = card.guesses ?? [];
  return (
    <section
      className={`${ui.scorecard} ${you ? ui.scorecardYou : ""}`}
      aria-label={`Scorecard: ${card.name}`}
    >
      <h3 className={ui.scorecardTitle}>
        {card.name}
        {you && <span className={ui.muted}> (you)</span>}
        {card.knockedOut && <span className={ui.muted}> · knocked out</span>}
      </h3>
      <dl className={ui.stats}>
        <dt>Tiles filled</dt>
        <dd>
          {card.tiles}{" "}
          <span className={ui.muted}>
            ({card.tilesByBoard.map((n, i) => `${emojis[i] ?? ""} ${n}`).join(" · ")})
          </span>
        </dd>
        <dt>Letters typed</dt>
        <dd>{card.lettersTyped}</dd>
        <dt>Rotations as Capt.</dt>
        <dd>{card.rotations}</dd>
        <dt>Wrong letters passed on</dt>
        <dd>{card.wrongLeft ?? 0}</dd>
        <dt>Suspect marks</dt>
        <dd>
          {card.accurateSuspects} accurate · {card.falseSuspects} false
        </dd>
        <dt>Meta {guesses.length > 1 ? "guesses" : "guess"}</dt>
        <dd>
          {guesses.length > 0 ? (
            guesses
              .map(
                (g) =>
                  `${g.text} ${g.correct && g.metaNumber ? `✓ word ${metaLabel(g.metaNumber)}, +${g.points}` : "✗"}`,
              )
              .join(" · ")
          ) : (
            <span className={ui.muted}>not used</span>
          )}
        </dd>
        <dt>Active time</dt>
        <dd>{formatClock(card.activeSeconds * 1000)}</dd>
      </dl>
    </section>
  );
}

/**
 * Results (§9.7, revised): team score and grade, then per-player scorecards; with more than one
 * player, the MVP of each board and the tile leaderboard.
 */
export function Results({
  result,
  yourSeat,
  emojis,
}: {
  result: GameResult;
  /** Seat of the viewing player; omit on the host screen to show every scorecard. */
  yourSeat?: number;
  /** Board emoji by board index. */
  emojis: string[];
}) {
  const d = result.details;
  const multi = result.players.length > 1;
  const cards =
    yourSeat === undefined
      ? result.players
      : [...result.players].sort(
          (a, b) => Number(b.seat === yourSeat) - Number(a.seat === yourSeat),
        );
  return (
    <div className={ui.results}>
      <p className={ui.grade} aria-label={`Grade ${result.grade}`}>
        {result.grade}
      </p>
      <p className={ui.total}>
        <strong>{result.total}</strong> / 100
      </p>
      <table className={ui.breakdown}>
        <tbody>
          <tr>
            <th scope="row">
              Time {formatClock(d.gameSeconds * 1000)}{" "}
              <span className={ui.muted}>(par {formatClock(d.parSeconds * 1000)})</span>
            </th>
            <td>{result.breakdown.time} / 50</td>
          </tr>
          <tr>
            <th scope="row">Meta words</th>
            <td>{result.breakdown.metas} / 35</td>
          </tr>
          {d.metas.map((m, i) => (
            <tr key={m.id}>
              <th scope="row" style={{ paddingLeft: 16 }}>
                <span className={ui.muted}>{metaLabel(i + 1)}.</span> {m.answer}{" "}
                <span className={ui.muted}>
                  {m.by === "guess"
                    ? `guessed${m.guessedBy ? ` by ${m.guessedBy}` : ""}`
                    : m.by === "tiles"
                      ? "tiles"
                      : "not obtained"}
                  {m.rotations !== null &&
                    `, after ${m.rotations} rotation${m.rotations === 1 ? "" : "s"}`}
                </span>
              </th>
              <td className={ui.muted}>{m.points}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">
              Wrong letters passed on at rotations: {d.wrongLeft ?? 0}{" "}
              <span className={ui.muted}>(not scored)</span>
            </th>
            <td />
          </tr>
          <tr>
            <th scope="row">False suspects: {d.falseSuspects}</th>
            <td>{result.breakdown.suspects} / 15</td>
          </tr>
        </tbody>
      </table>

      {multi && (
        <>
          <h2 className={ui.resultsHeading}>Board MVPs</h2>
          <ul className={ui.plainList}>
            {result.mvps.map((m) => (
              <li key={m.boardIndex}>
                <span aria-hidden="true">{m.emoji}</span>{" "}
                {m.names.length > 0 ? (
                  <>
                    <strong>{m.names.join(" & ")}</strong>{" "}
                    <span className={ui.muted}>
                      {m.tiles} tile{m.tiles === 1 ? "" : "s"}
                    </span>
                  </>
                ) : (
                  <span className={ui.muted}>no tiles</span>
                )}
              </li>
            ))}
          </ul>
          <h2 className={ui.resultsHeading}>Tiles leaderboard</h2>
          <ol className={ui.leaderboard}>
            {result.leaderboard.map((p, i) => (
              <li key={p.seat} className={p.seat === yourSeat ? ui.leaderYou : undefined}>
                <span>
                  {i + 1}. {p.name}
                </span>
                <strong>{p.tiles}</strong>
              </li>
            ))}
          </ol>
        </>
      )}

      <h2 className={ui.resultsHeading}>{multi ? "Scorecards" : "Your scorecard"}</h2>
      {cards.map((c) => (
        <Scorecard key={c.seat} card={c} emojis={emojis} you={c.seat === yourSeat} />
      ))}
    </div>
  );
}
