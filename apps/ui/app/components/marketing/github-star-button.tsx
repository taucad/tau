import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { metaConfig } from '#constants/meta.constants.js';

type GithubStarsResponse = {
  readonly stars: number | undefined;
};

const githubApiUrl = `https://api.github.com/repos/${metaConfig.githubOwner}/${metaConfig.githubRepo}`;

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
      const response = await fetch(githubApiUrl);
      if (!response.ok) {
        return { stars: undefined };
      }

      const body = (await response.json()) as { stargazers_count?: unknown };
      return { stars: typeof body.stargazers_count === 'number' ? body.stargazers_count : undefined };
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
