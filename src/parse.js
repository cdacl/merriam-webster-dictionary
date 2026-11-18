/**
 * 把 Merriam-Webster 返回的 JSON 解析成插件内部使用的数据结构
 *
 * 顶层结构参考：https://www.dictionaryapi.com/products/json#sec-3
 * 每一条词条（entry）包含 meta / hom / hwi / fl / lbs / ins / def / et / date 等字段，
 * def 里的 sseq 是由 sense、sen、bs、pseq 组成的嵌套数组，是解析的重点。
 */

var Config = require('./config.js');
var Markup = require('./markup.js');
var Utils = require('./utils.js');

// 拼接真人发音地址
// 规则：https://media.merriam-webster.com/audio/prons/{lang}/{country}/mp3/{subdir}/{audio}.mp3
// subdir：以 bix 开头 → bix；以 gg 开头 → gg；以数字或标点开头 → number；否则首字母
function audioURL(filename, dictionary) {
  if (!filename) return '';
  var audio = String(filename).replace(/\.(mp3|wav|ogg)$/i, '').toLowerCase();
  if (!audio) return '';
  var subdir;
  if (audio.indexOf('bix') === 0) {
    subdir = 'bix';
  } else if (audio.indexOf('gg') === 0) {
    subdir = 'gg';
  } else if (/^[a-z]/.test(audio)) {
    subdir = audio.charAt(0);
  } else {
    subdir = 'number';
  }
  var dict = dictionary || { lang: 'en', country: 'us' };
  return (
    Config.AUDIO_PREFIX +
    dict.lang + '/' + dict.country + '/mp3/' + subdir + '/' +
    audio + '.mp3'
  );
}

// 把字符串或对象数组统一成文本数组
function toTextList(value) {
  if (!value) return [];
  if (typeof value === 'string') return value ? [value] : [];
  var out = [];
  (Array.isArray(value) ? value : [value]).forEach(function (item) {
    var text = Utils.textOf(item);
    if (text) out.push(text);
  });
  return out;
}

// 同义词/反义词分组：[[{wd: 'a'}, {wd: 'b'}]] → ['a', 'b']
function parseWordGroups(groups) {
  var out = [];
  if (!groups) return out;
  (Array.isArray(groups) ? groups : [groups]).forEach(function (group) {
    if (!group) return;
    if (typeof group === 'string') {
      out.push(group);
      return;
    }
    (Array.isArray(group) ? group : [group]).forEach(function (word) {
      var text = typeof word === 'string' ? word : (word && word.wd) || '';
      if (text) out.push(text);
    });
  });
  return Utils.uniqueList(out);
}

// 词形变化：[{il: 'plural', if: 'goods', prs: [...]}]
// → [{name: '复数', value: 'goods', pronunciations: [...]}]
// 像 good 的 better / best 会自带音标和发音，这里一并解析出来
function parseInflections(list, dictKey) {
  var out = [];
  (list || []).forEach(function (item) {
    if (!item) return;
    var value = Utils.textOf(item['if'] || item.l || '');
    if (!value) return;
    var label = Utils.textOf(item.il || '');
    // 同一个形式重复出现（例如 run 的 ins 里既有带限定语的 run，又有裸 run）只留第一次
    var previous = out[out.length - 1];
    if (previous && !label && previous.value === value) return;
    out.push({
      name: Config.INFLECTION_NAMES[label] || (label === 'or' ? 'or' : label),
      value: value,
      raw: label,
      // spl 是词形本身的性质（例如 plural），官网上显示成灰色底的小标签
      label: Utils.textOf(item.spl || ''),
      pronunciations: parsePronunciations(item.prs, dictKey)
    });
  });
  return out;
}

// 发音：[{mw: 'ˈgu̇d', sound: {audio: 'good01'}}]
function parsePronunciations(list, dictKey) {
  var dictionary = Config.DICTIONARIES[dictKey] || Config.DICTIONARIES.collegiate;
  var out = [];
  (list || []).forEach(function (item) {
    if (!item) return;
    var notation = String(item.mw || '').replace(/^\\+|\\+$/g, '').trim();
    if (!notation) return;
    var audio = item.sound && item.sound.audio ? String(item.sound.audio) : '';
    out.push({
      text: notation,
      label: Utils.textOf(item.l || ''),
      labelAfter: Utils.textOf(item.l2 || ''),
      pun: Utils.textOf(item.pun || ''),
      audio: audio,
      url: audioURL(audio, dictionary)
    });
  });
  return out;
}

