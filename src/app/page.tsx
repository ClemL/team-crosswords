import { PuzzlePicker } from "@/components/PuzzlePicker";
import { ThemeToggle } from "@/components/ThemeToggle";
import home from "@/components/home.module.css";
import ui from "@/components/ui.module.css";

export default function Home() {
  return (
    <main className={home.page}>
      <div className={home.titleRow}>
        <h1 className={home.title}>Rotating Co-op Crossword</h1>
        <ThemeToggle />
      </div>
      <p className={home.lede}>
        Pick a game. A room opens on this screen; join it from your phone or this device.
      </p>
      <PuzzlePicker />
      <section className={home.rules} aria-label="How to play">
        <h2>How to play</h2>
        <ol>
          <li>Three 5×5 boards sit in a ring. You can type only on the board at your seat.</li>
          <li>
            Play alone or with up to 3 players, one per board. The{" "}
            <span className={ui.capt}>Capt.</span> rotates the ring (⟲ or ⟳); the role passes around
            after each rotation. Alone, you can rotate at any time; with others, each rotation is
            followed by a cooldown that gets 1 second shorter every time.
          </li>
          <li>
            Words are checked only when the ring rotates: correct, filled words turn green and lock.
          </li>
          <li>
            Some clues start hidden. They unlock when a letter on another board is correct, after
            enough rotations, or after enough words are solved.
          </li>
          <li>
            Circled cells spell 5 meta words of different lengths. A word is obtained when all of
            its tiles turn green, or when someone guesses it. Each word is worth 7 points, minus 10%
            per rotation made before it was obtained. The game ends when all 5 are obtained.
          </li>
          <li>
            Each player gets one guess for the whole game, checked against every word not yet
            obtained. Right or wrong, it is then used. Completing a word with tiles does not use it.
          </li>
          <li>
            Mark a doubtful cell with ?. A mark on a correct letter is a false suspect and costs 3
            points. Par is 5 minutes. The results show each player&apos;s tiles, an MVP for each
            board and a tiles leaderboard.
          </li>
        </ol>
      </section>
    </main>
  );
}
