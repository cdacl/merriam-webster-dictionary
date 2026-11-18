/**
 * 把解析后的词条渲染成 Bob 需要的两种形态：
 *   1. content —— 完整释义（Markdown / 纯文本）
 *   2. toDict  —— 词典面板（音标、词性、释义、词形变化、词源等）
 */

var Config = require('./config.js');
var Markup = require('./markup.js');
var Utils = require('./utils.js');

// 词性缩写
function posLabel(pos) {
  if (!pos) return '';
  var key = String(pos).toLowerCase();
  return Config.PART_OF_SPEECH[key] || pos;
}

function bold(mode, text) {
  return mode === 'md' ? '**' + text + '**' : text;
}

function italic(mode, text) {
  return mode === 'md' ? '*' + text + '*' : text;
}

// 例句本身可能已经带斜体标记，外层再包一层会打架，这里做个保护
function italicSafe(mode, text) {
  if (mode !== 'md') return text;
  return text.indexOf('*') >= 0 ? text : '*' + text + '*';
}

// 需要空行时补一个，避免连续空行
function boldSafe(mode, text) {
  if (!text) return '';
  if (mode !== 'md' || String(text).indexOf('*') >= 0) return text;
  return '**' + text + '**';
}

function blank(out) {
  if (!out.length) return;
  if (out[out.length - 1] !== '') out.push('');
}

// 小节标题：Markdown 里用四级标题便于扫读，纯文本仍用粗体
function heading(mode, text) {
  return mode === 'md' ? '#### ' + text : bold(mode, text);
}

// 例句：Markdown 里用引用块，和释义正文区分开
function exampleLine(mode, text) {
  return mode === 'md' ? '> ' + text : text;
}

// 拼接相邻的文本片段：每段单独渲染时首尾空格会被吃掉，这里补回来
function appendFragment(base, fragment) {
  if (!fragment) return base;
  if (!base) return fragment;
  if (/\s$/.test(base) || /^[\s,.;:!?)\]]/.test(fragment)) return base + fragment;
  return base + ' ' + fragment;
}

// 单个发音：可选的前置标签 + /口语记法/
function pronunciationText(item, mode) {
  if (!item || !item.text) return '';
  var label = item.label ? italic(mode, item.label) + ' ' : '';
  var text = '/' + item.text + '/';
  if (item.labelAfter) text += ' ' + italic(mode, item.labelAfter);
  return label + text;
}

// 一组发音，按 MW 的规则用 pun 或逗号分隔
function pronunciationList(list, mode) {
  var texts = [];
  (list || []).forEach(function (item) {
    var text = pronunciationText(item, mode);
    if (text) texts.push(text);
  });
  return texts.join(', ');
}

// 一个词形变化：*比较级* **bet·ter** /ˈbe-tər/
function inflectionText(item, mode) {
  var name = item.name ? italic(mode, item.name) : '';
  var form = bold(mode, Markup.cleanHeadword(item.value));
  var pron = pronunciationList(item.pronunciations, mode);
  var line = name ? name + ' ' + form : form;
  return flatten(line + (pron ? ' ' + pron : ''));
}

// MW 用 {il:'or'} 表示「或」的前后并列，渲染时并进同一组
function isKnownInflection(name) {
  if (!name) return true;
  var names = Config.INFLECTION_NAMES || {};
  for (var key in names) {
    if (Object.prototype.hasOwnProperty.call(names, key) && names[key] === name) return true;
  }
  return false;
}

function inflectionGroups(inflections) {
  var groups = [];
  (inflections || []).forEach(function (item) {
    var isOr = item.name === 'or' || item.raw === 'or';
    // 「or」和「also chiefly dialectal」这类限定语都并进上一组，
    // 前者是并列词形，后者是这个形式前面的说明
    var joins = (isOr || !isKnownInflection(item.name)) && groups.length;
    if (joins) {
      groups[groups.length - 1].push(item);
    } else {
      groups.push([item]);
    }
  });
  return groups;
}

// 形容词、副词的 ins 不带标签，按 MW 的顺序补上「比较级」「最高级」
function isGradable(partOfSpeech) {
  var text = String(partOfSpeech || '').toLowerCase();
  return text.indexOf('adjective') === 0 || text.indexOf('adverb') === 0;
}

