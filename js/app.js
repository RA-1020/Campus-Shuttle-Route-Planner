/*
 * Page behaviour: form handling, validation, rendering and events.
 */

const KIND_GROUPS = [
  { kind: "hostel", label: "Hostels" },
  { kind: "academic", label: "Schools" },
  { kind: "facility", label: "Around campus" },
  { kind: "gate", label: "Gates" }
];

const state = {
  result: null,         // last planTrip() result
  selected: 0,          // index of the highlighted journey
  routeFilter: "all",   // route id or "all"
  boardLive: true,      // departures board follows the clock
  legendRoute: null     // route highlighted from the map legend
};

/* ---------- small helpers ---------- */

const $ = function (selector) { return document.querySelector(selector); };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function todayKey() {
  return dayKeyFor(new Date());
}

function dayLabel(key) {
  return DAYS.find(function (d) { return d.key === key; }).long;
}

function stopName(id) {
  return getStop(id).name;
}

// Fill a <select> with stops grouped by kind.
function fillStopSelect(select) {
  KIND_GROUPS.forEach(function (group) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    STOPS.filter(function (s) { return s.kind === group.kind; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); })
      .forEach(function (stop) {
        const option = document.createElement("option");
        option.value = stop.id;
        option.textContent = stop.name;
        optgroup.appendChild(option);
      });
    select.appendChild(optgroup);
  });
}

function routeSwatch(route) {
  const swatch = el("span", "swatch");
  swatch.style.setProperty("--route", route.color);
  swatch.setAttribute("aria-hidden", "true");
  return swatch;
}

/* ================================================================
   1. Trip planner
   ================================================================ */

const form = $("#plan-form");
const fromSelect = $("#from");
const toSelect = $("#to");
const modeSelect = $("#mode");
const timeInput = $("#time");
const earlyInput = $("#early");
const transferInput = $("#transfer");
const resultsBody = $("#results-body");

function buildDayOptions() {
  const container = $("#day-options");
  const today = todayKey();
  DAYS.forEach(function (day) {
    const id = "day-" + day.key;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "day";
    input.id = id;
    input.value = day.key;
    input.checked = day.key === today;

    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = day.label;
    if (day.key === today) label.title = "Today";

    container.append(input, label);
  });
}

function selectedDay() {
  const checked = form.querySelector('input[name="day"]:checked');
  return checked ? checked.value : todayKey();
}

// Sensible starting time: half an hour from now, inside cart hours.
function defaultTime() {
  const start = toMinutes(SERVICE.weekday.first);
  const end = toMinutes(SERVICE.weekday.last);
  let minutes = Math.ceil((nowMinutes() + 30) / 5) * 5;
  if (minutes < start || minutes > end) minutes = toMinutes("08:00");
  return toInputTime(minutes);
}

// "Minutes early" only makes sense when arriving by a time.
function syncModeFields() {
  const arriving = modeSelect.value === "arrive";
  $("#early-field").hidden = !arriving;
  earlyInput.disabled = !arriving;
}

// Checks the browser cannot do alone. Uses setCustomValidity so the
// browser's own validation bubble shows our message.
function validateCustom() {
  const toError = $("#to-error");
  const timeError = $("#time-error");

  if (fromSelect.value && fromSelect.value === toSelect.value) {
    toSelect.setCustomValidity("Choose a destination different from where you start.");
    toError.textContent = "Start and destination are the same stop.";
  } else {
    toSelect.setCustomValidity("");
    toError.textContent = "";
  }

  timeError.textContent = "";
  timeInput.setCustomValidity("");
  if (timeInput.validity.valueMissing) {
    timeInput.setCustomValidity("Enter a time, for example 08:00.");
  } else if (timeInput.validity.rangeUnderflow || timeInput.validity.rangeOverflow) {
    timeInput.setCustomValidity("Pick a time between 6:00 am and 11:00 pm.");
    timeError.textContent = "Shuttles are only planned between 6:00 am and 11:00 pm.";
  }

  earlyInput.setCustomValidity("");
  if (!earlyInput.disabled && (earlyInput.validity.rangeUnderflow || earlyInput.validity.rangeOverflow)) {
    earlyInput.setCustomValidity("Use a number from 0 to 30.");
  }
}

