import type { GameResult } from "@/game/types";
import { formatClock } from "@/client/usePoll";
import ui from "./ui.module.css";

/** §9.7 results: time vs par, tokens, false suspects, meta, components, total, grade. */
export function Results({ result, metaAnswer }: { result: GameResult; metaAnswer?: string }) {
  const d = result.details;
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
            <th scope="row">
              Check tokens {d.tokensSpent} of {d.tokensIssued} spent
            </th>
            <td>{result.breakdown.tokens} / 25</td>
          </tr>
          <tr>
            <th scope="row">False suspects: {d.falseSuspects}</th>
            <td>{result.breakdown.suspects} / 15</td>
          </tr>
          <tr>
            <th scope="row">
              Meta {d.metaSolved ? "solved" : "not solved"}
              {metaAnswer ? <span className={ui.muted}> ({metaAnswer})</span> : null}
            </th>
            <td>{result.breakdown.meta} / 10</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
