import { ExtensionContext, ProgressLocation, window } from 'vscode';
import { spawnSync } from 'child_process';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger';

const GITHUB_API_URL  = 'https://api.github.com/repos/Keeper-Security/Commander/releases/latest';
const GITHUB_TAG_URL  = 'https://api.github.com/repos/Keeper-Security/Commander/releases/tags/v';
const INSTALL_CACHE   = path.join(os.homedir(), '.keeper-commander-install');

// Set to a specific version string (e.g. '16.0.5') to pin the CLI to that release.
// Set to null to always compare against and offer the latest release.
const PINNED_VERSION: string | null = null;

interface ReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface LatestRelease {
  version: string;
  assets: ReleaseAsset[];
}

export class CommanderInstallerService {
  constructor(
    // @ts-ignore
    private context: ExtensionContext
  ) {}

  // Check all known candidate paths and return the first working binary path, or null.
  resolveExistingBinary(): string | null {
    const platform = process.platform;
    const candidates: string[] = ['keeper'];

    if (platform === 'darwin') {
      candidates.push(
        path.join(os.homedir(), 'usr', 'local', 'keepercommandercli', 'bin', 'keeper-commander'),
        path.join(os.homedir(), 'usr', 'local', 'bin', 'keeper'),
        '/usr/local/bin/keeper',
        '/usr/bin/keeper'
      );
    } else if (platform === 'linux') {
      candidates.push(
        path.join(os.homedir(), '.local', 'bin', 'keeper'),
        '/usr/local/bin/keeper',
        '/usr/bin/keeper'
      );
    } else if (platform === 'win32') {
      candidates.push('C:\\Program Files\\Keeper Commander\\keeper.exe');
    }

    for (const candidate of candidates) {
      try {
        const r = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 10000 });
        const out = `${r.stdout || ''}${r.stderr || ''}`;
        if (r.status === 0 && /version\s+[\d.]+/i.test(out)) {
          logger.logInfo(`CommanderInstaller: found keeper at ${candidate}`);
          return candidate;
        }
      } catch {
        // try next
      }
    }
    return null;
  }

  // Entry point: shows VS Code progress notification, runs install, returns binary path or null.
  async promptAndInstall(): Promise<string | null> {
    let resolvedPath: string | null = null;

    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: 'Keeper Commander CLI',
        cancellable: false,
      },
      async (progress) => {
        const report = (msg: string) => {
          logger.logInfo(`CommanderInstaller: ${msg}`);
          progress.report({ message: msg });
        };

        try {
          report('Fetching latest release info...');
          const release = await this.fetchLatestRelease();
          report(`Downloading v${release.version}...`);

          const platform = process.platform;

          if (platform === 'darwin') {
            resolvedPath = await this.installMacos(release.version, release.assets, report);
          } else if (platform === 'win32') {
            resolvedPath = await this.installWindows(release.version, release.assets, report);
          } else {
            resolvedPath = await this.installLinux(release.version, report);
          }

          report(`Installed successfully. Binary: ${resolvedPath}`);
          window.showInformationMessage(
            `Keeper Commander CLI v${release.version} installed successfully.`
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.logError('CommanderInstaller: install failed', error);
          window.showErrorMessage(`Keeper Commander CLI installation failed: ${msg}`);
        }
      }
    );

    return resolvedPath;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private fetchLatestRelease(): Promise<LatestRelease> {
    const endpoint = PINNED_VERSION
      ? `${GITHUB_TAG_URL}${PINNED_VERSION}`
      : GITHUB_API_URL;

    return new Promise((resolve, reject) => {
      const parsed = new URL(endpoint);
      https.get(
        { hostname: parsed.hostname, path: parsed.pathname, headers: { 'User-Agent': 'keeper-vscode-extension' } },
        (res) => {
          if (res.statusCode !== 200) return reject(new Error(`GitHub API returned HTTP ${res.statusCode}`));
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            try {
              const release = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              resolve({ version: release.tag_name.replace(/^v/, ''), assets: release.assets });
            } catch (e) {
              reject(e);
            }
          });
          res.on('error', reject);
        }
      ).on('error', reject);
    });
  }

  // Returns the installed version string (e.g. '16.0.5') or null if it cannot be determined.
  getInstalledVersion(binaryPath: string): string | null {
    try {
      const r   = spawnSync(binaryPath, ['--version'], { encoding: 'utf8', timeout: 10000 });
      const out = `${r.stdout || ''}${r.stderr || ''}`;
      const match = out.match(/version\s+([\d.]+)/i);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  // Compares the installed version against the latest (or pinned) release.
  // If a newer version is available, asks the user to upgrade or keep the current one.
  // Runs async from lazyInitialize so it never blocks startup.
  async checkAndUpgrade(binaryPath: string): Promise<string> {
    try {
      const installed = this.getInstalledVersion(binaryPath);
      const release   = await this.fetchLatestRelease();

      logger.logInfo(`CommanderInstaller: installed=${installed}, latest=${release.version}`);

      // When PINNED_VERSION is set, skip the upgrade prompt — developer has locked the version.
      if (PINNED_VERSION || !installed || installed === release.version) {
        return binaryPath;
      }

      const action = await window.showInformationMessage(
        `Keeper Commander CLI v${installed} is installed. v${release.version} is available.`,
        'Upgrade',
        'Keep Current Version'
      );

      if (action === 'Upgrade') {
        const newPath = await this.promptAndInstall();
        return newPath ?? binaryPath;
      }

      return binaryPath;
    } catch (error) {
      logger.logError('CommanderInstaller: upgrade check failed', error);
      return binaryPath;
    }
  }

  private downloadWithProgress(
    url: string,
    destPath: string,
    onProgress: (msg: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const file = fs.createWriteStream(destPath);

      function follow(targetUrl: string): void {
        const parsed = new URL(targetUrl);
        https.get(
          { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'keeper-vscode-extension' } },
          (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              return follow(res.headers.location);
            }
            if (res.statusCode !== 200) {
              file.close();
              return reject(new Error(`HTTP ${res.statusCode} downloading ${targetUrl}`));
            }

            const total = parseInt(res.headers['content-length'] || '0', 10);
            let received = 0;
            let lastPct  = -1;

            res.on('data', (chunk: Buffer) => {
              received += chunk.length;
              if (total > 0) {
                const pct = Math.floor((received / total) * 100);
                if (pct !== lastPct && pct % 20 === 0) {
                  onProgress(`Downloading... ${pct}%`);
                  lastPct = pct;
                }
              }
            });

            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
            file.on('error', reject);
            res.on('error', reject);
          }
        ).on('error', reject);
      }

      follow(url);
    });
  }

  private async installMacos(
    version: string,
    assets: ReleaseAsset[],
    onProgress: (msg: string) => void
  ): Promise<string> {
    const arch      = process.arch === 'arm64' ? 'arm64' : 'x86_64';
    const assetName = `keeper-commander-mac-${arch}-v${version}.pkg`;
    const asset     = assets.find((a) => a.name === assetName);
    if (!asset) throw new Error(`Asset not found: ${assetName}`);

    const pkgPath = path.join(INSTALL_CACHE, assetName);

    if (fs.existsSync(pkgPath)) {
      onProgress('Using cached installer...');
    } else {
      await this.downloadWithProgress(asset.browser_download_url, pkgPath, onProgress);
    }

    onProgress('Running installer...');
    const result = spawnSync(
      'installer',
      ['-pkg', pkgPath, '-target', 'CurrentUserHomeDirectory'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`installer exited with status ${result.status}: ${result.stderr}`);
    }

    // The .pkg installs to ~/usr/local/keepercommandercli/ (user home, no sudo).
    // Create a symlink in ~/usr/local/bin/ and add it to PATH so the terminal can find it.
    const realBin = path.join(os.homedir(), 'usr', 'local', 'keepercommandercli', 'bin', 'keeper-commander');
    const symlink  = path.join(os.homedir(), 'usr', 'local', 'bin', 'keeper');
    fs.mkdirSync(path.dirname(symlink), { recursive: true });
    try { fs.unlinkSync(symlink); } catch { /* ok if not present */ }
    fs.symlinkSync(realBin, symlink);

    // Ensure ~/usr/local/bin is on PATH for future terminal sessions
    const pathExport = `export PATH="$HOME/usr/local/bin:$PATH"`;
    const zshrc      = path.join(os.homedir(), '.zshrc');
    const zshContent = fs.existsSync(zshrc) ? fs.readFileSync(zshrc, 'utf8') : '';
    if (!zshContent.includes(pathExport)) {
      fs.appendFileSync(zshrc, `\n# Added by Keeper Security VS Code Extension\n${pathExport}\n`);
    }

    onProgress('Verifying installation...');
    // Return the actual binary (not the symlink) for the most reliable path
    return realBin;
  }

  private async installWindows(
    version: string,
    assets: ReleaseAsset[],
    onProgress: (msg: string) => void
  ): Promise<string> {
    const assetName = `keeper-commander-windows-v${version}.exe`;
    const asset     = assets.find((a) => a.name === assetName);
    if (!asset) throw new Error(`Asset not found: ${assetName}`);

    const exePath = path.join(INSTALL_CACHE, assetName);

    if (fs.existsSync(exePath)) {
      onProgress('Using cached installer...');
    } else {
      await this.downloadWithProgress(asset.browser_download_url, exePath, onProgress);
    }

    onProgress('Running installer silently...');
    const result = spawnSync(exePath, ['/S'], { encoding: 'utf8', stdio: 'pipe' });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Installer exited with status ${result.status}`);
    }

    return 'keeper';
  }

  private async installLinux(
    version: string,
    onProgress: (msg: string) => void
  ): Promise<string> {
    const py = spawnSync('python3', ['--version'], { encoding: 'utf8' });
    if (py.status !== 0) throw new Error('python3 not found. Install Python 3 first.');

    const pkgSpec = `keepercommander==${version}`;
    onProgress(`Installing ${pkgSpec} via pip...`);

    let result = spawnSync('python3', ['-m', 'pip', 'install', '--user', pkgSpec], { encoding: 'utf8', stdio: 'pipe' });

    if (result.status !== 0) {
      onProgress('Retrying with --break-system-packages...');
      result = spawnSync(
        'python3',
        ['-m', 'pip', 'install', '--user', '--break-system-packages', pkgSpec],
        { encoding: 'utf8', stdio: 'pipe' }
      );
    }

    if (result.status !== 0) throw new Error(`pip install failed: ${result.stderr}`);

    return path.join(os.homedir(), '.local', 'bin', 'keeper');
  }
}
