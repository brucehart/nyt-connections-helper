# NYT Connections Helper

<p align="center">
  <img src="assets/logo.svg" width="132" alt="NYT Connections Helper logo">
</p>

NYT Connections Helper is a Chrome extension that recreates the behavior of the existing NYT Connections color-cycler userscript and adds configurable category settings.

## Features

- Cycles cards through NYT's native selected state and custom category colors.
- Adds bulk toolbar buttons for applying a category color to the currently selected cards.
- Lets you change the number of active categories, each category label, each category background color, and each category text color.
- Includes "Restore defaults" actions in both the popup and the options page. The defaults match the original userscript's four categories.

## Default Categories

1. Yellow - `#f9df6d`
2. Green - `#a0c35a`
3. Blue - `#b0c4ef`
4. Purple - `#ba81c5`

Each default category uses text color `#1d1d1d`.

## Load Unpacked

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select this repository root.

## Supported URLs

- `https://www.nytimes.com/games/connections*`
- `https://www.nytimes.com/crosswords/game/connections*`
