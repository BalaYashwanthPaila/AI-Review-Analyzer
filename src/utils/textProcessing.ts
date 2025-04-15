/**
 * Text processing utilities including chunking for large documents
 */

/**
 * Split text into chunks of approximately the specified size
 * @param text Text content to split
 * @param chunkSize Target size of each chunk (in characters)
 * @param overlap Number of characters to overlap between chunks
 * @returns Array of text chunks
 */
export function splitTextIntoChunks(
  text: string,
  chunkSize: number = 4000,
  overlap: number = 200
): string[] {
  if (!text || text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    // Calculate end index for this chunk
    let endIndex = startIndex + chunkSize;

    // If we're not at the end of the text, try to find a good break point
    if (endIndex < text.length) {
      // Look for natural break points (paragraph, sentence, or word)
      const paragraphBreak = text.lastIndexOf("\n\n", endIndex);
      const sentenceBreak = text.lastIndexOf(". ", endIndex);
      const wordBreak = text.lastIndexOf(" ", endIndex);

      // Use the closest natural break that's not too far back
      if (paragraphBreak > startIndex && paragraphBreak > endIndex - 200) {
        endIndex = paragraphBreak + 2; // Include the double newline
      } else if (sentenceBreak > startIndex && sentenceBreak > endIndex - 100) {
        endIndex = sentenceBreak + 2; // Include the period and space
      } else if (wordBreak > startIndex) {
        endIndex = wordBreak + 1; // Include the space
      }
    }

    // Extract the chunk
    chunks.push(text.slice(startIndex, endIndex));

    // Move startIndex for next chunk, accounting for overlap
    startIndex = endIndex - overlap;

    // Ensure we're making progress
    if (startIndex <= 0 || endIndex === startIndex) {
      startIndex = endIndex;
    }
  }

  return chunks;
}

/**
 * Estimate the number of tokens in a string
 * This is a rough approximation (1 token ≈ 4 characters for English text)
 * @param text Text to estimate
 * @returns Estimated token count
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Roughly 4 characters per token for English text
  return Math.ceil(text.length / 4);
}

/**
 * Create a short title/summary for a chunk
 * @param chunk Text chunk
 * @param index Chunk index
 * @param filename Original filename
 * @returns Chunk title
 */
export function createChunkTitle(
  chunk: string,
  index: number,
  filename: string
): string {
  // Get first line or first 50 characters
  const firstLine = chunk.split("\n")[0]?.trim() || "";
  const preview =
    firstLine.length > 50 ? firstLine.substring(0, 50) + "..." : firstLine;

  return `${filename} (chunk ${index + 1}) - ${preview}`;
}
