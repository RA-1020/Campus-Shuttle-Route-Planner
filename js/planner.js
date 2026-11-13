/*
 * Planner logic. Pure functions only: nothing here touches the page, so the
 * same rules can be ported to PHP in Assignment 2.
 */

/* ---------- time helpers ---------- */

// "07:30" -> 450 (minutes after midnight). Returns NaN for bad input.
function toMinutes(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return NaN;
  return hours * 60 + minutes;
}

// 450 -> "7:30 am"
function formatTime(total) {
  const minutesInDay = ((total % 1440) + 1440) % 1440;
  const hours = Math.floor(minutesInDay / 60);
  const minutes = minutesInDay % 60;
  const suffix = hours < 12 ? "am" : "pm";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return hour12 + ":" + String(minutes).padStart(2, "0") + " " + suffix;
}

// 450 -> "07:30" (value for <input type="time">)
function toInputTime(total) {
  const hours = Math.floor(total / 60) % 24;
  return String(hours).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}

// 75 -> "1 hr 15 min"
function formatDuration(minutes) {
  if (minutes < 60) return minutes + " min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours + " hr" + (rest ? " " + rest + " min" : "");
}

/* ---------- days ---------- */

const DAYS = [
  { key: "weekday", label: "Mon–Thu", long: "Monday to Thursday" },
  { key: "friday", label: "Fri", long: "Friday" },
  { key: "weekend", label: "Sat–Sun", long: "Weekend" }
];

// JavaScript Date -> timetable day key
function dayKeyFor(date) {
  const day = date.getDay(); // 0 Sunday ... 6 Saturday
  if (day === 0 || day === 6) return "weekend";
  if (day === 5) return "friday";
  return "weekday";
}

// The next day that has shuttles, and how to say it.
// (Thursday is grouped with Mon–Wed, so "next day" from a weekday is a weekday.)
function nextServiceDay(key) {
  const next = { weekday: "weekday", friday: "weekday", weekend: "weekday" };
  const words = { weekday: "tomorrow", friday: "on Monday", weekend: "on Monday" };
  return { key: next[key], words: words[key] };
}

/* ---------- lookups ---------- */

function getStop(id) {
  return STOPS.find(function (stop) { return stop.id === id; });
}

function getRoute(id) {
  return ROUTES.find(function (route) { return route.id === id; });
}

/* ---------- timetables ---------- */

function windowAt(list, minutes) {
  return list.find(function (w) {
    return minutes >= toMinutes(w[0]) && minutes < toMinutes(w[1]);
  });
}

// Minutes for one cart to get back to where it started.
function cycleMinutes(route) {
  if (route.loop) return route.lapMinutes;
  const oneWay = route.stops[route.stops.length - 1][1];
  return 2 * (oneWay + CONFIG.layoverMinutes);
}

// Gap between carts leaving the same stop in the same direction.
// On a line, every cart passes each stop once per round trip.
// On a loop, half the carts go each way.
function headway(route, dayKey, peak) {
  const carts = Math.max(route.loop ? 2 : 1, peak ? route.peakCarts : route.carts);
  return Math.ceil(cycleMinutes(route) / (route.loop ? carts / 2 : carts));
}

// Departure times (minutes) from the start of a route on a given day.
// Both directions run on the same clock.
function departuresFor(route, dayKey) {
  const service = SERVICE[dayKey];
  if (!service) return []; // weekend: no service

  const last = toMinutes(service.last);
  const times = [];
  let current = toMinutes(service.first);

  while (current <= last) {
    const pause = windowAt(service.pause, current);
    if (pause) {
      current = toMinutes(pause[1]);
      continue;
    }
    times.push(current);
    current += headway(route, dayKey, Boolean(windowAt(service.peaks, current)));
  }
  // The last carts always leave at closing time. If the previous cart would
  // leave only a minute or two earlier, it becomes the last cart instead.
  const previous = times[times.length - 1];
  if (previous !== last && !windowAt(service.pause, last)) {
    if (last - previous < headway(route, dayKey, false) / 2) times[times.length - 1] = last;
    else times.push(last);
  }
  return times;
}

