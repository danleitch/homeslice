/**
 * Runs once before the workers start, and they inherit its environment.
 * Fixing the zone keeps every date in the suite the same on a laptop in Cape
 * Town, a CI runner and a container.
 */
export default function setup(): void {
  process.env.TZ = 'UTC';
}
