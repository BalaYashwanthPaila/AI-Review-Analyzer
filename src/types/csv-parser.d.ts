declare module "csv-parser" {
  import { Transform } from "stream";

  /**
   * Creates a transform stream that parses CSV data.
   */
  function csvParser(options?: {
    /**
     * Column separator (default: ',')
     */
    separator?: string;
    /**
     * Disable auto trimming of headers and fields
     */
    trim?: boolean;
    /**
     * Disable auto parsing of numbers and booleans
     */
    skipLines?: number;
    /**
     * Skip a specific number of lines at the start of the file
     */
    headers?: string[] | boolean;
    /**
     * Provide your own headers, or set to false to disable headers
     */
    escape?: string;
    /**
     * Escape character for quotes (default: '"')
     */
    [key: string]: any;
  }): Transform;

  export default csvParser;
}