// Peak window at a time, or undefined. Its third value is the main flow.
function peakAt(dayKey, minutes) {
  const service = SERVICE[dayKey];
  return service ? windowAt(service.peaks, minutes) : undefined;
}

function isPeak(dayKey, minutes) {
  return Boolean(peakAt(dayKey, minutes));
}

// Seat pressure on one ride: "full" when riding with the peak crowd
// (hostel to class in the morning, the other way at lunch and 5 pm),
// "busy" for any other ride at peak time, "" otherwise.
function crowding(leg, dayKey) {
  const peak = peakAt(dayKey, leg.board);
  if (!peak) return "";
  const from = getStop(leg.from).kind;
  const to = getStop(leg.to).kind;
  const withCrowd = peak[2] === "class"
    ? from === "hostel" && to !== "hostel"
    : from !== "hostel" && to === "hostel";
  return withCrowd ? "full" : "busy";
}

// Each route runs both ways. A "direction" is one way along it.
// Loop directions list two laps so a ride can pass the starting stop.
function buildDirections() {
  const list = [];
  ROUTES.forEach(function (route) {
    const ids = route.stops.map(function (s) { return s[0]; });
    const mins = route.stops.map(function (s) { return s[1]; });

    if (route.loop) {
      const lap = route.lapMinutes;
      const reverseIds = [ids[0]].concat(ids.slice(1).reverse());
      const reverseMins = [0].concat(mins.slice(1).reverse().map(function (m) { return lap - m; }));
      [[ids, mins, "Clockwise"], [reverseIds, reverseMins, "Anticlockwise"]].forEach(function (d) {
        list.push({
          route: route,
          stops: d[0].concat(d[0], [d[0][0]]),
          minutes: d[1].concat(d[1].map(function (m) { return m + lap; }), [2 * lap]),
          heading: d[2].toLowerCase(),
          short: d[2] + " loop"
        });
      });
      return;
    }

    const total = mins[mins.length - 1];
    list.push({ route: route, stops: ids, minutes: mins });
    list.push({
      route: route,
      stops: ids.slice().reverse(),
      minutes: mins.slice().reverse().map(function (m) { return total - m; })
    });
  });

  list.forEach(function (dir) {
    if (!dir.heading) {
      const end = getStop(dir.stops[dir.stops.length - 1]).name;
      dir.heading = "towards " + end;
      dir.short = "To " + end;
    }
  });
  return list;
}

const DIRECTIONS = buildDirections();

// Where a rider boards a direction (first lap for loops), or -1.
function boardIndex(dir, stopId) {
  return dir.stops.indexOf(stopId);
}

// Where the same rider gets off: the next time the cart reaches the stop.
function alightIndex(dir, fromIndex, stopId) {
  return dir.stops.indexOf(stopId, fromIndex + 1);
}

/* ---------- walking ---------- */

function walkMinutes(fromId, toId) {
  const a = getStop(fromId);
  const b = getStop(toId);
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  return Math.max(1, Math.round(distance * CONFIG.walkMinutesPerUnit));
}

/* ---------- journey search ---------- */

function makeLeg(dir, fromIndex, toIndex, departure) {
  return {
    direction: dir,
    route: dir.route,
    from: dir.stops[fromIndex],
    to: dir.stops[toIndex],
    fromIndex: fromIndex,
    toIndex: toIndex,
    stopCount: toIndex - fromIndex,
    board: departure + dir.minutes[fromIndex],
    arrive: departure + dir.minutes[toIndex],
    departure: departure
  };
}

// First departure in a sorted list that reaches a stop (offset) by `ready`.
function firstDepartureAfter(deps, offset, ready) {
  let low = 0;
  let high = deps.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (deps[mid] + offset >= ready) high = mid; else low = mid + 1;
  }
  return low < deps.length ? deps[low] : undefined;
}

