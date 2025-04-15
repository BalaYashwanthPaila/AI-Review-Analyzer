import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string | null;
  status: "uploading" | "processing" | "ready" | "error";
  error?: string;
  totalChunks?: number;
  successfulChunks?: number;
  serverPath?: string;
  isPdfWithoutText?: boolean;
}

interface UploadedUrl {
  id: string;
  url: string;
  status: "scraping" | "ready" | "error";
  content: string | null;
  error?: string;
  scrapingMethod?: "static" | "dynamic";
  contentLength?: number;
  totalChunks?: number;
  successfulChunks?: number;
  failedChunks?: number;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const validateFileSize = (file: File): { valid: boolean; message?: string } => {
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      message: `File ${file.name} is too large. Maximum file size is 20MB.`,
    };
  }
  return { valid: true };
};

const validateFileType = (file: File): { valid: boolean; message?: string } => {
  // Supported file types
  const supportedTypes = [
    "text/plain", // .txt
    "text/markdown", // .md
    "application/pdf", // .pdf
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/vnd.ms-excel", // .xls
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "text/csv", // .csv
    "application/csv", // alternative MIME type for CSV
  ];

  // Also check extensions for cases where MIME type is generic
  const supportedExtensions = [
    ".txt",
    ".md",
    ".pdf",
    ".docx",
    ".xls",
    ".xlsx",
    ".csv",
  ];

  const fileExtension = file.name
    .substring(file.name.lastIndexOf("."))
    .toLowerCase();

  if (
    !supportedTypes.includes(file.type) &&
    !supportedExtensions.includes(fileExtension)
  ) {
    return {
      valid: false,
      message: `File type ${
        file.type || fileExtension
      } is not supported. Please upload TXT, MD, PDF, DOCX, XLS, XLSX, or CSV files.`,
    };
  }

  return { valid: true };
};

const validateFile = (file: File): { valid: boolean; message?: string } => {
  const sizeValidation = validateFileSize(file);
  if (!sizeValidation.valid) return sizeValidation;

  const typeValidation = validateFileType(file);
  if (!typeValidation.valid) return typeValidation;

  return { valid: true };
};

