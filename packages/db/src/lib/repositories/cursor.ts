/** Opaque keyset cursor: base64url("<sortValue>|<id>"). */
export function encodeCursor(sortValue: string, id: string): string {
  return Buffer.from(`${sortValue}|${id}`).toString('base64url');
}

export function decodeCursor(
  cursor: string | undefined,
): { sortValue: string; id: string } | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString();
    const separator = decoded.lastIndexOf('|');
    if (separator < 1) return null;
    return {
      sortValue: decoded.slice(0, separator),
      id: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}