// Stops from which one ride reaches `toId`, then stops from which two rides do.
function reachSets(toId) {
  const one = new Set();
  DIRECTIONS.forEach(function (dir) {
    const j = dir.stops.lastIndexOf(toId); // loops list the start stop again later
    if (j > 0) dir.stops.slice(0, j).forEach(function (id) { one.add(id); });
  });
  const two = new Set(one);
  DIRECTIONS.forEach(function (dir) {
    dir.stops.forEach(function (id, k) {
      if (one.has(id)) dir.stops.slice(0, k).forEach(function (earlier) { two.add(earlier); });
    });
  });
  return [one, two];
}

/*
 * Ride patterns from one stop to another, ignoring times: which direction to
 * board, where to get off, and where to change. maxLegs 1 = direct only,
 * 3 = up to two changes.
 */
function ridePatterns(fromId, toId, maxLegs) {
  const reach = reachSets(toId);
  const patterns = [];

  function explore(stopId, legsLeft, sofar, visited) {
    DIRECTIONS.forEach(function (dir) {
      if (sofar.length && sofar[sofar.length - 1].dir.route === dir.route) return;
      const i = boardIndex(dir, stopId);
      if (i === -1) return;

      for (let k = i + 1; k < dir.stops.length; k++) {
        const stop = dir.stops[k];
        if (stop === toId) {
          patterns.push(sofar.concat([{ dir: dir, i: i, k: k }]));
          return;
        }
        if (stop === stopId) return; // a full lap: nothing new after this
        const target = legsLeft === 3 ? reach[1] : reach[0];
        if (legsLeft > 1 && target.has(stop) && !visited.has(stop)) {
          const nextVisited = new Set(visited);
          nextVisited.add(stop);
          explore(stop, legsLeft - 1, sofar.concat([{ dir: dir, i: i, k: k }]), nextVisited);
        }
      }
    });
  }

  explore(fromId, maxLegs, [], new Set([fromId]));
  return patterns;
}

// Give a pattern real times, starting with a cart that leaves at `dep`.
function timedJourney(pattern, dayKey, dep) {
  const legs = [];
  let departure = dep;
  for (let n = 0; n < pattern.length; n++) {
    const p = pattern[n];
    if (n > 0) {
      const ready = legs[n - 1].arrive + CONFIG.transferMinutes;
      departure = firstDepartureAfter(departuresFor(p.dir.route, dayKey), p.dir.minutes[p.i], ready);
      if (departure === undefined) return null;
      if (departure + p.dir.minutes[p.i] - ready > CONFIG.maxWaitMinutes) return null;
    }
    legs.push(makeLeg(p.dir, p.i, p.k, departure));
  }
  return {
    legs: legs,
    board: legs[0].board,
    arrive: legs[legs.length - 1].arrive,
    duration: legs[legs.length - 1].arrive - legs[0].board,
    transfers: legs.length - 1
  };
}

// Every journey whose first cart is boarded between `earliest` and `latest`.
function journeysBetween(patterns, dayKey, earliest, latest) {
  const journeys = [];
  patterns.forEach(function (pattern) {
    const first = pattern[0];
    departuresFor(first.dir.route, dayKey).forEach(function (dep) {
      const board = dep + first.dir.minutes[first.i];
      if (board < earliest || board > latest) return;
      const journey = timedJourney(pattern, dayKey, dep);
      if (journey) journeys.push(journey);
    });
  });
  return journeys;
}

// Drop journeys that are strictly worse than another one.
function removeWorse(journeys) {
  return journeys.filter(function (j) {
    return !journeys.some(function (other) {
      if (other === j) return false;
      const notWorse = other.board >= j.board && other.arrive <= j.arrive && other.transfers <= j.transfers;
      const better = other.board > j.board || other.arrive < j.arrive || other.transfers < j.transfers;
      return notWorse && better;
    });
  });
}

