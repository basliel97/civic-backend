import { pool } from '../db/pool.js';

/**
 * Strip all HTML tags from text to prevent XSS attacks
 * @param text - The text to sanitize
 * @returns The text with all HTML tags removed
 */
export function stripHtmlTags(text: string): string {
  if (!text) return text;
  return text.replace(/<[^>]*>/g, '').trim();
}

export interface ProfanityCheckResult {
  isClean: boolean;
  matchedWords: { word: string; severity: string }[];
  severity: 'none' | 'low' | 'medium' | 'high';
}

export async function checkProfanity(text: string): Promise<ProfanityCheckResult> {
  const result = await pool.query('SELECT word, severity FROM banned_words');
  const bannedWords = result.rows;
  
  const textLower = text.toLowerCase();
  const matchedWords: { word: string; severity: string }[] = [];
  
  for (const { word, severity } of bannedWords) {
    const wordLower = word.toLowerCase();
    if (textLower.includes(wordLower)) {
      matchedWords.push({ word, severity });
    }
  }
  
  if (matchedWords.length === 0) {
    return { isClean: true, matchedWords: [], severity: 'none' };
  }
  
  const severityLevels = { low: 1, medium: 2, high: 3 };
  const maxSeverity = matchedWords.reduce((max, item) => {
    return severityLevels[item.severity as keyof typeof severityLevels] > max ? severityLevels[item.severity as keyof typeof severityLevels] : max;
  }, 0);
  
  const severityMap: Record<number, 'low' | 'medium' | 'high'> = { 1: 'low', 2: 'medium', 3: 'high' };
  
  return {
    isClean: false,
    matchedWords,
    severity: severityMap[maxSeverity] || 'medium'
  };
}

export async function getBannedWords() {
  const result = await pool.query('SELECT * FROM banned_words ORDER BY created_at DESC');
  return result.rows;
}

export async function addBannedWord(word: string, severity: string, language: string, createdBy: string) {
  const result = await pool.query(
    'INSERT INTO banned_words (word, severity, language, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
    [word.toLowerCase(), severity, language, createdBy]
  );
  return result.rows[0];
}

export async function deleteBannedWord(id: string) {
  const result = await pool.query('DELETE FROM banned_words WHERE id = $1 RETURNING *', [id]);
  return result.rows[0];
}

export async function bulkAddBannedWords(words: { word: string; severity?: string; language?: string }[], createdBy: string) {
  const results = [];
  for (const w of words) {
    try {
      const result = await pool.query(
        'INSERT INTO banned_words (word, severity, language, created_by) VALUES ($1, $2, $3, $4) ON CONFLICT (word) DO NOTHING RETURNING *',
        [w.word.toLowerCase(), w.severity || 'medium', w.language || 'both', createdBy]
      );
      if (result.rows[0]) results.push(result.rows[0]);
    } catch (e) {
      console.log(`Skipped: ${w.word}`);
    }
  }
  return results;
}
