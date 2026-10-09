# Release Notes

## 0.3 - 2026-10-08

- Supports The Athletic's Connections: Sports Edition at `nytimes.com/athletic/connections-sports-edition`.
- Recognizes Sports Edition's selected tiles, its "Deselect" control, and image tiles that have no visible text.
- Ignores the checkbox click that follows a tile click, which could store a hidden color on a newly selected tile.
- Detects selection from tile classes instead of hidden checkboxes, which stay checked after Deselect and caused tiles to be colored instead of selected.
- Matches the helper buttons' font to the game's native controls.

## 0.2.3 - 2026-09-15

- Collapses ad-only containers identified by their visible advertisement label, including reserved outer space.
- Places helper buttons in their own row within the native controls, outside animated board layers.
- Preserves board dimensions and aligns column layouts to the top instead of forcing wrapper heights.

## 0.2.2 - 2026-09-15

- Places the helper toolbar immediately after the tile board.
- Collapses ad banners with advertiser links or close buttons while preserving Continue, Skip, and Play controls and dialogs.
- Removes reserved heights and excess spacing from intermediate game wrappers.

## 0.2.1 - 2026-09-15

- Waits for the playable board before hiding banners or compacting the page.
- Preserves ad containers with buttons and dialog content so the pre-game Continue control remains available.

## 0.2 - 2026-09-15

- Collapses recognized ad banners and their reserved slots on Connections pages.
- Reduces game wrapper spacing and packs helper and native controls closer together.
- Supports control buttons identified by their text when test IDs are unavailable.
- Keeps the inline helper toolbar below dialogs by removing its elevated stacking order.

## 0.1 - 2026-03-29

- Initial Chrome Web Store submission for NYT Connections Helper.
- Adds customizable category labels, tile colors, and text colors.
- Includes popup and options pages for managing category settings.
- Applies a branded extension logo and packaged store-ready icon set.
- Adds a privacy policy and stores extension settings in local-only Chrome storage.
- Clarifies that the extension is unofficial and not affiliated with or endorsed by The New York Times Company.
