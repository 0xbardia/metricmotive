#!/bin/sh
# Interleaved Lighthouse A/B, mobile, performance only: rc6 build vs v2.1 build, 5 rounds, both pages.
# Waits for 1-minute load < 12 (2 per core on 6 cores) before each run. Usage: sh lighthouse-ab.sh <rc6Base> <v21Base> <outDir>
set -u
RC6="$1"; V21="$2"; OUT="$3"
mkdir -p "$OUT"
export CHROME_PATH=/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
run() {
  label=$1; base=$2; path=$3; round=$4
  while [ "$(cut -d' ' -f1 /proc/loadavg | cut -d. -f1)" -ge 12 ]; do sleep 15; done
  load=$(cut -d' ' -f1 /proc/loadavg)
  file="$OUT/$label-$(echo "$path" | tr '/' '_')-r$round.json"
  lighthouse "$base$path" --only-categories=performance --form-factor=mobile --screenEmulation.mobile \
    --chrome-flags="--headless=new --no-sandbox --disable-gpu" --quiet --output=json --output-path="$file" >/dev/null 2>&1
  echo "$label $path r$round load=$load exit=$?" >> "$OUT/progress.txt"
}
for r in 1 2 3 4 5; do
  for path in / /verify/rct_14804bf62424284e; do
    if [ $((r % 2)) -eq 1 ]; then run rc6 "$RC6" "$path" "$r"; run v21 "$V21" "$path" "$r"
    else run v21 "$V21" "$path" "$r"; run rc6 "$RC6" "$path" "$r"; fi
  done
done
echo DONE >> "$OUT/progress.txt"
