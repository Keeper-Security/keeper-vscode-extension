# Change Log

## 2.2.0

- **Security fixes**:
  - **Save in Keeper Security** and **Generate Password** now escape backslashes and double quotes in record titles, field values, and folder UIDs before building `record-add` / `nsf-record-add` arguments. Repository-controlled secret text (e.g. from a malicious `.env` or source file) can no longer break out of quoted Commander arguments and inject additional CLI flags such as `--title=` when the extension writes to the persistent Commander shell.
  - Reject control characters in record-add field data before the command is sent to Keeper Commander.

## 2.1.0

- **Nested Share Folder Support** (In CLI mode): Added support for Keeper's new nested share folders alongside classic folders.
  - Folder picker now distinguishes between `(Nested Share Folder)` and `(Classic Folder)` folders.
- **Permission Model Selection in My Vault** (In CLI mode): When the current storage is `My Vault` (root), `Generate Password` and `Save Value to Vault` now prompt the user to choose between:
  - `Use classic permission model` — creates the record with classic permission model.
  - `Use new permission model` — creates the record with new permission model.
- **Combined Record Listing for My Vault** (In CLI mode): **Get from Keeper Security** fetches both classic and nested share folder records and shows them together in a single list when current storage is `My Vault`.
- **Security fixes**:
  - Reject Keeper references containing line breaks or other control characters in `.env` files used by the `Run Securely` command.
  - Validate Keeper record UIDs and arguments passed to Keeper Commander, rejecting values that contain control characters or unsafe characters.
  - Hardened `createKeeperReference` and `validateKeeperReference` to reject record UIDs that are not URL-safe base64 tokens.
  - The legacy Keeper Commander executor now spawns the CLI directly via `execFile` with a tokenized argv instead of `exec` with a concatenated command string. No shell is involved, so shell metacharacters in arguments cannot be interpreted as syntax even if they bypass upstream validation. The persistent-process path already used this model; the legacy path now matches it.
  - Declared `capabilities.untrustedWorkspaces.supported = false` so the extension is disabled by default in VS Code Restricted Mode. The Run Securely command parses workspace `.env` files and invokes a local CLI; running in untrusted workspaces is not safe.
- **Performance**:
  - Faster authentication check: replaced the `this-device` probe with `login-status`, which is significantly quicker for vaults with large amounts of data. Auth-check timeout extended to 5 minutes for slow networks/setups.
  - `sync-down` is now invoked with `--force` so that the latest records are always fetched when retrieving folders or records.
- **Dependencies**:
  - Bumped `webpack` to `^5.105.2`.
  - Added overrides for `diff` and `serialize-javascript` to address transitive vulnerabilities.

## 2.0.1

- **Security**: Updated dependencies to address known vulnerabilities:
  - Fixed high-severity issues in `@isaacs/brace-expansion`, `glob`, `jws`, `qs`, and `tar-fs`
  - Fixed moderate-severity issues in `js-yaml`, `lodash`, and `undici`

## 2.0.0

- **Dual Mode Support**: Added support for two modes of operation:
  - **CLI Mode**: Uses Keeper Commander CLI (original mode)
  - **KSM Mode**: Uses Keeper Secrets Manager (new mode)
- **Mode Switching**: Added commands to switch between CLI and KSM modes for the current workspace:
  - `Switch to CLI` command (available in KSM mode)
  - `Switch to KSM` command (available in CLI mode)
- **KSM Authentication**: Added `Authenticate` command for KSM mode with support for multiple authentication methods:
  - One-Time Access Token
  - Base64 encoded configuration string
  - JSON configuration file
- **KSM Mode Feature Parity**: KSM mode supports all the same functionality as CLI mode, including:
  - Save, retrieve, and generate secrets
  - Secret detection with codelense feature
  - Secure execution with injected secrets
  - Choose folder for organizing secrets
  - Comprehensive logging and debugging

## 1.0.1

- Enabled browsing of environment files and added functionality to remember the last executed command in the Run Securely feature.
- Bug fixes

## 1.0.0

- Initial release of Keeper Security VS Code Extension
- Secret management: save, retrieve, and generate secrets
- Secret detection with codelense feature
- Secure execution with injected secrets
- Comprehensive logging and debugging
