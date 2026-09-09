/** Remove translation hints without changing meaningful surrounding whitespace. */
export function stripContextMarkers(text: string): string {
  return text.replace(/\$ctx:[^\s]*/g, '').replace(/\s*\{\{__ctx__:[^}]+\}\}/g, '');
}

export function preserveWhitespace(source: string, translation: string): string {
  const leading = source.match(/^\s*/)?.[0] || '';
  const trailing = source.match(/\s*$/)?.[0] || '';
  return source.trim() ? leading + translation.trim() + trailing : source;
}
