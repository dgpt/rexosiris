#!/usr/bin/env bash
set -euo pipefail
out=public/audio; pcm="$1"
slug() { echo "$1" | sed -E 's/ \(mastered\)(_2)?//; s/\.flac$//' | tr 'A-Z' 'a-z' | sed -E "s/[^a-z0-9]+/-/g; s/^-|-$//g"; }
manifest=scripts/tracks.tsv; : > "$manifest"
for album in "e" "what is real"; do
  for f in "/mnt/c/Users/Admin/Music/$album"/*.flac; do
    b=$(basename "$f"); s=$(slug "$b"); t=$(echo "$b" | sed -E 's/ \(mastered\)(_2)?//; s/\.flac$//')
    printf '%s\t%s\t%s\n' "$album" "$s" "$t" >> "$manifest"
    ffmpeg -nostdin -loglevel error -y -i "$f" -vn -ac 2 -b:a 128k "$out/$s.mp3" &
    ffmpeg -nostdin -loglevel error -y -i "$f" -vn -ac 1 -ar 22050 -f f32le "$pcm/$s.f32" &
    wait
  done
done
echo done $(wc -l < "$manifest")