function inflectionLabel(group, index, partOfSpeech) {
  var named = null;
  (group || []).forEach(function (item) {
    if (item.name && item.name !== 'or' && isKnownInflection(item.name)) named = item.name;
  });
  if (named) return named;
  if (isGradable(partOfSpeech)) {
    if (index === 0) return 'comparative';
    if (index === 1) return 'superlative';
  }
  return '';
}

// 一整行词形变化：*比较级* **bet·ter** /ˈbe-tər/；*最高级* **best** /ˈbest/
function inflectionLine(inflections, partOfSpeech, mode) {
  var groups = inflectionGroups(inflections);
  var texts = groups.map(function (group, index) {
    var label = inflectionLabel(group, index, partOfSpeech);
    var forms = [];
    var prons = [];
    group.forEach(function (item, position) {
      var qualifier = item.name && item.name !== 'or' && !isKnownInflection(item.name)
        ? italic(mode, item.name) + ' '
        : '';
      var pron = pronunciationList(item.pronunciations, mode);
      if (pron) prons.push(pron);
      var form = qualifier + bold(mode, Markup.cleanHeadword(item.value)) + (pron ? ' ' + pron : '');
      if (position === 0) {
        forms.push(form);
      } else if (item.name === 'or' || item.raw === 'or') {
        forms.push(' or ' + form);
      } else {
        forms.push('; ' + form);
      }
    });
    return (label ? italic(mode, label) + ' ' : '') + forms.join('');
  });
  return flatten(texts.join('; '));
}

function bullet(mode, level) {
  var pad = '';
  for (var i = 0; i < level; i++) pad += '  ';
  return pad + (mode === 'md' ? '- ' : '· ');
}

