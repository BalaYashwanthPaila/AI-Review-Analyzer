import type { NextApiRequest, NextApiResponse } from "next";
import { ChatOpenAI, OpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import path from "path";
import db from "../../utils/db";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { review, rating } = req.body;

    if (!review || !rating) {
      return res
        .status(400)
        .json({ message: "Review text and rating are required" });
    }

    // Initialize OpenAI API
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ message: "OpenAI API key is not configured" });
    }

    // Generate embedding for the review to find relevant context
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName: "text-embedding-ada-002",
    });

    // Create embedding for the review text
    const reviewEmbedding = await embeddings.embedQuery(review);

    // Find relevant context based on similarity to the review
    const relevantContexts = db.findSimilarContexts(reviewEmbedding, 5);
    console.log(
      "Relevant contexts",
      relevantContexts.map((r) => r.content)
    );

    // Initialize LLM for response generation
    const llm = new ChatOpenAI({
      apiKey,
      modelName: "gpt-4o",
      temperature: 0.5,
    });

    // Extract relevant context information
    const contextualContent = relevantContexts.map((item) => {
      const sourceInfo = item.title
        ? `Source: ${item.title}${item.url ? ` (${item.url})` : ""}`
        : item.source;

      // Calculate similarity percentage for clearer understanding
      const similarityPercentage = item.similarity
        ? Math.round(item.similarity * 100)
        : 0;

      return `${sourceInfo} (${similarityPercentage}% relevant):\n${item.content}`;
    });

    // Compile context for the response - limit to 4000 tokens maximum
    // to avoid token limits in the prompt
    let context = `Review: "${review}"\nRating: ${rating}/5`;

    // Calculate estimated tokens so far
    let estimatedTokens = Math.ceil(context.length / 4);

    // Add relevant context chunks, but check token count as we go
    if (contextualContent.length > 0) {
      context += "\n\nRelevant Organization Context:\n";
      estimatedTokens += 5; // Add tokens for the header

      // Add each context item, but monitor token count
      for (const item of contextualContent) {
        const itemTokens = Math.ceil(item.length / 4);

        // If adding this item would exceed our target token limit, break
        if (estimatedTokens + itemTokens > 4000) {
          context += "\n[Additional context truncated to fit token limits]";
          break;
        }

        context += item + "\n\n";
        estimatedTokens += itemTokens + 2; // +2 for the newlines
      }
    }

    const prompt = `
      You are a customer support agent for a fintech company.
      First, analyze the sentiment of this customer query, then generate a professional response.
      
      ${context}
      
      For the sentiment analysis:
      1. Categorize the sentiment as one of: "positive", "negative", "neutral", or "mixed"
      2. Provide a sentiment score from 1 to 5 where:
         - 1 is very negative
         - 2 is somewhat negative
         - 3 is neutral
         - 4 is somewhat positive
         - 5 is very positive
      3. Give a brief reason for your sentiment classification in one sentence
      
      Then, generate a response that:
      1. Addresses the customer's query and offers solutions from the organization context and maintain the brand voice
      2. Is professional, concise, friendly and empathetic
      3. Includes specific relevant information from the organization context when needed
      4. For negative reviews, is empathetic and offers solutions from the organization context
      5. For positive reviews, expresses gratitude from the organization context
      6. If the customer's query is not related to the organization, say so
      7. If the customer's query is not clear, ask for more information
      8. In case we don't have enough information to answer the query, ask the user to conatact relevant customer support channels

      
      
      Format your answer exactly as follows:
      SENTIMENT: [sentiment category]
      SCORE: [1-5 score]
      REASON: [brief reason]
      
      RESPONSE:
      [your suggested response]
    `;

    const llmOutput = await llm.predict(prompt);

    // Parse the LLM output to extract sentiment information and response
    let sentiment = "neutral";
    let sentimentScore = 3;
    let sentimentReason = "";
    let suggestedResponse = "";

    // Parse the output using regex
    const sentimentMatch = llmOutput.match(
      /SENTIMENT:\s*(positive|negative|neutral|mixed)/i
    );
    const scoreMatch = llmOutput.match(/SCORE:\s*([1-5])/i);
    const reasonMatch = llmOutput.match(
      /REASON:\s*(.+?)(?=\n\n|\n\s*RESPONSE:)/i
    );
    const responseMatch = llmOutput.match(/RESPONSE:\s*([\s\S]+)$/i);

    if (sentimentMatch) sentiment = sentimentMatch[1].toLowerCase();
    if (scoreMatch) sentimentScore = parseInt(scoreMatch[1]);
    if (reasonMatch) sentimentReason = reasonMatch[1].trim();
    if (responseMatch) suggestedResponse = responseMatch[1].trim();

    return res.status(200).json({
      success: true,
      suggestedResponse,
      sentiment,
      sentimentScore,
      sentimentReason,
      relevantContext: relevantContexts.map((item) => ({
        title: item.title || item.source,
        similarity: item.similarity,
      })),
    });
  } catch (error) {
    console.error("Error analyzing review:", error);
    return res.status(500).json({
      message: "Error analyzing review",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
