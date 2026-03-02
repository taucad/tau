/* eslint-disable no-restricted-imports -- standalone scripts use relative imports */

import process from 'node:process';
import React, { useState, useMemo } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { Spinner, ConfirmInput, TextInput } from '@inkjs/ui';
import type { Manifest, RepoConfig, RepoStatus } from './lib.ts';
import { readManifest, getRepoStatus, getLastActivity, cloneRepo, syncRepo, forkRepo, unforkRepo } from './lib.ts';

// ── Types ───────────────────────────────────────────────────────

type AppMode = 'list' | 'fork-confirm' | 'unfork-confirm' | 'syncing' | 'cloning';

type EnrichedRepo = {
  name: string;
  config: RepoConfig;
  status: RepoStatus;
  lastActivity?: number;
};

// ── Data Loading ────────────────────────────────────────────────

function loadRepos(manifest: Manifest, root: string): EnrichedRepo[] {
  const entries = Object.entries(manifest.repos);
  const enriched: EnrichedRepo[] = entries.map(([name, config]) => {
    const status = getRepoStatus(name, config, manifest, root);
    const lastActivity = status.cloned ? getLastActivity(name, config, manifest, root) : undefined;
    return { name, config, status, lastActivity };
  });

  enriched.sort((a, b) => {
    if (a.status.cloned && !b.status.cloned) {
      return -1;
    }

    if (!a.status.cloned && b.status.cloned) {
      return 1;
    }

    if (a.status.cloned && b.status.cloned) {
      return (b.lastActivity ?? 0) - (a.lastActivity ?? 0);
    }

    return a.name.localeCompare(b.name);
  });

  return enriched;
}

// ── Components ──────────────────────────────────────────────────