function readQuery() {
  return {
    from: fromSelect.value,
    to: toSelect.value,
    day: selectedDay(),
    mode: modeSelect.value,
    time: toMinutes(timeInput.value),
    early: modeSelect.value === "arrive" ? Number(earlyInput.value) || 0 : 0,
    transfer: transferInput.checked
  };
}

function runSearch() {
  validateCustom();
  if (!form.checkValidity()) {
    form.reportValidity();
    return false;
  }
  state.result = planTrip(readQuery());
  state.selected = 0;
  renderResults();
  return true;
}

// After a search, bring the answer on screen if it starts below the fold.
function revealResults() {
  const top = $("#results").getBoundingClientRect().top;
  if (top > window.innerHeight * 0.6) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("#results").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }
}

/* ---------- results ---------- */

function renderEmptyState() {
  resultsBody.replaceChildren();
  const box = el("div", "results-empty");
  box.append(
    el("h3", "results-heading", "Where are you headed?"),
    el("p", "results-text", "Choose a start and destination, or try a common trip.")
  );
  const list = el("ul", "example-list");
  EXAMPLE_TRIPS.forEach(function (trip) {
    const item = el("li");
    const button = el("button", "example-button", trip.label);
    button.type = "button";
    button.addEventListener("click", function () {
      fromSelect.value = trip.from;
      toSelect.value = trip.to;
      modeSelect.value = trip.mode;
      timeInput.value = trip.time;
      const weekday = form.querySelector("#day-weekday");
      if (selectedDay() === "weekend") weekday.checked = true;
      syncModeFields();
      if (runSearch()) revealResults();
    });
    item.appendChild(button);
    list.appendChild(item);
  });
  box.appendChild(list);
  resultsBody.appendChild(box);
  ShuttleMap.clear();
}

// Advice when the best cart is likely to be full at a peak time.
function seatText(result) {
  const day = result.query.day;
  const best = result.journeys[0];
  if (journeyCrowding(best, day) !== "full") return "";
  const seats = best.legs[0].route.seats;
  const calmer = result.journeys.slice(1).find(function (j) { return journeyCrowding(j, day) !== "full"; });
  if (calmer) {
    return " Carts seat " + seats + " and this one usually fills before it reaches you, so the " +
      formatTime(calmer.board) + " is the safer bet.";
  }
  return " Carts seat " + seats + " and most leave full at this time, so be at the stop early or take an earlier one.";
}

function summaryFor(result) {
  const q = result.query;
  const to = stopName(q.to);
  const best = result.journeys[0];

  if (result.status === "ok" && q.mode === "arrive") {
    const spare = q.time - best.arrive;
    return {
      heading: "Catch the " + formatTime(best.board) + " cart.",
      text: "It reaches " + to + " at " + formatTime(best.arrive) + ", " +
        (spare === 0 ? "right on " : spare + " min before ") + formatTime(q.time) + "." + seatText(result)
    };
  }
  if (result.status === "ok") {
    return {
      heading: "Next cart: " + formatTime(best.board) + ".",
      text: "It reaches " + to + " at " + formatTime(best.arrive) + "." + seatText(result)
    };
  }
  if (result.status === "late") {
    const lateBy = result.late.arrive - q.time;
    return {
      heading: "No cart gets you there by " + formatTime(q.time) + ".",
      text: lateBy <= 0
        ? "The closest one arrives at " + formatTime(result.late.arrive) + ", inside your " + q.early + " minutes early buffer."
        : "The earliest one reaches " + to + " at " + formatTime(result.late.arrive) + ", " + lateBy + " min late."
    };
  }
  if (result.status === "none") {
    return {
      heading: "No cart after " + formatTime(q.time) + ".",
      text: "The last carts leave at " + formatTime(toMinutes(SERVICE[q.day].last)) +
        ". Try an earlier time, or walk."
    };
  }
  if (result.status === "no-route") {
    return {
      heading: "No cart connects these stops" + (q.transfer ? " with two changes or fewer." : " directly."),
      text: q.transfer
        ? "This trip needs more than two changes, which the planner does not suggest."
        : "Turn on “Allow changes” to include trips where you switch carts."
    };
  }
  return {
    heading: "No carts run at the weekend.",
    text: "Carts run Monday to Friday. Pick a weekday to see the timetable."
  };
}

