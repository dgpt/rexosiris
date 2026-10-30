# what is real.

A StepMania / Crypt of the NecroDancer–style rhythm game where every track is mine: two of my albums, *e* and *what is real*, twenty songs.

**Play it:** https://what-is-real-rhythm.netlify.app (make an account, pick a song, arrow keys or D F J K, taps on a phone)

## Who it's for

People who'd rather play an album than just listen to it, and people who've heard my music and want to *hit* it. The good moment is when a chart lands on a kick you've heard a hundred times, and now you're the one hitting it.

## What you can do

- **Create an account / sign in.** Scores, settings and history are yours.
- **Pick a song from either album, at Easy, Normal or Hard.** Every chart shows its note count, BPM and length.
- **Play.** Four lanes and scrolling arrows, judged Perfect / Great / Good / Miss (±45 / 90 / 135 ms). There's a combo counter and a health bar, and you fail if it empties. The whole stage pulses on the beat, NecroDancer style, harder on the downbeat.
- **Results.** You get a grade (SS–D), accuracy and max combo. The server saves the run and tells you whether it's a personal best and where it ranks.
- **Leaderboards per song and difficulty**, plus your personal best on every song row and a recent-plays list.
- **Calibrate.** Tap along to a click and your median offset is saved to your account, so the charts line up with *your* speakers and keyboard.
- **Scroll speed**, saved per account.
- **Chart your own track.** Drop any audio file and the same analyzer that charted my albums runs in your browser and charts it. Those runs aren't ranked.

## The interesting part: charts come from the audio

Nobody hand-charted these. `src/shared/analyze.ts` is plain TypeScript that runs both offline over the albums (`scripts/build-charts.ts`) and in the browser for uploads:

1. **Onsets.** A Hann-windowed FFT (1024 / hop 256 at 22.05 kHz) gives log-magnitude spectral flux in four bands (sub, low-mid, high-mid, air).
2. **Tempo.** It autocorrelates the onset envelope at 1×, 2× and 4× the beat lag across 75–185 BPM, with a log-normal prior centred near 125 BPM so it doesn't settle on half or double time.
3. **Phase, then refinement.** It picks the beat phase that collects the most onset energy, then repeatedly fits a straight line through the strongest onset near each predicted beat. On a 120 BPM click track, a tempo 0.25 BPM off had drifted 50+ ms by the end of 30 s. After the fit, every note is within one analysis frame (~11 ms) of its click (`analyze.test.ts`).
4. **Charting.** It quantizes to quarter, eighth or sixteenth notes by difficulty, scores each grid slot by the onset strength nearby (on-beat slots weighted up) and keeps the strongest slots up to a target density (1.3 / 2.6 / 4.6 notes per second). The lane comes from the dominant frequency band, so kicks and highs land in different places. Easy never repeats a lane twice in a row, and Hard adds jumps on strong downbeats.

## Not trusting the client

The browser sends judgment counts, not a score. The server checks that the counts add up to the chart's real note count and that the max combo is possible, then computes score and grade itself (`src/server/handler.ts`, tests in `handler.test.ts`). Sessions are HMAC-signed cookies and passwords are PBKDF2-SHA256 (120k iterations).

## Stack

- TypeScript end to end, built with Bun. The client is vanilla TS plus Canvas plus Web Audio, with no framework, at about 20 KB.
- The API is one handler. It runs locally under `Bun.serve` and in production as a Netlify Function (`netlify/functions/api.mts`), with Netlify Blobs as the store.
- Audio is my FLAC masters, transcoded to 128k MP3 (`scripts/transcode.sh`).

```
bun install
bun run dev        # http://127.0.0.1:4390, file-backed store in .data/
bun run test       # analyzer + API
bun run typecheck
```

## How it was built, and what I'd do next

I worked inside the 2-hour box (started 12:52 MDT, see `.timebox`). I chose the product and the music. The code was written by an AI coding agent (Claude) working under my direction, which is how I build day to day. Sign-up, play, results, leaderboard and upload were walked in a real Chrome, on localhost and on production, before I called them done; calibration was only opened, not tapped through. Those walks caught two real bugs. Notes still on screen when a song ended weren't counted as misses, so the server rejected the run. And the beat grid drifted with tempo error, which the regression step fixed.

Next, in order:
- Hold notes.
- A per-song chart editor, so I can hand-tune the moments the analyzer gets wrong.
- Per-song offsets from the masters.
- Friends and following on the leaderboards.
- Replays.
