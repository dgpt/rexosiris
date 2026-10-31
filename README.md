# REXOSIRIS. — a rhythm game

This is the home page for my music, REXOSIRIS, and it's also a rhythm game you play on it. The game plays my two albums, *what comes next?* and *e*, plus two DEDZII remixes: twenty-two songs, titled, ordered and credited from the files' own tags (`scripts/read-tags.ts`).

**Play it:** https://what-is-real-rhythm.netlify.app (no account needed: pick a song, then left / up / right on the arrow keys, A W D or J I L, or taps on a phone)

## Who it's for

People who'd rather play an album than just listen to it, and people who've heard my music and want to *hit* it. The good moment is when a chart lands on a part you've heard a hundred times, and now you're the one playing it.

## What you can do

- **Listen.** The home page is the albums. Every song plays from a player bar, no sign-in.
- **Play, with or without an account.** Pick a song at Easy, Normal or Hard. Three lanes, left / up / right, like Rift of the NecroDancer, with scrolling arrows and hold notes, judged Perfect / Great / Good / Miss (±45 / 90 / 135 ms) with early/late markers. You get a combo, a health bar, and FEVER at 30 combo. The stage pulses on the beat, with a live spectrum and hit bursts.
- **Results.** You get a grade (SS–D), FULL COMBO and ALL PERFECT banners, hold OK/NG, and a timing graph of every hit. Playing as a guest, the score waits for you: sign in from the results screen and it's saved.
- **An account, if you want one.** Scores, settings and history are yours, with leaderboards per song and difficulty, your personal best on every song row, and recent plays. Making an account starts with a short calibration.
- **Calibrate.** Tap along to a click and your median offset is saved, so the charts line up with *your* speakers and keyboard. Taps are timed against when you actually hear the click, and the help text only shows up if your taps are all over the place.
- **Scroll speed**, saved per account (or locally as a guest).
- **Chart your own track.** Drop any audio file and an analyzer charts it in your browser. Those runs aren't ranked.

## How the charts are made

The albums were charted by a model trained on charts people made by hand, then fitted to my own projects.

