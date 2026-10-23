import { PuzzlePicker } from "@/components/PuzzlePicker";
import home from "@/components/home.module.css";

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
          <li>The board master rotates the ring (⟲ or ⟳) once the cooldown ends.</li>
          <li>
            Words are checked only when the ring rotates: correct, filled words turn green and lock.
          </li>
          <li>
            Some clues start hidden. They unlock when a letter on another board is correct, after
            enough rotations, or after enough words are solved.
          </li>
          <li>Shaded cells spell a 6-letter meta word. You have 3 wrong guesses.</li>
          <li>
            Check tokens (🎟) reveal wrong cells in one word. Unspent tokens and accurate suspect
            marks (?) raise your grade.
          </li>
        </ol>
      </section>
    </main>
  );
}