// Keep one journey per boarding and arrival time, preferring fewer changes.
function uniqueJourneys(journeys) {
  const seen = new Set();
  journeys = journeys.slice().sort(function (a, b) { return a.transfers - b.transfers; });
  return journeys.filter(function (j) {
    const key = j.board + "-" + j.arrive;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/*
 * Main entry point.
 * query: { from, to, day, mode: "arrive" | "depart", time: minutes, early: minutes,
 *          transfer: bool (true = up to two changes) }
 * Returns { status, journeys, ... } where status is one of:
 *   "ok"        journeys found
 *   "late"      nothing arrives in time; `late` is the earliest that does
 *   "none"      no shuttle after the chosen time
 *   "no-route"  the stops need more changes than the settings allow
 *   "no-service" no shuttles on that day
 */
function planTrip(query) {
  const walk = walkMinutes(query.from, query.to);
  const result = { query: query, walk: walk, journeys: [] };

  if (!SERVICE[query.day]) {
    result.status = "no-service";
    return result;
  }

  const patterns = ridePatterns(query.from, query.to, query.transfer ? 3 : 1);
  if (patterns.length === 0) {
    result.status = "no-route";
    return result;
  }

  if (query.mode === "arrive") {
    const target = query.time - query.early;
    result.target = target;
    const candidates = uniqueJourneys(journeysBetween(patterns, query.day, target - CONFIG.lookBackMinutes, target));
    const inTime = removeWorse(candidates.filter(function (j) { return j.arrive <= target; }));
    inTime.sort(function (a, b) { return b.board - a.board || a.transfers - b.transfers; });
    result.journeys = inTime.slice(0, CONFIG.maxOptions);

    if (result.journeys.length) {
      result.status = "ok";
    } else {
      const later = journeysBetween(patterns, query.day, target - CONFIG.lookBackMinutes, target + 180)
        .filter(function (j) { return j.arrive > target; })
        .sort(function (a, b) { return a.arrive - b.arrive || a.transfers - b.transfers; });
      result.status = later.length ? "late" : "none";
      result.late = later[0] || null;
    }
  } else {
    const after = removeWorse(uniqueJourneys(journeysBetween(patterns, query.day, query.time, query.time + 120)));
    after.sort(function (a, b) { return a.arrive - b.arrive || a.transfers - b.transfers || b.board - a.board; });
    result.journeys = after.slice(0, CONFIG.maxOptions);
    result.status = result.journeys.length ? "ok" : "none";
  }

  return result;
}

/* ---------- departures board ---------- */

// Next shuttles leaving a stop at or after `now`.
function nextDepartures(stopId, dayKey, now, limit) {
  const list = [];
  DIRECTIONS.forEach(function (dir) {
    const i = dir.stops.indexOf(stopId);
    if (i === -1 || i === dir.stops.length - 1) return; // the cart ends here
    departuresFor(dir.route, dayKey).forEach(function (dep) {
      const at = dep + dir.minutes[i];
      if (at >= now) {
        list.push({ direction: dir, route: dir.route, at: at, busy: isPeak(dayKey, at) });
      }
    });
  });
  list.sort(function (a, b) { return a.at - b.at; });
  return list.slice(0, limit);
}

// First shuttle from a stop on a given day (for "first tomorrow" messages).
function firstDeparture(stopId, dayKey) {
  const list = nextDepartures(stopId, dayKey, 0, 1);
  return list.length ? list[0].at : null;
}

/* ---------- route summaries ---------- */

// "Every 7 min, 6 at peak" for the route list (each way).
function frequencyText(route, dayKey) {
  const service = SERVICE[dayKey];
  if (!service) return "No service";
  const normal = headway(route, dayKey, false);
  let text = "Every " + normal + " min";
  if (service.peaks.length) {
    const peak = headway(route, dayKey, true);
    if (peak < normal) text += ", " + peak + " at peak";
  }
  return text;
}

// "6 carts, 8 at peak"
function fleetText(route) {
  return route.carts + " carts, " + route.peakCarts + " at peak";
}
