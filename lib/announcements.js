// Gemeinsam für Webseite und Zentrale: Nur Links auf diese Webseite („/…“) oder https sind erlaubt.
// Die API prüft dasselbe beim Speichern; hier wird zur Sicherheit nochmals geprüft.

export function safeLink(link) {
  if (typeof link !== 'string' || link === '') return null;
  if (/^\/(?!\/)[A-Za-z0-9\-._~/?=&%]*$/.test(link)) return link;
  if (/^https:\/\/[A-Za-z0-9.-]+(\/[A-Za-z0-9\-._~/?=&%]*)?$/.test(link)) return link;
  return null;
}
