/**
 * Merriam-Webster 词典 —— Bob 翻译插件入口
 *
 * 文档：https://bobtranslate.com/plugin/
 * 接口：https://www.dictionaryapi.com/products/json
 *
 * 只依赖 Bob 注入的全局对象：$http、$option、$file、$data、$env，
 * 不访问网络之外的环境（JavaScriptCore 里没有 Node 和浏览器 API）。
 */

var Config = require('./src/config.js');
var Parse = require('./src/parse.js');
var Render = require('./src/render.js');
var Api = require('./src/api.js');
var Utils = require('./src/utils.js');

// 一个词条数组最多渲染几条，避免长词条把窗口撑爆
var MAX_ENTRIES = 4;

/**
 * 支持的语言。MW 给的是英文释义，所以本质上只处理「英文 → 任意」这一个方向，
 * 这里声明中文目标语言是为了让 Bob 在 auto → zh-Hans 时能把插件列出来。
 */
function supportLanguages() {
  return ['auto', 'en', 'zh-Hans', 'zh-Hant'];
}

// 读取插件设置
function readOptions() {
  var read = function (key, fallback) {
    if (typeof $option === 'undefined' || !$option) return fallback;
    var value = $option[key];
    if (value === undefined || value === null || value === '') return fallback;
    return value;
  };

  // 旧版本还留着已移除的词典名时，退回默认的大学词典
  var dictKey = String(read('dictionary', 'collegiate'));
  if (!Config.DICTIONARIES[dictKey]) dictKey = 'collegiate';
  var apiKey = String(read('apiKey', '')).trim();
  var thesaurusKey = String(read('thesaurusApiKey', '')).trim();

  return {
    // 同义词词典的 Key 与主词典不通用，选了同义词词典就用那一把
    apiKey: dictKey === 'thesaurus' ? thesaurusKey : apiKey,
    apiKeyLabel: dictKey === 'thesaurus' ? 'thesaurus' : 'main',
    dictKey: dictKey,
    resultStyle: String(read('resultStyle', 'both')),
    showExamples: String(read('showExamples', 'on')) !== 'off',
    cacheDays: parseInt(read('cacheDays', '7'), 10) || 0
  };
}

// Markdown 渲染需要 Bob 1.21.0 及以上
function supportsMarkdown() {
  if (typeof $env === 'undefined' || !$env || !$env.appVersion) return false;
  return Utils.compareVersion($env.appVersion, '1.21.0') >= 0;
}

