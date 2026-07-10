import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { detectRegressions } from "../engine/regression.js";
import { computeStreak } from "../engine/streak.js";
import { buildTimelines } from "../engine/timeline.js";
import type { Store } from "../store/db.js";

/** The dashboard's entire data contract - also what `atrophy export` writes. */
export function buildPayload(store: Store): object {
  const sessions = store.allSessions();
  return {
    exportedAt: new Date().toISOString(),
    ratings: store.allRatings(),
    sessions,
    timelines: buildTimelines(sessions),
    streak: computeStreak(sessions),
    regressions: detectRegressions(sessions),
  };
}

/**
 * Local-first dashboard server: two routes, loopback only, data read fresh
 * from SQLite on every request so a finished drill shows up on refresh.
 */
export function startServer(store: Store, htmlPath: string, port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(readFileSync(htmlPath, "utf8"));
    } else if (url === "/data.json") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(buildPayload(store)));
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