function walkText(result) {
  const q = result.query;
  const walk = result.walk;
  const best = result.journeys[0];

  if (best && walk <= best.duration) {
    return "Walking takes about " + walk + " min, which is quicker than this ride.";
  }
  if ((result.status === "late" || result.status === "no-route" || result.status === "no-service" || result.status === "none") &&
      q.mode === "arrive") {
    return "Walking takes about " + walk + " min. Leave by " + formatTime(q.time - q.early - walk) + " to make it.";
  }
  return "Walking takes about " + walk + " min.";
}

// Friday prayer break near the chosen time.
function pauseText(query) {
  let note = "";
  ROUTES.forEach(function (route) {
    const service = SERVICE[query.day];
    if (!service || note) return;
    service.pause.forEach(function (p) {
      const start = toMinutes(p[0]);
      const end = toMinutes(p[1]);
      if (query.time >= start - 30 && query.time <= end + 30) {
        note = "Shuttles pause for Friday prayer from " + formatTime(start) + " to " + formatTime(end) + ".";
      }
    });
  });
  return note;
}

// "full" if any ride is with the peak crowd, "busy" if any is at peak time.
function journeyCrowding(journey, day) {
  const levels = journey.legs.map(function (leg) { return crowding(leg, day); });
  if (levels.indexOf("full") !== -1) return "full";
  if (levels.indexOf("busy") !== -1) return "busy";
  return "";
}

function journeyTags(journey, mode, index) {
  const tags = [];
  tags.push({ text: journey.transfers === 0 ? "Direct" : journey.transfers + (journey.transfers === 1 ? " change" : " changes") });
  if (index === 0 && mode === "arrive") tags.push({ text: "Latest you can leave" });
  if (index === 0 && mode === "depart") tags.push({ text: "Arrives first" });
  const level = journeyCrowding(journey, state.result.query.day);
  if (level === "full") tags.push({ text: "Likely full", warn: true });
  if (level === "busy") tags.push({ text: "Busy", warn: true });
  return tags;
}

function renderLegs(list, journey) {
  journey.legs.forEach(function (leg, i) {
    if (i > 0) {
      const wait = leg.board - journey.legs[i - 1].arrive;
      const change = el("li", "leg-change", "Change at " + stopName(leg.from) + ", wait " + wait + " min");
      list.appendChild(change);
    }
    const item = el("li", "leg");
    item.style.setProperty("--route", leg.route.color);
    const ride = el("p", "leg-ride");
    ride.append(
      el("strong", "", leg.route.name),
      document.createTextNode((leg.route.loop ? ", " : " ") + leg.direction.heading)
    );
    const from = el("p", "leg-stop");
    from.append(el("time", "", formatTime(leg.board)), document.createTextNode(stopName(leg.from)));
    const to = el("p", "leg-stop");
    to.append(el("time", "", formatTime(leg.arrive)), document.createTextNode(stopName(leg.to)));
    const count = el("p", "leg-count", leg.stopCount + (leg.stopCount === 1 ? " stop" : " stops") + ", " + (leg.arrive - leg.board) + " min");
    item.append(from, ride, count, to);
    list.appendChild(item);
  });
}

function renderJourneyList(journeys, mode) {
  const list = el("ol", "journey-list");
  const template = $("#journey-template");

  journeys.forEach(function (journey, index) {
    const node = template.content.firstElementChild.cloneNode(true);
    const button = node.querySelector(".journey-select");
    const legs = node.querySelector(".legs");
    const legsId = "legs-" + index;

    node.querySelector(".journey-board").textContent = formatTime(journey.board);
    node.querySelector(".journey-summary").textContent =
      "Arrive " + formatTime(journey.arrive) + ", " + formatDuration(journey.duration);

    const tags = node.querySelector(".journey-tags");
    journeyTags(journey, mode, index).forEach(function (tag) {
      tags.appendChild(el("span", tag.warn ? "tag tag-busy" : "tag", tag.text));
    });

    renderLegs(legs, journey);
    legs.id = legsId;
    button.setAttribute("aria-controls", legsId);

    const isSelected = index === state.selected;
    node.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-expanded", String(isSelected));
    legs.hidden = !isSelected;

    button.addEventListener("click", function () {
      state.selected = index;
      renderResults({ keepFocus: index });
    });

    list.appendChild(node);
  });
  return list;
}

