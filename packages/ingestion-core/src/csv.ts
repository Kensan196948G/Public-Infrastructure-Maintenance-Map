/**
 * Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF).
 * Dependency-free so it runs identically in Workers, Node and tests.
 */

/**
 * Thrown when input violates RFC 4180 in a way that would otherwise be silently
 * mis-parsed (Issue #11) — an unterminated quoted field, or data wedged between
 * a closing quote and the next delimiter. Callers surface this as a failed
 * ingestion run rather than accepting corrupted rows.
 */
export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // True right after a field's closing quote: only a delimiter/newline/EOF may
  // follow. Anything else (e.g. `"a"b`) is malformed, not silently concatenated.
  let afterClosingQuote = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = '';
    afterClosingQuote = false;
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        afterClosingQuote = true;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (afterClosingQuote && ch !== ',' && ch !== '\r' && ch !== '\n') {
      throw new CsvParseError(
        `unexpected character after closing quote at index ${i} (RFC 4180 violation)`,
      );
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (inQuotes) {
    throw new CsvParseError('unterminated quoted field (RFC 4180 violation)');
  }
  // Flush the trailing field/row (no newline at EOF).
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

/** Parses CSV using the first row as the header. Blank lines are skipped. */
export function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text).filter((r) => !(r.length === 1 && r[0] === ''));
  const header = rows[0];
  if (!header) return [];
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, idx) => {
      record[key] = cells[idx] ?? '';
    });
    return record;
  });
}
