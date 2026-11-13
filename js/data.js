/*
 * Campus Shuttle — sample records (student-created, not official NUST data).
 *
 * The shuttles are golf carts that circulate around NUST H-12. Stop
 * positions and roads are traced from the NUST campus map; travel times
 * assume a cart covers about 250 m a minute and stops for 30 seconds.
 *
 * The records are shaped like database rows so that Assignment 2 can move
 * them into SQLite/MySQL tables with almost no changes:
 *   stops        (id, name, kind, x, y, label)
 *   routes       (id, name, color, loop, carts, peak_carts, seats)
 *   route_stops  (route_id, stop_id, seq, minutes)  -> ROUTES[n].stops
 *   service_days (day, first, last)                 -> SERVICE
 */

// Planner settings. If the instructor's rule changes a limit, change it here.
const CONFIG = {
  transferMinutes: 2,       // minimum time to change carts at a shared stop
  maxWaitMinutes: 20,       // longest wait for a connecting cart the planner suggests
  layoverMinutes: 2,        // a cart waits this long at each end of a route
  walkMinutesPerUnit: 0.05, // walking time on the schematic map (1000 units ≈ 3 km)
  lookBackMinutes: 90,      // how far before an "arrive by" time to look for carts
  maxOptions: 3,            // journeys shown per search
  serviceStart: "06:00",    // earliest time the form accepts
  serviceEnd: "23:00"       // latest time the form accepts
};

// kind: "academic" | "hostel" | "facility" | "gate"
// x, y: position on the map (viewBox 0 0 1000 920), traced from the campus map
// label: which side of the dot the name sits on; mapName: shorter name for the map
// ("|" starts a new line); extraLabel: a second name on the other side of the road.
// Twin hostels share a pickup point: Zakaria, Rehmat and Razi use one, Hajveri has
// its own a little further down, and the Ghazali and Beruni gate opens onto the
// road right beside it. Liaquat and Attar sit further back with their own gates.
const STOPS = [
  { id: "gate1",   name: "Gate 1",             kind: "gate",     x: 947, y: 396, label: "n" },
  { id: "gate2",   name: "Gate 2",             kind: "gate",     x: 22, y: 20, label: "sl" },
  { id: "adm",     name: "Admin Block",        kind: "facility", x: 266, y: 192, label: "n" },
  { id: "asab",    name: "ASAB",               kind: "academic", x: 390, y: 161, label: "n" },
  { id: "iese",    name: "IESE",               kind: "academic", x: 534, y: 205, label: "n" },
  { id: "scme",    name: "SCME",               kind: "academic", x: 704, y: 227, label: "n" },
  { id: "conc1",   name: "Concordia 1",        kind: "facility", x: 573, y: 262, label: "e" },
  { id: "igis",    name: "IGIS & SADA",        kind: "academic", x: 323, y: 275, label: "e" },
  { id: "nbs",     name: "NBS & S3H",          kind: "academic", x: 416, y: 419, label: "e" },
  { id: "office",  name: "Main Office",        kind: "facility", x: 458, y: 486, label: "e" },
  { id: "fatima",  name: "Fatima Hostel",      kind: "hostel",   x: 594, y: 346, label: "w", mapName: "Fatima" },
  { id: "ayesha",  name: "Ayesha & Khadija",   kind: "hostel",   x: 596, y: 387, label: "se" },
  { id: "maryam",  name: "Maryam Block",       kind: "hostel",   x: 573, y: 509, label: "e", mapName: "Maryam" },
  { id: "nstp",    name: "NSTP",               kind: "facility", x: 717, y: 392, label: "n" },
  { id: "conc3",   name: "Concordia 3",        kind: "facility", x: 518, y: 581, label: "se" },
  { id: "lib",     name: "Central Library",    kind: "facility", x: 422, y: 610, label: "sw" },
  { id: "seecs",   name: "SEECS",              kind: "academic", x: 298, y: 490, label: "e" },
  { id: "conc2",   name: "Concordia 2",        kind: "facility", x: 246, y: 405, label: "ne" },
  { id: "rumi",    name: "Old Rumi Blocks",    kind: "hostel",   x: 165, y: 366, label: "ne", mapName: "Old Rumi blocks" },
  { id: "exam",    name: "Exam Hall",          kind: "facility", x: 61, y: 368, label: "n" },
  { id: "scee",    name: "SCEE (NICE)",        kind: "academic", x: 152, y: 410, label: "w", mapName: "SCEE" },
  { id: "zakaria", name: "Zakaria, Rehmat & Razi", kind: "hostel", x: 152, y: 474, label: "w", mapName: "Zakaria,|Rehmat, Razi" },
  { id: "hajveri", name: "Hajveri, Ghazali & Beruni", kind: "hostel", x: 152, y: 528, label: "w", mapName: "Hajveri", extraLabel: { text: "Ghazali,|Beruni", side: "ne" } },
  { id: "liaquat", name: "Liaquat Hostel", kind: "hostel", x: 195, y: 554, label: "s", mapName: "Liaquat" },
  { id: "attar",   name: "Attar Hostels", kind: "hostel", x: 240, y: 547, label: "se", mapName: "Attar" },
  { id: "smme",    name: "SMME & SNS",         kind: "academic", x: 152, y: 750, label: "s" },
  { id: "sports",  name: "Sports Complex",     kind: "facility", x: 486, y: 750, label: "s" },
  { id: "medical", name: "Medical Centre",     kind: "facility", x: 724, y: 614, label: "e" }
];