function renderResults(options) {
  const result = state.result;
  if (!result) return renderEmptyState();
  resultsBody.replaceChildren();

  const summary = summaryFor(result);
  const head = el("div", "results-summary");
  head.append(el("h3", "results-heading", summary.heading), el("p", "results-text", summary.text));
  resultsBody.appendChild(head);

  let shown = result.journeys;
  if (result.status === "late" && result.late) shown = [result.late];

  resetLegend();
  if (shown.length) {
    if (state.selected >= shown.length) state.selected = 0;
    resultsBody.appendChild(renderJourneyList(shown, result.query.mode));
    ShuttleMap.showJourney(shown[state.selected]);
  } else {
    ShuttleMap.clear();
  }

  resultsBody.appendChild(el("p", "walk-note", walkText(result)));
  const pause = pauseText(result.query);
  if (pause) resultsBody.appendChild(el("p", "walk-note", pause));

  if (options && options.keepFocus !== undefined) {
    const buttons = resultsBody.querySelectorAll(".journey-select");
    if (buttons[options.keepFocus]) buttons[options.keepFocus].focus();
  }
}

function setupPlanner() {
  [fromSelect, toSelect, $("#board-stop")].forEach(fillStopSelect);
  buildDayOptions();
  timeInput.value = defaultTime();
  timeInput.min = CONFIG.serviceStart;
  timeInput.max = CONFIG.serviceEnd;
  syncModeFields();

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (runSearch()) revealResults();
  });

  // Re-check custom rules as the user edits, so messages clear straight away.
  [fromSelect, toSelect, timeInput, earlyInput].forEach(function (input) {
    input.addEventListener("input", validateCustom);
    input.addEventListener("change", validateCustom);
  });

  modeSelect.addEventListener("change", syncModeFields);

  $("#swap").addEventListener("click", function () {
    const from = fromSelect.value;
    fromSelect.value = toSelect.value;
    toSelect.value = from;
    validateCustom();
    if (state.result && fromSelect.value && toSelect.value) runSearch();
  });

  // Changing the day or the transfer switch updates results that are already showing.
  form.addEventListener("change", function (event) {
    const live = event.target.name === "day" || event.target === transferInput;
    if (live && state.result) runSearch();
  });

  renderEmptyState();
}

/* ================================================================
   2. Departures board
   ================================================================ */

const boardStop = $("#board-stop");
const boardTime = $("#board-time");
const board = $("#board");

function boardMinutes() {
  if (state.boardLive) return nowMinutes();
  const value = toMinutes(boardTime.value);
  return isNaN(value) ? nowMinutes() : value;
}

function renderBoard() {
  const day = todayKey();
  const now = boardMinutes();
  if (state.boardLive) boardTime.value = toInputTime(now);
  $("#board-now").setAttribute("aria-pressed", String(state.boardLive));

  const list = nextDepartures(boardStop.value, day, now, 6);
  board.replaceChildren();

  const caption = el("p", "board-caption",
    (state.boardLive ? "Live" : "From " + formatTime(now)) + ", " + dayLabel(day));
  board.appendChild(caption);

  if (!list.length) {
    const next = nextServiceDay(day);
    const first = firstDeparture(boardStop.value, next.key);
    const empty = el("div", "board-empty");
    empty.append(
      el("p", "board-empty-title", day === "weekend" ? "No carts at the weekend." : "No more carts today."),
      el("p", "", first !== null ? "The first cart from " + stopName(boardStop.value) + " leaves " + next.words + " at " + formatTime(first) + "." : "")
    );
    board.appendChild(empty);
    return;
  }

  const ol = el("ol", "board-list");
  list.forEach(function (dep) {
    const row = el("li", "board-row");
    row.style.setProperty("--route", dep.route.color);

    const wait = dep.at - now;
    const when = el("p", "board-when");
    when.append(el("time", "board-time", formatTime(dep.at)), el("span", "board-wait", wait <= 0 ? "Now" : "in " + formatDuration(wait)));

    const where = el("p", "board-where");
    const line = el("span", "board-route", dep.route.name);
    if (dep.busy) line.appendChild(el("span", "tag tag-busy", "Busy"));
    where.append(el("strong", "", dep.direction.short), line);

    row.append(where, when);
    ol.appendChild(row);
  });
  board.appendChild(ol);
}

