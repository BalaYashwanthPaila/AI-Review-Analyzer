import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";
import * as cheerio from "cheerio";
import { OpenAIEmbeddings } from "@langchain/openai";
import path from "path";
import { promises as fs } from "fs";
import db from "../../utils/db";
import {
  splitTextIntoChunks,
  estimateTokenCount,
  createChunkTitle,
} from "../../utils/textProcessing";
const puppeteer = require("puppeteer");

// Import the ContextItem interface from our db.ts file or redefine it here
interface ContextItem {
  id: string;
  source: string;
  content: string;
  title?: string;
  url?: string;
  embedding?: number[];
  createdAt: string;
  similarity?: number;
}

/**
 * Scrapes content using Puppeteer for client-side rendered websites
 */
async function scrapeDynamicContent(
  url: string
): Promise<{ content: string; title: string }> {
  console.log(`Scraping dynamic content from: ${url}`);

  // Launch a headless browser
  const browser = await puppeteer.launch({
    headless: "new", // Use the new headless mode
    args: ["--no-sandbox", "--disable-setuid-sandbox"], // Helpful for running in containers
  });

  try {
    const page = await browser.newPage();

    // Set a reasonable timeout (30 seconds)
    await page.setDefaultNavigationTimeout(30000);

    // Go to the URL and wait until network is idle
    await page.goto(url, {
      waitUntil: "networkidle2", // Wait until there are no more than 2 network connections for at least 500ms
    });

    // Wait a bit more for any late-loading content using a compatible approach
    // Replace waitForTimeout with a compatible alternative
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get the page title
    const title = await page.title();

    // Extract text from all relevant elements
    const content = await page.evaluate(() => {
      // Remove hidden elements that might contain text but aren't visible to users
      document
        .querySelectorAll(
          'script, style, noscript, [style*="display:none"], [style*="display: none"], [hidden]'
        )
        .forEach((el) => el.remove());

      // Get text from paragraphs, headings, list items, etc.
      const textElements = Array.from(
        document.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, span, div")
      );

      return textElements
        .map((el) => el.textContent?.trim())
        .filter((text) => text && text.length > 0)
        .join("\n");
    });

    return { content, title };
  } finally {
    // Always close the browser
    await browser.close();
  }
}

/**
 * Scrapes content using Cheerio for server-side rendered websites
 */
async function scrapeStaticContent(
  htmlContent: string
): Promise<{ content: string; title: string }> {
  const $ = cheerio.load(htmlContent);

  // Remove script and style tags
  $("script, style, noscript").remove();

  // Extract text content from main content areas
  const content = $("body")
    .find("p, h1, h2, h3, h4, h5, h6, li, span, div")
    .toArray()
    .map((element) => $(element).text().trim())
    .filter((text) => text.length > 0)
    .join("\n");

  const title = $("title").text();

  return { content, title };
}

/**
 * Determines if a website is likely client-side rendered based on content analysis
 */
