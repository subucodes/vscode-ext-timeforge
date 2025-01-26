# Change Log

All notable changes to the "timeforge" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 25-01-2025

### Added
- **Timer Functionality**
  - Start, pause, and stop a countdown timer within VS Code.
  - Timer progress is displayed in the status bar.
  - Click interactions for pausing and stopping.
  - Blinking warning when time is almost up.

- **Database Integration**
  - Uses SQLite to log time-tracking sessions.
  - Tracks start time, elapsed time, and workspace association.
  - Persists session history for review.

- **User Interface**
  - Status bar item for real-time tracking.
  - Theming support for status bar color changes based on state.
  - Clickable status bar to control the timer.

- **Statistics & Insights**
  - Command to view total time spent per workspace.
  - Webview-based statistics panel with:
    - Heatmap visualization of time spent.
    - Yearly navigation for past records.
    - Table breakdown of workspace time logs.
    - Light and dark mode toggle
  - Total time spent across sessions displayed in a notification.

### Changed
- First public release, no changes yet

### Fixed
- No fixes yet, this is the initial release


[0.0.1]: https://github.com/subucodes/vscode-ext-timeforge/releases/tag/v0.0.1