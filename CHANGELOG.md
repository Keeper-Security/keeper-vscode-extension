# Change Log

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
