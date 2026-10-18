// Serves the demo inputs in demo-files/ to the home screen's demo-case buttons. Only listed files.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEMO_FILES } from "@/lib/demo-cases";

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  if (!DEMO_FILES.has(name)) return new Response("Not a demo file", { status: 404 });
  const body = await readFile(path.join(process.cwd(), "demo-files", name));
  const type = name.endsWith(".json") ? "application/json" : name.endsWith(".eml") ? "message/rfc822" : "text/plain; charset=utf-8";
  return new Response(body, { headers: { "content-type": type, "cache-control": "no-store" } });
}
