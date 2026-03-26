import { pool } from '../db/pool.js';
/**
 * Strip all HTML tags from text to prevent XSS attacks
 * @param text - The text to sanitize
 * @returns The text with all HTML tags removed
 */
export function stripHtmlTags(text) {
    if (!text)
        return text;
    return text.replace(/<[^>]*>/g, '').trim();
}
export async function checkProfanity(text) {
    const result = await pool.query('SELECT word, severity FROM banned_words');
    const bannedWords = result.rows;
    const textLower = text.toLowerCase();
    const matchedWords = [];
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
        return severityLevels[item.severity] > max ? severityLevels[item.severity] : max;
    }, 0);
    const severityMap = { 1: 'low', 2: 'medium', 3: 'high' };
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
export async function addBannedWord(word, severity, language, createdBy) {
    const result = await pool.query('INSERT INTO banned_words (word, severity, language, created_by) VALUES ($1, $2, $3, $4) RETURNING *', [word.toLowerCase(), severity, language, createdBy]);
    return result.rows[0];
}
export async function deleteBannedWord(id) {
    const result = await pool.query('DELETE FROM banned_words WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
}
export async function bulkAddBannedWords(words, createdBy) {
    const results = [];
    for (const w of words) {
        try {
            const result = await pool.query('INSERT INTO banned_words (word, severity, language, created_by) VALUES ($1, $2, $3, $4) ON CONFLICT (word) DO NOTHING RETURNING *', [w.word.toLowerCase(), w.severity || 'medium', w.language || 'both', createdBy]);
            if (result.rows[0])
                results.push(result.rows[0]);
        }
        catch (e) {
            console.log(`Skipped: ${w.word}`);
        }
    }
    return results;
}
