import { PuzzlePicker } from "@/components/PuzzlePicker";
import home from "@/components/home.module.css";
import ui from "@/components/ui.module.css";

export default function Home() {
  return (
    <main className={home.page}>
      <h1 className={home.title}>Rotating Co-op Crossword</h1>
      <p className={home.lede}>
        Pick a game. A room opens on this screen; join it from your phone or this device.
      </p>
      <PuzzlePicker />
      <section className={home.rules} aria-label="How to play">
        <h2>How to play</h2>
        <ol>
          <li>Three 5×5 boards sit in a ring. You can type only on the board at your seat.</li>
          <li>
            The <span className={ui.capt}>Capt.</span> rotates the ring (⟲ or ⟳). Playing alone, you
            can rotate at any time; with others, each rotation is followed by a cooldown that gets 1
            second shorter every time.
          </li>
          <li>
            Words are checked only when the ring rotates: correct, filled words turn green and lock.
          </li>
          <li>
            Some clues start hidden. They unlock when a letter on another board is correct, after
            enough rotations, or after enough words are solved.
          </li>
          <li>
            Circled cells spell 5 meta words of different lengths. One guess is checked against all
            of them. A word is worth 7 points, minus 10% per rotation made before you guess it; the
            team has 3 wrong guesses in total. Finishing the puzzle reveals any word you did not
            guess, for 0 points.
          </li>
          <li>
            Checks (🎟) reveal the wrong cells in one word; they do not affect your score. Accurate
            suspect marks (?) do: each false one costs 3 points. Par is 5 minutes.
          </li>
        </ol>
      </section>
    </main>
  );
}
