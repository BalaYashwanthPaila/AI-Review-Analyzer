import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { promises as fsPromises } from "fs";
import formidable from "formidable";
import { OpenAIEmbeddings } from "@langchain/openai";
import db from "../../utils/db";
import {
  splitTextIntoChunks,
  estimateTokenCount,
  createChunkTitle,
} from "../../utils/textProcessing";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { createReadStream } from "fs";
// Import with CommonJS syntax to avoid TypeScript issues
// @ts-ignore
import csvParser from "csv-parser";

// Disable the default body parser
export const config = {
  api: {
    bodyParser: false,
  },
};

// Log request details (for debugging only - remove in production)
function logRequestDetails(req: NextApiRequest) {
  console.log("============ REQUEST DETAILS ============");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("========================================");
}

type ProcessedFile = {
  filename: string;
  filepath: string;
  mimetype: string;
  size: number;
};

interface ContextItem {
  id: string;
  source: string;
  content: string;
  title?: string;
  filepath?: string;
  embedding?: number[];
  createdAt: string;
  similarity?: number;
}

// Enhanced function to read file content based on mimetype
async function readFileContent(
  filepath: string,
  mimetype: string
): Promise<string> {
  try {
    // Handle different file types appropriately
    if (
      mimetype === "application/pdf" ||
      filepath.toLowerCase().endsWith(".pdf")
    ) {
      // PDF file processing
      try {
        console.log(`Processing PDF file: ${filepath}`);
        const dataBuffer = await fsPromises.readFile(filepath);

        // Check if buffer is valid
        if (!dataBuffer || dataBuffer.length === 0) {
          console.error(`Empty buffer for PDF file: ${filepath}`);
          return "";
        }

        console.log(`PDF buffer size: ${dataBuffer.length} bytes`);

        try {
          // Use the buffer directly, not the filepath
          const pdfData = await pdfParse(filepath);
          console.log("PDF data", pdfData);

          if (!pdfData || !pdfData.text) {
            console.error(`PDF parsed but no text content found: ${filepath}`);
            return "";
          }

          console.log(
            `Successfully extracted ${pdfData.text.length} characters from PDF`
          );

          // Return at least some content even if it's nearly empty
          return (
            pdfData.text.trim() ||
            "[PDF content appears to be empty or contains only images]"
          );
        } catch (pdfError) {
          console.error(`Error during PDF parsing: ${filepath}`, pdfError);
          return `[Error parsing PDF: ${
            pdfError instanceof Error ? pdfError.message : "Unknown error"
          }]`;
        }
      } catch (fileError) {
        console.error(`Error reading PDF file: ${filepath}`, fileError);
        return `[Error reading PDF file: ${
          fileError instanceof Error ? fileError.message : "Unknown error"
        }]`;
      }
    } else if (
      mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      filepath.toLowerCase().endsWith(".docx")
    ) {
      // DOCX file processing
      const dataBuffer = await fsPromises.readFile(filepath);
      const result = await mammoth.extractRawText({ buffer: dataBuffer });
      return result.value || "";
    } else if (
      mimetype === "application/vnd.ms-excel" ||
      mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      filepath.toLowerCase().endsWith(".xls") ||
      filepath.toLowerCase().endsWith(".xlsx")
    ) {
      // Excel file processing
      try {
        console.log(`Processing Excel file: ${filepath}`);
        const workbook = XLSX.readFile(filepath);

        // Combine all sheets into one text document
        let content = "";

        for (const sheetName of workbook.SheetNames) {
          // Get the worksheet
          const worksheet = workbook.Sheets[sheetName];

          // Convert sheet to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          // Add sheet name as a heading
          content += `## Sheet: ${sheetName}\n\n`;

          // If there's data, process it
          if (jsonData.length > 0) {
            // Get headers (column names) from the first row
            const headers = Object.keys(jsonData[0]!!);

            // Add each row as a line
            jsonData.forEach((row: any, rowIndex: number) => {
              content += `Row ${rowIndex + 1}: `;

              headers.forEach((header) => {
                if (row[header] !== undefined) {
                  content += `${header}: ${row[header]}; `;
                }
              });

              content += "\n";
            });

            content += "\n";
          } else {
            content += "No data in this sheet\n\n";
          }
        }

        return content || "Empty Excel file";
      } catch (excelError) {
        console.error(`Error processing Excel file: ${filepath}`, excelError);
        return `[Error processing Excel file: ${
          excelError instanceof Error ? excelError.message : "Unknown error"
        }]`;
      }
    } else if (
      mimetype === "text/csv" ||
      mimetype === "application/csv" ||
      filepath.toLowerCase().endsWith(".csv")
    ) {
      // CSV file processing
      try {
        console.log(`Processing CSV file: ${filepath}`);

        // Use a promise to handle the csv-parser stream
        const csvData = await new Promise<string>((resolve, reject) => {
          const results: any[] = [];

          createReadStream(filepath)
            .pipe(csvParser())
            .on("data", (data) => results.push(data))
            .on("end", () => {
              // Convert the CSV data to a formatted string
              let content = "";

              if (results.length > 0) {
                // Get headers from the first row
                const headers = Object.keys(results[0]);

                // Add a header row
                content += `CSV file with ${results.length} rows and ${headers.length} columns\n\n`;

                // Add each row as a line
                results.forEach((row, rowIndex) => {
                  content += `Row ${rowIndex + 1}: `;

                  headers.forEach((header) => {
                    if (row[header] !== undefined) {
                      content += `${header}: ${row[header]}; `;
                    }
                  });

                  content += "\n";
                });
              } else {
                content = "Empty CSV file or no data rows";
              }

              resolve(content);
            })
            .on("error", (error) => {
              reject(error);
            });
        });

        return csvData;
      } catch (csvError) {
        console.error(`Error processing CSV file: ${filepath}`, csvError);
        return `[Error processing CSV file: ${
          csvError instanceof Error ? csvError.message : "Unknown error"
        }]`;
      }
    } else if (
      mimetype === "text/plain" ||
      filepath.toLowerCase().endsWith(".txt") ||
      filepath.toLowerCase().endsWith(".md")
    ) {
      // Plain text files
      return await fsPromises.readFile(filepath, "utf8");
    } else {
      // For other file types, attempt to read as text
      console.log(
        `Attempting to read file as text: ${filepath}, mime type: ${mimetype}`
      );
      try {
        return await fsPromises.readFile(filepath, "utf8");
      } catch (error) {
        console.error(`Failed to read file as text: ${filepath}`, error);
        return "";
      }
    }
  } catch (error) {
    console.error(
      `Error reading file content: ${filepath}, mime type: ${mimetype}`,
      error
    );
    return "";
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    console.log("File upload request received");
    logRequestDetails(req);

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), "uploads");
    try {
      await fsPromises.access(uploadsDir);
    } catch (error) {
      console.log("Creating uploads directory");
      await fsPromises.mkdir(uploadsDir, { recursive: true });
    }

    // Parse the incoming form data
    console.log("Parsing form data");
    const options = {
      uploadDir: uploadsDir,
      keepExtensions: true,
      multiples: true,
    };

    const form = formidable(options);
    // For Formidable v3 and below, use:
    // const form = new formidable.IncomingForm(options);

    const files: ProcessedFile[] = await new Promise((resolve, reject) => {
      const files: ProcessedFile[] = [];

      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error("Error parsing form data:", err);
          return reject(err);
        }

        console.log("Form fields:", fields);
        console.log("Files received:", files);

        const processedFiles: ProcessedFile[] = [];

        // return res.status(200).json({
        //   message: "Files uploaded and processed successfully",
        //   files: processedFiles,
        // });
        // Handle files
        if (files) {
          // Extract all files from the form data
          const allFiles: any[] = [];

          // Check if files.files exists (field name used by our front-end)
          if (files.files) {
            const filesArray = Array.isArray(files.files)
              ? files.files
              : [files.files];
            allFiles.push(...filesArray);
          } else {
            // Otherwise, collect files from all fields
            Object.keys(files).forEach((fieldName) => {
              const fieldFiles = files[fieldName];
              if (Array.isArray(fieldFiles)) {
                allFiles.push(...fieldFiles);
              } else if (fieldFiles) {
                allFiles.push(fieldFiles);
              }
            });
          }

          console.log(`Found ${allFiles.length} files to process`);

          for (const file of allFiles) {
            console.log(
              `Processing file: ${file.originalFilename || "unknown"}`
            );

            processedFiles.push({
              filename: file.originalFilename || "unknown",
              filepath: file.filepath,
              mimetype: file.mimetype || "application/octet-stream",
              size: file.size,
            });
          }
        } else {
          console.log("No files found in the request");
        }

        resolve(processedFiles);
      });
    });

    // Initialize OpenAI API
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ message: "OpenAI API key is not configured" });
    }

    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName: "text-embedding-ada-002",
    });

    if (files.length === 0) {
      return res.status(400).json({
        message: "No files were uploaded",
      });
    }

    // Process the files according to their type
    const processedFiles = await Promise.all(
      files.map(async (file) => {
        console.log(
          `Processing file: ${file.filename}, size: ${file.size} bytes`
        );

        try {
          // Read file content
          const content = await readFileContent(file.filepath, file.mimetype);

          if (!content || content.trim() === "") {
            console.warn(
              `Empty or invalid content from file: ${file.filename}`
            );

            // Special handling for PDFs that might be image-only
            if (
              file.mimetype === "application/pdf" ||
              file.filepath.toLowerCase().endsWith(".pdf")
            ) {
              return {
                name: file.filename,
                type: file.mimetype,
                size: file.size,
                path: file.filepath,
                error:
                  "This PDF might be image-only or scanned. No text content could be extracted.",
                totalChunks: 0,
                isPdfWithoutText: true,
              };
            }

            return {
              name: file.filename,
              type: file.mimetype,
              size: file.size,
              path: file.filepath,
              error: "Could not extract text content from this file",
              totalChunks: 0,
            };
          }

          // Check if content starts with error message from our PDF parser
          if (
            content.startsWith("[Error parsing PDF:") ||
            content.startsWith("[Error reading PDF file:")
          ) {
            console.warn(
              `Error reported during PDF parsing: ${file.filename} - ${content}`
            );
            return {
              name: file.filename,
              type: file.mimetype,
              size: file.size,
              path: file.filepath,
              error: content,
              totalChunks: 0,
            };
          }

          console.log(`Read ${content.length} characters from file`);

          // Estimate token count for the entire content
          const estimatedTokens = estimateTokenCount(content);
          console.log(`Estimated token count: ${estimatedTokens}`);

          // Split content into chunks if it's too large
          // OpenAI's embedding models have a limit of ~8K tokens
          const MAX_TOKENS = 8000;
          const textChunks =
            estimatedTokens > MAX_TOKENS
              ? splitTextIntoChunks(content)
              : [content];

          console.log(`Split content into ${textChunks.length} chunks`);

          // Process each chunk
          const chunkResults = await Promise.all(
            textChunks.map(async (chunk, index) => {
              try {
                // Create a chunk-specific title
                const chunkTitle =
                  textChunks.length > 1
                    ? createChunkTitle(chunk, index, file.filename)
                    : file.filename;

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
                  id: `${Date.now().toString()}-chunk-${index}-${Math.random()
                    .toString(36)
                    .substring(2, 9)}`,
                  source: "file",
                  content: chunk,
                  title: chunkTitle,
                  filepath: file.filepath,
                  embedding,
                  createdAt: new Date().toISOString(),
                };

                // Add chunk to context database
                const existingContext = db.get("context") || [];
                existingContext.push(contextItem);
                db.set("context", existingContext);

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
                  error:
                    error instanceof Error ? error.message : "Unknown error",
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
              `${failedChunks.length} chunks failed during processing for file: ${file.filename}`
            );
          }

          return {
            name: file.filename,
            type: file.mimetype,
            size: file.size,
            path: file.filepath,
            chunks: successfulChunks,
            failedChunks: failedChunks.length > 0 ? failedChunks : undefined,
            totalChunks: textChunks.length,
            successfulChunks: successfulChunks.length,
          };
        } catch (error) {
          console.error(`Error processing file ${file.filename}:`, error);
          return {
            name: file.filename,
            type: file.mimetype,
            size: file.size,
            path: file.filepath,
            error: error instanceof Error ? error.message : "Unknown error",
            totalChunks: 0,
          };
        }
      })
    );

    return res.status(200).json({
      message: "Files uploaded and processed successfully",
      files: processedFiles,
    });
  } catch (error) {
    console.error("Error uploading files:", error);
    return res.status(500).json({
      message: "Error uploading files",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