// 整理用户输入：去掉首尾的标点、引号和多余空白
function normalizeWord(text) {
  if (!text) return '';
  var word = String(text).trim();
  word = word.replace(/^[\s"'“”‘’《》()（）\[\]【】,;:!?、，；：！？]+/, '');
  word = word.replace(/[\s"'“”‘’《》()（）\[\]【】,;:!?、，；：！？]+$/, '');
  word = word.replace(/\s+/g, ' ').trim();
  // 末尾的句号（且不是缩写里的点）一并去掉
  if (/^[^.]+\.$/.test(word)) word = word.slice(0, -1);
  return word;
}

// 判断是否值得我们拿去查（排除中日韩文字和纯符号）
function isLookupable(word) {
  if (!word) return false;
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(word)) return false;
  return /[A-Za-z\u00c0-\u024f]/.test(word);
}

// 大小写备选：先查原样，查不到再试全小写 / 首字母大写
function candidatesFor(word) {
  var list = [word];
  var lower = word.toLowerCase();
  if (lower !== word) {
    list.push(lower);
  } else {
    var capitalized = word.charAt(0).toUpperCase() + word.slice(1);
    if (capitalized !== word) list.push(capitalized);
  }
  return list;
}

function noKeyError(options) {
  var isThesaurus = options && options.dictKey === 'thesaurus';
  return {
    type: 'secretKey',
    message: isThesaurus ? Config.TEXT.noThesaurusKey : Config.TEXT.noKey,
    addition: isThesaurus ? Config.TEXT.noThesaurusKeyHint : Config.TEXT.noKeyHint,
    troubleshootingLink: Config.TEXT.keyLink
  };
}

// 组装成功结果
function buildResult(query, entries, options) {
  var markdown = supportsMarkdown();
  var mode = markdown ? 'md' : 'plain';
  var result = {
    from: query.detectFrom || 'en',
    to: query.detectTo || 'zh-Hans'
  };
  var wantsDict = options.resultStyle !== 'full';
  var wantsFull = options.resultStyle !== 'dict';

  if (wantsDict) {
    var dict = Render.dict(entries.slice(0, MAX_ENTRIES));
    if (dict) result.toDict = dict;
  }

  // 只显示词典面板、但拿不到面板数据时，退化成完整释义
  if (wantsFull || !result.toDict) {
    var contentOptions = {
      showExamples: options.showExamples,
      panelSeparator: !!(wantsDict && result.toDict)
    };
    var text = Render.content(entries.slice(0, MAX_ENTRIES), contentOptions, mode);
    if (text) {
      result.content = {
        format: markdown ? 'markdown' : 'plain',
        text: text
      };
      // 老版本 Bob 只认 toParagraphs，一并给上
      if (!markdown) result.toParagraphs = text.split('\n').filter(function (line) { return !!line.trim(); });
    }
  }

  return result;
}

// 没查到词条：给出「你是不是想查」
function buildNoResult(query, word, suggestions) {
  var result = {
    from: query.detectFrom || 'en',
    to: query.detectTo || 'zh-Hans'
  };
  // 有建议词时整个结果交给词典面板：Bob 会把词渲染成可点的链接，点一下就能再查
  if (suggestions && suggestions.length) {
    result.toDict = Render.suggestionsDict(word, suggestions);
    return result;
  }
  // 没有建议词时只能给文字提示
  var markdown = supportsMarkdown();
  var text = Render.suggestions(word, [], markdown ? 'md' : 'plain');
  result.content = { format: markdown ? 'markdown' : 'plain', text: text };
  if (!markdown) result.toParagraphs = text.split('\n').filter(function (line) { return !!line.trim(); });
  return result;
}

/**
 * 执行翻译（词典查询）
 */
function translate(query, completion) {
  var finish = function (payload) {
    if (query && typeof query.onCompletion === 'function') {
      query.onCompletion(payload);
    } else if (typeof completion === 'function') {
      completion(payload);
    }
  };

  var options = readOptions();

  if (!options.apiKey) {
    finish({ error: noKeyError(options) });
    return;
  }

  var word = normalizeWord(query.text);

  if (!word) {
    finish({ error: { type: 'param', message: Config.TEXT.empty } });
    return;
  }

  if (!isLookupable(word)) {
    finish({
      error: {
        type: 'notFound',
        message: Config.TEXT.notEnglish,
        addition: 'Dictionary: ' + (Config.DICTIONARIES[options.dictKey] || Config.DICTIONARIES.collegiate).name
      }
    });
    return;
  }

  var candidates = candidatesFor(word);
  var index = 0;
  var bestSuggestions = [];

  var next = function () {
    if (index >= candidates.length) {
      finish({ result: buildNoResult(query, word, bestSuggestions) });
      return;
    }
    var candidate = candidates[index++];
    Api.lookup(candidate, options.dictKey, options, query.cancelSignal).then(
      function (data) {
        var parsed = Parse.parseResponse(data.response, options.dictKey);
        // 只留词头和查询词一致的词条，挡掉 best / better / "good and" 这类连带结果
        var entries = Parse.filterByWord(parsed.entries, candidate);
        if (entries.length) {
          finish({ result: buildResult(query, entries, options) });
          return;
        }
        if (!bestSuggestions.length && parsed.suggestions.length) {
          bestSuggestions = parsed.suggestions;
        }
        next();
      },
      function (error) {
        // 换一种大小写再试，只有真的出错才中断
        if (error && error.type === 'notFound' && index < candidates.length) {
          next();
          return;
        }
        finish({ error: error });
      }
    );
  };

  next();
}

/**
 * 验证 API Key：发起一次真实查询，能拿到数据就认为 Key 可用
 */
function pluginValidate(completion) {
  var done = function (payload) {
    if (typeof completion === 'function') completion(payload);
  };

  var options = readOptions();
  if (!options.apiKey) {
    done({ result: false, error: noKeyError(options) });
    return;
  }

  Api.request('test', options.dictKey, options, null).then(
    function () {
      done({ result: true });
    },
    function (error) {
      done({ result: false, error: error });
    }
  );
}

function pluginTimeoutInterval() {
  return 30;
}

// 仅在 Node 环境（单元测试）里导出；Bob 运行时没有 module，这段会被跳过
if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = {
    supportLanguages: supportLanguages,
    translate: translate,
    pluginValidate: pluginValidate,
    pluginTimeoutInterval: pluginTimeoutInterval
  };
}
