# AI Play Store Review Analyzer

A Next.js application for analyzing Play Store reviews and generating appropriate responses using AI, based on your organization's context.

## Features

- **Context Setup**:

  - Upload knowledge files (TXT, PDF, DOCX, MD)
  - Add website URLs for context scraping
  - All context is stored with OpenAI embeddings for semantic search

- **Review Analysis**:
  - Analyze sentiment based on review text and star rating
  - Generate AI responses using relevant organizational context
  - Semantic search to find the most relevant context for each review

## Getting Started

### Prerequisites

- Node.js 14+ and npm
- OpenAI API key

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.local` file in the root directory with your OpenAI API key:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```

### Running the Application

```bash
npm run dev
```

Visit `http://localhost:3000` to access the application.

## Usage

### Step 1: Set up your organization context

First, go to the "Context Setup" tab and:

- Upload relevant files containing your organization's information, FAQs, etc.
- Add URLs to your organization's website, documentation, or other relevant pages

The application will:

- Extract text content from uploaded files
- Scrape content from the provided URLs
- Create embeddings for all content for semantic search
- Store everything in a database for use during review analysis

### Step 2: Analyze Play Store reviews

Navigate to the "Review Analysis" tab and:

- Enter the star rating (1-5) of the review
- Paste the review text
- Click "Analyze Review"

The application will:

- Determine the sentiment of the review
- Find the most relevant pieces of context for this specific review
- Generate an appropriate response based on the review content and your organization's information
- Display the suggested response, which can be copied for use in the Play Store

## Technical Details

- Built with Next.js and TypeScript
- Uses TailwindCSS for styling
- Integrates with OpenAI for embeddings and response generation
- Implements vector similarity search for finding relevant context
- Uses a lightweight JSON database for storing context

## License

[MIT](LICENSE)
