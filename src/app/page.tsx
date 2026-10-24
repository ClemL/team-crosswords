import { DensityToggle } from "@/components/DensityToggle";
import { PuzzlePicker } from "@/components/PuzzlePicker";
import { ThemeToggle } from "@/components/ThemeToggle";
import home from "@/components/home.module.css";
import ui from "@/components/ui.module.css";

export default function Home() {
  return (
    <main className={home.page}>
      <div className={home.titleRow}>
        <h1 className={home.title}>Team Crossword</h1>
        <div className={home.display}>
          <ThemeToggle />
          <DensityToggle />
        </div>
      </div>
      <p className={home.lede}>
        Pick a mode and a game. A room opens on this screen; join it from your phone or this device.
      </p>
      <PuzzlePicker />
      <section className={home.rules} aria-label="How to play">
        <h2>How to play</h2>
        <ol>
          <li>
            Three boards sit in a ring: 5×5 in 5× mode, 6×6 in 6× mode, 7×7 in 7× mode. You can type
            only on the board at your seat.
          </li>
          <li>
            Play alone or with up to one player per board (3 in either mode); players are seated
            with empty seats between them where the ring allows. The{" "}
            <span className={ui.capt}>Capt.</span> rotates the ring (⟲ or ⟳); their phone is tinted
            red, and the role passes around after each rotation. Alone, you can rotate at any time;
            with others, each rotation is followed by a cooldown that gets 1 second shorter every
            time.
          </li>
          <li>
            Words are checked only when the ring rotates: correct, filled words turn green and lock.
            A board whose words are all green leaves the ring at that rotation, so nobody is handed
            a finished board.
          </li>
          <li>
            Some clues start hidden. They unlock when a letter on another board is correct (that
            cell has a dashed outline and the emoji of the board it helps), after enough rotations,
            or after enough words are solved.
          </li>
          <li>
            Circled cells spell meta words A, B, C… of different lengths: 5 words of 3–7 letters in
            5× mode, 6 of 3–8 in 6× mode, 7 of 3–9 in 7× mode. A word is obtained when all of its
            tiles turn green, or when someone guesses it. The words share 35 points (7 each in 5×,
            about 5.8 in 6×, 5 in 7×), minus 10% per rotation made before each was obtained. The
            game ends when all are obtained.
          </li>
          <li>
            Guesses are checked against every word not yet obtained. Alone, you can keep guessing
            until a guess is wrong. With others, each player gets one guess, and a wrong one knocks
            that player out: they can watch, but no longer type, mark cells, guess or be{" "}
            <span className={ui.capt}>Capt.</span> If everyone is knocked out, the game ends.
            Completing a word with tiles never uses a guess.
          </li>
          <li>
            Mark a doubtful cell with ?. A mark on a correct letter is a false suspect and costs 3
            points. Par is 5 minutes in 5× mode and 6 in 6× mode. 7× mode has a 7-minute time limit:
            when it runs out the game ends, and the score is the number of meta words obtained. The
            results show each player&apos;s tiles and the wrong letters they passed on at rotations,
            an MVP for each board and a tiles leaderboard. The{" "}
            <span className={ui.capt}>Capt.</span> can end a round and restart it from the seating
            map.
          </li>
        </ol>
      </section>
    </main>
  );
}