const ContextUpload: React.FC = () => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [urls, setUrls] = useState<UploadedUrl[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [message, setMessage] = useState("");

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    // Validate files before uploading
    const fileValidationResults = acceptedFiles.map((file) => ({
      file,
      ...validateFile(file),
    }));

    const invalidFiles = fileValidationResults.filter(
      (result) => !result.valid
    );

    // If there are invalid files, show error messages and don't proceed
    if (invalidFiles.length > 0) {
      const errorMessages = invalidFiles.map((result) => result.message);
      setMessage(errorMessages.join("\n"));

      // Create entries for invalid files to show in the UI
      const invalidFileEntries = invalidFiles.map((result) => ({
        id: Math.random().toString(36).substring(2, 9),
        name: result.file.name,
        type: result.file.type,
        size: result.file.size,
        content: null,
        status: "error" as const,
        error: result.message,
      }));

      setFiles((prev) => [...prev, ...invalidFileEntries]);
      return;
    }

    // Clear any previous error messages
    setMessage("");

    // Create file entries with pending status
    const newFiles = acceptedFiles.map((file) => ({
      id: Math.random().toString(36).substring(2, 9),
      name: file.name,
      type: file.type,
      size: file.size,
      content: null,
      status: "uploading" as const,
    }));

    setFiles((prev) => [...prev, ...newFiles]);

    try {
      // Update all files to processing status
      setFiles((prev) =>
        prev.map((file) =>
          newFiles.some((nf) => nf.id === file.id)
            ? { ...file, status: "processing" }
            : file
        )
      );

      // Create a single FormData for all files
      const formData = new FormData();
      acceptedFiles.forEach((file) => {
        formData.append("files", file);
        console.log(
          `Adding file to upload: ${file.name}, size: ${file.size}, type: ${file.type}`
        );
      });

      // Upload all files in a single request
      console.log(`Uploading ${acceptedFiles.length} files to server...`);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Upload response:", data);

      // Mark all files as ready
      setFiles((prev) =>
        prev.map((file) => {
          if (newFiles.some((nf) => nf.id === file.id)) {
            // Find corresponding uploaded file
            const uploadedFile = data.files.find(
              (uf: any) => uf.name === file.name
            );

            if (uploadedFile?.error) {
              return {
                ...file,
                status: "error",
                error: uploadedFile.error,
              };
            }

            return {
              ...file,
              status: "ready",
              // Add chunk information from server response
              totalChunks: uploadedFile?.totalChunks || 1,
              successfulChunks:
                uploadedFile?.successfulChunks ||
                uploadedFile?.totalChunks ||
                1,
              // Additionally store any server-side processing results
              serverPath: uploadedFile?.path,
            };
          }
          return file;
        })
      );

      // Optionally read the files for display
      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        const fileId = newFiles[i].id;

        // Read file content for display purposes
        try {
          const content = await readFileContent(file);

          // Update file with content
          setFiles((prev) =>
            prev.map((f) => (f.id === fileId ? { ...f, content } : f))
          );
        } catch (error) {
          console.error(`Error reading file content: ${file.name}`, error);
        }
      }
    } catch (error) {
      console.error("Error uploading files:", error);

      // Mark all affected files as error
      setFiles((prev) =>
        prev.map((file) =>
          newFiles.some((nf) => nf.id === file.id)
            ? {
                ...file,
                status: "error",
                error: error instanceof Error ? error.message : "Unknown error",
              }
            : file
        )
      );
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const readFileContent = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        try {
          const result = reader.result as string;

          // For PDF files, we won't attempt client-side parsing
          // Just return a placeholder since PDFs are processed server-side
          if (
            file.type === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf")
          ) {
            resolve("[PDF content will be processed on the server]");
            return;
          }

          // For DOCX files, also just return a placeholder
          if (
            file.type ===
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            file.name.toLowerCase().endsWith(".docx")
          ) {
            resolve("[DOCX content will be processed on the server]");
            return;
          }

          // For Excel files, return a placeholder
          if (
            file.type === "application/vnd.ms-excel" ||
            file.type ===
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            file.name.toLowerCase().endsWith(".xls") ||
            file.name.toLowerCase().endsWith(".xlsx")
          ) {
            resolve("[Excel content will be processed on the server]");
            return;
          }

          // For CSV files, return a placeholder
          if (
            file.type === "text/csv" ||
            file.type === "application/csv" ||
            file.name.toLowerCase().endsWith(".csv")
          ) {
            resolve("[CSV content will be processed on the server]");
            return;
          }

          resolve(result);
        } catch (error) {
          reject(new Error("Failed to parse file content"));
        }
      };

      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };

      // Use different reading methods based on file type
      if (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf") ||
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.name.toLowerCase().endsWith(".docx") ||
        file.type === "application/vnd.ms-excel" ||
        file.type ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.name.toLowerCase().endsWith(".xls") ||
        file.name.toLowerCase().endsWith(".xlsx")
      ) {
        // For binary files, just read as array buffer
        // We don't actually process them client-side, but we need to read them somehow
        reader.readAsArrayBuffer(file);
      } else {
        // For text files (includes CSV), read as text
        reader.readAsText(file);
      }
    });
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim()) return;

    if (!urlInput.startsWith("http://") && !urlInput.startsWith("https://")) {
      setMessage("Please enter a valid URL starting with http:// or https://");
      return;
    }

    const newUrl: UploadedUrl = {
      id: Math.random().toString(36).substring(2, 9),
      url: urlInput,
      status: "scraping",
      content: null,
    };

    setUrls((prev) => [...prev, newUrl]);
    setUrlInput("");

    try {
      const response = await fetch(
        `/api/scrape?url=${encodeURIComponent(urlInput)}`
      );

      if (!response.ok) {
        throw new Error(`Failed to scrape URL: ${response.statusText}`);
      }

      const data = await response.json();

      setUrls((prev) => {
        const updated = [...prev];
        const urlIndex = updated.findIndex((u) => u.id === newUrl.id);
        if (urlIndex !== -1) {
          updated[urlIndex] = {
            ...updated[urlIndex],
            content:
              data.contextItems?.length > 0
                ? data.contextItems
                    .map((item: any) => item.contentPreview)
                    .join("\n---\n")
                : "[Content processed and stored]",
            status: "ready",
            scrapingMethod: data.scrapingMethod,
            contentLength: data.contentLength,
            totalChunks: data.totalChunks,
            successfulChunks: data.successfulChunks,
            failedChunks: data.failedChunks,
          };
        }
        return updated;
      });
    } catch (error) {
      setUrls((prev) => {
        const updated = [...prev];
        const urlIndex = updated.findIndex((u) => u.id === newUrl.id);
        if (urlIndex !== -1) {
          updated[urlIndex] = {
            ...updated[urlIndex],
            status: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
        return updated;
      });
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
  };

  const handleRemoveUrl = (id: string) => {
    setUrls((prev) => prev.filter((url) => url.id !== id));
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold mb-4">Upload Knowledge Files</h2>
        <p className="mb-4 text-gray-700">
          Upload files containing your organization's knowledge, SOPs, or other
          context information. Supported formats: TXT, PDF, DOCX, MD, XLS, XLSX,
          CSV
        </p>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${
              isDragActive
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-blue-500"
            }`}
        >
          <input {...getInputProps()} />
          {isDragActive ? (
            <p className="text-blue-500">Drop the files here...</p>
          ) : (
            <p>Drag & drop files here, or click to select files</p>
          )}
        </div>

        {files.length > 0 && (
          <div className="mt-4">
            <h3 className="font-medium mb-2">Uploaded Files:</h3>
            <ul className="space-y-2">
              {files.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded"
                >
                  <div className="flex flex-col">
                    <div className="flex items-center">
                      <span className="mr-2">
                        {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                      {file.status === "uploading" && (
                        <span className="text-yellow-500 text-sm">
                          Uploading...
                        </span>
                      )}
                      {file.status === "processing" && (
                        <span className="text-blue-500 text-sm">
                          Processing...
                        </span>
                      )}
                      {file.status === "ready" && (
                        <span className="text-green-500 text-sm">
                          Ready
                          {file.totalChunks && file.totalChunks > 1
                            ? ` (${file.successfulChunks || file.totalChunks}/${
                                file.totalChunks
                              } chunks processed)`
                            : ""}
                        </span>
                      )}
                      {file.status === "error" && file.error && (
                        <div>
                          <span className="text-red-500 text-sm">
                            {file.error.includes("image-only or scanned")
                              ? "⚠️ Image-only PDF detected"
                              : file.error}
                          </span>
                          {file.error.includes("image-only or scanned") && (
                            <div className="text-xs text-orange-700 mt-1">
                              This PDF appears to contain only images or scanned
                              content. Text cannot be extracted automatically.
                              Consider using a PDF with text content.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {file.status === "ready" &&
                      file.content &&
                      file.content.length > 0 && (
                        <div className="mt-1 text-xs text-gray-500">
                          <details>
                            <summary>Preview content</summary>
                            <div className="mt-1 p-2 bg-gray-100 rounded max-h-32 overflow-y-auto">
                              <pre className="whitespace-pre-wrap">
                                {file.content.substring(0, 500)}...
                              </pre>
                            </div>
                          </details>
                        </div>
                      )}
                  </div>
                  <button
                    onClick={() => handleRemoveFile(file.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Add Website URLs</h2>
        <p className="mb-4 text-gray-700">
          Add URLs to your organization's website, documentation, or other
          relevant web pages.
        </p>

        <div className="flex space-x-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com/docs"
            className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={handleAddUrl}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Add URL
          </button>
        </div>

        {message && <p className="mt-2 text-red-500">{message}</p>}

        {urls.length > 0 && (
          <div className="mt-4">
            <h3 className="font-medium mb-2">Added URLs:</h3>
            <ul className="space-y-2">
              {urls.map((url) => (
                <li
                  key={url.id}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded"
                >
                  <div className="flex flex-col">
                    <div className="flex items-center">
                      <span className="mr-2">{url.url}</span>
                      {url.status === "scraping" && (
                        <span className="text-yellow-500 text-sm">
                          Scraping...
                        </span>
                      )}
                      {url.status === "ready" && (
                        <span className="text-green-500 text-sm">
                          Ready
                          {url.scrapingMethod && (
                            <span className="text-xs ml-1">
                              {url.scrapingMethod === "dynamic"
                                ? "(dynamic content captured)"
                                : "(static content)"}
                            </span>
                          )}
                          {url.contentLength && (
                            <span className="text-xs ml-1">
                              ({Math.round(url.contentLength / 1000)}K chars)
                            </span>
                          )}
                          {url.totalChunks && url.totalChunks > 1 && (
                            <span className="text-xs ml-1">
                              {` (${url.successfulChunks || url.totalChunks}/${
                                url.totalChunks
                              } chunks processed)`}
                            </span>
                          )}
                        </span>
                      )}
                      {url.status === "error" && (
                        <span className="text-red-500 text-sm">
                          {url.error}
                        </span>
                      )}
                    </div>
                    {url.status === "ready" && url.content && (
                      <div className="mt-1 text-xs text-gray-500">
                        <details>
                          <summary>
                            Preview content{" "}
                            {url.totalChunks &&
                              url.totalChunks > 1 &&
                              `(${url.totalChunks} chunks)`}
                          </summary>
                          <div className="mt-1 p-2 bg-gray-100 rounded max-h-32 overflow-y-auto">
                            <pre className="whitespace-pre-wrap">
                              {url.content}
                            </pre>
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveUrl(url.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContextUpload;
