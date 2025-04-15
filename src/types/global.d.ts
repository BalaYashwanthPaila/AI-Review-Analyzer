declare module "xlsx" {
  export interface Sheet {
    [cell: string]: any;
  }

  export interface Workbook {
    SheetNames: string[];
    Sheets: {
      [sheetName: string]: Sheet;
    };
  }

  export function readFile(filename: string): Workbook;

  export namespace utils {
    export function sheet_to_json(sheet: Sheet): any[];
  }
}

declare module "csv-parser" {
  import { Transform } from "stream";

  export default function csvParser(options?: any): Transform;
}
