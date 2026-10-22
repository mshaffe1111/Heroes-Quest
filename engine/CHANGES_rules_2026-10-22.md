# Build B rules: engine changes (engine_next, copied from engine_work on 2026-10-22)

The only things written outside `engine_next` are the test logs in `../engine_next_logs/`. Nothing was committed. Also new: `smoke.mjs`, a short all-computer smoke game.

## Changes, by item

### 1. City garrison limit 8
- `src/rules.js` DEFAULT_RULES: `cityGarrisonLimit` 32 to 8 (the same as `stackLimit`).
- `src/game.js` `hireHero`: refuses with `no-room` when the city already holds 8.
- `src/game.js` `rollHeroOffer`: the offered hero can only appear in a city with room (see item 5).
- `src/game.js` `placeQuestAlly`: room check uses `armyLimitAt` (city or square) instead of `stackLimit`.
- Already in place and now covered by tests: `moveGroup` (`stack-limit`), production (`production-stalled` / `garrison-full`), vectoring (waits on the road a turn while the target city is full), capture (the attacking group is 8 at most and the defenders are dead).
- `src/ai.js` new `roomFor`; `nearestOwnCity(g, realmId, from, need)` picks the nearest own city with room for the group; `runReturn` re-targets when its home is full or lost, and when no city has room it drops the group (the armies stay where they are) instead of trying again; `sendHome` asks for a city with room.

### 2. Healing in your own cities: 1 pip a turn
- `src/rules.js` `cityHeal` 2 to 1. Field Hospitals still adds 1 (`doctrines.js` text changed to "2 pips a turn instead of 1"); a Field Medic still adds his pip.

### 3. Out of gold
- `src/game.js` `beginTurn`: when the realm's gold is below zero after income and upkeep, every city with an order emits `{ type: 'production-stalled', city, reason: 'debt' }` and makes no progress (nothing starts or completes). Nothing deserts. Upkeep is still charged. Work resumes on the first turn that ends upkeep at or above zero. `realm.deficit` is unchanged.

### 4. The Unsworn default to Strong
- `src/mapgen/togame.js` `mapToGame`: `opts.neutrals` defaults to `'strong'`. `'normal'` and `'active'` still work; any other value throws. New exports `NEUTRAL_KINDS`.

### 5. Hero offers, heroes from ruins and quests
- `src/game.js` `rollHeroOffer`: checks the hero limit, the price and a city with room BEFORE the roll; a turn the realm cannot take a hero uses no random number and does not spend the chance. The roll order after that (chance, city, name) is unchanged.
- `src/game.js` new exports `joinHero(g, realmId, x, y)` (a free hero, needs the limit and room on the square) and `underHeroLimit(g, realmId)`; internal `heroCount`, `citiesWithRoom`, `joinHeroInCity`.
- `src/sites.js` `exploreRuin`: new outcome `'hero'` (weight 9 in `ruinRewardWeights`, about 1 in 12 of successful non-stronghold searches). Left out of the draw when the realm is at its hero limit or the ruin square is full. Returns `{ outcome: 'hero', army, name }`.
- `src/quests.js` `pickReward`: when the realm is under its hero limit and not poor, a `questHeroChance` (1/12) roll can make the reward `{ kind: 'hero' }`; new helper `roomForHero`. `finish` passes `out.hero` to game.js.
- `src/game.js` `placeQuestAlly`: places a quest-reward hero on the questing hero's square, else in the realm's first city with room, and pushes a `hero-joined` event; at the limit or with no room he is paid as 300 gold instead (same rule as an ally with no room).

### 6. Hero levels up to 9
- `src/rules.js`: `heroMaxLevel` 9; `heroXpThresholds` [0, 15, 30, 60, 100, 150, 210, 280, 360]; new `heroStrengthByLevel`, `heroMoveByLevel`, `heroExtraPipLevels` (old `heroStrengthPerLevel`, `heroMovePerLevel`, `heroExtraPipLevel` kept as fallbacks for older rule sets).
- `src/units.js`: new `heroLevelStrength`, `heroLevelMove`, `heroLevelPips`, `xpForNextLevel`; `heroCoreStrength`, `heroMove`, `maxPips` use them. `grantXp` is unchanged: one perk point per level gained (none in classic).
- `src/perks.js`: new `perksLeft(h)`; `offerPerks` returns `{ ok: false, reason: 'no-perks-left' }` and clears the spare points when a hero owns every offerable perk. There are 8 offerable perks and 8 level-ups (2 to 9), so there is exactly one choice per level; the last picks offer fewer than three because the shortlist is drawn only from perks he does not have.

