const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
const DEFAULT_TIMEOUT_MS = 6_000;
const DEFAULT_RESULT_LIMIT = 3;

export type WebSearchSnippet = {
  title: string;
  url: string;
  description?: string;
  markdown?: string;
};

export type WebSearchResult = {
  query: string;
  snippets: WebSearchSnippet[];
};

type FirecrawlSearchResponse = {
  success?: boolean;
  data?: {
    web?: Array<{
      url?: string;
      title?: string;
      description?: string;
      markdown?: string;
    }>;
  };
};

export function formatWebSearchForPrompt(result: WebSearchResult): string {
  if (result.snippets.length === 0) {
    return "";
  }

  return result.snippets
    .map((snippet, index) => {
      const body =
        snippet.markdown?.trim() ||
        snippet.description?.trim() ||
        "(No content available)";
      return `--- Web result ${index + 1}: ${snippet.title} (${snippet.url}) ---\n${body}`;
    })
    .join("\n\n");
}

/**
 * Search the live web via Firecrawl. Returns null on any failure — never throws.
 */
export async function searchWeb(
  query: string,
  options?: { timeoutMs?: number; limit?: number },
): Promise<WebSearchResult | null> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return null;
  }

  const apiKey = (process.env.FIRECRAWL_API_KEY ?? "").trim();
  if (!apiKey) {
    console.warn(
      "[knowledge/firecrawl] FIRECRAWL_API_KEY not set — skipping web search",
    );
    return null;
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const limit = options?.limit ?? DEFAULT_RESULT_LIMIT;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: trimmedQuery,
        limit,
        scrapeOptions: {
          formats: [{ type: "markdown" }],
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(
        "[knowledge/firecrawl] API error",
        response.status,
        text.slice(0, 200),
      );
      return null;
    }

    const json = (await response.json()) as FirecrawlSearchResponse;
    const web = json.data?.web ?? [];

    const snippets: WebSearchSnippet[] = web
      .filter((item) => item.url && item.title)
      .map((item) => ({
        title: item.title!,
        url: item.url!,
        description: item.description,
        markdown: item.markdown,
      }));

    return {
      query: trimmedQuery,
      snippets,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error(
        `[knowledge/firecrawl] Request timed out after ${timeoutMs}ms`,
      );
    } else {
      console.error("[knowledge/firecrawl] Request failed:", error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
