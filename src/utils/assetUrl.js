/**
 * Thumbnail URL for a project card. The generator records a content hash in
 * data/projects.json (`thumbnailHash`); using it as `?v=` means the URL changes
 * exactly when the file changes, so browsers and CDNs can cache it for a long
 * time. A registry entry without a hash falls back to the plain URL.
 */
export function getThumbnailUrl(project) {
  if (!project || typeof project.path !== "string") {
    return "";
  }

  const rawPath = project.path.trim();
  // Reject dangerous pseudo-protocols
  if (/^\s*(javascript|data|vbscript|file):/i.test(rawPath)) {
    return "";
  }

  const safePath = rawPath.endsWith("/") ? rawPath : `${rawPath}/`;
  const url = `${safePath}thumbnail.svg`;

  if (
    project.thumbnailHash &&
    typeof project.thumbnailHash === "string" &&
    /^[0-9a-f]{8}$/i.test(project.thumbnailHash.trim())
  ) {
    return `${url}?v=${encodeURIComponent(project.thumbnailHash.trim())}`;
  }

  return url;
}
