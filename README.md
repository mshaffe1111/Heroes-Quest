# Heroes Quest
Turn based strategy game where you conquer the world.

Play it here (early test build): https://mshaffe1111.github.io/Heroes-Quest/

## What is here
- [`index.html`](https://github.com/mshaffe1111/Heroes-Quest/blob/main/index.html) and [`play/`](https://github.com/mshaffe1111/Heroes-Quest/tree/main/play) the playable game (title, new game wizard, painted map, city and battle screens, fog of war, computer realms, autosave). The built page is `play/game.js`; its source is in [`game/src`](https://github.com/mshaffe1111/Heroes-Quest/tree/main/game/src). Rebuild with `cd game && npm install && npm run build`.
- [`engine/`](https://github.com/mshaffe1111/Heroes-Quest/tree/main/engine) the rules engine: maps, armies, combat, heroes, quests, computer players, fog of war, doctrines, stats ledger, save and load, army orders. Source is in [`engine/src`](https://github.com/mshaffe1111/Heroes-Quest/tree/main/engine/src) and the tests in [`engine/test`](https://github.com/mshaffe1111/Heroes-Quest/tree/main/engine/test). Run them with `cd engine && npm install && npm test`.
- [`docs/`](https://github.com/mshaffe1111/Heroes-Quest/tree/main/docs) the [army guide](https://github.com/mshaffe1111/Heroes-Quest/blob/main/docs/Army_Guide.md) and the site that GitHub Pages serves.

## Branches
- `main` stable, always the latest finished work.
- `dev` work in progress.