// 把 [tag,payload] / [[tag,payload]…] / 更深的嵌套统一摊成一层对
function flattenPairs(payload) {
  var out = [];
  (payload || []).forEach(function (node) {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'string') {
      out.push(node);
      return;
    }
    out = out.concat(flattenPairs(node));
  });
  return out;
}

// 释义正文：dt 是由 text / vis / note 等组成的数组
function parseDefinitionText(dt) {
  var parts = [];
  (dt || []).forEach(function (pair) {
    if (!pair) return;
    var tag = pair[0];
    var payload = pair[1];
    if (tag === 'text') {
      if (typeof payload === 'string' && payload) parts.push({ t: 'text', v: payload });
    } else if (tag === 'vis') {
      var examples = [];
      (payload || []).forEach(function (item) {
        var text = item && item.t ? item.t : '';
        if (text) examples.push(text);
      });
      if (examples.length) parts.push({ t: 'vis', v: examples });
    } else if (tag === 'uns' || tag === 'snote' || tag === 'note') {
      // 这几种标签的 payload 可能是嵌套的 [tag, payload] 块，
      // 例如 ["uns", [[["text", "…"], ["vis", […]]]]]
      // 它们在 MW 网页上是独立的一行（用法说明），并带自己的例句，
      // 所以单独存成一个 note 部件，渲染时另起一段。
      var noteText = [];
      var noteExamples = [];
      if (Array.isArray(payload)) {
        parseDefinitionText(flattenPairs(payload)).forEach(function (part) {
          if (part.t === 'vis') noteExamples = noteExamples.concat(part.v);
          else if (part.t === 'text' || part.t === 'note' || part.t === 'label') noteText.push(part.v);
        });
      } else {
        var plain = Utils.textOf(payload);
        if (plain) noteText.push(plain);
      }
      var noteValue = Utils.collapse(noteText.join(' '));
      if (noteValue || noteExamples.length) {
        parts.push({ t: 'note', v: noteValue, examples: noteExamples });
      }
    } else if (tag === 'gl') {
      var label = Utils.textOf(payload);
      if (label) parts.push({ t: 'label', v: label });
    } else if (tag === 'gwds') {
      // 西班牙语词典里的 gloss words，形如 {gwc: 'country', gwd: 'campo'}
      var gwd = payload && payload.gwd ? payload.gwd : '';
      var gwc = payload && payload.gwc ? payload.gwc : '';
      if (gwd || gwc) {
        parts.push({ t: 'text', v: gwd + (gwc ? '（' + gwc + '）' : '') });
      }
    }
  });
  return parts;
}

// 单个义项
function parseSense(raw, dictKey) {
  if (!raw) return null;
  var sense = {
    sn: Utils.textOf(raw.sn || ''),
    labels: toTextList(raw.sls).concat(toTextList(raw.lbs)),
    parts: parseDefinitionText(raw.dt),
    pronunciations: parsePronunciations(raw.prs, dictKey),
    inflections: parseInflections(raw.ins, dictKey),
    sd: '',
    sdParts: null,
    syns: parseWordGroups(raw.syn_list),
    ants: parseWordGroups(raw.ant_list),
    related: parseWordGroups(raw.rel_list),
    near: parseWordGroups(raw.near_list),
    similar: parseWordGroups(raw.sim_list),
    opposites: parseWordGroups(raw.opp_list),
    subSenses: [],
    prefix: false
  };

  if (raw.sdsense) {
    sense.sd = Utils.textOf(raw.sdsense.sd || '');
    sense.sdParts = parseDefinitionText(raw.sdsense.dt);
  }

  (raw.subsenses || []).forEach(function (sub) {
    var parsed = parseSense(sub, dictKey);
    if (parsed) sense.subSenses.push(parsed);
  });

  return sense;
}

// 判断一个元素是不是 [tag, payload] 这样的「标签对」
function isPair(item) {
  return Array.isArray(item) && typeof item[0] === 'string';
}

// sseq：外层是「块」，块内是若干义项。
// pseq 的 payload 少一层，直接就是一串标签对，这里统一补成「只有一个块」。
// 义项编号的层级：1 / a / (1) 依次变深，用来判断某个 sen 标题下面该挂哪些义项
function senseLevel(sn) {
  var value = String(sn || '').trim();
  if (!value) return 0;
  if (value.charAt(0) === '(') return 3;
  if (/^[0-9]/.test(value)) return 1;
  if (/^[a-zA-Z]/.test(value)) return 2;
  return 1;
}

function flattenBlocks(parsed) {
  var out = [];
  (parsed || []).forEach(function (block) {
    out = out.concat(block);
  });
  return out;
}