// Service by day. Carts run Monday to Friday and the last ones leave at 5 pm.
// Peak windows are when classes start and end:
//   8–9 am, the lunch break (1 pm to hostels, 2 pm back to class), and 5 pm.
// flow says which way most riders travel: "class" or "hostel".
const SERVICE = {
  weekday: {
    first: "07:30", last: "17:00",
    peaks: [["08:00", "09:00", "class"], ["13:00", "13:30", "hostel"],
            ["13:30", "14:00", "class"], ["16:30", "17:15", "hostel"]],
    pause: []
  },
  friday: {
    first: "07:30", last: "17:00",
    peaks: [["08:00", "09:00", "class"], ["16:30", "17:15", "hostel"]],
    pause: [["13:00", "14:00"]]   // carts stop for Friday prayer
  }
  // Saturday and Sunday: no service
};

// Golf carts. stops: [stopId, minutes from the first stop].
// loop: true means carts circle the route in both directions.
// path: points used to draw the line along the real roads; stop ids or [x, y] bends.
const ROUTES = [
  {
    id: "ring",
    name: "Ring Road",
    color: "#D93A2B",
    loop: true,
    lapMinutes: 20,
    carts: 6, peakCarts: 8, seats: 10,
    stops: [["adm", 0], ["asab", 2], ["iese", 4], ["conc1", 5], ["fatima", 6], ["ayesha", 7],
            ["maryam", 9], ["conc3", 10], ["lib", 12], ["seecs", 14], ["conc2", 16], ["rumi", 17]],
    path: ["adm", [333, 168], "asab", [461, 165], "iese", "conc1", [588, 307],
           "fatima", "ayesha", [590, 448], "maryam", [547, 554], "conc3", [480, 602],
           "lib", [378, 590], [333, 550], "seecs", [276, 430], "conc2", [205, 384],
           "rumi", [161, 326], [170, 269], [211, 221]]
  },
  {
    id: "scholars",
    name: "Scholars Avenue",
    color: "#E07B00",
    loop: false,
    carts: 3, peakCarts: 4, seats: 10,
    stops: [["gate2", 0], ["adm", 4], ["igis", 5], ["nbs", 7], ["office", 9], ["sports", 12]],
    path: ["gate2", [90, 19], [138, 54], "adm", "igis", "nbs", "office",
           [477, 605], "sports"]
  },
  {
    id: "luqman",
    name: "Luqman Avenue",
    color: "#0A7EA4",
    loop: false,
    carts: 2, peakCarts: 3, seats: 10,
    stops: [["gate1", 0], ["nstp", 3], ["ayesha", 5], ["conc1", 6], ["scme", 8]],
    path: ["gate1", "nstp", "ayesha", [588, 385], [586, 346], [579, 307], [564, 266],
           "conc1", [621, 230], "scme"]
  },
  {
    id: "west",
    name: "West Hostels",
    color: "#1F8A4C",
    loop: false,
    carts: 2, peakCarts: 3, seats: 10,
    stops: [["exam", 0], ["rumi", 2], ["scee", 3], ["zakaria", 4], ["hajveri", 5], ["liaquat", 6],
            ["attar", 7], ["seecs", 8]],
    path: ["exam", "rumi", [152, 378], "scee", "zakaria", "hajveri", [152, 558],
           "liaquat", "attar", [288, 531], "seecs"]
  },
  {
    id: "lake",
    name: "Lake Road",
    color: "#D14D72",
    loop: false,
    carts: 3, peakCarts: 4, seats: 10,
    stops: [["hajveri", 0], ["smme", 3], ["sports", 7], ["medical", 11], ["nstp", 14]],
    path: ["hajveri", [152, 558], "smme", "sports", [724, 750], "medical", [720, 582],
           "nstp"]
  }
];

// Ready-made searches for the empty state.
const EXAMPLE_TRIPS = [
  { from: "hajveri", to: "nbs", mode: "arrive", time: "09:00", label: "Ghazali & Beruni to NBS & S3H by 9:00 am" },
  { from: "fatima", to: "smme", mode: "arrive", time: "14:00", label: "Fatima Hostel to SMME & SNS by 2:00 pm" },
  { from: "seecs", to: "zakaria", mode: "depart", time: "13:00", label: "SEECS to Razi & Rehmat after 1:00 pm" }
];