function setupBoard() {
  boardStop.value = "seecs";
  boardStop.addEventListener("change", renderBoard);

  boardTime.addEventListener("change", function () {
    if (!boardTime.value) {
      state.boardLive = true;
    } else {
      state.boardLive = false;
    }
    renderBoard();
  });

  $("#board-now").addEventListener("click", function () {
    state.boardLive = true;
    renderBoard();
  });

  // Planner "From" also moves the board, so both show the same stop.
  fromSelect.addEventListener("change", function () {
    if (fromSelect.value) {
      boardStop.value = fromSelect.value;
      renderBoard();
    }
  });

  renderBoard();
  setInterval(function () {
    if (state.boardLive) renderBoard();
  }, 30000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && state.boardLive) renderBoard();
  });
}

/* ================================================================
   3. Routes list with stop search and route filter
   ================================================================ */

const searchInput = $("#stop-search");
const routeList = $("#route-list");
const routeStatus = $("#route-status");

function buildRouteFilter() {
  const row = $("#route-filter");
  const options = [{ id: "all", name: "All routes" }].concat(ROUTES);
  options.forEach(function (option) {
    const chip = el("button", "chip");
    chip.type = "button";
    chip.dataset.route = option.id;
    chip.setAttribute("aria-pressed", String(option.id === state.routeFilter));
    if (option.color) chip.appendChild(routeSwatch(option));
    chip.appendChild(document.createTextNode(option.name));
    chip.addEventListener("click", function () {
      state.routeFilter = option.id;
      row.querySelectorAll(".chip").forEach(function (c) {
        c.setAttribute("aria-pressed", String(c.dataset.route === option.id));
      });
      renderRoutes();
    });
    row.appendChild(chip);
  });
}

function timetableBlock(route, day) {
  const block = el("div", "timetable");
  const first = route.stops[0][0];
  const last = route.stops[route.stops.length - 1][0];
  const times = departuresFor(route, day);
  const ends = route.loop ? [first] : [first, last];

  ends.forEach(function (endId) {
    const column = el("div", "timetable-column");
    column.appendChild(el("h4", "", (route.loop
      ? "Leaving " + stopName(endId) + ", both ways"
      : "From " + stopName(endId)) + ", " + DAYS.find(function (d) { return d.key === day; }).long));
    const ul = el("ul", "time-grid");
    times.forEach(function (t) {
      const li = el("li");
      li.appendChild(el("time", "", formatTime(t)));
      ul.appendChild(li);
    });
    column.appendChild(ul);
    block.appendChild(column);
  });
  return block;
}

