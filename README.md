# REXOSIRIS. — a rhythm game

A StepMania / Crypt of the NecroDancer–style rhythm game where every track is mine. I release music as REXOSIRIS, and the game plays two of my albums, *what comes next?* and *e*: twenty songs, titled, ordered and credited from the files' own tags (`scripts/read-tags.ts`).

**Play it:** https://what-is-real-rhythm.netlify.app (make an account, pick a song, arrow keys or D F J K, taps on a phone)

## Who it's for

People who'd rather play an album than just listen to it, and people who've heard my music and want to *hit* it. The good moment is when a chart lands on a kick you've heard a hundred times, and now you're the one hitting it.

## What you can do

- **Create an account / sign in.** Scores, settings and history are yours.
- **Pick a song from either album, at Easy, Normal or Hard.** Selecting a song plays a preview. Arrows and Enter drive the whole menu from the keyboard. Each song shows its BPM, length, note and hold counts, and the path of instruments its chart follows.
- **Play.** Four lanes, scrolling arrows and hold notes, judged Perfect / Great / Good / Miss (±45 / 90 / 135 ms) with early/late markers. You get a combo, a health bar, and FEVER at 30 combo. The stage pulses on the beat, NecroDancer style, harder on the downbeat, with a live spectrum and hit bursts. A tag shows which instrument the chart is following right now.
- **Results.** You get a grade (SS–D), FULL COMBO and ALL PERFECT banners, hold OK/NG, and a timing graph of every hit. If you're consistently early or late, it tells you to calibrate. The server saves the run and tells you whether it's a personal best and where it ranks.
- **Leaderboards per song and difficulty**, plus your personal best on every song row and a recent-plays list.
- **Calibrate.** Tap along to a click and your median offset is saved to your account, so the charts line up with *your* speakers and keyboard.
- **Scroll speed**, saved per account.
- **Chart your own track.** Drop any audio file and the same analyzer that charted my albums runs in your browser and charts it. Those runs aren't ranked.

## The interesting part: charts that listen

Nobody hand-charted these. `src/shared/analyze.ts` is plain TypeScript that runs both offline over the albums (`scripts/build-charts.ts`) and in your browser when you upload a track.

1. **Six voices.** A Hann-windowed FFT (1024 / hop 256 at 22.05 kHz) is split into instrument bands: kick, bass, snare body, snare crack and lead, hats, and cymbals. For each band it tracks spectral flux (hits), level (sustain) and a flux-weighted centroid (where in the band the hit sits, which stands in for timbre and pitch).
2. **The beat grid.** Tempo comes from autocorrelating the onset envelope at 1×, 2× and 4× the beat lag (75–185 BPM, with a prior so it doesn't settle on half or double time). Then comes the phase, and a regression through the strongest onset near each beat. On a click track every note lands within one analysis frame (~11 ms).
3. **Phrases follow the music.** The song is cut into 4-bar phrases. Each phrase follows the voice that is most *unusually* present in it: salience divided by that voice's average across the song, with hysteresis so the lead doesn't flicker. The chart moves between soundscapes the way a person would chart them, kick in the verse, lead in the hook, hats in the break. The game shows what it's following, and song select shows each song's path.
4. **Same sound, same lane.** Within a phrase, the followed voice's hits are clustered by timbre on the gaps between them. Each cluster gets a fixed lane, ordered low to high. A riff that alternates two notes alternates two lanes, and a melody climbing in pitch walks left to right.
5. **Density follows energy.** Each phrase's note budget scales with its loudness. Drops get dense and breakdowns breathe. Gaps longer than 2 beats (4 on Easy) are filled from the next-strongest voice, except in quiet breakdowns.
6. **Holds.** A bass, snare-body or lead hit whose band level stays up for 1+ beats becomes a hold note, in half-beat steps up to 4 beats, trimmed so its lane is free again before the next note.
7. **Difficulty.** Easy is quarter notes from the followed voice and never asks for the same lane twice within a beat. Normal adds eighths and holds. Hard adds sixteenths, a second voice and jumps on strong downbeats. Notes are colored by subdivision (red quarters, blue eighths, gold sixteenths), the way StepMania players read rhythm at a glance.

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

I worked inside the 2-hour box (started 12:52 MDT, see `.timebox`). I chose the product and the music and played it. The code was written by an AI coding agent (Claude) working under my direction, which is how I build day to day.

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

Next:
- A per-song chart editor for the moments the analyzer gets wrong.
- Per-song offsets from the masters.
- Friends and following on the leaderboards.
- Replays.
- Chord-aware lanes for the lead.
