import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

class AsyncSemaphore {
  private current = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) {
      this.current++;
      next();
    }
  }
}

// Semaphore to limit concurrent browser instances
const browserSemaphore = new AsyncSemaphore(2);

const MAX_HTML_LENGTH = 2_000_000; // 2MB

export async function POST(req: NextRequest) {
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  let body: { html?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 },
    );
  }

  if (typeof body.html !== "string" || body.html.trim().length === 0) {
    return NextResponse.json(
      { error: "Field 'html' is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  if (body.html.length > MAX_HTML_LENGTH) {
    return NextResponse.json(
      { error: `HTML payload exceeds maximum allowed size (${MAX_HTML_LENGTH} bytes)` },
      { status: 413 },
    );
  }

  await browserSemaphore.acquire();
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext({
      javaScriptEnabled: false, // Prevent JS execution (XSS/SSRF mitigations)
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15_000);

    // Block all outbound network and local file requests except inline data/about URLs
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("data:") || url.startsWith("about:")) {
        return route.continue();
      }
      return route.abort("blockedbyclient");
    });

    await page.setContent(body.html, {
      waitUntil: "load",
      timeout: 15_000,
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "1in", right: "1in", bottom: "1in", left: "1in" },
    });

    return new NextResponse(pdf as unknown as Uint8Array<ArrayBuffer>, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF rendering failed";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    browserSemaphore.release();
  }
}
