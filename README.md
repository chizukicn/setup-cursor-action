# Setup Cursor Agent CLI Action

[![GitHub Actions][github-actions-src]][github-actions-href]
[![License][license-src]][license-href]

A GitHub Action for installing Cursor Agent CLI in GitHub Actions workflows. This action uses the official installation script to install Cursor Agent CLI and supports macOS and Linux platforms.

## Features

- 🚀 Uses official installation script to install Cursor Agent CLI
- 📦 Supports macOS and Linux platforms
- 🔧 Supports version specification
- ⚡ Uses GitHub Actions tool cache to speed up installation
- 🛠️ Provides installation path and version information
- 🔄 Automatically detects and uses cached versions
- 💬 Supports prompt input for AI task execution
- 🌊 Real-time streaming processing of cursor-agent output
- 🏗️ Modular architecture for easy extension and maintenance
- ❌ Does not support Windows (Cursor Agent CLI limitation)

## Usage

### Basic Usage

```yaml
- uses: chizukicn/setup-cursor-action@v1
```

### Specify Version

```yaml
- uses: chizukicn/setup-cursor-action@v1
  with:
    version: 'latest'
```

### Use Prompt

```yaml
- uses: chizukicn/setup-cursor-action@v1
  with:
    prompt: 'Help me analyze the code structure of this project'
```

### Use Environment Variable

```yaml
- uses: chizukicn/setup-cursor-action@v1
  env:
    CURSOR_PROMPT: 'Help me optimize the performance of this project'
```

### Use API Key

```yaml
- uses: chizukicn/setup-cursor-action@v1
  with:
    api-key: ${{ secrets.CURSOR_API_KEY }}
```

### Use API Key with Environment Variable

```yaml
- uses: chizukicn/setup-cursor-action@v1
  env:
    CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}
```

### Specify Model

```yaml
- uses: chizukicn/setup-cursor-action@v1
  with:
    model: 'gpt-4'
```

### Complete Example with All Parameters

```yaml
- uses: chizukicn/setup-cursor-action@v1
  with:
    prompt: 'Help me analyze the code structure of this project'
    api-key: ${{ secrets.CURSOR_API_KEY }}
    model: 'gpt-4'
```

### Complete Example: Code Analysis

```yaml
name: AI Code Analysis

on:
  push:
    branches: [main]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Cursor Agent CLI and Analyze Code
        uses: chizukicn/setup-cursor-action@v1
        with:
          prompt: 'Analyze the code quality of this project, identify potential issues and provide improvement suggestions'
          api-key: ${{ secrets.CURSOR_API_KEY }}
          model: 'gpt-4'
```

### Multi-platform Support

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest]

steps:
  - uses: chizukicn/setup-cursor-action@v1
    with:
      version: 'latest'

  - name: Verify Installation
    run: |
      cursor-agent --version
      echo "Cursor Agent CLI installed at: ${{ steps.setup-cursor-agent.outputs.cursor-agent-path }}"
      echo "Version: ${{ steps.setup-cursor-agent.outputs.cursor-agent-version }}"
```

## Input Parameters

| Parameter | Description | Required | Default |
|-----------|-------------|----------|---------|
| `version` | Cursor Agent CLI version to install | No | `latest` |
| `prompt` | Prompt to send to Cursor Agent CLI | No | `CURSOR_PROMPT` environment variable |
| `api-key` | Cursor API key for authentication | No | `CURSOR_API_KEY` environment variable |
| `model` | Model to use for Cursor Agent CLI | No | `auto` |

## Output Parameters

| Parameter | Description |
|-----------|-------------|
| `cursor-agent-path` | Path to the installed Cursor Agent CLI executable |
| `cursor-agent-version` | Version of the installed Cursor Agent CLI |

## Supported Platforms

- ✅ **macOS** (latest)
- ✅ **Linux** (Ubuntu latest)
- ❌ **Windows** (not supported by Cursor Agent CLI)

> **Note**: Windows is not supported because Cursor Agent CLI does not support Windows platform.

## Installation Notes

- **Permission Issues**: Automatically handles permission requirements on macOS and Linux
- **Installation Location**: Chooses appropriate installation directory (usually bin directory under user directory)
- **PATH Setup**: Automatically adds cursor-agent to PATH environment variable
- **Cache Optimization**: Uses GitHub Actions tool cache to speed up subsequent installations

## Cursor Agent CLI Usage

After installation, you can use Cursor Agent CLI directly in your workflow:

```yaml
- name: Run Cursor Agent CLI
  run: |
    cursor-agent --version
    cursor-agent "Help me review this code"
```

## Development

### Prerequisites

- Node.js 20+
- pnpm

### Installation

```bash
pnpm install
```

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for detailed changelog.

---

[github-actions-src]: https://github.com/chizukicn/setup-cursor-action/workflows/CI/badge.svg
[github-actions-href]: https://github.com/chizukicn/setup-cursor-action/actions
[license-src]: https://img.shields.io/badge/license-MIT-blue.svg
[license-href]: https://github.com/chizukicn/setup-cursor-action/blob/main/LICENSE
