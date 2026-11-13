# Code walkthrough

A guide to how the app works, in the order it runs, and where to make common changes.

## 1. Loading

`index.html` loads four scripts in order at the end of `<body>`:

1. `data.js` defines `CONFIG`, `STOPS`, `ROUTES` and `EXAMPLE_TRIPS`.
2. `planner.js` defines the pure functions that use the data. It never touches the page.
3. `map.js` defines `ShuttleMap`, which draws the SVG map.
4. `app.js` wires everything to the page and runs the `setup…()` functions at the bottom.

They are plain scripts, not ES modules, so the page also works when opened straight from disk (`file://`).

## 2. The data model

- A **stop** has an `id`, `name`, `kind` (hostel, academic, facility, gate) and an `x, y` position on the schematic map.
- A **route** has a `name`, a `color`, whether it is a `loop`, its number of `carts` and `peakCarts`, `seats` per cart, an ordered list of `stops` as `[stopId, minutesFromStart]`, and a drawing `path`.
- A **service day** in `SERVICE` has `first` and `last` start times, `peaks` (each with the way most riders travel), `pause` windows with no service. Days missing from `SERVICE` (the weekend) have no carts.

`headway(route, day, peak)` works out the gap between carts: a cart's round trip (or lap) divided by the carts on the route, with loop carts split between the two directions. `departuresFor(route, day)` then starts at `first`, adds the peak or normal gap each step, jumps over pauses, and always includes a final cart at `last`.

Each route runs both ways. `buildDirections()` creates a forward and a reverse "direction" for every route. Loop directions list two laps, so a ride can pass the starting stop.

## 3. Planning a trip (`planTrip`)

1. **Ride patterns.** `ridePatterns` lists every way to get there with up to three rides, ignoring times: which direction to board, where to get off, where to change. `reachSets` prunes it to change stops that can still reach the destination.
2. **Real times.** `journeysBetween` takes each pattern, tries every first cart in the time window, and for each later ride uses a binary search (`firstDepartureAfter`) for the first cart at least `CONFIG.transferMinutes` after the previous one arrives.
3. **Filter by the user's time.**
   - *Arrive by:* keep journeys that arrive by `time − minutes early`, sort by latest boarding time.
   - *Leave after:* keep journeys that board after the time, sort by earliest arrival.
4. **Remove worse options.** `removeWorse` drops any journey that boards no later, arrives no earlier and changes no less often than another one.
5. **Return a status** (`ok`, `late`, `none`, `no-route`, `no-service`). `app.js` turns each status into a heading and a sentence in `summaryFor`.
6. **Seat pressure.** `crowding(leg, day)` marks a ride "full" if it travels with the peak crowd (hostel to class in the morning and at 2 pm, class to hostel at 1 pm and 5 pm) and "busy" for any other peak ride. `seatText` adds the advice to take a safer cart.

## 4. Validation

The form uses the browser's own validation: `required`, `min` and `max`. `validateCustom()` adds the rules HTML cannot express (start and destination must differ, friendly range messages) with `setCustomValidity`, and runs on every `input`/`change`. On submit, `form.checkValidity()` decides whether to search, and `form.reportValidity()` shows the browser's message.

## 5. Events used

| Event | Element | Effect |
| --- | --- | --- |
| `submit` | Trip form | Validate, search, show results |
| `input`, `change` | Form fields | Re-check validation as the user types |
| `change` | Day buttons, change switch | Re-run a search already on screen |
| `change` | "I want to" | Show or hide "Minutes early" |
| `click` | Swap, example trips, journey options, legend, route chips, Now | See each section |
| `input` | Stop search | Filter routes live |
| `keydown` | Document | Escape closes the mobile menu |
| `visibilitychange` + `setInterval` | Document | Keep the departures board current |

## 6. Common live changes

| Change | Where |
| --- | --- |
| Accent colour | `--accent` in `:root` in `css/styles.css` (and the dark-mode block) |
| Minimum time to change carts | `CONFIG.transferMinutes` in `js/data.js` |
| Seats per cart, or carts on a route | `seats`, `carts`, `peakCarts` in `ROUTES` (frequencies update by themselves) |
| Peak times or service hours | `peaks`, `first`, `last` in `SERVICE` |
| Add a stop | Add to `STOPS`, then add `[id, minutes]` to a route's `stops` and its id to that route's `path` |
| Rename a route or change its colour | `name`, `color` in `ROUTES` |
| Number of options shown | `CONFIG.maxOptions` |
| Number of departures on the board | `nextDepartures(…, 6)` in `renderBoard()` |
| Tablet / desktop breakpoints | The two `@media (min-width: …)` blocks at the end of `styles.css` |
