#!/bin/sh
# Rebuild the Latin WOFF2 variants in qa/type/fonts/variants from the official variable TTFs (google/fonts, OFL 1.1).
# Needs fonttools and brotli in a venv: python3 -m venv VENV && VENV/bin/pip install fonttools brotli
# Usage: VENV=/path/to/venv sh qa/type/build-variants.sh <scratch-dir>
set -eu
VENV="${VENV:?set VENV to a venv with fonttools and brotli}"
SRC="${1:?scratch dir for the source TTFs}"
OUT="$(cd "$(dirname "$0")" && pwd)/fonts/variants"
mkdir -p "$SRC" "$OUT"
GF=https://raw.githubusercontent.com/google/fonts/main/ofl
curl -sL -o "$SRC/Fraunces.ttf" "$GF/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf"
curl -sL -o "$SRC/InstrumentSans.ttf" "$GF/instrumentsans/InstrumentSans%5Bwdth%2Cwght%5D.ttf"
curl -sL -o "$SRC/HankenGrotesk.ttf" "$GF/hankengrotesk/HankenGrotesk%5Bwght%5D.ttf"
LATIN="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
FEAT="kern,liga,calt,ccmp,locl,mark,mkmk,tnum,lnum,pnum,case,frac"
mk() { name=$1; src=$2; shift 2
  "$VENV/bin/fonttools" varLib.instancer "$src" "$@" -o "$SRC/tmp-$name.ttf" -q
  "$VENV/bin/pyftsubset" "$SRC/tmp-$name.ttf" --unicodes="$LATIN" --layout-features="$FEAT" --flavor=woff2 --output-file="$OUT/$name.woff2"
  echo "$name $(stat -c %s "$OUT/$name.woff2") bytes"; }
F="$SRC/Fraunces.ttf"
mk fr-opsz-wght-100-900 "$F" SOFT=0 WONK=0
mk fr-opsz-wght-400-700 "$F" SOFT=0 WONK=0 wght=400:700
mk fr-opsz-wght-wonk-400-700 "$F" SOFT=0 wght=400:700
mk fr-opsz-wght-soft-400-700 "$F" WONK=0 wght=400:700
mk fr-opsz-wght-soft-wonk-400-700 "$F" wght=400:700
mk is-wght-400-700 "$SRC/InstrumentSans.ttf" wdth=100 wght=400:700
mk is-wdth-wght-400-700 "$SRC/InstrumentSans.ttf" wght=400:700
mk hg-wght-400-700 "$SRC/HankenGrotesk.ttf" wght=400:700
# Commit Mono (OFL 1.1) is static OTF; the Latin subsets live in qa/type/fonts/commit-mono-{400,700}.woff2
