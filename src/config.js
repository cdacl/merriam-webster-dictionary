/**
 * 全局配置：接口地址、词典列表、词性/词形映射
 *
 * Merriam-Webster 开发者文档：https://www.dictionaryapi.com/products/json
 */

// 查询接口：https://dictionaryapi.com/api/v3/references/{ref}/json/{word}?key={KEY}
var API_PREFIX = 'https://dictionaryapi.com/api/v3/references/';

// 发音资源：https://media.merriam-webster.com/audio/prons/{lang}/{country}/mp3/{subdir}/{audio}.mp3
var AUDIO_PREFIX = 'https://media.merriam-webster.com/audio/prons/';

// 支持的词典。ref 是接口路径里的词典标识；lang/country 只用于拼接发音地址
var DICTIONARIES = {
  collegiate: { ref: 'collegiate', lang: 'en', country: 'us', name: 'Collegiate' },
  thesaurus: { ref: 'thesaurus', lang: 'en', country: 'us', name: 'Thesaurus' }
};

// 词性缩写。词典面板空间有限，长词性统一转成常见缩写
var PART_OF_SPEECH = {
  noun: 'n.',
  verb: 'v.',
  adjective: 'adj.',
  adverb: 'adv.',
  pronoun: 'pron.',
  preposition: 'prep.',
  conjunction: 'conj.',
  interjection: 'interj.',
  article: 'art.',
  determiner: 'det.',
  numeral: 'num.',
  prefix: 'pref.',
  suffix: 'suf.',
  abbreviation: 'abbr.',
  trademark: 'tm.',
  'transitive verb': 'vt.',
  'intransitive verb': 'vi.',
  'auxiliary verb': 'aux.',
  'helping verb': 'aux.',
  'phrasal verb': 'phr. v.',
  'noun plural': 'n. pl.',
  'plural noun': 'n. pl.',
  'plural verb': 'v. pl.',
  'combining form': 'comb. form',
  'geographical name': 'geog.',
  'biographical name': 'biog.'
};

// 词形变化的显示名，用于词典面板的「其他词形」（都是英文词典术语）
var INFLECTION_NAMES = {
  plural: 'plural',
  singular: 'singular',
  'past tense': 'past',
  'past participle': 'past participle',
  'present participle': 'present participle',
  'present tense': 'present',
  'third-person singular': '3rd person sing.',
  comparative: 'comparative',
  superlative: 'superlative',
  imperative: 'imperative'
};

// 界面文案
var TEXT = {
  noKey: 'No API key set',
  noKeyHint: 'Add your Merriam-Webster API key in the plugin settings. You can get one for free at https://dictionaryapi.com',
  badKey: 'The API key is invalid or expired',
  noThesaurusKey: 'No thesaurus API key set',
  noThesaurusKeyHint: 'The Thesaurus needs its own key: generate a second key at https://dictionaryapi.com (it is not shared with the Collegiate key) and put it in the "Thesaurus API Key" setting',
  notSubscribed: 'This key is not subscribed to the selected dictionary',
  badKeyHint: 'Check the API key in the plugin settings, or get a new one at https://dictionaryapi.com',
  quota: 'Daily query limit reached',
  quotaHint: 'Each key allows 1,000 queries per day. You can request a second key at https://dictionaryapi.com',
  network: 'Network request failed',
  apiError: 'The response from Merriam-Webster could not be parsed',
  notFound: 'Not in the dictionary',
  notEnglish: 'Merriam-Webster is an English dictionary: only English words can be looked up',
  empty: 'Nothing to look up',
  configLink: 'https://bobtranslate.com/plugin/',
  keyLink: 'https://dictionaryapi.com/products/api-collegiate-dictionary'
};

module.exports = {
  API_PREFIX: API_PREFIX,
  AUDIO_PREFIX: AUDIO_PREFIX,
  DICTIONARIES: DICTIONARIES,
  PART_OF_SPEECH: PART_OF_SPEECH,
  INFLECTION_NAMES: INFLECTION_NAMES,
  TEXT: TEXT
};
