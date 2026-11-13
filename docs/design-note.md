# Design note: Campus Shuttle Route Planner

## Wireframe

See `wireframe.svg` (or `wireframe.png`). Mobile stacks form, results and map in one column. Tablet puts the form next to the results with the map below. Desktop keeps the form and results in a 400 px column with the map sticky beside them, so the highlighted journey stays visible while the results scroll.


## Interactions and edge cases

| Interaction | Logic used | Edge cases handled |
| --- | --- | --- |
| Trip planner | Finds ride patterns with up to two changes (minimum 2 min to change, round the Ring Road in either direction), gives them real times, removes options that are worse in every way, ranks them, and flags seat pressure at peaks | Same start and destination; missing or out‑of‑range time; minutes early outside 0–30; weekend; Friday prayer break; nothing arrives in time (shows lateness); no cart after the chosen time; changes turned off; best cart likely full; walking faster than riding |
| Departures board | Next six carts from a stop across both directions of every route, refreshed every 30 s and when the tab becomes visible again | After the 5 pm last cart (shows the first one tomorrow, or on Monday after a Friday); weekend (shows Monday); stop where a route ends |
| Route search and filter | Case‑insensitive match on stop names, combined with a route filter | Blank or space‑only search; no match (explains what to try) |
| Map | SVG drawn from the same records; highlights only the ridden parts of the selected journey, or one route from the legend | Narrow screens scroll the map sideways and move it to the journey |

## Accessibility

Landmarks (`header`, `nav`, `main`, `section`, `footer`), one `h1` and ordered headings, a skip link, labels on every input, `fieldset`/`legend` for grouped controls, native input types (`time`, `number`, `search`, `select`), `aria-live` regions for results and the board, `aria-pressed` and `aria-expanded` on toggle buttons, visible keyboard focus, colour never used alone (route names always shown), and reduced motion respected.
