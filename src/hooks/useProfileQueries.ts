import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProfile, insertProfile, updateProfile } from '../lib/profile-api';
import { UserProfile } from '../data/types';

/**
 * Query key factory for profile data, keeping every call site's cache key in one place so a
 * typo can't silently create a second, disconnected cache entry for the same user.
 * Parameters: none beyond the key builder's own userId argument.
 * Returns: an object with a `detail(userId)` function producing that user's query key.
 * Edge cases: `userId` may be `undefined` (session not yet loaded) — callers pass it through
 * unchanged and instead use `enabled` on the query to avoid firing with an undefined id.
 */
export const profileKeys = {
  detail: (userId: string | undefined) => ['profile', userId] as const,
};

/**
 * Fetches and caches the given user's profile row.
 * Parameters: userId (the signed-in user's auth id, or undefined while the session is loading).
 * Returns: the standard React Query result object; `data` is the UserProfile, or null if the
 * user is authenticated but hasn't completed profile-creation yet.
 * Edge cases: the query is disabled (never fires) while userId is undefined, so there's no
 * request storm while auth state is still resolving on app start.
 */
export const useProfileQuery = (userId: string | undefined) =>
  useQuery({
    queryKey: profileKeys.detail(userId),
    queryFn: () => fetchProfile(userId as string),
    enabled: !!userId,
  });

/**
 * Creates a new profile row and seeds the query cache with the result immediately, so the
 * newly created profile is available to every screen without waiting for a refetch.
 * Parameters: none — call sites pass `{ userId, draft }` to the returned mutation's mutate/
 * mutateAsync functions.
 * Returns: a React Query mutation object.
 * Edge cases: on failure (e.g. UsernameTakenError from profile-api.ts), no cache write happens
 * and the error propagates to the caller via mutateAsync's rejected promise.
 */
export const useCreateProfileMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, draft }: { userId: string; draft: Omit<UserProfile, 'id'> }) =>
      insertProfile(userId, draft),
    onSuccess: (profile, { userId }) => {
      queryClient.setQueryData(profileKeys.detail(userId), profile);
    },
  });
};

/**
 * Applies a partial update to a user's profile with an optimistic UI update: the cache is
 * patched immediately (before the network request resolves) so point/win/loss changes feel
 * instant, then rolled back automatically if the request fails.
 * Parameters: none — call sites pass `{ userId, patch }` to the returned mutation's mutate/
 * mutateAsync functions.
 * Returns: a React Query mutation object.
 * Edge cases: if two updates race, the later `onSettled` invalidation reconciles the cache with
 * the server's actual state, so a lost optimistic update self-corrects on the next read.
 */
export const useUpdateProfileMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, patch }: { userId: string; patch: Partial<Omit<UserProfile, 'id'>> }) =>
      updateProfile(userId, patch),
    onMutate: async ({ userId, patch }) => {
      const key = profileKeys.detail(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<UserProfile>(key);
      if (previous) {
        queryClient.setQueryData<UserProfile>(key, { ...previous, ...patch });
      }
      return { previous, userId };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(profileKeys.detail(context.userId), context.previous);
      }
    },
    onSettled: (_data, _err, { userId }) => {
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(userId) });
    },
  });
};