function flatten(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

// 义项的正文与例句分开
function senseBody(sense, mode) {
  var text = '';
  var examples = [];
  (sense.parts || []).forEach(function (part) {
    if (part.t === 'text' || part.t === 'note') {
      text = appendFragment(text, Markup.render(part.v, mode));
    } else if (part.t === 'label') {
      text = appendFragment(text, part.v);
    } else if (part.t === 'vis') {
      examples = examples.concat(part.v);
    }
  });
  return { text: flatten(text), examples: examples };
}

// 渲染一个义项（含例句、子义项）
function renderSense(sense, options, mode, level, out) {
  var body = senseBody(sense, mode);
  var text = body.text;
  var sep = '';
  if (text.charAt(0) === ':') {
    sep = text.charAt(1) === ' ' ? ': ' : ':';
    text = text.slice(sep.length);
  }

  var head = sense.sn ? bold(mode, sense.sn) : '';
  var labels = sense.labels.length ? ' ' + italic(mode, sense.labels.join(', ')) : '';
  if (!head) sep = '';
  // 没有 {bc} 冒号的义项，编号和正文之间补一个空格
  if (head && text && !sep) sep = ' ';

  var line = flatten(head + labels + sep + text);

  // 只有编号、没有任何内容的义项（数据里会出现）不要渲染成空条目
  if (
    !text &&
    !sense.sd &&
    !sense.syns.length &&
    !sense.ants.length &&
    !sense.related.length &&
    !sense.near.length &&
    !(sense.subSenses || []).length
  ) {
    return;
  }

  // 义项里自带的发音与词形变化（例如某个义项专属的复数形式）
  if (sense.pronunciations.length) {
    line = flatten(line + ' ' + pronunciationList(sense.pronunciations, mode));
  }
  if (sense.inflections.length) {
    var forms = sense.inflections.map(function (item) {
      return inflectionText(item, mode);
    });
    line = flatten(line + ' (' + forms.join('; ') + ')');
  }

  // Markdown 里「缩进但不带项目符号」只能用代码块表示，所以编号行改成普通段落；
  // 层级由编号文字本身（1 a (1)、b、2）体现。纯文本模式仍用 · 与缩进表示层级。
  if (line) {
    blank(out);
    out.push(mode === 'md' ? line : bullet(mode, level) + line);
  }

  // 例句、具体化说明、近义词/反义词用列表，统一放在编号行下面
  var listLevel = mode === 'md' ? 0 : level + 1;
  var quoteLines = [];
  var listLines = [];
  if (options.showExamples) {
    body.examples.forEach(function (example) {
      var text = flatten(Markup.render(example, mode));
      if (!text) return;
      if (mode === 'md') quoteLines.push(exampleLine(mode, italicSafe(mode, text)));
      else listLines.push(bullet(mode, listLevel) + italicSafe(mode, text));
    });
  }

  // 具体化说明：specifically …
  if (sense.sd) {
    var sdText = '';
    (sense.sdParts || []).forEach(function (part) {
      if (part.t === 'text') sdText += Markup.render(part.v, mode);
    });
    sdText = flatten(sdText).replace(/^:\s*/, '');
    listLines.push(bullet(mode, listLevel) + italic(mode, sense.sd) + (sdText ? ' ' + sdText : ''));
  }

  // 同义词词典的义项里带有同义词/反义词列表
  var wordList = function (label, words) {
    var prefix = mode === 'md' ? boldSafe(mode, label) + ' ' : label + ': ';
    listLines.push(bullet(mode, listLevel) + prefix + words.slice(0, 12).join(', '));
  };
  if (sense.syns.length) wordList('Synonyms', sense.syns);
  if (sense.ants.length) wordList('Antonyms', sense.ants);
  if (sense.related.length) wordList('Related', sense.related);
  // MW 的 near_list 是「近反义词」，不是近义词
  if (sense.near.length) wordList('Near antonyms', sense.near);

  if (quoteLines.length) {
    blank(out);
    Array.prototype.push.apply(out, quoteLines);
    blank(out);
  }

  if (listLines.length) {
    blank(out);
    Array.prototype.push.apply(out, listLines);
    blank(out);
  }

  (sense.subSenses || []).forEach(function (sub) {
    renderSense(sub, options, mode, level + 1, out);
  });
}

// 义项里是否已经有近义词/反义词列表（同义词词典）
function sectionsHaveWordLists(sections) {
  var found = false;
  (sections || []).forEach(function (section) {
    (section.blocks || []).forEach(function (block) {
      block.forEach(function (sense) {
        if (sense.syns.length || sense.ants.length) found = true;
      });
    });
  });
  return found;
}

// 一组释义（词条里的一个 def 段）
function renderSection(section, options, mode, out) {
  if (!section.blocks || !section.blocks.length) return false;
  if (section.divider) {
    blank(out);
    out.push(heading(mode, section.divider));
  }
  section.blocks.forEach(function (block) {
    block.forEach(function (sense, index) {
      renderSense(sense, options, mode, index === 0 ? 0 : 1, out);
    });
  });
  return true;
}

// 用法说明、同义词辨析这类「段落 + 例句」内容
function renderProse(parts, options, mode, out) {
  var buffer = '';
  var flush = function () {
    var text = flatten(buffer);
    if (text) out.push(text);
    buffer = '';
  };

  (parts || []).forEach(function (part) {
    if (part.t === 'text') {
      buffer = appendFragment(buffer, Markup.render(part.v, mode));
    } else if (part.t === 'note' || part.t === 'label') {
      buffer = appendFragment(buffer, part.v);
    } else if (part.t === 'vis') {
      flush();
      if (mode === 'md') blank(out);
      var pushed = false;
      if (options.showExamples) {
        part.v.forEach(function (example) {
          var text = flatten(Markup.render(example, mode));
          if (!text) return;
          if (mode === 'md') out.push(exampleLine(mode, italicSafe(mode, text)));
          else out.push(bullet(mode, 1) + italicSafe(mode, text));
          pushed = true;
        });
      }
      if (pushed) {
        blank(out);
      }
    }
  });
  flush();
}

// 用法说明（usages）、同义词辨析（syns）：标题 + 段落
function renderParagraphSections(sections, options, mode, out) {
  (sections || []).forEach(function (section) {
    blank(out);
    if (section.title) {
      out.push(heading(mode, flatten(Markup.render(section.title, mode))));
      blank(out);
    }
    renderProse(section.parts, options, mode, out);
    if (section.refs && section.refs.length) {
      blank(out);
      out.push(bold(mode, 'See') + ' ' + section.refs.join(', '));
    }
  });
}

// 派生词、短语动词：一行带过，有释义的显示第一条
function renderRunOn(runOn, options, mode, out) {
  var head = bold(mode, runOn.word);
  if (runOn.partOfSpeech) head += ' ' + italic(mode, posLabel(runOn.partOfSpeech));
  var summaries = [];
  (runOn.sections || []).forEach(function (section) {
    section.blocks.forEach(function (block) {
      block.forEach(function (sense) {
        var summary = senseSummary(sense);
        if (summary) summaries.push(summary);
      });
    });
  });
  var line = head + (summaries.length ? ' — ' + summaries.slice(0, 3).join('; ') : '');
  out.push(bullet(mode, 0) + line);
}

/**
 * 渲染单个词条
 */
function renderEntry(entry, options, mode, out, displayNumber) {
  // 词头（同一词的多个词条用显示序号区分）
  var number = displayNumber || entry.homograph;
  var title = entry.word + (number > 1 ? ' (' + number + ')' : '');
  out.push(mode === 'md' ? '### ' + title : title);
  out.push('');

  // 词性 + 标签 + 音标
  var headLine = [];
  var pos = posLabel(entry.partOfSpeech);
  if (pos) headLine.push(bold(mode, pos));
  if (entry.labels.length) headLine.push(italic(mode, entry.labels.join(', ')));
  var pronunciations = pronunciationList(entry.pronunciations, mode);
  if (pronunciations) headLine.push(pronunciations);
  if (headLine.length) {
    out.push(headLine.join(' '));
    out.push('');
  }

  // 异体拼写
  entry.variants.forEach(function (variant) {
    if (variant.word) out.push(italic(mode, variant.label || 'variant') + ' ' + variant.word);
  });

  // 词形变化：*比较级* **bet·ter** /ˈbe-tər/；*最高级* **best** /ˈbest/
  if (entry.inflections.length) {
    out.push(inflectionLine(entry.inflections, entry.partOfSpeech, mode));
    out.push('');
  }

  // 释义
  var hasSenses = false;
  entry.sections.forEach(function (section) {
    if (renderSection(section, options, mode, out)) hasSenses = true;
  });

  // 一些词典里没有 def，只有一组简短释义
  if (!hasSenses && entry.shortDefinitions.length) {
    entry.shortDefinitions.forEach(function (item) {
      out.push(bullet(mode, 0) + flatten(Markup.render(item, mode)));
    });
    hasSenses = true;
  }

  if (hasSenses) blank(out);

  // 用法说明（例如 good 的「Good vs. Well: Usage Guide」）与同义词辨析
  renderParagraphSections(entry.usageSections, options, mode, out);
  renderParagraphSections(entry.synonymSections, options, mode, out);

  // 义项里已经列过近义词/反义词时，条目级别的不再重复
  var senseHasWordLists = sectionsHaveWordLists(entry.sections);

  // 词源、首次使用
  var hasExtras = entry.etymology || entry.date ||
    (!senseHasWordLists && (entry.synonyms.length || entry.antonyms.length));
  if (hasExtras) blank(out);

  // Markdown 里相邻行会并成一段，每条附加信息之间留一个空行
  var firstExtra = true;
  var pushExtra = function (line) {
    if (!firstExtra) blank(out);
    firstExtra = false;
    out.push(line);
  };

  if (entry.etymology) {
    pushExtra(bold(mode, 'Etymology') + ' ' + flatten(Markup.render(entry.etymology, mode)));
  }
  if (entry.date) {
    var date = entry.date + (entry.dateSense ? ' (sense ' + entry.dateSense + ')' : '');
    pushExtra(bold(mode, 'First Known Use') + ' ' + date);
  }
  if (!senseHasWordLists && entry.synonyms.length) {
    pushExtra(bold(mode, 'Synonyms') + ' ' + entry.synonyms.slice(0, 12).join(', '));
  }
  if (!senseHasWordLists && entry.antonyms.length) {
    pushExtra(bold(mode, 'Antonyms') + ' ' + entry.antonyms.slice(0, 12).join(', '));
  }

  // 派生词、短语动词
  if (entry.runOns.length || entry.definedRunOns.length) {
    blank(out);
    out.push(heading(mode, 'Related'));
    entry.runOns.forEach(function (runOn) {
      renderRunOn(runOn, options, mode, out);
    });
    entry.definedRunOns.forEach(function (runOn) {
      renderRunOn(runOn, options, mode, out);
    });
  }

  // 参见（see also）
  if (entry.crossReferences.length) {
    blank(out);
    var refs = entry.crossReferences.map(function (item) {
      // 数据里本身就带 "see also" 前缀，别和标题重复
      return flatten(Markup.render(item, mode)).replace(/^see also\s+/i, '');
    });
    out.push(heading(mode, 'See also'));
    blank(out);
    out.push(refs.join('; '));
  }
}

/**
 * 完整释义文本
 * @param {Array} entries 解析后的词条
 * @param {Object} options { showExamples }
 * @param {string} mode 'md' | 'plain'
 */
function content(entries, options, mode) {
  var lines = [];
  // 词典面板和完整释义在 Bob 里是上下两块，面板在上；这里给完整释义加一条分隔线
  if (options.panelSeparator) {
    lines.push(mode === 'md' ? '---' : '——————————');
    lines.push('');
  }
  // 同一词的多个词条（词性不同）编号，避免连续几个一模一样的标题
  var seen = {};
  entries.forEach(function (entry, index) {
    if (index > 0) {
      lines.push('');
      // 多词条之间用分割线隔开，Markdown 下更清楚
      if (mode === 'md') {
        lines.push('---');
        lines.push('');
      }
    }
    var key = String(entry.word || '');
    seen[key] = (seen[key] || 0) + 1;
    var number = entry.homograph > 1 ? entry.homograph : seen[key];
    renderEntry(entry, options, mode, lines, number);
    lines.push('');
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Bob 的音标只有美音 / 英音两种类型
function phoneticType(label) {
  var text = String(label || '').toLowerCase();
  if (text.indexOf('uk') >= 0 || text.indexOf('br') >= 0) return 'uk';
  return 'us';
}

// 义项的一句话摘要，用于词典面板
function senseSummary(sense) {
  var text = '';
  (sense.parts || []).forEach(function (part) {
    if (part.t === 'text' || part.t === 'note') {
      text = appendFragment(text, Markup.render(part.v, 'plain'));
    }
  });
  text = text.replace(/^:\s*/, '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  var prefix = sense.sn ? sense.sn + ': ' : '';
  return Utils.truncate(prefix + text, 200);
}

/**
 * 词典面板数据（toDict）
 */
function dict(entries) {
  if (!entries || !entries.length) return null;

  var first = entries[0];
  var result = { word: first.word };
  var phonetics = [];
  var parts = [];
  var partIndex = {};
  var exchanges = [];
  var synonyms = [];
  var antonyms = [];

  entries.forEach(function (entry) {
    // 音标 + 发音：同一词条里有多个变体时，优先只显示能发音的那几条
    var pronunciations = entry.pronunciations.filter(function (item) {
      return !!item.text;
    });
    var playable = pronunciations.filter(function (item) {
      return !!item.url;
    });
    if (playable.length) pronunciations = playable;

    pronunciations.forEach(function (item) {
      var duplicated = phonetics.some(function (phonetic) {
        return phonetic.value === item.text;
      });
      if (duplicated) return;
      var phonetic = { type: phoneticType(item.label), value: item.text };
      if (item.url) phonetic.tts = { type: 'url', value: item.url };
      phonetics.push(phonetic);
    });

    // 词形变化
    inflectionGroups(entry.inflections).forEach(function (group, index) {
      var exchangeName = inflectionLabel(group, index, entry.partOfSpeech) || 'Forms';
      var exchange = null;
      exchanges.forEach(function (exists) {
        if (exists.name === exchangeName) exchange = exists;
      });
      if (!exchange) {
        exchange = { name: exchangeName, words: [] };
        exchanges.push(exchange);
      }
      group.forEach(function (item) {
        if (!item.value) return;
        var phon = pronunciationList(item.pronunciations, 'plain');
        var qualifier = item.name && item.name !== 'or' && !isKnownInflection(item.name)
          ? item.name + ' '
          : '';
        var text = qualifier + Markup.cleanHeadword(item.value) + (phon ? ' ' + phon : '');
        if (exchange.words.indexOf(text) < 0) exchange.words.push(text);
      });
    });

    // 释义按词性分组
    entry.sections.forEach(function (section) {
      var label = posLabel(section.divider || '') || posLabel(entry.partOfSpeech) || 'Definition';
      var part = partIndex[label];
      if (!part) {
        part = { part: label, means: [] };
        partIndex[label] = part;
        parts.push(part);
      }
      section.blocks.forEach(function (block) {
        block.forEach(function (sense) {
          if (part.means.length >= 8) return;
          var summary = senseSummary(sense);
          if (summary && part.means.indexOf(summary) < 0) part.means.push(summary);
        });
      });
    });

    entry.synonyms.forEach(function (word) {
      if (synonyms.indexOf(word) < 0) synonyms.push(word);
    });
    entry.antonyms.forEach(function (word) {
      if (antonyms.indexOf(word) < 0) antonyms.push(word);
    });
  });

  // 没有 def 的词典退化为简短释义
  if (!parts.length && first.shortDefinitions.length) {
    parts.push({
      part: posLabel(first.partOfSpeech) || 'Definition',
      means: first.shortDefinitions.map(function (item) {
        return Utils.truncate(flatten(item), 200);
      })
    });
  }

  if (phonetics.length) result.phonetics = phonetics;
  if (parts.length) result.parts = parts;
  if (exchanges.length) result.exchanges = exchanges;

  var additions = [];
  if (first.etymology) {
    additions.push({ name: 'Etymology', value: Utils.truncate(flatten(Markup.render(first.etymology, 'plain')), 300) });
  }
  if (first.date) {
    additions.push({
      name: 'First Known Use',
      value: first.date + (first.dateSense ? ' (sense ' + first.dateSense + ')' : '')
    });
  }
  var usage = (first.usageSections || [])[0];
  if (usage) {
    var prose = '';
    (usage.parts || []).forEach(function (part) {
      if (part.t === 'text' || part.t === 'note') {
        prose = appendFragment(prose, Markup.render(part.v, 'plain'));
      }
    });
    var usageName = usage.title
      ? Utils.truncate(flatten(Markup.render(usage.title, 'plain')), 60)
      : 'Usage note';
    additions.push({ name: usageName, value: Utils.truncate(flatten(prose), 300) });
  }
  if (synonyms.length) {
    additions.push({ name: 'Synonyms', value: synonyms.slice(0, 12).join(', ') });
  }
  if (antonyms.length) {
    additions.push({ name: 'Antonyms', value: antonyms.slice(0, 12).join(', ') });
  }
  if (additions.length) result.additions = additions;

  return result;
}

/**
 * 没有查到词条时，把建议词放进词典面板的「词形变化」样式里
 * Bob 会把这类词渲染成可点的词，点一下就把词填进查询框再查一次
 */
function suggestionsDict(word, list) {
  var words = (list || []).slice(0, 12);
  // 只给 exchanges 的话 Bob 不会渲染词典面板，所以补一条 parts 让面板出现
  var dict = {
    word: word,
    parts: [{ part: "Similar spellings", means: ["click to look it up"] }]
  };
  // exchanges 里的一组词会被排在同一行，而相关词（relatedWordParts）本身就是逐条列表
  if (words.length) {
    dict.relatedWordParts = [
      {
        part: "Did you mean",
        words: words.map(function (item) {
          return { word: item, means: "" };
        })
      }
    ];
  }
  return dict;
}

function suggestions(word, list, mode) {
  var lines = [];
  lines.push(bold(mode, word + " is not in Merriam-Webster"));
  lines.push("");
  if (list && list.length) {
    lines.push("Did you mean one of these?");
    lines.push("");
    list.slice(0, 12).forEach(function (item) {
      lines.push(bullet(mode, 0) + item);
    });
  } else {
    lines.push("Merriam-Webster only covers words and common phrases. Check the spelling.");
  }
  return lines.join("\n");
}

module.exports = {
  content: content,
  dict: dict,
  suggestions: suggestions,
  suggestionsDict: suggestionsDict,
  senseSummary: senseSummary,
  posLabel: posLabel
};
