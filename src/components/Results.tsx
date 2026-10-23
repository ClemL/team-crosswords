import type { GameResult } from "@/game/types";
import { formatClock } from "@/client/usePoll";
import ui from "./ui.module.css";

/** §9.7 results: time vs par, meta words, false suspects, components, total, grade. */
export function Results({ result }: { result: GameResult }) {
  const d = result.details;
  const guessed = d.metas.filter((m) => m.rotations !== null).length;
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
              Meta words guessed: {guessed} of {d.metas.length}
            </th>
            <td>{result.breakdown.metas} / 35</td>
          </tr>
          {d.metas.map((m, i) => (
            <tr key={m.id}>
              <th scope="row" style={{ paddingLeft: 16 }}>
                <span className={ui.muted}>{i + 1}.</span> {m.answer}{" "}
                <span className={ui.muted}>
                  {m.rotations === null
                    ? "auto-completed"
                    : `after ${m.rotations} rotation${m.rotations === 1 ? "" : "s"}`}
                </span>
              </th>
              <td className={ui.muted}>{m.points}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">False suspects: {d.falseSuspects}</th>
            <td>{result.breakdown.suspects} / 15</td>
          </tr>
          <tr>
            <th scope="row" className={ui.muted}>
              Checks used: {d.tokensSpent} of {d.tokensIssued} (not scored)
            </th>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
