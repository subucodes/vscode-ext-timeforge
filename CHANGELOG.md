# Change Log

All notable changes to the "timeforge" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.5] - 2025-01-30

### Added
- Platform support for Mac and Linux. Earlier it was supporting only Windows


## [0.0.4] - 2025-01-28

### Changed
- Using grey banner instead of white which made the extension details invisible in the marketplace


## [0.0.3] - 2025-01-28

### Fixed
- Modules did not get bundled as part of extension publication. Fixed that.


## [0.0.2] - 2025-01-28

### Added
- Parallel workspace support. Many vscode instance can be opened parallelly and you can set timers and work. It gets recorded.

### Changed
- Using blue icon instead of white one.


## [0.0.1] - 2025-01-26

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
[0.0.2]: https://github.com/subucodes/vscode-ext-timeforge/releases/tag/v0.0.2
[0.0.3]: https://github.com/subucodes/vscode-ext-timeforge/releases/tag/v0.0.3
[0.0.4]: https://github.com/subucodes/vscode-ext-timeforge/releases/tag/v0.0.4
[0.0.5]: https://github.com/subucodes/vscode-ext-timeforge/releases/tag/v0.0.5