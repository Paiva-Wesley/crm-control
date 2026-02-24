export const normalizeString = (str: string): string => {
    return str
        .trim()
        .toLowerCase()
        // Remove accents and diacritics
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        // Replace multiple spaces with a single space
        .replace(/\s+/g, ' ')
        // Remove hyphens and simple punctuation
        .replace(/[-/\\^$*+?.()|[\]{}]/g, '');
};