function StatusBar({
  total,
  clonedCount,
  group,
  groups,
}: {
  readonly total: number;
  readonly clonedCount: number;
  readonly group: string;
  readonly groups: string[];
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyan">
          Tau Repos
        </Text>
        <Text> </Text>
        <Text dimColor>
          {total} repos · {clonedCount} cloned
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Group: </Text>
        {['all', ...groups].map((g) => (
          <Text key={g} color={g === group ? 'cyan' : undefined} bold={g === group}>
            {g === group ? `[${g}]` : ` ${g} `}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

function KeyHints(): React.ReactElement {
  return (
    <Box marginBottom={1}>
      <Text dimColor>↑↓ navigate ←→/space toggle fork ○● ⏎ clone s sync / filter Tab group q quit</Text>
    </Box>
  );
}

function ForkToggle({
  isForked,
  isSelected,
}: {
  readonly isForked: boolean;
  readonly isSelected: boolean;
}): React.ReactElement {
  if (isForked) {
    return (
      <Text color={isSelected ? 'green' : 'yellow'} bold={isSelected}>
        ●
      </Text>
    );
  }

  return <Text dimColor={!isSelected}>○</Text>;
}

function RepoRow({
  repo,
  isSelected,
  nameWidth,
  owner,
}: {
  readonly repo: EnrichedRepo;
  readonly isSelected: boolean;
  readonly nameWidth: number;
  readonly owner: string;
}): React.ReactElement {
  const { name, config, status } = repo;

  const indicator = isSelected ? '>' : ' ';
  const clonedBadge = status.cloned ? <Text color="green">cloned</Text> : <Text dimColor> ─ </Text>;

  const upstreamOwner = config.upstream.split('/')[0]!;
  const originLabel = config.fork ? owner : upstreamOwner;

  const branch = status.branch ?? config.branch ?? '─';
  const branchDisplay = branch.length > 16 ? branch.slice(0, 15) + '…' : branch;

  const dirtyIndicator = status.dirty ? <Text color="red">*</Text> : <Text> </Text>;

  return (
    <Box>
      <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
        {indicator}{' '}
      </Text>
      <Box width={nameWidth + 2}>
        <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
          {name}
        </Text>
      </Box>
      <Box width={10}>{clonedBadge}</Box>
      <Box width={3}>
        <ForkToggle isForked={Boolean(config.fork)} isSelected={isSelected} />
      </Box>
      <Box width={20}>
        <Text dimColor={!config.fork}>{originLabel}</Text>
      </Box>
      <Box width={18}>
        <Text color="blue">{branchDisplay}</Text>
      </Box>
      {dirtyIndicator}
    </Box>
  );
}

function Header({ nameWidth }: { readonly nameWidth: number }): React.ReactElement {
  return (
    <Box marginBottom={0}>
      <Text dimColor>{'  '}</Text>
      <Box width={nameWidth + 2}>
        <Text dimColor bold>
          NAME
        </Text>
      </Box>
      <Box width={10}>
        <Text dimColor bold>
          STATUS
        </Text>
      </Box>
      <Box width={3}>
        <Text dimColor bold>
          FK
        </Text>
      </Box>
      <Box width={20}>
        <Text dimColor bold>
          ORIGIN
        </Text>
      </Box>
      <Box width={18}>
        <Text dimColor bold>
          BRANCH
        </Text>
      </Box>
    </Box>
  );
}

// ── Input Handlers ──────────────────────────────────────────────

function useNavigationInput(options: {
  mode: AppMode;
  showFilter: boolean;
  filter: string;
  filteredRepos: EnrichedRepo[];
  groupNames: string[];
  group: string;
  cursor: number;
  setShowFilter: (v: boolean) => void;
  setFilter: (v: string) => void;
  setCursor: (fn: (c: number) => number) => void;
  setGroup: (g: string) => void;
  setMessage: (m: string) => void;
  setMode: (m: AppMode) => void;
  exit: () => void;
}): void {
  const {
    mode,
    showFilter,
    filter,
    filteredRepos,
    groupNames,
    group,
    cursor,
    setShowFilter,
    setFilter,
    setCursor,
    setGroup,
    setMessage,
    setMode,
    exit,
  } = options;

  // eslint-disable-next-line complexity -- sequential key handlers are inherently branchy
  useInput((input, key) => {
    if (mode !== 'list') {
      return;
    }

    if (showFilter) {
      if (key.escape || (input === '/' && filter === '')) {
        setShowFilter(false);
        setFilter('');
      }

      return;
    }

    if (input === 'q' || key.escape) {
      exit();
      return;
    }

    if (input === '/') {
      setShowFilter(true);
      return;
    }

    if (key.upArrow || input === 'k') {
      setCursor((c) => Math.max(0, c - 1));
      setMessage('');
      return;
    }

    if (key.downArrow || input === 'j') {
      setCursor((c) => Math.min(filteredRepos.length - 1, c + 1));
      setMessage('');
      return;
    }

    if (key.tab) {
      const allGroups = ['all', ...groupNames];
      const currentIdx = allGroups.indexOf(group);
      const direction = key.shift ? -1 : 1;
      const nextIdx = (currentIdx + direction + allGroups.length) % allGroups.length;
      setGroup(allGroups[nextIdx]!);
      setCursor(() => 0);
      setMessage('');
      return;
    }

    if (input === ' ') {
      const repo = filteredRepos[cursor];
      if (repo) {
        setMode(repo.config.fork ? 'unfork-confirm' : 'fork-confirm');
      }

      return;
    }

    if (key.rightArrow) {
      const repo = filteredRepos[cursor];
      if (repo && !repo.config.fork) {
        setMode('fork-confirm');
      }

      return;
    }

    if (key.leftArrow) {
      const repo = filteredRepos[cursor];
      if (repo?.config.fork) {
        setMode('unfork-confirm');
      }
    }
  });
}

// ── Main App ────────────────────────────────────────────────────

function App(): React.ReactElement {
  const { exit } = useApp();
  const [{ manifest, root }] = useState(() => readManifest());
  const [repos, setRepos] = useState<EnrichedRepo[]>(() => loadRepos(manifest, root));
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<AppMode>('list');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [group, setGroup] = useState('all');

  const groupNames = useMemo(() => Object.keys(manifest.groups), [manifest.groups]);

  const filteredRepos = useMemo(() => {
    let list = repos;

    if (group !== 'all') {
      const groupConfig = manifest.groups[group];
      if (groupConfig) {
        const groupSet = new Set(groupConfig.repos);
        list = list.filter((r) => groupSet.has(r.name));
      }
    }

    if (filter) {
      const lower = filter.toLowerCase();
      list = list.filter(
        (r) => r.name.toLowerCase().includes(lower) || (r.config.description?.toLowerCase().includes(lower) ?? false),
      );
    }

    return list;
  }, [repos, group, filter, manifest.groups]);

  const clonedCount = repos.filter((r) => r.status.cloned).length;
  const nameWidth = Math.max(...filteredRepos.map((r) => r.name.length), 4);

  const viewportHeight = process.stdout.rows ? process.stdout.rows - 12 : 20;
  const scrollOffset = useMemo(() => {
    if (cursor < Math.floor(viewportHeight / 2)) {
      return 0;
    }

    return Math.min(cursor - Math.floor(viewportHeight / 2), Math.max(0, filteredRepos.length - viewportHeight));
  }, [cursor, viewportHeight, filteredRepos.length]);

  const visibleRepos = filteredRepos.slice(scrollOffset, scrollOffset + viewportHeight);

  const refreshRepos = (): void => {
    const fresh = readManifest(root);
    setRepos(loadRepos(fresh.manifest, root));
  };

  useNavigationInput({
    mode,
    showFilter,
    filter,
    filteredRepos,
    groupNames,
    group,
    cursor,
    setShowFilter,
    setFilter,
    setCursor,
    setGroup,
    setMessage,
    setMode,
    exit,
  });

  useInput((input, key) => {
    if (mode !== 'list' || showFilter) {
      return;
    }

    if (key.return) {
      const repo = filteredRepos[cursor];
      if (repo && !repo.status.cloned) {
        setMode('cloning');
        setMessage(`Cloning ${repo.name}...`);
        setTimeout(() => {
          try {
            cloneRepo(repo.name, repo.config, manifest, root);
            setMessage(`✓ ${repo.name} cloned`);
          } catch (error) {
            setMessage(`✗ Clone failed: ${error instanceof Error ? error.message : String(error)}`);
          }

          refreshRepos();
          setMode('list');
        }, 0);
      }

      return;
    }

    if (input === 's') {
      const repo = filteredRepos[cursor];
      if (repo?.status.cloned) {
        setMode('syncing');
        setMessage(`Syncing ${repo.name}...`);
        setTimeout(() => {
          const result = syncRepo(repo.name, repo.config, manifest, root);
          setMessage(result.ok ? `✓ ${result.message}` : `✗ ${result.message}`);
          refreshRepos();
          setMode('list');
        }, 0);
      }

      return;
    }

    if (input === 'S') {
      setMode('syncing');
      setMessage('Syncing all cloned repos...');
      setTimeout(() => {
        let ok = 0;
        let fail = 0;
        for (const repo of filteredRepos) {
          if (repo.status.cloned) {
            const result = syncRepo(repo.name, repo.config, manifest, root);
            if (result.ok) {
              ok++;
            } else {
              fail++;
            }
          }
        }

        setMessage(`✓ Synced ${ok} repos${fail > 0 ? `, ${fail} failed` : ''}`);
        refreshRepos();
        setMode('list');
      }, 0);
    }
  });

  const selectedRepo = filteredRepos[cursor];

  return (
    <Box flexDirection="column">
      <StatusBar total={repos.length} clonedCount={clonedCount} group={group} groups={groupNames} />

      {showFilter ? (
        <Box marginBottom={1}>
          <Text>Filter: </Text>
          <TextInput
            placeholder="type to filter..."
            onChange={(value) => {
              setFilter(value);
              setCursor(() => 0);
            }}
          />
        </Box>
      ) : null}

      <KeyHints />

      <Header nameWidth={nameWidth} />
      <Text dimColor>{'─'.repeat(nameWidth + 55)}</Text>

      {visibleRepos.map((repo, idx) => (
        <RepoRow
          key={repo.name}
          repo={repo}
          isSelected={idx + scrollOffset === cursor}
          nameWidth={nameWidth}
          owner={manifest.owner}
        />
      ))}

      {filteredRepos.length > viewportHeight && (
        <Text dimColor>
          {' '}
          ({scrollOffset + 1}-{Math.min(scrollOffset + viewportHeight, filteredRepos.length)} of {filteredRepos.length})
        </Text>
      )}

      {mode === 'fork-confirm' && selectedRepo ? (
        <Box marginTop={1}>
          <Text>
            Fork{' '}
            <Text bold color="yellow">
              {selectedRepo.config.upstream}
            </Text>{' '}
            to{' '}
            <Text bold color="green">
              {manifest.owner}
            </Text>
            ?{' '}
          </Text>
          <ConfirmInput
            onConfirm={() => {
              setMessage(`Forking ${selectedRepo.name}...`);
              setMode('syncing');
              setTimeout(() => {
                const result = forkRepo(selectedRepo.name, manifest, root);
                setMessage(result.ok ? `✓ ${result.message}` : `✗ ${result.message}`);
                refreshRepos();
                setMode('list');
              }, 0);
            }}
            onCancel={() => {
              setMode('list');
              setMessage('');
            }}
          />
        </Box>
      ) : null}

      {mode === 'unfork-confirm' && selectedRepo ? (
        <Box marginTop={1}>
          <Text>
            Remove fork config for{' '}
            <Text bold color="yellow">
              {selectedRepo.name}
            </Text>
            ? (revert to upstream only){' '}
          </Text>
          <ConfirmInput
            onConfirm={() => {
              setMessage(`Unforking ${selectedRepo.name}...`);
              setMode('syncing');
              setTimeout(() => {
                const result = unforkRepo(selectedRepo.name, manifest, root);
                setMessage(result.ok ? `✓ ${result.message}` : `✗ ${result.message}`);
                refreshRepos();
                setMode('list');
              }, 0);
            }}
            onCancel={() => {
              setMode('list');
              setMessage('');
            }}
          />
        </Box>
      ) : null}

      {(mode === 'syncing' || mode === 'cloning') && (
        <Box marginTop={1}>
          <Spinner label={message} />
        </Box>
      )}

      {message && mode === 'list' ? (
        <Box marginTop={1}>
          <Text color={message.startsWith('✓') ? 'green' : message.startsWith('✗') ? 'red' : undefined}>{message}</Text>
        </Box>
      ) : null}

      {selectedRepo?.config.description && mode === 'list' ? (
        <Box marginTop={1}>
          <Text dimColor>{selectedRepo.config.description}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

// ── Entry ───────────────────────────────────────────────────────

export function launch(): void {
  render(<App />);
}
