interface PwaEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

const installPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#171816"><title>Install MetricMotive</title>
<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/favicon.svg"></head>
<body style="margin:0;background:#f3f0e6;color:#171816;font:16px/1.5 system-ui,sans-serif">
<main style="max-width:38rem;margin:0 auto;padding:12vh 1.5rem">
<p style="font:600 12px/1.2 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#9c641d">MetricMotive</p>
<h1 style="font:600 clamp(2.4rem,8vw,4rem)/1.02 Georgia,serif;margin:.75rem 0 1rem">Keep the proof close.</h1>
<p>Add MetricMotive to your home screen for a focused view of your Motive Guards and receipts.</p>
<p style="color:#5e625b">In your browser menu, choose <strong>Add to Home Screen</strong> or <strong>Install app</strong>.</p>
<a href="/" style="display:inline-block;margin-top:1rem;padding:.75rem 1rem;background:#171816;color:#f3f0e6;text-decoration:none;border-radius:.4rem">Back to MetricMotive</a>
</main></body></html>`;

export default async function metricmotivePwaMiddleware(
  event: PwaEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  if ((event.req.method ?? "GET").toUpperCase() !== "GET") return next();
  const acceptsHtml = event.req.headers.get("accept")?.includes("text/html");
  if (event.url.searchParams.get("install") === "1" && acceptsHtml && !event.url.pathname.startsWith("/api/")) {
    return new Response(installPage, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
  return next();
}
