// Minimal Upstash-REST-compatible proxy in front of a real Redis, for local development and
// for testing the production Upstash adapter in CI. Not for production use.
//
//   REDIS_URL=redis://127.0.0.1:6379 SHIM_PORT=8079 SHIM_TOKEN=dev npx tsx scripts/upstash-shim.ts
//   UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079 UPSTASH_REDIS_REST_TOKEN=dev npm run dev
import { createServer, type IncomingMessage } from "node:http";
import { connect, type Socket } from "node:net";

type Reply = string | number | null | Reply[] | { error: string } | { status: string };

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
const port = Number(process.env.SHIM_PORT ?? 8079);
const token = process.env.SHIM_TOKEN ?? "dev";

function encode(args: unknown[]): Buffer {
  const parts = args.map((a) => Buffer.from(typeof a === "string" ? a : JSON.stringify(a)));
  const chunks: Buffer[] = [Buffer.from(`*${parts.length}\r\n`)];
  for (const p of parts) chunks.push(Buffer.from(`$${p.length}\r\n`), p, Buffer.from("\r\n"));
  return Buffer.concat(chunks);
}

/** Incremental RESP2 parser. Returns [reply, nextOffset] or null if incomplete. */
function parse(buf: Buffer, at: number): [Reply, number] | null {
  if (at >= buf.length) return null;
  const end = buf.indexOf("\r\n", at);
  if (end === -1) return null;
  const type = String.fromCharCode(buf[at]);
  const line = buf.toString("utf8", at + 1, end);
  const next = end + 2;
  switch (type) {
    case "+":
      return [{ status: line }, next];
    case "-":
      return [{ error: line }, next];
    case ":":
      return [Number(line), next];
    case "$": {
      const len = Number(line);
      if (len === -1) return [null, next];
      if (buf.length < next + len + 2) return null;
      return [buf.toString("utf8", next, next + len), next + len + 2];
    }
    case "*": {
      const n = Number(line);
      if (n === -1) return [null, next];
      const items: Reply[] = [];
      let off = next;
      for (let i = 0; i < n; i++) {
        const r = parse(buf, off);
        if (!r) return null;
        items.push(r[0]);
        off = r[1];
      }
      return [items, off];
    }
    default:
      throw new Error(`bad RESP type ${type}`);
  }
}

function run(commands: unknown[][]): Promise<Reply[]> {
  return new Promise((resolve, reject) => {
    const sock: Socket = connect(Number(redisUrl.port || 6379), redisUrl.hostname);
    let buf = Buffer.alloc(0);
    const replies: Reply[] = [];
    let off = 0;
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        const r = parse(buf, off);
        if (!r) break;
        replies.push(r[0]);
        off = r[1];
      }
      if (replies.length === commands.length) {
        sock.end();
        resolve(replies);
      }
    });
    sock.on("error", reject);
    sock.write(Buffer.concat(commands.map(encode)));
  });
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** Shape a RESP reply the way Upstash REST returns it. */
function toRest(r: Reply, base64: boolean): { result?: unknown; error?: string } {
  const conv = (x: Reply): unknown => {
    if (x === null || typeof x === "number") return x;
    if (typeof x === "string") return base64 ? b64(x) : x;
    if (Array.isArray(x)) return x.map(conv);
    if ("status" in x) return x.status;
    return null;
  };
  if (r !== null && typeof r === "object" && !Array.isArray(r) && "error" in r)
    return { error: r.error };
  return { result: conv(r) };
}

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
}

createServer(async (req, res) => {
  try {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    const base64 = req.headers["upstash-encoding"] === "base64";
    const path = (req.url ?? "/").split("?")[0];
    const payload = await body(req);
    let out: unknown;
    if (path === "/pipeline") {
      const cmds = payload as unknown[][];
      out = (await run(cmds)).map((r) => toRest(r, base64));
    } else if (path === "/multi-exec") {
      const cmds = payload as unknown[][];
      const replies = await run([["MULTI"], ...cmds, ["EXEC"]]);
      const exec = replies[replies.length - 1];
      out = Array.isArray(exec) ? exec.map((r) => toRest(r, base64)) : [toRest(exec, base64)];
    } else {
      const [reply] = await run([payload as unknown[]]);
      out = toRest(reply, base64);
    }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(out));
  } catch (e) {
    res.writeHead(500).end(JSON.stringify({ error: String(e) }));
  }
}).listen(port, () => console.log(`upstash shim on http://127.0.0.1:${port} → ${redisUrl.href}`));
