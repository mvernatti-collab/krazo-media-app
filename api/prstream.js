// Live-stream relay for Press Row overlays in Production Truck.
//
// The /prx rewrites work for Press Row's JSON, but the live stream
// (/api/games/<id>/broadcast-stream) comes back as Press Row's app HTML when
// passed through a rewrite. This function fetches the stream directly from
// Press Row and pipes it to the overlay. If the function's time limit cuts the
// connection, the overlay simply reconnects.
//
//   /api/prstream?h=hoops&p=/api/games/<gameId>/broadcast-stream

const HOSTS = { hoops: "hoops.pressrowapps.com", gridiron: "gridiron.pressrowapps.com" };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export default async function handler(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  const host = HOSTS[q.h];
  const path = String(q.p || "");
  if (!host || !/^\/api\/games\/[^/?#]+\/broadcast-stream$/.test(path)) {
    res.status(400).send("bad stream request");
    return;
  }
  const ac = new AbortController();
  req.on("close", () => ac.abort());
  let upstream;
  try {
    upstream = await fetch(`https://${host}${path}`, {
      headers: { accept: "text/event-stream", "cache-control": "no-cache", "user-agent": UA },
      signal: ac.signal,
    });
  } catch (e) {
    res.status(502).send("stream unreachable");
    return;
  }
  const ctype = upstream.headers.get("content-type") || "";
  if (!upstream.ok || !ctype.includes("text/event-stream") || !upstream.body) {
    res.status(502).send(`upstream ${upstream.status} ${ctype}`);
    return;
  }
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    "x-accel-buffering": "no",
    connection: "keep-alive",
  });
  if (res.flushHeaders) res.flushHeaders();
  res.write(": krazo relay connected\n\n");
  try {
    for await (const chunk of upstream.body) {
      res.write(chunk);
    }
  } catch (e) {
    // client went away or upstream dropped
  }
  res.end();
}
