import process from 'node:process';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import yaml from 'js-yaml';

// ── Types ───────────────────────────────────────────────────────

export type RepoConfig = {
	upstream: string;
	fork?: string;
	branch?: string;
	path?: string;
	description?: string;
	shallow?: boolean;
};

export type GroupConfig = {
	description?: string;
	repos: string[];
};

export type Manifest = {
	version: number;
	repos_dir: string;
	owner: string;
	groups: Record<string, GroupConfig>;
	repos: Record<string, RepoConfig>;
};

export type RepoStatus = {
	name: string;
	cloned: boolean;
	branch?: string;
	dirty?: boolean;
	ahead?: number;
	behind?: number;
	upstreamAhead?: number;
	lastActivity?: number;
};

// ── Root Detection ──────────────────────────────────────────────

export function findRoot(): string {
	if (process.env['TAU_ROOT']) {
		const envRoot = process.env['TAU_ROOT'];
		if (existsSync(join(envRoot, 'repos.yaml'))) {
			return envRoot;
		}
	}

	let dir = process.cwd();
	while (dir !== dirname(dir)) {
		if (existsSync(join(dir, 'repos.yaml'))) {
			return dir;
		}

		dir = dirname(dir);
	}

	throw new Error(
		'Could not find repos.yaml. Run from the workspace root or set TAU_ROOT.',
	);
}

// ── Manifest Read/Write ─────────────────────────────────────────

export function readManifest(root?: string): {
	manifest: Manifest;
	root: string;
} {
	const resolvedRoot = root ?? findRoot();
	const filePath = join(resolvedRoot, 'repos.yaml');
	const content = readFileSync(filePath, 'utf8');
	const manifest = yaml.load(content) as Manifest;
	return { manifest, root: resolvedRoot };
}

export function writeManifest(manifest: Manifest, root?: string): void {
	const resolvedRoot = root ?? findRoot();
	const filePath = join(resolvedRoot, 'repos.yaml');
	const content = yaml.dump(manifest, {
		lineWidth: -1,
		noRefs: true,
		quotingType: "'",
		forceQuotes: false,
	});
	writeFileSync(filePath, content, 'utf8');
}

// ── URL Helpers ─────────────────────────────────────────────────

export function repoUrl(ownerRepo: string): string {
	return `https://github.com/${ownerRepo}.git`;
}

export function parseOwnerRepo(url: string): string | undefined {
	const match =
		/github\.com[/:](?<ownerRepo>[^/]+\/[^/.]+?)(?:\.git)?$/.exec(url);
	return match?.groups?.['ownerRepo'];
}

// ── Path Helpers ────────────────────────────────────────────────

export function repoPath(
	name: string,
	repo: RepoConfig,
	manifest: Manifest,
	root: string,
): string {
	const relative = repo.path ?? name;
	return resolve(root, manifest.repos_dir, relative);
}

// ── Repo Resolution ─────────────────────────────────────────────

export function resolveRepos(
	manifest: Manifest,
	filter?: {
		name?: string;
		group?: string;
		all?: boolean;
	},
): Array<[string, RepoConfig]> {
	if (!filter || filter.all) {
		return Object.entries(manifest.repos);
	}

	if (filter.name) {
		const repo = manifest.repos[filter.name];
		if (!repo) {
			throw new Error(`Repo "${filter.name}" not found in manifest.`);
		}

		return [[filter.name, repo]];
	}

	if (filter.group) {
		const group = manifest.groups[filter.group];
		if (!group) {
			throw new Error(
				`Group "${filter.group}" not found. Available: ${Object.keys(manifest.groups).join(', ')}`,
			);
		}

		return group.repos
			.map((name): [string, RepoConfig] | undefined => {
				const repo = manifest.repos[name];
				if (!repo) {
					console.warn(`Warning: repo "${name}" in group "${filter.group}" not found in manifest.`);
					return undefined;
				}

				return [name, repo];
			})
			.filter((entry): entry is [string, RepoConfig] => entry !== undefined);
	}

	return Object.entries(manifest.repos);
}

// ── Git Helpers ─────────────────────────────────────────────────

export function isCloned(
	name: string,
	repo: RepoConfig,
	manifest: Manifest,
	root: string,
): boolean {
	const dir = repoPath(name, repo, manifest, root);
	return existsSync(join(dir, '.git'));
}

export function gitExec(
	name: string,
	repo: RepoConfig,
	manifest: Manifest,
	root: string,
	args: string[],
): string {
	const dir = repoPath(name, repo, manifest, root);
	return execSync(['git', ...args].join(' '), {
		cwd: dir,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	}).trim();
}

export function getRepoStatus(
	name: string,
	repo: RepoConfig,
	manifest: Manifest,
	root: string,
): RepoStatus {
	if (!isCloned(name, repo, manifest, root)) {
		return { name, cloned: false };
	}

	try {
		const branch = gitExec(name, repo, manifest, root, [
			'rev-parse',
			'--abbrev-ref',
			'HEAD',
		]);

		const statusOutput = gitExec(name, repo, manifest, root, [
			'status',
			'--porcelain',
		]);
		const dirty = statusOutput.length > 0;

		let ahead = 0;
		let behind = 0;
		try {
			const abOutput = gitExec(name, repo, manifest, root, [
				'rev-list',
				'--left-right',
				'--count',
				`origin/${branch}...HEAD`,
			]);
			const parts = abOutput.split('\t');
			behind = Number.parseInt(parts[0] ?? '0', 10);
			ahead = Number.parseInt(parts[1] ?? '0', 10);
		} catch {
			// no tracking branch
		}

		let upstreamAhead: number | undefined;
		if (repo.fork) {
			try {
				const defaultBranch =
					repo.branch ?? branch;
				const uaOutput = gitExec(name, repo, manifest, root, [
					'rev-list',
					'--count',
					`HEAD..upstream/${defaultBranch}`,
				]);
				upstreamAhead = Number.parseInt(uaOutput, 10);
			} catch {
				// upstream not fetched yet
			}
		}

		const lastActivity = getLastActivity(name, repo, manifest, root);

		return {
			name,
			cloned: true,
			branch,
			dirty,
			ahead,
			behind,
			upstreamAhead,
			lastActivity,
		};
	} catch {
		return { name, cloned: true };
	}
}

