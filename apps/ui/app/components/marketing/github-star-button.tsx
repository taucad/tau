import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { metaConfig } from '#constants/meta.constants.js';
import type { GithubStarsResponse } from '#routes/api.github-stars/route.js';

function formatStars(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }

  return String(count);
}

/**
 * GitHub link for the marketing chrome that shows the repository star count when
 * available. Degrades to a plain GitHub icon if the count cannot be fetched
 * (offline, rate-limited) — the star fetch is best-effort and never blocks.
 */
export function GithubStarButton(): React.JSX.Element {
  const { data } = useQuery<GithubStarsResponse>({
    queryKey: ['github-stars'],
    async queryFn(): Promise<GithubStarsResponse> {
      const response = await fetch('/api/github-stars');
      if (!response.ok) {
        return { stars: undefined };
      }

      return (await response.json()) as GithubStarsResponse;
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const stars = data?.stars;

  return (
    <Button asChild variant='outline' size='sm' className='gap-1.5'>
      <a href={metaConfig.githubUrl} target='_blank' rel='noopener noreferrer' aria-label='Star Tau on GitHub'>
        <SvgIcon id='github' className='size-4' />
        {stars === undefined ? (
          <span className='hidden sm:inline'>Star</span>
        ) : (
          <span className='flex items-center gap-1 tabular-nums'>
            <Star className='size-3 fill-current' />
            {formatStars(stars)}
          </span>
        )}
      </a>
    </Button>
  );
}
