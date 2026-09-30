// src/utils/route-group.ts — resolve Expo Router route groups at runtime.
// The same screen name exists in several of (admin)/(courier)/(guest)/(kitchen)/
// (npo)/(staff), so an href must be scoped to the caller's own group. A bare
// name ("sync-queue") is not a valid href (Expo Router expects a leading "/"),
// and an ungrouped "/sync-queue" resolves to whichever group happens to win —
// which can drop a user into an unrelated dashboard.
import { useSegments } from 'expo-router';

/** Home route for every role-area group. */
export const GROUP_HOMES: Record<string, string> = {
  '(admin)': '/(admin)/dashboard',
  '(courier)': '/(courier)/dashboard',
  '(guest)': '/',
  '(kitchen)': '/(kitchen)/dashboard',
  '(npo)': '/(npo)/dashboard',
  '(staff)': '/(staff)/staff-dashboard',
};

/** "(staff)" when the current screen lives in app/(staff); "" otherwise. */
export function useRouteGroup(): string {
  const segments = useSegments();
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (typeof s === 'string' && s.length > 2 && s.startsWith('(') && s.endsWith(')')) return s;
  }
  return '';
}

/** Group-scoped href builder: hrefFor("sync-queue") → "/(staff)/sync-queue". */
export function useGroupHref(): (screen: string) => string {
  const group = useRouteGroup();
  return (screen: string) => {
    const path = screen.startsWith('/') ? screen : `/${screen}`;
    return group ? `/${group}${path}` : path;
  };
}

/** Safe "go home for this group" target, used as a back-link fallback. */
export function useGroupHome(): string {
  return GROUP_HOMES[useRouteGroup()] ?? '/';
}
