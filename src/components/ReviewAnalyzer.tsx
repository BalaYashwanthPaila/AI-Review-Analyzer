import React, { useState } from "react";

interface ReviewAnalysisResult {
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number;
  suggestedResponse: string;
}

const ReviewAnalyzer: React.FC = () => {
  const [review, setReview] = useState("");
  const [rating, setRating] = useState<number>(3);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ReviewAnalysisResult | null>(null);
  const [error, setError] = useState("");

  const handleAnalyzeReview = async () => {
    if (!review.trim()) {
      setError("Please enter a review to analyze");
      return;
    }

    setIsAnalyzing(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/analyze-review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          review,
          rating,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error analyzing review: ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">
          Analyze Play Store Review
        </h2>
        <p className="mb-4 text-gray-700">
          Enter a Play Store review and its rating to analyze sentiment and
          generate an appropriate response.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="rating" className="block mb-2 font-medium">
              Rating (1-5 stars)
            </label>
            <div className="flex space-x-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`text-2xl focus:outline-none ${
                    star <= rating ? "text-yellow-400" : "text-gray-300"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="review" className="block mb-2 font-medium">
              Review Text
            </label>
            <textarea
              id="review"
              rows={6}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Enter the Play Store review text here..."
              className="w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <button
            onClick={handleAnalyzeReview}
            disabled={isAnalyzing}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? "Analyzing..." : "Analyze Review"}
          </button>

          {error && (
            <div className="p-3 bg-red-100 text-red-700 rounded-md">
              {error}
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="border rounded-md overflow-hidden">
          <div className="p-4 bg-gray-50 border-b">
            <h3 className="font-medium">Analysis Results</h3>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <h4 className="font-medium mb-1">Sentiment:</h4>
              <div className="flex items-center">
                <div
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    result.sentiment === "positive"
                      ? "bg-green-100 text-green-800"
                      : result.sentiment === "negative"
                      ? "bg-red-100 text-red-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {result.sentiment.charAt(0).toUpperCase() +
                    result.sentiment.slice(1)}
                </div>
                <span className="ml-2 text-sm text-gray-500">
                  Score: {result.sentimentScore.toFixed(2)}
                </span>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-1">Suggested Response:</h4>
              <div className="p-3 bg-gray-50 rounded-md">
                <p className="whitespace-pre-wrap">
                  {result.suggestedResponse}
                </p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(result.suggestedResponse);
                }}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800"
              >
                Copy to clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewAnalyzer;