function renderRoutes() {
  const query = searchInput.value.trim().toLowerCase();
  const today = todayKey();
  const tableDay = today === "weekend" ? "weekday" : today;

  const matches = function (stopId) {
    return query !== "" && stopName(stopId).toLowerCase().includes(query);
  };

  const visible = ROUTES.filter(function (route) {
    const passFilter = state.routeFilter === "all" || state.routeFilter === route.id;
    const passSearch = query === "" || route.stops.some(function (s) { return matches(s[0]); });
    return passFilter && passSearch;
  });

  routeList.replaceChildren();

  if (!visible.length) {
    routeStatus.textContent = query
      ? "No stop matches “" + searchInput.value.trim() + "”. Try a school or hostel name, such as SEECS or Razi."
      : "No routes to show.";
    return;
  }

  if (query) {
    const stopCount = STOPS.filter(function (s) { return s.name.toLowerCase().includes(query); }).length;
    routeStatus.textContent = visible.length + (visible.length === 1 ? " route serves " : " routes serve ") +
      (stopCount === 1 ? "this stop." : "these " + stopCount + " stops.");
  } else {
    routeStatus.textContent = "";
  }

  visible.forEach(function (route) {
    const item = el("li", "route-item");
    item.style.setProperty("--route", route.color);

    const head = el("div", "route-head");
    const title = el("h3", "route-name", route.name);
    const ends = el("p", "route-ends", route.loop
      ? "Loop, both ways"
      : stopName(route.stops[0][0]) + " to " + stopName(route.stops[route.stops.length - 1][0]));
    const freq = el("p", "route-freq", today === "weekend"
      ? "No service today"
      : frequencyText(route, today));
    const fleet = el("p", "route-freq", fleetText(route));
    head.append(title, ends, freq, fleet);

    const strip = el("ol", "stop-strip");
    route.stops.forEach(function (s) {
      const li = el("li", "strip-stop");
      const name = matches(s[0]) ? el("mark", "", stopName(s[0])) : el("span", "", stopName(s[0]));
      li.appendChild(name);
      li.appendChild(el("span", "strip-minutes", s[1] === 0 ? "Start" : "+" + s[1] + " min"));

      const others = routesAtStop(s[0]).filter(function (r) { return r !== route; });
      if (others.length) {
        const change = el("span", "strip-change");
        others.forEach(function (r) { change.appendChild(routeSwatch(r)); });
        change.appendChild(el("span", "visually-hidden",
          "Change for " + others.map(function (r) { return r.name; }).join(" and ")));
        li.appendChild(change);
      }
      strip.appendChild(li);
    });
    if (route.loop) {
      const back = el("li", "strip-stop");
      back.append(el("span", "", stopName(route.stops[0][0])),
        el("span", "strip-minutes", "+" + route.lapMinutes + " min, lap complete"));
      strip.appendChild(back);
    }

    const details = el("details", "route-details");
    const summary = el("summary", "", "Timetable");
    details.append(summary, timetableBlock(route, tableDay));

    item.append(head, strip, details);
    routeList.appendChild(item);
  });
}

function setupRoutes() {
  routeList.style.setProperty("--routes", ROUTES.length);
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const count = words[ROUTES.length] || String(ROUTES.length);
  $("#route-count").textContent = count.charAt(0).toUpperCase() + count.slice(1) + " routes and " +
    STOPS.length + " stops, served by " + ROUTES[0].seats + "-seat golf carts.";
  buildRouteFilter();
  searchInput.addEventListener("input", renderRoutes);
  renderRoutes();
}

/* ================================================================
   4. Map legend and site navigation
   ================================================================ */

function resetLegend() {
  state.legendRoute = null;
  document.querySelectorAll(".legend-button").forEach(function (b) {
    b.setAttribute("aria-pressed", "false");
  });
}

function setupMap() {
  ShuttleMap.draw($("#map"));
  const legend = $("#map-legend");
  const list = el("ul", "legend-list");

  ROUTES.forEach(function (route) {
    const item = el("li");
    const button = el("button", "legend-button");
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.append(routeSwatch(route), document.createTextNode(route.name));
    button.addEventListener("click", function () {
      const turningOn = state.legendRoute !== route.id;
      state.legendRoute = turningOn ? route.id : null;
      legend.querySelectorAll(".legend-button").forEach(function (b) {
        b.setAttribute("aria-pressed", "false");
      });
      if (turningOn) {
        button.setAttribute("aria-pressed", "true");
        ShuttleMap.showRoutes([route.id]);
      } else if (state.result) {
        renderResults();
      } else {
        ShuttleMap.clear();
      }
    });
    item.appendChild(button);
    list.appendChild(item);
  });
  legend.appendChild(list);
}

function setupNav() {
  const button = $(".menu-button");
  const nav = $("#site-nav");

  function setOpen(open) {
    button.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  }

  button.addEventListener("click", function () {
    setOpen(button.getAttribute("aria-expanded") !== "true");
  });
  nav.addEventListener("click", function (event) {
    if (event.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && button.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      button.focus();
    }
  });
}

/* ---------- start ---------- */

setupMap();
setupPlanner();
setupBoard();
setupRoutes();
setupNav();
