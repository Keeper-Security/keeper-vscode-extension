# Keeper Security VS Code Extension

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Usage](#usage)
- [Secret Reference Format](#secret-reference-format)
- [Extension Settings](#extension-settings)
- [Troubleshooting](#troubleshooting)
- [Common Issues](#common-issues)
- [License](#license)

## Overview

A comprehensive VS Code extension that integrates Keeper Security vault functionality
directly into the development workflow. The extension provides secure secret management 
capabilities including saving, retrieving, generating, and running commands with secrets from Keeper Security vault.

The goal is to enable developers to manage secrets securely without leaving their development environment, while maintaining the highest security standards and providing seamless integration with existing Keeper Security infrastructure.

## Features

- **Secret Management**: Save, retrieve, and generate secrets directly from VS Code
- **Secret Detection**: Automatically detect potential secrets in .env file
- **Secure Execution**: Run commands with secrets injected from Keeper Security
- **Multiple Authentication Methods**: Base64, Token authentication
- **Error Handling**: Graceful error handling with helpful messages
- **CodeLens Integration**: Provide inline prompts for secret management

## Prerequisites

- **Keeper Secrets Manager access** (See the [Quick Start Guide](https://docs.keeper.io/en/keeperpam/secrets-manager/quick-start-guide) for more details)
  - Secrets Manager add-on enabled for your Keeper subscription
  - Membership in a Role with the Secrets Manager enforcement policy enabled
- A Keeper [Secrets Manager Application](https://docs.keeper.io/en/keeperpam/secrets-manager/about/terminology#application) with secrets shared to it 
  - See the [Quick Start Guide](https://docs.keeper.io/en/keeperpam/secrets-manager/quick-start-guide#2.-create-an-application) for instructions on creating an Application
- An initialized Keeper [Secrets Manager Configuration](https://docs.keeper.io/en/keeperpam/secrets-manager/about/secrets-manager-configuration)
  - VS Code extension accepts Base64, Token format configurations

- System Requirements
  - **Node.js**: 18.0.0 or later
  - **VS Code**: 1.99.0 or later

## Setup

### Install the extension

From the VS Code Marketplace or GitHub install the latest version of the extension.


## Usage

### Authentication

The extension supports two authentication methods for connecting to Keeper Security:

#### 1. Base64 Configuration Authentication

This method uses a base64-encoded configuration string that contains your Keeper Security credentials.

**Steps:**
1. Open VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type `Keeper Security: Authenticate` and select it
3. Choose "base64" from the authentication method dropdown
4. Enter your base64 configuration string

#### 2. Token Authentication

This method uses a one-time token for authentication.

**Steps:**
1. Open VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type `Keeper Security: Authenticate` and select it
3. Choose "token" from the authentication method dropdown
4. Enter your one-time token

### Available Commands

Once authenticated, you can access the following commands through the Command Palette:

| Command | Description |
|---------|-------------|
| **Save in Keeper Security** | Save selected text as secret in vault saveValueToVault` |
| **Get from Keeper Security** | Insert existing secrets from vault getValueFromVault` |
| **Generate Password** | Generate and store secure passwords |
| **Run Securely** | Execute commands with injected secrets |

### Command Details

#### Save Secrets in Keeper Vault

1. **Using Command Palette**

    **Purpose**: Save selected text as a secret in Keeper Security vault and replace it with a reference.

    **Steps**:
    1. Select text containing a secret (password, token, API key)
    2. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
    3. Type `Keeper Security: Save in Keeper Vault` and select it
    4. Extension will authenticate with Keeper Security (if needed)
    5. Extension creates new item in Keeper vault
    6. Selected text is replaced with secret reference (`keeper://...`)
    7. User receives confirmation of successful save

    **Example**:
    ```javascript
    // Before: Selected text
    const apiKey = "sk-1234567890abcdef";

    // After: Replaced with reference
    const apiKey = "keeper://vault/api-keys/openai";
    ```

2. Detect Secrets Automatically

    **Purpose**: Automatically detect potential secrets in your code for easy identification and securing.

    **Features**:
    - Extension scans files for known secret patterns
    - Provides CodeLens for detected secrets
    - CodeLens shows `Save in Keeper Security` option
    - Different detection rules for `.env` files vs regular code files
    - Click CodeLens to save detected secret

    **Example Detection Patterns**:
    - API keys: `sk-`, `pk_`, `Bearer `, etc.
    - Passwords: `password`, `passwd`, `pwd`
    - Tokens: `token`, `secret`, `key`
    - Environment variables: `API_KEY`, `SECRET_`, `PASSWORD`

#### Retrieve Secrets from Keeper Vault

**Purpose**: Insert existing Keeper Security secrets into your code without exposing actual values.

**Steps**:
1. Open Command Palette
2. Type `Keeper Security: Get from Keeper Vault` and select it
3. Extension shows list of available Keeper items
4. Select specific item and field
5. Extension inserts secret reference at cursor position

**Reference Format**: `keeper://vault/item/field`

**Example**:
```javascript
// Cursor position before command
const databasePassword = |

// After selecting from vault
const databasePassword = keeper://vault/database/production/password
```

#### Generate New Random Password

**Purpose**: Generate secure passwords and store them in Keeper Security without leaving VS Code.

**Steps**:
1. Open Command Palette
2. Type `Keeper Security: Generate Password` and select it
3. Provide name for new item (e.g., "Database Password", "API Key")
4. Extension creates item in Keeper vault
5. Extension inserts secret reference at cursor position

**Generated Password Features**:
- Cryptographically secure random generation
- Configurable length and complexity
- Automatic storage in Keeper vault
- Reference format: `keeper://vault/generated/[item-name]`

#### Run Commands Securely

**Purpose**: Run commands with secrets injected from Keeper Security for secure application execution.

**Steps**:
1. Open Command Palette
2. Type `Keeper Security: Run Securely` and select it
3. Extension reads `.env` file with `keeper://` references
4. Extension resolves secrets from Keeper vault
5. Extension creates isolated terminal with injected secrets
6. User can run any command with secrets available as environment variables

**Example `.env` file**:
```env
DATABASE_URL=keeper://vault/database/production/url
API_KEY=keeper://vault/api/keys/openai
SECRET_TOKEN=keeper://vault/tokens/jwt
```

**Usage**:
```bash
# Secrets are automatically available as environment variables
npm start
# DATABASE_URL, API_KEY, SECRET_TOKEN are injected
```

### Secret Reference Format

Visit [Keeper Notation](https://docs.keeper.io/en/keeperpam/secrets-manager/about/keeper-notation) Docs. for more information

### Extension Settings 

The extension provides debug configuration options:

1. Open VS Code Settings (`Ctrl+,` / `Cmd+,`)
2. Search for "Keeper Security"
3. Enable "Debug" to see detailed logging information

**Note:** Debug mode requires reloading the extension to take effect.

## Troubleshooting

### Debug Mode

Enable debug logging to see detailed information about extension operations:

1. Open VS Code Settings (`Ctrl+,` / `Cmd+,`)
2. Search for "Keeper Security"
3. Enable "Debug" option
4. Reload the extension (`Ctrl+Shift+P` → "Developer: Reload Window")

### Common Issues

#### 1. Authentication Failures

**Problem**: "Authentication failed" errors when trying to connect to Keeper Security

**Solutions**:
- Verify your base64 configuration string is complete and properly formatted
- Ensure your one-time token hasn't expired (tokens expire after use)
- Check your internet connection and firewall settings
- Verify your Keeper Security account has Secrets Manager access enabled

#### 2. Commands Not Available

**Problem**: Keeper Security commands don't appear in Command Palette

**Solution**: 
- Ensure you're authenticated first by running "Keeper Security: Authenticate"
- Reload VS Code window if commands still don't appear
- Check the extension is properly installed and activated

#### 3. Extension Not Loading

**Problem**: Extension fails to activate or shows errors

**Solutions**:
- Check VS Code version compatibility (requires 1.99.0 or later)
- Verify Node.js version (requires 18.0.0 or later)
- Check the Output panel for detailed error messages
- Try reinstalling the extension

#### 5. Secret Detection Not Working

**Problem**: CodeLens doesn't appear for potential secrets

**Solutions**:
- Ensure the file is saved and recognized by VS Code
- Check that the secret patterns match the detection rules
- Reload the extension if detection stops working
- Verify the file type is supported (.js, .ts, .env, etc.)

#### 6. Secret References Not Resolving

**Problem**: `keeper://` references don't resolve to actual values

**Solutions**:
- Ensure you're authenticated with Keeper Security
- Verify the reference format is correct
- Check that the referenced item exists in your vault
- Ensure the field name matches exactly

#### 7. Run Securely Command Issues

**Problem**: Commands don't have access to injected secrets

**Solutions**:
- Verify your `.env` file contains valid `keeper://` references
- Ensure all referenced secrets exist in your vault
- Check that the terminal is created by the extension
- Verify the extension has permission to create terminals

## License

This module is licensed under the MIT.