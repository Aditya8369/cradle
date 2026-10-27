import { getSearchableCategory } from "../components/ui/utils/categoryFilter.js";

/**
 * Filter the project registry using the same rules on either execution path.
 * Keeping this pure makes the main-thread fallback and worker behaviour identical.
 */
export function filterProjects(allProjects, selectedCategory, query) {
  if (!Array.isArray(allProjects)) return [];
  const q = typeof query === "string" ? query.toLowerCase().trim() : "";
  return allProjects.filter(project => {
    if (!project) return false;
    const matchesCategory =
      selectedCategory === "all" || project.category === selectedCategory;
    if (!matchesCategory) return false;

    if (!q) return true;

    const titleMatches =
      typeof project.title === "string" &&
      project.title.toLowerCase().includes(q);

    const descriptionMatches =
      typeof project.description === "string" &&
      project.description.toLowerCase().includes(q);

    const categoryMatches =
      typeof project.category === "string" &&
      getSearchableCategory(project.category).includes(q);

    return titleMatches || descriptionMatches || categoryMatches;
  });
}
