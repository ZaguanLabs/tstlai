/** Representation metadata must be recalculated after translating an HTML body. */
export const TRANSFORMED_HEADERS = ['content-length', 'etag', 'content-md5', 'digest'];

export function translatedHeaders(headers: Headers): Headers {
  const result = new Headers(headers);
  for (const name of TRANSFORMED_HEADERS) result.delete(name);
  return result;
}