// sen 元素没有自己的定义文本时是一个「标题义项」（例如 good 的 g / h），
// 它下面跟着的兄弟元素才是真正的内容，要收进 head.subSenses 里，否则会丢掉编号。
function isHeadingSen(tag, payload) {
  return tag === 'sen' && payload && !payload.dt && !payload.sdsense;
}

function parseSenseSequence(sseq, dictKey) {
  var blocks = [];
  var items = sseq || [];
  if (items.length && isPair(items[0])) items = [items];

  items.forEach(function (block) {
    if (!Array.isArray(block)) return;
    var senses = [];
    var heading = null;

    var push = function (list) {
      if (!list || !list.length) return;
      if (heading) {
        // 编号比标题更深才收进来，同层或更浅说明已经离开这个标题了
        var kept = [];
        list.forEach(function (sense) {
          if (senseLevel(sense.sn) > heading.level) {
            heading.subSenses = heading.subSenses.concat([sense]);
          } else {
            kept.push(sense);
          }
        });
        if (kept.length) {
          heading = null;
          senses = senses.concat(kept);
        }
      } else {
        senses = senses.concat(list);
      }
    };

    block.forEach(function (pair) {
      if (!isPair(pair)) return;
      var tag = pair[0];
      var payload = pair[1];
      if (isHeadingSen(tag, payload)) {
        var head = parseSense(payload, dictKey);
        if (head) {
          head.heading = true;
          head.level = senseLevel(head.sn);
          heading = head;
          senses.push(head);
        }
        return;
      }
      if (tag === 'sense' || tag === 'sen') {
        var sense = parseSense(payload, dictKey);
        if (sense) push([sense]);
      } else if (tag === 'bs') {
        // 绑定替代：先输出一段前缀文字，再输出下面的义项
        var prefix = payload && payload.sense ? parseSense(payload.sense, dictKey) : null;
        if (prefix) {
          prefix.prefix = true;
          push([prefix]);
        }
      } else if (tag === 'pseq') {
        // 圆括号编号的子义项序列
        push(flattenBlocks(parseSenseSequence(payload, dictKey)));
      }
    });
    if (senses.length) blocks.push(senses);
  });
  return blocks;
}

// def 字段：一个词条可以有多段释义（例如及物动词/不及物动词分开）
function parseDefinitions(def, dictKey) {
  var sections = [];
  (def || []).forEach(function (item) {
    if (!item) return;
    sections.push({
      divider: Utils.textOf(item.vd || ''),
      blocks: parseSenseSequence(item.sseq, dictKey)
    });
  });
  return sections;
}

// 派生词（uros）与短语动词（dros）
function parseRunOns(list, dictKey) {
  var out = [];
  (list || []).forEach(function (item) {
    if (!item) return;
    var word = item.drp || item.ure || '';
    word = Markup.cleanHeadword(word);
    if (!word) return;
    out.push({
      word: word,
      partOfSpeech: Utils.textOf(item.fl || item.gram || ''),
      labels: toTextList(item.rsl),
      pronunciations: parsePronunciations(item.prs, dictKey),
      sections: parseDefinitions(item.def, dictKey)
    });
  });
  return out;
}

// 注记（usage notes 等）
function parseNotes(list) {
  var out = [];
  (list || []).forEach(function (item) {
    if (!item) return;
    var text = Utils.textOf(item);
    if (text) out.push(text);
  });
  return out;
}

// 「see in addition」引用：[{uaref: 'text|id'}]
function parseUarefs(uarefs) {
  var out = [];
  if (!uarefs || !uarefs.uaref) return out;
  var list = Array.isArray(uarefs.uaref) ? uarefs.uaref : [uarefs.uaref];
  list.forEach(function (item) {
    var text = Utils.textOf(item);
    if (!text) return;
    var fields = text.split('|');
    out.push((fields[0] || '').trim());
  });
  return out;
}

/**
 * 用法说明（usages）与同义词辨析（syns）这类「标题 + 段落 + 例句」的内容，
 * 结构上都是 [{pl: 标题, pt: [[tag, payload]...], uarefs: {...}}]
 */
function parseParagraphs(list) {
  var out = [];
  (list || []).forEach(function (item) {
    if (!item) return;
    var title = Utils.textOf(item.pl || '');
    var parts = parseDefinitionText(item.pt);
    var refs = parseUarefs(item.uarefs);
    if (title || parts.length || refs.length) {
      out.push({ title: title, parts: parts, refs: refs });
    }
  });
  return out;
}

