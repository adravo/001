import pdfParse from 'pdf-parse';

export function isPdf(filename: string, mimetype?: string): boolean {
  return mimetype === 'application/pdf' || /\.pdf$/i.test(filename);
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { text } = await pdfParse(buffer);
  return text.trim();
}
