/*
 * Schematic shuttle map, drawn as SVG from the STOPS and ROUTES records.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

// Background traced from the NUST campus map: roads (thin grey) and the lake.
// Purely visual, so it lives here rather than in the data records.
const MAP_ROADS = [[[266, 192],[333, 168],[390, 161],[461, 165],[534, 205],[573, 262],[588, 307],[594, 346],[596, 387],[590, 448],[573, 509],[547, 554],[518, 581],[480, 602],[422, 610],[378, 590],[333, 550],[298, 490],[276, 430],[246, 405],[205, 384],[165, 366],[161, 326],[170, 269],[211, 221],[266, 192]],[[6, 16],[90, 19],[138, 54],[266, 192]],[[275, 205],[451, 474]],[[596, 384],[717, 387],[998, 396]],[[570, 259],[621, 230],[704, 227]],[[160, 368],[19, 368]],[[152, 368],[152, 826]],[[45, 558],[152, 558],[243, 547],[288, 531],[298, 490]],[[19, 750],[944, 758]],[[717, 390],[720, 582],[730, 750]],[[573, 512],[621, 582],[998, 582]],[[477, 605],[486, 750]],[[38, 262],[186, 262]],[[707, 384],[704, 288]]];
const MAP_WATER = [[[221, 494], [250, 502], [269, 544], [275, 582], [307, 621], [333, 640], [358, 672], [390, 698], [435, 717], [467, 736], [467, 750], [422, 746], [371, 730], [342, 710], [323, 678], [294, 662], [256, 660], [211, 654], [193, 627], [205, 605], [243, 605], [280, 621], [275, 602], [261, 570], [243, 531], [218, 507]], [[451, 760], [550, 763], [640, 769], [691, 800], [742, 838], [794, 877], [806, 904], [762, 908], [646, 904], [640, 880], [675, 864], [614, 846], [550, 816], [486, 795], [422, 782], [352, 782], [344, 769], [390, 768]]];
const MAP_LAKE_LABEL = [621, 813];


function svgElement(name, attributes) {
  const el = document.createElementNS(SVG_NS, name);
  Object.keys(attributes || {}).forEach(function (key) {
    el.setAttribute(key, attributes[key]);
  });
  return el;
}

// Route path entries are stop ids or [x, y] bends.
function pathPoints(entries) {
  return entries.map(function (entry) {
    if (Array.isArray(entry)) return entry;
    const stop = getStop(entry);
    return [stop.x, stop.y];
  });
}

function pointsAttribute(points) {
  return points.map(function (p) { return p[0] + "," + p[1]; }).join(" ");
}

// Drawn points of a whole route; loops close back on their start.
function routePoints(route) {
  const points = pathPoints(route.path);
  return route.loop ? points.concat([points[0]]) : points;
}

// Drawn points between two neighbouring stops, in travel order.
function segmentBetween(route, fromId, toId) {
  const path = route.path;
  const a = path.indexOf(fromId);
  const b = path.indexOf(toId);

  if (!route.loop) {
    const slice = path.slice(Math.min(a, b), Math.max(a, b) + 1);
    return pathPoints(a <= b ? slice : slice.reverse());
  }

  // On a loop, walk forwards; if that passes another stop, walk backwards.
  const walk = function (step) {
    const entries = [path[a]];
    let i = a;
    while (i !== b) {
      i = (i + step + path.length) % path.length;
      if (i !== b && !Array.isArray(path[i])) return null;
      entries.push(path[i]);
    }
    return pathPoints(entries);
  };
  return walk(1) || walk(-1);
}

// Drawn points for the part of a direction a rider is on.
function legPoints(leg) {
  const stops = leg.direction.stops.slice(leg.fromIndex, leg.toIndex + 1);
  let points = [];
  for (let k = 1; k < stops.length; k++) {
    const piece = segmentBetween(leg.route, stops[k - 1], stops[k]);
    points = points.concat(k === 1 ? piece : piece.slice(1));
  }
  return points;
}

function routesAtStop(stopId) {
  return ROUTES.filter(function (route) {
    return route.stops.some(function (s) { return s[0] === stopId; });
  });
}

const LABEL_OFFSETS = {
  n:  { dx: 0,   dy: -26, anchor: "middle" },
  s:  { dx: 0,   dy: 36,  anchor: "middle" },
  e:  { dx: 18,  dy: 6,   anchor: "start" },
  w:  { dx: -18, dy: 6,   anchor: "end" },
  ne: { dx: 14,  dy: -14, anchor: "start" },
  se: { dx: 14,  dy: 30,  anchor: "start" },
  sl: { dx: -10, dy: 34,  anchor: "start" },
  sw: { dx: -14, dy: 34,  anchor: "end" }
};

// A stop name beside its dot; "|" in the text starts a new line.
function stopLabel(stop, side, text) {
  const offset = LABEL_OFFSETS[side] || LABEL_OFFSETS.s;
  const lines = text.split("|");
  const lineHeight = 23;
  // Multi-line labels on the left or right are centred on the dot.
  const shift = (side === "e" || side === "w") ? -((lines.length - 1) * lineHeight) / 2 : 0;
  const label = svgElement("text", {
    class: "map-label",
    x: stop.x + offset.dx,
    y: stop.y + offset.dy + shift,
    "text-anchor": offset.anchor
  });
  lines.forEach(function (line, i) {
    const tspan = svgElement("tspan", { x: stop.x + offset.dx, dy: i === 0 ? 0 : lineHeight });
    tspan.textContent = line;
    label.appendChild(tspan);
  });
  return label;
}

const ShuttleMap = {
  svg: null,
  overlay: null,

  draw: function (svg) {
    this.svg = svg;

    const background = svgElement("g", { class: "map-background", "aria-hidden": "true" });
    MAP_WATER.forEach(function (shape) {
      background.appendChild(svgElement("polygon", { class: "map-water", points: pointsAttribute(shape) }));
    });
    MAP_ROADS.forEach(function (road) {
      background.appendChild(svgElement("polyline", { class: "map-road", points: pointsAttribute(road) }));
    });
    const lake = svgElement("text", { class: "map-water-label", x: MAP_LAKE_LABEL[0], y: MAP_LAKE_LABEL[1] });
    lake.textContent = "NUST Lake";
    background.appendChild(lake);
    svg.appendChild(background);

    const lines = svgElement("g", { class: "map-lines" });
    ROUTES.forEach(function (route) {
      lines.appendChild(svgElement("polyline", {
        class: "map-line",
        "data-route": route.id,
        points: pointsAttribute(routePoints(route)),
        stroke: route.color
      }));
    });
    svg.appendChild(lines);

    this.overlay = svgElement("g", { class: "map-overlay" });
    svg.appendChild(this.overlay);

    const stops = svgElement("g", { class: "map-stops" });
    STOPS.forEach(function (stop) {
      const served = routesAtStop(stop.id);
      const group = svgElement("g", { class: "map-stop", "data-stop": stop.id });
      const title = svgElement("title");
      title.textContent = stop.name + " (" + served.map(function (r) { return r.name; }).join(", ") + ")";
      group.appendChild(title);

      const isInterchange = served.length > 1;
      group.appendChild(svgElement("circle", {
        class: isInterchange ? "map-dot map-dot-interchange" : "map-dot",
        cx: stop.x,
        cy: stop.y,
        r: isInterchange ? 11 : 8,
        stroke: isInterchange ? "var(--ink)" : served[0].color
      }));

      group.appendChild(stopLabel(stop, stop.label, stop.mapName || stop.name));
      if (stop.extraLabel) {
        group.appendChild(stopLabel(stop, stop.extraLabel.side, stop.extraLabel.text));
      }
      stops.appendChild(group);
    });
    svg.appendChild(stops);
  },

  // On narrow screens the map scrolls sideways; bring the given points into view.
  scrollTo: function (points) {
    const box = this.svg.parentElement;
    if (box.scrollWidth <= box.clientWidth) return;
    const xs = points.map(function (p) { return p[0]; });
    const middle = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
    box.scrollLeft = (middle / 1000) * box.scrollWidth - box.clientWidth / 2;
  },

  clear: function () {
    this.svg.classList.remove("is-focused");
    this.overlay.replaceChildren();
    this.svg.querySelectorAll(".is-active").forEach(function (el) {
      el.classList.remove("is-active");
    });
  },

  // Dim everything except the given routes.
  showRoutes: function (routeIds) {
    this.clear();
    if (!routeIds.length) return;
    this.svg.classList.add("is-focused");
    const svg = this.svg;
    routeIds.forEach(function (id) {
      const line = svg.querySelector('.map-line[data-route="' + id + '"]');
      if (line) line.classList.add("is-active");
      getRoute(id).stops.forEach(function (s) {
        svg.querySelector('.map-stop[data-stop="' + s[0] + '"]').classList.add("is-active");
      });
    });
    this.scrollTo(routePoints(getRoute(routeIds[0])));
  },

  // Draw only the ridden parts of a journey on top of a dimmed map.
  showJourney: function (journey) {
    this.clear();
    this.svg.classList.add("is-focused");
    const overlay = this.overlay;
    const svg = this.svg;

    journey.legs.forEach(function (leg) {
      overlay.appendChild(svgElement("polyline", {
        class: "map-ride",
        points: pointsAttribute(legPoints(leg)),
        stroke: leg.route.color
      }));
      leg.direction.stops.slice(leg.fromIndex, leg.toIndex + 1).forEach(function (id) {
        svg.querySelector('.map-stop[data-stop="' + id + '"]').classList.add("is-active");
      });
    });

    // Rings on the start and destination
    const first = getStop(journey.legs[0].from);
    const last = getStop(journey.legs[journey.legs.length - 1].to);
    [first, last].forEach(function (stop) {
      overlay.appendChild(svgElement("circle", { class: "map-endpoint", cx: stop.x, cy: stop.y, r: 17 }));
    });
    this.scrollTo([[first.x, first.y], [last.x, last.y]]);
  }
};
