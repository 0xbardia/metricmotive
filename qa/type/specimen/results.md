# Type specimen results

Server: http://127.0.0.1:8093/specimen/index.html (flags ?c=A|ASOFT|AWONK|B|C, ?nofallback=1)

## Bytes (budget: current 141,580; ceiling 161,580)
| cand | first-load | total | pass |
|--|--|--|--|
| A | 91,804 | 122,992 | pass |
| ASOFT | 140,776 | 171,964 | FAIL |
| AWONK | 92,068 | 123,256 | pass |
| B | 83,092 | 112,688 | pass |
| C | 90,660 | 136,064 | pass |

## CLS on swap (390x844, 4x CPU, 1.5s font delay, median of 3)
| cand | with fallbacks | nofallback |
|--|--|--|
| A | 0.0000 | 0.0179 |
| ASOFT | 0.0000 | 0.0179 |
| AWONK | 0.0000 | 0.0179 |
| B | 0.0000 | 0.0179 |
| C | 0.0000 | 0.0804 |

Instrument Sans Fallback corrected (A family was 0.0100 before): size-adjust 102.14%, ascent 94.97%, descent 24.48% (was 106.47/91.11/23.48).

## Contrast
Same for all candidates. Min normal text 5.19 (brand #8a5a12 on bone); min small mono label 5.19. All AA. See results.json for each pair.

## Tabular figures
Fraunces: no tnum in built subsets. Instrument Sans: tnum works. Hanken, Source Sans 3: default already tabular. Mono fonts: monospaced.

## WONK
Not visibly different at 32 px; at 88 px differences are negligible/not discernible in the screenshot.