// 日期字段：before 12th century{ds|t|1|a|1} —— 去掉义项标记，单独保存
function parseDate(raw) {
  if (!raw) return { text: '', sense: '' };
  var text = String(raw);
  var sense = '';
  var match = text.match(/\{ds\|[^{}]*\}/);
  if (match) {
    var fields = match[0].replace(/^\{|\}$/g, '').split('|');
    var number = (fields[2] || '') + (fields[3] || '');
    if (fields[4]) number += '(' + fields[4] + ')';
    sense = number;
    text = text.replace(match[0], '');
  }
  return { text: Utils.collapse(text), sense: sense };
}

// 词源：et 是 [{...}] 或 [[tag, payload]]
function parseEtymology(et) {
  if (!et) return '';
  var chunks = [];
  (Array.isArray(et) ? et : [et]).forEach(function (item) {
    if (Array.isArray(item)) {
      if (item[0] === 'text' && typeof item[1] === 'string') chunks.push(item[1]);
    } else if (typeof item === 'string') {
      chunks.push(item);
    } else if (item && typeof item.text === 'string') {
      chunks.push(item.text);
    }
  });
  return chunks.join('').trim();
}

/**
 * 解析单条词条
 */
function parseEntry(raw, dictKey) {
  if (!raw || typeof raw !== 'object') return null;
  var meta = raw.meta || {};
  var headword = raw.hwi || {};
  var word = Markup.cleanHeadword(headword.hw || meta.id || '');
  if (!word) return null;

  var date = parseDate(raw.date);

  return {
    id: Utils.textOf(meta.id || ''),
    homograph: raw.hom || 0,
    word: word,
    partOfSpeech: Utils.textOf(raw.fl || raw.gram || ''),
    labels: toTextList(raw.lbs).concat(toTextList(raw.sls)),
    pronunciations: parsePronunciations(headword.prs, dictKey),
    variants: (raw.vrs || []).map(function (item) {
      return { label: Utils.textOf(item.vl || ''), word: Utils.textOf(item.va || '') };
    }),
    alternateHeadwords: toTextList(raw.ahws),
    inflections: parseInflections(raw.ins, dictKey),
    sections: parseDefinitions(raw.def, dictKey),
    runOns: parseRunOns(raw.uros, dictKey),
    definedRunOns: parseRunOns(raw.dros, dictKey),
    etymology: parseEtymology(raw.et),
    date: date.text,
    dateSense: date.sense,
    notes: parseNotes(raw.usages),
    usageSections: parseParagraphs(raw.usages),
    synonymSections: parseParagraphs(raw.syns),
    crossReferences: (raw.dxnls || []).map(function (item) {
      return Utils.textOf(item);
    }),
    synonyms: parseWordGroups(meta.syns),
    antonyms: parseWordGroups(meta.ants),
    shortDefinitions: (raw.shortdef || []).map(function (item) {
      return Utils.collapse(item);
    }),
    offensive: !!meta.offensive,
    stems: meta.stems || []
  };
}

/**
 * 判断返回的是词条还是「你是不是想查……」的建议列表
 */
function normalize(raw) {
  var entries = [];
  var suggestions = [];
  if (Array.isArray(raw)) {
    raw.forEach(function (item) {
      if (typeof item === 'string') {
        var text = Utils.collapse(item);
        if (text) suggestions.push(text);
      } else if (item && typeof item === 'object') {
        entries.push(item);
      }
    });
  } else if (raw && typeof raw === 'object') {
    entries.push(raw);
  }
  return { entries: entries, suggestions: Utils.uniqueList(suggestions) };
}

/**
 * 解析整个响应
 */
// 词头去掉音节星号、统一小写，用来判断这条词条到底是不是用户查的词
function headwordOf(entry) {
  return String((entry && entry.word) || '').replace(/[*·]/g, '').toLowerCase();
}

// MW 对 good 会连带返回 best、better、"good and" 等相关词条，
// 只保留词头与查询词一致的那些（一条都没有时才退回原样）
function filterByWord(entries, word) {
  var target = String(word || '').replace(/\*/g, '').toLowerCase();
  var matched = (entries || []).filter(function (entry) {
    return headwordOf(entry) === target;
  });
  return matched.length ? matched : entries || [];
}

function parseResponse(raw, dictKey) {
  var normalized = normalize(raw);
  var entries = [];
  normalized.entries.forEach(function (item) {
    var entry = parseEntry(item, dictKey);
    if (entry) entries.push(entry);
  });
  return { entries: entries, suggestions: normalized.suggestions };
}

module.exports = {
  senseLevel: senseLevel,
  filterByWord: filterByWord,
  headwordOf: headwordOf,
  audioURL: audioURL,
  normalize: normalize,
  parseEntry: parseEntry,
  parseResponse: parseResponse,
  parseWordGroups: parseWordGroups
};