1. **A charter trained on human charts.** [Mapperatorinator](https://github.com/OliBomby/Mapperatorinator) (v32) is a transformer trained on ranked osu! beatmaps, mania included. It listens to the song and writes a chart. It's best at 4-key mania, so it charts in 4K and `scripts/charts/notes.ts` folds that to three lanes: the outer columns go left and right, the inner ones go up, and when the chart steps sideways out of the middle it steps the same way, so the fold doesn't invent repeated same-lane hits the chart didn't have.
2. **My FL Studio projects give the exact grid.** For twelve songs, `scripts/flp` reads the .flp project directly (FL 25's format, without PyFLP) and finds which project made which song by matching note onsets against the master, since a lot of projects had been renamed. Left alone, the model guesses the tempo first and then charts against its guess, and on some songs the guess started halfway through, leaving the first half empty. `scripts/charts/generate.ts` hands it the project's grid instead, at the tempo octave the model itself hears (*drive* is charted at 190 bpm, the way an osu! mapper would time it).
3. **One tempo for the songs without a project.** The model's slow, careful timing pass runs once per song, and `scripts/charts/grid.ts` fits one tempo through every long section it found. These are FL productions at a constant tempo, so one grid is closer to the truth than the pass's small wobbles. All three difficulties share it.
4. **Lined up with the sound, measured.** `fitToOnsets` in `grid.ts` slides each grid against the song's onsets, searching tempo (±0.5%) and phase together, and moves it to where the hits actually land. The onset curve it fits against (`scripts/charts/onsets.ts`) is checked by a test against synthetic clicks with known onsets, and that test fails if its latency is off by 4 ms. On the twelve linked songs it leaves the project tempo exactly as it is and moves the grid 23 to 26 ms later, the error of my matcher. On the others it corrected two fitted tempos (*is it over?* was 0.23% slow) to the same values the titled FL projects hold, and a check that each third of the song still lines up reads within 3 ms everywhere.
5. **Three seeds per chart, best one kept.** Every difficulty is generated three times. `scripts/charts/pick.ts` drops any version that leaves loud parts of the song empty or holds a note longer than 12 seconds, then keeps the one whose notes sit on the strongest attacks. It chooses between whole charts; it never moves a note.
6. **Difficulty by density.** Easy, Normal and Hard come from the model's star rating (0.9 / 1.4 / 2.1, in its half-star steps), chosen to match the note counts people were already playing.

The charts are precomputed, in two steps that share one work directory:

```
MAPPERATORINATOR=/path/to/Mapperatorinator bun run charts:generate .charts   # grids, then 3 seeds x 3 difficulties per song; skips what exists
bun run charts:assemble .charts                                              # picks a chart per difficulty, writes public/charts/
```

Uploads still go through the original in-browser analyzer (`src/shared/analysis/`).

## Not trusting the client

The browser sends judgment counts, not a score. The server checks that the counts add up to the chart's real note count and that the max combo is possible, then computes score and grade itself (`src/server/handler.ts`, tests in `handler.test.ts`). Sessions are HMAC-signed cookies and passwords are PBKDF2-SHA256 (120k iterations).

## Stack

- TypeScript end to end, built with Bun. The client is vanilla TS plus Canvas plus Web Audio, with no framework, at about 48 KB minified.
- The API is one handler. It runs locally under `Bun.serve` and in production as a Netlify Function (`netlify/functions/api.mts`), with Netlify Blobs as the store.
- Audio is my FLAC masters, transcoded to 128k MP3 (`bun run audio`).

```
bun install
bun run dev        # http://127.0.0.1:4390, file-backed store in .data/
bun run test       # analyzer + API
bun run typecheck
bun run lint       # oxlint, type-aware (needs Node >= 22.6 for the comment rule)
bun run check      # all three
```

## Code layout and the lint bar

- `src/shared/analysis/`: one module per stage of the charter (`fft`, `features`, `grid`, `voices`, `phrases`, `lanes`, `chart`), with `model.ts` holding the shared types and constants. `analyze.ts` re-exports them.
- `src/shared/guards.ts`: runtime type guards. Nothing read from the network or the store is cast; it is checked.
- `src/server/`: `handler.ts` is a route table of small typed handlers, `session.ts` holds passwords and signed cookies, and `dev.ts` is the local file store.
- `src/client/`: `game/` (judging, scorecard, rendering, the play session), `screens/` (one module per screen) and small `api`, `audio`, `listen`, `settings`, `state`, `dom` and `decode` modules.
- `scripts/flp/`: the FL Studio project reader and the onset matcher that links a project to its master. The links themselves (local paths) stay out of the repo.
- `scripts/charts/`: the chart pipeline. `osu.ts` is the only code that reads or writes .osu files (a test holds that), `onsets.ts` the one onset measure, `grid.ts` the one grid, `notes.ts` the fold to three lanes, `pick.ts` the choice between seeds, `model.ts` the only place the model is called.

`.oxlintrc.json` is strict on purpose. It turns the correctness, suspicious, pedantic and perf categories into errors, and the type-aware rules (no `any`, no unsafe casts, no non-null `!`, strict booleans, no floating promises) apply on top. It also caps size: 250 lines a file, 60 a function, complexity 12, nesting depth 3, 4 parameters. A local rule (`lint/no-comments.ts`) bans comments, because a comment that was true gets read as current long after it stops being true. Names, types and tests carry the meaning instead. The whole tree lints at 0 warnings and 0 errors.

## How it was built, and what I'd do next

The first version was built inside the 2-hour box (started 12:52 MDT, see `.timebox`; the `master` branch is that version). After that I kept going for an evening, because it became the home page I'd been needing: no sign-in to play, the Listen player, three lanes, calibration on sign-up, and the trained charter. I chose the product and the music, played it, and called what was wrong. The code was written by an AI coding agent (Claude) working under my direction, which is how I build day to day.

How it was checked:
- Tests cover the analyzer, against synthetic click tracks, a kick/noise/kick song that must change voices, and two alternating pitches that must stay in two lanes. They also cover the API.
- Sign-up, play, results, leaderboard, upload and mobile were walked in a real Chrome on localhost and on production.
- A bot player hooks the page's audio start from a test-only script and presses every note at its exact audio time. It scored 11/11 Perfect, which proves chart times, audio clock and judging agree end to end.

What the checks caught:
- Notes still on screen when a song ended weren't counted, so the server rejected the run.
- A small tempo error drifted the grid 50 ms over 30 s.
- Five songs charted zero notes, because of an off-by-one at a negative first beat.
- Raw salience let the hats win every phrase.
- The arrows were drawn rotated the wrong way.
- A touch the phone cancels (an edge swipe, a notification) never sent touchend, so its lane stayed held and a hold note scored OK with no finger on it. A probe that cancels a touch mid-hold read "1 OK" before the fix and "1 NG" after.
- On a phone the only way out of a song was Esc. There is now a × outside the lane columns.
- An earlier revert had quietly dropped the lint script from package.json, so the gate wasn't running at all.
- Calibration called my latency "perfect" right after measuring -17 ms. It now always states the number, and it saves nothing if the taps are too scattered to trust.
- The calibration click kept playing after you left the screen.
- Snapping every note onto the nearest audio onset made the charts worse, not better, because it was graded against the same onset curve it snapped to. It was reverted.
- Asked for three keys, the trained model still wrote four columns, so it charts in four and the fold does the rest.
- Filenames with parentheses broke the model's config parser, and most of the first batch of charts failed without anyone noticing. The batch now stops after three failures.
- Left to time a song itself, the model sometimes started its tempo at 1:38 or 2:09, and those charts had nothing before that. It now gets the tempo handed to it, and a version that leaves loud parts empty is never picked.
- Three charts the picker had chosen opened with a single hold lasting 46 seconds, or the whole song, written by the model at time zero. The hold also blocked its lane, so the rest of the chart was folded around it. A chart like that is now never picked; the longest hold anywhere else is under 7 seconds.
- The grid my project matcher found was 23 to 26 ms early on all twelve songs. The model's own timing agreed with it, which looked like confirmation, but it was early in the same way. Only a synthetic click with a known onset separated the measuring tool's error from the song's.

Next:
- Hand fixes for the moments the charter gets wrong. The converter already reads .osu files, so a chart can go through osu!'s own mania editor and come back.
- Friends and following on the leaderboards.
- Replays.
- Chord-aware lanes for the lead.
