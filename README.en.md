# Merriam-Webster Dictionary for Bob

[中文说明](README.md) · English

Look up Merriam-Webster entries right inside [Bob](https://bobtranslate.com): headwords, phonetics, real audio, English definitions, example sentences, inflections, etymology, and synonyms / antonyms.

Data comes from the [Merriam-Webster Dictionary API](https://www.dictionaryapi.com/products/json). The plugin itself collects and uploads nothing.

## Features

- **Dictionary panel**: headword, phonetics (tap to play), definitions grouped by part of speech, inflections (plural / past / comparative…, each with its own phonetics), etymology and first known use.
- **Separator**: when the panel and the full entry are shown together, the full entry starts with a horizontal rule so the two blocks do not run into each other.
- **Full entry**: the whole entry as Markdown — sense numbers (1 a, b, 2 a…), usage labels, example sentences, run-on entries.
- **Markdown structure**: entries are `###` headings; part-of-speech dividers, usage notes, related words and cross-references are `####` headings; examples are block quotes (`> *good news*`); homographs of the same word are separated by horizontal rules.
- **Usage notes**: usage guides such as *Good vs. Well* for `good`, and synonym discussions, are rendered as their own sections after the definitions.
- **See also**: `see also` cross-references from the entry.
- **Only the word you asked for**: Merriam-Webster returns `best`, `better`, `good and` and more alongside `good`. The plugin keeps only the entries whose headword matches the query, so they never leak into the panel.
- **Two dictionaries**: Collegiate (default) and Collegiate Thesaurus, switchable in Settings.
- **Thesaurus**: pick the thesaurus to get synonyms, antonyms, related words and near antonyms (`syn_list` / `ant_list` / `rel_list` / `near_list`).
- **English only output**: no localized labels anywhere — the panel and the entry use Merriam-Webster's own terminology (`comparative`, `Etymology`, `Synonyms`…).
- **Did you mean**: a misspelled word gets Merriam-Webster's suggestions in the panel's *Did you mean* block, one word per line, each clickable — tap one to look it up again.
- **Local cache**: responses are cached in the plugin sandbox, so repeated lookups do not spend your daily quota.

> **About Markdown**: headings, block quotes and horizontal rules need Bob 1.21.0+ on macOS 13+. Older versions fall back to plain text (levels shown with `·` and indentation); the content is the same. Rendering can be turned off in *Preferences → Translation → Markdown*.

> **About audio**: the playable pronunciation buttons come from the panel's `phonetics` field, so they can only sit next to the headword; inflections (better / best…) carry their phonetics as text. Audio cannot be played from the Markdown entry.

> **About usage guides**: the plugin reads the `usages` / `syns` fields of the API. A few articles that exist only on the Merriam-Webster website (such as standalone Usage Guide pages) are not part of the API response and therefore cannot be shown.

> This is an **English-to-English dictionary** plugin: it returns Merriam-Webster's definitions, not translations. Looking up `good` gives you *of a favorable character or tendency*, not a translation.

## Installation

1. Download
   [`merriam-webster-dictionary-1.1.1.bobplugin`](https://github.com/cdacl/merriam-webster-dictionary/releases/download/v1.1.1/merriam-webster-dictionary-1.1.1.bobplugin)
   from [Releases](https://github.com/cdacl/merriam-webster-dictionary/releases/latest).
2. Double-click it to install (or drag it into Bob's Plugins page).
3. Go to Bob → Plugins → Merriam-Webster Dictionary → Settings and enter your API key.

The plugin declares an `appcast`, so Bob will offer updates on the plugin page.
The repository is also tagged `bobplugin`, which makes it discoverable in the
[GitHub bobplugin list](https://github.com/topics/bobplugin).

Manual install: copy `info.json`, `main.js`, `icon.png` and `src/` from this repository into
`~/Library/Application Support/Bob/Plugins/com.cdacl.bobplugin.merriamwebster/`.

## Getting an API key

The Merriam-Webster API requires a key:

1. Sign up at <https://dictionaryapi.com/register/index>.
2. On your account page, request the **Collegiate Dictionary** and/or **Collegiate Thesaurus** keys. **Each dictionary has its own key.**
3. Copy the key into the plugin settings.

If the plugin says *"This key is not subscribed to the selected dictionary"*, the key is fine but does not cover the dictionary chosen in Settings — request a key for it at dictionaryapi.com, or switch back to a dictionary the key does cover.

A free key allows **1,000 queries per key per day** and is for non-commercial use only; for commercial use or higher volume, license it from Merriam-Webster.
If the plugin says the key is invalid or expired, it usually has a stray space or belongs to a different dictionary.

Keys are bound to a specific dictionary; using one with the wrong dictionary makes the plugin report *not subscribed*.

Settings has two key fields: **API Key** for the main dictionary, and **Thesaurus API Key** which is only used when the dictionary is set to the thesaurus. With both filled in, you can switch dictionaries without swapping keys.

## Settings

| Setting | Description |
| --- | --- |
| API Key | Key for the Collegiate Dictionary, stored in Bob's local settings (secure field). |
| Thesaurus API Key | Only used when the dictionary is set to the thesaurus; the two keys are not interchangeable, and a missing key is reported. |
| Dictionary | Collegiate (default) / Thesaurus. |
| Result layout | Panel + full entry (default) / panel only / full entry only. |
| Examples | Whether to show example sentences in the entry. |
| Cache lifetime | 1 / 7 (default) / 30 days, or off. |

## What you can look up

- Single English words and the phrases the dictionary covers (for example `give up`, `in spite of`).
- Case fallback: if `paris` misses, `Paris` is tried.
- Chinese, Japanese or Korean input is rejected immediately with a note that Merriam-Webster is an English dictionary, so no quota is wasted.

## Project layout

```
.
├── info.json               Plugin metadata and settings definition
├── main.js                 Entry point: supportLanguages / translate / pluginValidate
├── icon.png                Plugin icon (256×256)
├── src
│   ├── api.js              Requests, error mapping, cached lookups
│   ├── cache.js            JSON cache in the plugin sandbox
│   ├── config.js           Endpoints, dictionary list, POS abbreviations, copy
│   ├── markup.js           Renders Merriam-Webster markup ({bc} {it} {dxt|…} …)
│   ├── parse.js            API JSON → entry model
│   ├── render.js           Entry model → Markdown entry / panel data
│   └── utils.js            Version comparison, text helpers
├── test
│   ├── run.js              Node unit tests (mocked Bob environment)
│   └── fixtures            Sample API responses with real structure
└── build
    ├── gen_icon.py         Generates the icon
    └── package.sh          Packages the .bobplugin
```

The plugin runs in Bob's JavaScriptCore: no Node, no browser APIs — only Bob's injected
globals (`$http`, `$option`, `$file`, `$data`, `$env`…) and its own `require`.

## Development

```bash
# Unit tests (mock $http / $option / $file / $data / $env)
node test/run.js

# Live API run (the key is read from an environment variable, never committed)
MW_KEY=your-key node test/live.js good run little

# Regenerate the icon
python3 build/gen_icon.py

# Build the package
bash build/package.sh
```

To debug in Bob, rename the plugin folder so it ends with `.bobplugin` and double-click it —
Bob loads it in debug mode, which makes `$log` output easy to follow.

## License and notices

- Plugin code: MIT.
- Entry data is copyright Merriam-Webster; API use is subject to the
  [Merriam-Webster API terms](https://dictionaryapi.com/products/api-collegiate-dictionary).
- Public distribution of this plugin (including an app store listing) must follow
  Merriam-Webster's brand guidelines — please confirm the scope of your license if you redistribute it.

## Changelog

### 1.1.1

- Usage notes (`uns`) follow the website's layout: when they directly follow the definition text, or are the only thing in the sense, they stay on the same line prefixed with `→` (as in `good` 1 b (8), 1 d (3), 1 f (4)); when they come after example sentences they get their own line (as in `good` 1 f (1)) together with their own examples. Previously the arrow was lost, or the note was folded into the definition text unconditionally.
- Gray badges: usage labels (`archaic`, `chiefly British`, `often attributive`), sense registers (`sports`, `informal`) and form labels (`plural`) are rendered as inline code, which Bob draws on a light gray background, matching the website. Plain-text mode drops the backticks.
- Sense-level inflections now sit right after the sense number (`a(1) waters ˈwȯ-tərz ˈwä- plural : …`) instead of being parenthesized at the end of the definition.
- Cross-references (compare / see also …) use `→` (the website shows an arrow icon there); `specifically` / `especially` / `also` notes become paragraphs without bullet points in Markdown.

### 1.1.0

- Reworked the full entry for Bob 1.21.0's Markdown renderer: part-of-speech dividers, usage notes, related words and see-also become `####` headings, examples become block quotes, homographs are separated by horizontal rules, and list labels (synonyms, antonyms…) are bold.
- Bob older than 1.21.0 keeps the plain-text layout with the same content.

### 1.0.0

- Dictionary panel plus full entry: headword, phonetics (tap to play), definitions grouped by part of speech, examples, inflections (with their own phonetics), etymology, first known use, usage notes, see also.
- Two dictionaries: Collegiate and Thesaurus, with a separate key field for the thesaurus.
- Fully English output, no localized labels.
- Misspellings surface Merriam-Webster's suggestions in the panel's *Did you mean*, one word per line, click to look up.
- Local cache (7 days by default) and categorized errors (missing key / invalid key / not subscribed / quota exceeded / network failure).
