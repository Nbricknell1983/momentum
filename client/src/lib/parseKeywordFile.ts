export async function parseKeywordFile(file: File): Promise<string> {
  const xlsx = await import('xlsx');
  const xlsxRead = xlsx.read ?? (xlsx as any).default?.read;
  const xlsxUtils = xlsx.utils ?? (xlsx as any).default?.utils;
  if (!xlsxRead || !xlsxUtils) throw new Error('Spreadsheet library unavailable');

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isCSV = file.name.toLowerCase().endsWith('.csv');

  let wb: any;
  if (isCSV) {
    let text: string;
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      text = new TextDecoder('UTF-16LE').decode(buffer.slice(2));
    } else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
      text = new TextDecoder('UTF-16BE').decode(buffer.slice(2));
    } else if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      text = new TextDecoder('UTF-8').decode(buffer.slice(3));
    } else {
      text = new TextDecoder('UTF-8').decode(buffer);
    }
    text = text.replace(/^\uFEFF/, '');
    wb = xlsxRead(text, { type: 'string' });
  } else {
    wb = xlsxRead(bytes, { type: 'array' });
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, any>[] = xlsxUtils.sheet_to_json(ws, { defval: null });
  if (!rows.length) throw new Error('No data found');

  const norm = (s: string) => String(s ?? '').toLowerCase().trim();
  const firstRow = rows[0];
  const headers = Object.keys(firstRow).map(norm);
  const hasKeyword = headers.some(h => h.includes('keyword') && !h.includes('parent'));
  if (!hasKeyword) throw new Error('No keyword column found');

  const pick = (row: Record<string, any>, ...terms: string[]): any => {
    for (const key of Object.keys(row)) {
      const k = norm(key);
      if (terms.some(t => k.includes(t))) return row[key];
    }
    return null;
  };
  const num = (v: any) => { const n = Number(v); return isNaN(n) ? null : n; };

  const keywords = rows.map(row => ({
    keyword: String(pick(row, 'keyword') ?? '').trim(),
    volume: num(pick(row, 'volume', 'search volume', 'avg. monthly searches', 'monthly searches')),
    difficulty: num(pick(row, 'kd', 'keyword difficulty', 'difficulty')),
    cpc: num(pick(row, 'cpc')),
    position: num(pick(row, 'position', 'current position', 'rank')),
    traffic: num(pick(row, 'traffic potential', 'tp', 'traffic')),
  })).filter(k => k.keyword);

  keywords.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  const top = keywords.slice(0, 50);

  const lines = [`Keywords extracted from ${file.name} (${keywords.length} total):\n`];
  lines.push('Keyword | Volume | KD | Position | CPC');
  lines.push('--------|---------|----|----------|----');
  top.forEach(k => {
    lines.push(`${k.keyword} | ${k.volume ?? '—'} | ${k.difficulty ?? '—'} | ${k.position ?? '—'} | ${k.cpc != null ? '$' + k.cpc.toFixed(2) : '—'}`);
  });
  return lines.join('\n');
}