function isLikelyCSR(htmlContent: string): boolean {
  // Look for common CSR frameworks and minimal content
  const $ = cheerio.load(htmlContent);

  // Check for common root elements used by React, Vue, Angular
  const hasFrameworkRoots =
    $("#root").length > 0 || $("#app").length > 0 || $("[ng-app]").length > 0;

  // Check for JS framework references
  const hasFrameworkReferences =
    htmlContent.includes("react") ||
    htmlContent.includes("vue") ||
    htmlContent.includes("angular") ||
    htmlContent.includes("next") ||
    htmlContent.includes("nuxt");

  // Count meaningful text paragraphs (excluding scripts, styles)
  $("script, style").remove();
  const paragraphs = $("p").toArray();
  const meaningfulParagraphs = paragraphs.filter(
    (p) => $(p).text().trim().length > 20
  );

  // If we have framework indicators and very few paragraphs, it's likely CSR
  return (
    (hasFrameworkRoots || hasFrameworkReferences) &&
    meaningfulParagraphs.length < 5
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const url = req.query.url as string;

  if (!url) {
    return res.status(400).json({ message: "URL parameter is required" });
  }

  try {
    let content = "";
    let title = "";
    let scrapingMethod = "static";

    // First, fetch the initial HTML
    const initialResponse = await axios
      .get(url, {
        timeout: 10000, // 10 seconds timeout
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      })
      .catch((error) => {
        console.log(
          `Initial fetch failed: ${error.message}. Falling back to dynamic scraping.`
        );
        return { data: "", status: error.response?.status || 500 };
      });

    // If initial fetch failed or returned non-200, try dynamic scraping immediately
    if (!initialResponse.data || initialResponse.status !== 200) {
      console.log(
        `Initial fetch unsuccessful (status: ${initialResponse.status}). Using dynamic scraping.`
      );
      scrapingMethod = "dynamic";
      try {
        const dynamicResult = await scrapeDynamicContent(url);
        content = dynamicResult.content;
        title = dynamicResult.title;
      } catch (puppeteerError) {
        console.error(
          `Dynamic scraping failed: ${
            puppeteerError instanceof Error
              ? puppeteerError.message
              : "Unknown error"
          }`
        );
        throw new Error(
          `Failed to scrape content from ${url}: ${
            puppeteerError instanceof Error
              ? puppeteerError.message
              : "Unknown error"
          }`
        );
      }
    } else {
      // Determine if the site is likely using client-side rendering
      if (isLikelyCSR(initialResponse.data)) {
        // Use Puppeteer for dynamic content
        scrapingMethod = "dynamic";
        try {
          const dynamicResult = await scrapeDynamicContent(url);
          content = dynamicResult.content;
          title = dynamicResult.title;
        } catch (puppeteerError) {
          console.error(
            `Dynamic scraping failed after CSR detection: ${
              puppeteerError instanceof Error
                ? puppeteerError.message
                : "Unknown error"
            }`
          );
          // Fall back to static content if dynamic scraping fails
          console.log("Falling back to static scraping");
          const staticResult = await scrapeStaticContent(initialResponse.data);
          content = staticResult.content;
          title = staticResult.title;
          scrapingMethod = "static (fallback)";
        }
      } else {
        // Use Cheerio for static content
        const staticResult = await scrapeStaticContent(initialResponse.data);
        content = staticResult.content;
        title = staticResult.title;
      }

      // If content is too small from static scraping, fallback to dynamic scraping
      if (content.length < 500 && scrapingMethod === "static") {
        console.log(
          "Static content too small, falling back to dynamic scraping"
        );
        try {
          scrapingMethod = "dynamic";
          const dynamicResult = await scrapeDynamicContent(url);
          content = dynamicResult.content;
          title = dynamicResult.title || title;
        } catch (fallbackError) {
          console.error(
            `Dynamic fallback scraping failed: ${
              fallbackError instanceof Error
                ? fallbackError.message
                : "Unknown error"
            }`
          );
          // Keep the static content if fallback fails
          scrapingMethod = "static (dynamic fallback failed)";
        }
      }
    }

    console.log(
      `Scraped content using ${scrapingMethod} method. Content length: ${content.length} characters`
    );

    // If we still couldn't get meaningful content
    if (content.length < 100) {
      console.warn(`Scraped content is very short (${content.length} chars)`);
    }

    // Create OpenAI embeddings
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ message: "OpenAI API key is not configured" });
    }

    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName: "text-embedding-ada-002", // Use appropriate embedding model
    });

    // Check content length and chunk if necessary
    const estimatedTokens = estimateTokenCount(content);
    console.log(`Estimated token count: ${estimatedTokens}`);

    // Split content into chunks if it's too large
    // OpenAI's embedding models have a limit of ~8K tokens
    const MAX_TOKENS = 8000;
    const textChunks =
      estimatedTokens > MAX_TOKENS ? splitTextIntoChunks(content) : [content];

    console.log(`Split content into ${textChunks.length} chunks`);

    // Process each chunk and create contextItems
    const contextItems: ContextItem[] = [];
    const chunkResults = await Promise.all(
      textChunks.map(async (chunk, index) => {
        try {
          // Create a chunk-specific title
          const chunkTitle =
            textChunks.length > 1
              ? createChunkTitle(chunk, index, title || url)
              : title || url;

          // Generate embedding for this chunk
          const chunkTokens = estimateTokenCount(chunk);
          console.log(
            `Processing chunk ${index + 1}/${
              textChunks.length
            }, estimated tokens: ${chunkTokens}`
          );

          const embedding = await embeddings.embedQuery(chunk);

          // Create a context item for this chunk
          const contextItem: ContextItem = {
            id: `${Date.now().toString()}-url-chunk-${index}-${Math.random()
              .toString(36)
              .substring(2, 9)}`,
            source: "url",
            content: chunk,
            title: chunkTitle,
            url: url,
            embedding,
            createdAt: new Date().toISOString(),
          };

          contextItems.push(contextItem);

          return {
            chunkIndex: index,
            title: chunkTitle,
            charCount: chunk.length,
            tokenCount: chunkTokens,
          };
        } catch (error) {
          console.error(`Error processing chunk ${index + 1}:`, error);
          return {
            chunkIndex: index,
            error: error instanceof Error ? error.message : "Unknown error",
            charCount: chunk.length,
            tokenCount: estimateTokenCount(chunk),
          };
        }
      })
    );

    // Filter out any failed chunks
    const successfulChunks = chunkResults.filter((chunk) => !chunk.error);
    const failedChunks = chunkResults.filter((chunk) => chunk.error);

    if (failedChunks.length > 0) {
      console.warn(
        `${failedChunks.length} chunks failed during embedding for URL: ${url}`
      );
    }

    // Load existing context array or create a new one
    const existingContext = db.get("context") || [];

    // Add all successful chunks to context database
    existingContext.push(...contextItems);
    db.set("context", existingContext);

    return res.status(200).json({
      success: true,
      message: `URL content scraped with ${scrapingMethod} method and stored with embeddings`,
      contentLength: content.length,
      scrapingMethod,
      totalChunks: textChunks.length,
      successfulChunks: successfulChunks.length,
      failedChunks: failedChunks.length > 0 ? failedChunks.length : 0,
      contextItems: contextItems.map((item) => ({
        id: item.id,
        title: item.title,
        contentPreview: item.content.substring(0, 100) + "...",
        embedding: `[Array of ${item.embedding?.length || 0} numbers]`,
      })),
    });
  } catch (error) {
    console.error("Error scraping URL:", error);
    return res.status(500).json({
      message: "Error scraping URL or creating embeddings",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
