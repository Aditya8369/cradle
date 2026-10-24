/**
 * Thumbnail URL for a project card. The generator records a content hash in
 * data/projects.json (`thumbnailHash`); using it as `?v=` means the URL changes
 * exactly when the file changes, so browsers and CDNs can cache it for a long
 * time. A registry entry without a hash falls back to the plain URL.
 */
export function getThumbnailUrl(project) {
  const url = `${project.path}thumbnail.svg`;
  return project.thumbnailHash
    ? `${url}?v=${encodeURIComponent(project.thumbnailHash)}`
    : url;
}
