/**
 * Installed package that ships a skill, from its SKILL.md path or, for skills registered
 * in code (Library, Univer), their resource directory. Nested packages report
 * the bundle under the profile (dsh-workbench-office ships dsh-workbench-univer's skills).
 * Local skills (user or project directories) have no package owner.
 */
export function skillOwner(path) {
  if (typeof path !== 'string') return undefined
  const parts = path.split(/[\\/]node_modules[\\/]/)
  if (parts.length < 2) return undefined
  const segments = parts[1].split(/[\\/]/)
  return segments[0].startsWith('@') ? segments.slice(0, 2).join('/') : segments[0] || undefined
}