export function getLastActivity(
	name: string,
	repo: RepoConfig,
	manifest: Manifest,
	root: string,
): number | undefined {
	if (!isCloned(name, repo, manifest, root)) {
		return undefined;
	}

	try {
		const ts = gitExec(name, repo, manifest, root, [
			'log',
			'-1',
			'--format=%ct',
		]);
		return Number.parseInt(ts, 10);
	} catch {
		return undefined;
	}
}

// ── GitHub Metadata ─────────────────────────────────────────────

export function fetchRepoDescription(upstream: string): string | undefined {
	try {
		const raw = execSync(
			`gh repo view ${upstream} --json description -q .description`,
			{ encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
		).trim();
		return raw || undefined;
	} catch {
		return undefined;
	}
}

// ── Clone ───────────────────────────────────────────────────────

export function cloneRepo(
	name: string,
	repo: RepoConfig,
	manifest: Manifest,
	root: string,
): { action: 'cloned' | 'skipped'; message: string } {
	const dir = repoPath(name, repo, manifest, root);
	if (existsSync(join(dir, '.git'))) {
		return { action: 'skipped', message: `${name}: already cloned` };
	}

	if (!repo.description) {
		const description = fetchRepoDescription(repo.upstream);
		if (description) {
			repo.description = description;
			writeManifest(manifest, root);
		}
	}

	const cloneUrl = repo.fork ? repoUrl(repo.fork) : repoUrl(repo.upstream);
	const args = ['git', 'clone', cloneUrl, dir];
	if (repo.shallow) {
		args.splice(1, 0, '--depth', '1');
	}

	if (repo.branch) {
		args.splice(1, 0, '--branch', repo.branch);
	}

	execSync(args.join(' '), { stdio: 'inherit' });

	if (repo.fork) {
		execSync(
			`git -C ${dir} remote add upstream ${repoUrl(repo.upstream)}`,
			{ stdio: 'inherit' },
		);
	}

	return { action: 'cloned', message: `${name}: cloned` };
}

// ── Sync ────────────────────────────────────────────────────────

export function syncRepo(
	name: string,
	repo: RepoConfig,
	manifest: Manifest,
	root: string,
): { ok: boolean; message: string } {
	if (!isCloned(name, repo, manifest, root)) {
		return { ok: false, message: `${name}: not cloned` };
	}

	try {
		gitExec(name, repo, manifest, root, ['fetch', '--all', '--prune']);
		try {
			gitExec(name, repo, manifest, root, ['pull', '--ff-only']);
		} catch {
			return {
				ok: false,
				message: `${name}: fetch ok, pull --ff-only failed (diverged?)`,
			};
		}

		return { ok: true, message: `${name}: synced` };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return { ok: false, message: `${name}: ${msg}` };
	}
}

// ── Fork / Unfork ───────────────────────────────────────────────

export function forkRepo(
	name: string,
	manifest: Manifest,
	root: string,
): { ok: boolean; message: string } {
	const repo = manifest.repos[name];
	if (!repo) {
		return { ok: false, message: `Repo "${name}" not found in manifest.` };
	}

	if (repo.fork) {
		return {
			ok: false,
			message: `${name}: already forked to ${repo.fork}`,
		};
	}

	const upstreamParts = repo.upstream.split('/');
	const repoName = upstreamParts[1];
	const forkSlug = `${manifest.owner}/${repoName}`;

	try {
		execSync(
			`gh repo fork ${repo.upstream} --org ${manifest.owner} --clone=false`,
			{ stdio: 'inherit' },
		);
	} catch {
		// fork may already exist on GitHub
	}

	repo.fork = forkSlug;
	writeManifest(manifest, root);

	if (isCloned(name, repo, manifest, root)) {
		const dir = repoPath(name, repo, manifest, root);
		try {
			execSync(`git -C ${dir} remote rename origin upstream`, {
				stdio: 'pipe',
			});
		} catch {
			// upstream remote may already exist
		}

		try {
			execSync(
				`git -C ${dir} remote add origin ${repoUrl(forkSlug)}`,
				{ stdio: 'pipe' },
			);
		} catch {
			execSync(
				`git -C ${dir} remote set-url origin ${repoUrl(forkSlug)}`,
				{ stdio: 'pipe' },
			);
		}
	}

	return { ok: true, message: `${name}: forked to ${forkSlug}` };
}

export function unforkRepo(
	name: string,
	manifest: Manifest,
	root: string,
): { ok: boolean; message: string } {
	const repo = manifest.repos[name];
	if (!repo) {
		return { ok: false, message: `Repo "${name}" not found in manifest.` };
	}

	if (!repo.fork) {
		return { ok: false, message: `${name}: not forked` };
	}

	if (isCloned(name, repo, manifest, root)) {
		const dir = repoPath(name, repo, manifest, root);
		try {
			execSync(`git -C ${dir} remote remove origin`, { stdio: 'pipe' });
			execSync(`git -C ${dir} remote rename upstream origin`, {
				stdio: 'pipe',
			});
		} catch {
			// best effort
		}
	}

	delete repo.fork;
	writeManifest(manifest, root);

	return { ok: true, message: `${name}: unforked (upstream only)` };
}
