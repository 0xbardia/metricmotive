# Self-hosted fonts (Latin subset, woff2)

All three families are licensed under the SIL Open Font License 1.1 (OFL). The licence text for Commit Mono is in `commit-mono-LICENSE.txt`.

Built from the official variable TTFs (google/fonts, `ofl/`) by `qa/type/build-variants.sh`, with the Latin subset and axes pinned:

- fraunces-opsz-wght-400-700.woff2 (Fraunces: opsz and wght; SOFT=0, WONK=0; wght 400 to 700)
- instrument-sans-wght-400-700.woff2 (Instrument Sans: wdth=100; wght 400 to 700)
- commit-mono-400.woff2, commit-mono-700.woff2 (Commit Mono, static, Latin subset; qa/type/fonts)

Candidate A of the type specimen (`qa/type/specimen`). WONK and SOFT are excluded: WONK is not visibly different and SOFT costs about 49 kB.