### 7. Capture choices follow the approved Capture screen
- `src/economy.js`: new `sackedKind(city, rules)` and `captureOutcomes(city, rules)` (gold, kinds left, kind lost, razed for every choice, so the dialog can show the numbers and cannot drift from the rule); `applyCapture` now applies `captureOutcomes`.
  - Occupy: +0, keeps every kind.
  - Pillage: income x 8, keeps every kind (it used to lose a kind: that was Sack's effect).
  - Sack: income x 8 plus half the teaching cost (price x build x 10) of the kind it loses, which is its dearest kind. A city that builds nothing pays no more than Pillage (capped even if the multipliers are retuned). It used to strip every kind for income x 12.
  - Raze: income x 4 (it paid 0); no owner, no production, rebuild for 800.
  - The screen's example (14-gold city, 3 kinds) now gives +0 / +112 / +232 (with Heavy Cavalry as the dearest kind) / +56; the mock-up shows +0 / +120 / +260 / +60.
- `src/ai.js` `captureChoice` unchanged (pillage when gold is under 150, else occupy); it now keeps the whole city when it pillages.

### 8. Signature armies
- `src/armies.js`: new `SIGNATURE_ARMIES` (ivory pike, gold hcav, ember dwarf, crimson orc, verdant elf, azure grif, tidewatch lcav, ashen undead), `signatureOf`, `canRealmBuild`, and the marked HOOK `signatureBuildTurnsBonus` (returns 0) with a comment saying where strength and build-time perks would go.
- `src/doctrines.js` `buildTurns`: subtracts the hook (0 today).
- `src/economy.js` `validateProductionType(type, realmId)`: a realm may put its own signature army on a city's list even when it is a special type (the Ashen Undead). `armyUpkeep`: a special army a city built (`cityBuilt: true`) pays upkeep; allies from ruins, temples and quests stay free.
- `src/game.js` `addCity` and `addProductionType` pass the owner / realm to the check; `beginTurn` marks a city-built special army `cityBuilt`.
- `src/mapgen/togame.js`: `REALMS` entries carry `signature`; realms get `realm.signature`; new `withSignature` adds the signature army to each capital's list (free slot, else it replaces the dearest kind; 4 kinds at most); each capital starts with its hero (with the Standard) and 2 of its signature army (`START_SIGNATURE_ARMIES`) instead of the three cheapest kinds.

### 9. Rival count
- `src/mapgen/togame.js` `mapToGame(map, { realmIds })`: 2..8 distinct known realm ids, no more than the map has capitals (else throws; new export `realmIdsError` for the wizard, and `REALM_IDS`). `realmIds[k]` gets map capital k, so element 0 (the player) gets capital 0. Realms not listed are not created; their capitals, and any other cities the map gave them, become ordinary Unsworn cities (1-3 kinds, one Unsworn defender). `g.map.caps` lists only the capitals of realms that exist. Default: one realm per map capital in REALMS order (all 8 on an 8-realm map), as before.

## Tests changed, and why
- `test/game.test.js`
  - "pillage and sack give gold and damage production; raze burns the city" replaced by "capture follows the approved screen ...": the old test encoded the swapped Pillage/Sack effects and Raze paying 0.
  - New "capture outcomes: the screen example ... a city that builds nothing is never worth sacking".
  - "heroes level up at 15, 30 and 60 XP ... max level 4" replaced by "heroes level up to 9 ...": the old test asserted max level 4.
  - "a city may hold 32 armies, but only 8 can move or attack together" renamed "only 8 armies can move or attack together" (the body never tested 32).
- `test/heroes_sites.test.js`
  - "ruin rewards ...": the sage case used roll 0.95, which now falls in the new hero band; changed to 0.9 and the weights comment to 30/30/25/15/9.
  - "plunder quest ...": comment only (sack gold is now income x 8 + half a teaching cost).
- `test/quest_combat.test.js` "wounds heal only inside one of your own cities, two pips a turn" now one pip a turn (3 turns from 3 wounds to 0).
- `test/doctrines.test.js` "Field Hospitals: 3 pips a turn" now "2 pips a turn instead of 1".
- New `test/rules_b.test.js` (19 tests): garrison 8 (walking in, production, vectoring, hiring, capture, the computer's returning groups), healing, debt, Unsworn default, hero offers not wasted, heroes from ruins and quests, hero pips at levels 3 and 6, running out of perks, a perk point per level, signature armies and their start, Undead upkeep and building rights, the signature hook, realmIds and its validation.

## Results
- Every test file run alone (`node --test test/<name>.test.js`): ai 10/10, armies 4/4, combat 28/28, doctrines 13/13, fog 7/7, game 23/23, heroes_sites 20/20, mapgen 18/18, naval 19/19, orders 9/9, palette 3/3, quest_combat 27/27, rules_b 19/19, save 9/9, stack_move 9/9, stats 9/9, togame 14/14. Total: 241 passed, 0 failed. Logs are in `../engine_next_logs/`.
- Smoke games (`node smoke.mjs <seed> <rounds> [realmIds]`, all-computer, 60-city continent, new defaults), each with 0 errors and 0 over-limit squares:
  - seed 1, 10 rounds, 8 realms: 23 captures.
  - seed 2, 10 rounds, 3 realms (verdant, crimson, ashen): 6 captures.
  - seed 1, 40 rounds, 8 realms: 120 captures, 62 garrison-full stalls, 3 hero offers, no debt stalls (the computer avoids debt), highest hero level 2.

## PLACEHOLDER numbers (all in src/rules.js unless named)
- `heroXpThresholds` [0, 15, 30, 60, 100, 150, 210, 280, 360] (levels 2-4 unchanged).
- `heroStrengthByLevel` [5, 6, 7, 8, 8, 8, 9, 9, 9]: today's +1 a level to level 4, then a single point at level 7. Never faster than today's curve; the combat lab found heroes already very strong.
- `heroMoveByLevel` [14, 16, 18, 20, 21, 21, 22, 22, 23].
- `heroExtraPipLevels` [3, 6] (from COMBAT_DESIGN_DRAFT "4 pips, +1 at levels 3 and 6").
- `ruinRewardWeights.hero` 9 (of 109).
- `questHeroChance` 1/12.
- Quest hero with no room: 300 gold (game.js `placeQuestAlly`, same as the ally rule).
- `pillageGoldPerIncome` 8, `sackGoldPerIncome` 8, `sackShareOfLostKind` 0.5, `razeGoldPerIncome` 4.
- `START_SIGNATURE_ARMIES` 2 (mapgen/togame.js; Matt's decision, not really a guess).

## Could not do, or worth a decision
- Signature start balance: the starts are now very uneven. Two Undead (strength 7, 4 pips) or two Griffins (6, flying, upkeep 10 each) against two Orc Mobs (2) or two Light Cavalry (2). Upkeep at start ranges from 2 gold (Crimson) to 20 (Azure). Needs the combat lab with the signature perks.
- Capturing an Ashen city that builds Undead lets another realm build Undead there (production is kept on Occupy/Pillage). Decide whether a captured signature kind should be lost or kept.
- Passing through a full city: pathfinding does not know about square limits, so a group cannot walk THROUGH its own city holding 8 (the move stops with `stack-limit`). With 32 this almost never happened; with 8 it can, on roads through busy cities. The computer copes (it treats it as blocked and re-targets after 3 tries). Not changed, to keep Build A's pathfinding speed and results.
- `rebuildCity` still gives a rebuilt city no production (reviewer R-01 second half). Not in this list; untouched.
- Hero offers: no "not in the first turns" guard (R-07) and no temperament on the offer; not in this list.
- The page: the capture dialog should call `captureOutcomes` to show the gold; the wizard should pass `realmIds` and `neutrals`; the out-of-gold toast should use the `debt` stall. The engine side is ready; the web side was not touched.
- Saves made before this build carry their own rules object, so they keep the old numbers (32, heal 2, level 4) until a new game is started. The new code falls back safely on such a rules object: capture reads missing multipliers from DEFAULT_RULES (`captureOutcomes`), hero level tables fall back to the old per-level formulas, missing `heroExtraPipLevels` falls back to `heroExtraPipLevel`, and a missing `questHeroChance` / ruin `hero` weight simply means no hero rewards.
