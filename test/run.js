/**
 * 在 Node 里跑插件的单元测试
 *
 * Bob 的运行时是 JavaScriptCore，没有 Node 也没有浏览器 API，
 * 所以这里手动造出 Bob 会注入的那些全局对象（$http / $option / $file / $data / $env），
 * 然后用真实的 main.js 跑一遍完整的查询流程。
 *
 * 运行：node test/run.js
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
}

// ---------------------------------------------------------------- 模拟 Bob 环境

var memoryFS = {};
var httpLog = [];
var responses = {};

global.$env = {
  appVersion: '1.21.0',
  appBuild: '1210',
  macOSVersion: '14.4.1',
  macModel: 'MacBookPro18,3'
};

global.$option = {
  apiKey: 'TEST-KEY',
  dictionary: 'collegiate',
  resultStyle: 'both',
  showExamples: 'on',
  cacheDays: '0'
};

global.$log = {
  info: function () {},
  error: function () {}
};

global.$data = {
  isData: function (value) {
    return !!(value && value.__data);
  },
  fromUTF8: function (text) {
    return {
      __data: true,
      toUTF8: function () {
        return String(text);
      }
    };
  }
};

global.$file = {
  exists: function (p) {
    return Object.prototype.hasOwnProperty.call(memoryFS, p);
  },
  read: function (p) {
    return memoryFS[p] === undefined ? null : global.$data.fromUTF8(memoryFS[p]);
  },
  write: function (options) {
    memoryFS[options.path] = options.data.toUTF8();
    return true;
  },
  delete: function (p) {
    delete memoryFS[p];
    return true;
  },
  list: function (dir) {
    var prefix = dir + '/';
    return Object.keys(memoryFS)
      .filter(function (key) {
        return key.indexOf(prefix) === 0;
      })
      .map(function (key) {
        return key.slice(prefix.length);
      });
  },
  mkdir: function () {
    return true;
  },
  isDirectory: function () {
    return false;
  }
};

global.$http = {
  get: function (params) {
    var match = /\/json\/([^?]+)\?/.exec(params.url);
    var word = decodeURIComponent(match ? match[1] : '');
    httpLog.push({ word: word, url: params.url });
    var item = responses[word] || { status: 404 };
    setTimeout(function () {
      params.handler({
        data: item.payload === undefined ? null : item.payload,
        rawData: item.rawText ? { toUTF8: function () { return item.rawText; } } : null,
        response: { statusCode: item.status || 200, headers: {} },
        error: item.error || null
      });
    }, 0);
  }
};

// ---------------------------------------------------------------- 载入插件

var plugin = require(path.join(ROOT, 'main.js'));
var Markup = require(path.join(ROOT, 'src/markup.js'));
var Parse = require(path.join(ROOT, 'src/parse.js'));
var Render = require(path.join(ROOT, 'src/render.js'));

// ---------------------------------------------------------------- 断言工具

var passed = 0;
var failed = 0;
var failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('  \u2713 ' + name);
  } catch (error) {
    failed++;
    failures.push(name + '：' + error.message);
    console.log('  \u2717 ' + name);
    console.log('      ' + error.message);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message || '断言失败');
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error((label || '值') + ' 期望「' + expected + '」，实际「' + actual + '」');
  }
}

function expectContains(haystack, needle, label) {
  if (String(haystack).indexOf(needle) < 0) {
    throw new Error((label || '文本') + ' 中应包含「' + needle + '」，实际：\n' + haystack);
  }
}

function expectNotContains(haystack, needle, label) {
  if (String(haystack).indexOf(needle) >= 0) {
    throw new Error((label || '文本') + ' 中不应包含「' + needle + '」');
  }
}

function resetOptions(overrides) {
  global.$option = {
    apiKey: 'TEST-KEY',
    thesaurusApiKey: 'TEST-THESAURUS-KEY',
    dictionary: 'collegiate',
    resultStyle: 'both',
    showExamples: 'on',
    cacheDays: '0'
  };
  Object.keys(overrides || {}).forEach(function (key) {
    global.$option[key] = overrides[key];
  });
}

// 调用插件并等待回调
function translate(text, options) {
  resetOptions(options);
  return new Promise(function (resolve) {
    plugin.translate(
      {
        text: text,
        originalText: text,
        from: 'auto',
        to: 'zh-Hans',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
        onCompletion: resolve
      },
      resolve
    );
  });
}

function validate(options) {
  resetOptions(options);
  return new Promise(function (resolve) {
    plugin.pluginValidate(resolve);
  });
}

// ---------------------------------------------------------------- 测试

function testMarkup() {
  console.log('\n标记渲染');
  check('加粗与斜体', function () {
    expectEqual(Markup.render('{b}bold{/b} and {it}italic{/it}', 'md'), '**bold** and *italic*');
  });
  check('纯文本模式去掉标记', function () {
    expectEqual(Markup.render('{b}bold{/b} and {it}italic{/it}', 'plain'), 'bold and italic');
  });
  check('加粗冒号', function () {
    expectEqual(Markup.render('{bc}of a favorable character', 'md'), ': of a favorable character');
  });
  check('链接标记只显示文本', function () {
    expectEqual(Markup.render('see {a_link|good} and {d_link|bad|bad}', 'md'), 'see good and bad');
  });
  check('交叉引用 {dxt}', function () {
    expectEqual(Markup.render('{dx}compare {dxt|well||}{/dx}', 'md'), '→ compare well');
  });
  check('gloss 用方括号括起', function () {
    expectEqual(Markup.render('{gloss}a term{/gloss}', 'md'), '[a term]');
  });
  check('未知标记被丢弃', function () {
    expectEqual(Markup.render('a{unknown}b', 'md'), 'ab');
  });
  check('段落标记换行', function () {
    expectEqual(Markup.render('a{p_br}b', 'md'), 'a\n\nb');
  });
  check('引号标记', function () {
    expectEqual(Markup.render('{ldquo}quoted{rdquo}', 'md'), '“quoted”');
  });
  check('Markdown 特殊字符转义', function () {
    expectEqual(Markup.render('a*b', 'md'), 'a\\*b');
  });
  check('重音符号不被破坏', function () {
    expectEqual(Markup.render('ˈgu̇d', 'md'), 'ˈgu̇d');
  });
  check('词头音节分隔符', function () {
    expectEqual(Markup.cleanHeadword('kab*ba*lah'), 'kab·ba·lah');
  });
  check('more at 链接', function () {
    expectContains(Markup.render('from Latin {ma}{mat|fly|}{/ma}', 'md'), 'more at fly');
  });
}

function testAudio() {
  console.log('\n发音地址');
  var dict = { lang: 'en', country: 'us' };
  check('普通文件名', function () {
    expectEqual(
      Parse.audioURL('good01', dict),
      'https://media.merriam-webster.com/audio/prons/en/us/mp3/g/good01.mp3'
    );
  });
  check('以数字开头', function () {
    expectEqual(
      Parse.audioURL('3d000001', dict),
      'https://media.merriam-webster.com/audio/prons/en/us/mp3/number/3d000001.mp3'
    );
  });
  check('bix 子目录', function () {
    expectEqual(
      Parse.audioURL('bixdod04', dict),
      'https://media.merriam-webster.com/audio/prons/en/us/mp3/bix/bixdod04.mp3'
    );
  });
  check('gg 子目录', function () {
    expectEqual(
      Parse.audioURL('ggwheat01.wav', dict),
      'https://media.merriam-webster.com/audio/prons/en/us/mp3/gg/ggwheat01.mp3'
    );
  });
  check('空文件名', function () {
    expectEqual(Parse.audioURL('', dict), '');
  });
}

async function testTranslate() {
  console.log('\n查询流程');

  responses = {
    good: { status: 200, payload: fixture('collegiate-good.json') }
  };

  var both = await translate('good');
  // 输出必须全是英文：面板和释义里出现过中文字符就算失败
  check('输出里没有中文', function () {
    var cjk = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/;
    expect(!cjk.test(both.result.content.text), '释义里还有中文：' + both.result.content.text.match(cjk));
    expect(!cjk.test(JSON.stringify(both.result.toDict)), '面板里还有中文：' + JSON.stringify(both.result.toDict).match(cjk));
  });
  check('返回词典面板', function () {
    expect(both.result && both.result.toDict, '缺少 toDict');
    expectEqual(both.result.toDict.word, 'good');
    expect(both.result.toDict.phonetics.length > 0, '缺少音标');
    expectEqual(
      both.result.toDict.phonetics[0].tts.value,
      'https://media.merriam-webster.com/audio/prons/en/us/mp3/g/good01.mp3'
    );
  });
  check('返回完整释义', function () {
    expect(both.result.content, '缺少 content');
    expectEqual(both.result.content.format, 'markdown');
  });
  check('释义包含词头与词性', function () {
    var text = both.result.content.text;
    expectContains(text, '### good');
    expectContains(text, 'adj.');
    expectContains(text, '1 a');
    expectContains(text, 'of a favorable character or tendency');
  });
  check('释义包含例句', function () {
    expectContains(both.result.content.text, 'good news');
  });
  check('释义包含词形变化与词源', function () {
    var text = both.result.content.text;
    expectContains(text, 'comparative');
    expectContains(text, 'Etymology');
    expectContains(text, 'First Known Use');
  });
  check('释义包含子词汇', function () {
    expectContains(both.result.content.text, 'good·ness');
  });
  check('词典面板按词性分组', function () {
    var parts = both.result.toDict.parts;
    var labels = parts.map(function (part) {
      return part.part;
    });
    expect(labels.indexOf('adj.') >= 0, '缺少形容词分组：' + labels.join(' / '));
    expect(labels.indexOf('n.') >= 0, '缺少名词分组：' + labels.join(' / '));
    var adjective = parts[labels.indexOf('adj.')];
    expect(adjective.means.length >= 3, '形容词义项太少');
  });
  check('词典面板含词形变化', function () {
    var exchanges = both.result.toDict.exchanges;
    expect(exchanges.length > 0, '缺少词形变化');
    expectEqual(exchanges[0].name, 'comparative');
    // 单词形式带上它自己的音标，音节分隔符统一成中点
    expectEqual(exchanges[0].words[0], 'bet·ter /ˈbe-tər/');
    expectEqual(exchanges[1].words[0], 'best /ˈbest/');
  });

  check('音标只来自词头', function () {
    // 词形变化（better / best）的音标不该被当成 good 的音标塞进 phonetics
    var values = both.result.toDict.phonetics.map(function (item) {
      return item.value;
    });
    expectEqual(values.join('|'), 'ˈgu̇d');
  });

  check('词形变化带音标且不被 Markdown 吃掉', function () {
    var text = both.result.content.text;
    expectContains(text, '`comparative` **bet·ter** /ˈbe-tər/');
    expectContains(text, '`superlative` **best** /ˈbest/');
    expectNotContains(text, 'bet*ter');
  });

  check('用法说明渲染成小节标题', function () {
    var text = both.result.content.text;
    expectContains(text, '#### **good** vs. **well**');
    expectContains(text, 'are both standard in English');
    expectContains(text, '> *feeling proud/confident*');
    expectContains(text, '#### See also');
    expectContains(text, 'goodness');
  });

  check('Markdown 结构：例句用引用块、小节用标题、词条之间用分割线', function () {
    var text = both.result.content.text;
    // 例句换成引用块，释义正文和例句一眼分得开
    expectContains(text, '> *good news*');
    expectNotContains(text, '- *good news*');
    // 词性分隔（predicative）也让位给标题，避免和释义正文混在一起
    expectContains(text, '#### predicative');
    // 两个词条之间用分割线，避免「### good (2)」直接顶上来
    expect(text.indexOf('---\n\n### good (2)') >= 0, '词条之间缺少分割线');
    // 标题层级：词条用三级标题，小节用四级标题
    expectContains(text, '### good');
    expectContains(text, '#### Related');
  });

  check('连带返回的相关词条被过滤', function () {
    // 真实 API 对 good 会附送 best / better / "good and"，只该留下词头是 good 的
    var text = both.result.content.text;
    expectNotContains(text, '### best');
    expectNotContains(text, '### bet·ter');
    expectNotContains(text, '### good and');
    expectContains(text, '### good');
  });

  check('词典面板带上用法说明', function () {
    var additions = both.result.toDict.additions || [];
    var names = additions.map(function (item) {
      return item.name;
    });
    expect(names.join('|').indexOf('good vs. well') >= 0, '缺少用法说明');
  });

  var noExamples = await translate('good', { showExamples: 'off' });
  check('关闭例句', function () {
    expectNotContains(noExamples.result.content.text, 'good news');
    expectContains(noExamples.result.content.text, 'of a favorable character or tendency');
  });

  var dictOnly = await translate('good', { resultStyle: 'dict' });
  check('仅显示词典面板', function () {
    expect(dictOnly.result.toDict, '缺少 toDict');
    expect(!dictOnly.result.content, '不应返回 content');
  });

  var fullOnly = await translate('good', { resultStyle: 'full' });
  check('仅显示完整释义', function () {
    expect(!fullOnly.result.toDict, '不应返回 toDict');
    expect(fullOnly.result.content, '缺少 content');
  });

  // 查不到词：返回建议列表
  responses = {
    gud: { status: 200, payload: ['good', 'goodness', 'goods'] },
    Gud: { status: 200, payload: [] }
  };
  var suggestions = await translate('gud');
  check('未收录时把结果交给词典面板', function () {
    expect(suggestions.result.toDict, '缺少 toDict');
    expect(!suggestions.result.content, '有面板时不再显示文字列表');
  });

  check('建议词一行一个', function () {
    var dict = suggestions.result.toDict;
    expect(dict.parts && dict.parts.length === 1, "缺少 parts，Bob 不会渲染面板");
    var groups = dict.relatedWordParts;
    expect(groups && groups.length === 1, '应有一组相关词');
    expectEqual(groups[0].part, 'Did you mean');
    expectEqual(groups[0].words.map(function (item) { return item.word; }).join(','), 'good,goodness,goods');
    expect(!/[\u4e00-\u9fff]/.test(JSON.stringify(dict)), '建议面板里还有中文');
  });

  global.$env.appVersion = '1.20.5';
  var oldBobSuggestions = await translate('gud');
  global.$env.appVersion = '1.21.0';
  check('老版本 Bob 也给可点的建议词', function () {
    expect(oldBobSuggestions.result.toDict, '缺少 toDict');
    expect(!oldBobSuggestions.result.toParagraphs, '有面板时不再给纯文本');
  });

  // 错误的 Key
  responses = { good: { status: 403 } };
  var badKey = await translate('good');
  check('403 映射为密钥错误', function () {
    expect(badKey.error, '应返回 error');
    expectEqual(badKey.error.type, 'secretKey');
    expect(!!badKey.error.troubleshootingLink, '缺少 troubleshootingLink');
  });

  // 没有填 Key
  var noKey = await translate('good', { apiKey: '' });
  check('未填写 Key 时给出提示', function () {
    expect(noKey.error, '应返回 error');
    expectEqual(noKey.error.type, 'secretKey');
  });

  // 网络错误
  responses = { good: { status: 0, error: { message: 'The Internet connection appears to be offline.' } } };
  var network = await translate('good');
  check('网络错误映射', function () {
    expect(network.error, '应返回 error');
    expectEqual(network.error.type, 'network');
  });

  // 中文输入
  var chinese = await translate('你好');
  check('中文输入给出提示', function () {
    expect(chinese.error, '应返回 error');
    expectEqual(chinese.error.type, 'notFound');
  });

  // 空输入
  var empty = await translate('   ');
  check('空输入给出提示', function () {
    expect(empty.error, '应返回 error');
    expectEqual(empty.error.type, 'param');
  });

  // 大小写回退：Proserpine 查不到就试 proserpine / Proserpine
  responses = {
    paris: { status: 200, payload: [] },
    Paris: { status: 200, payload: fixture('collegiate-good.json').map(function (entry) {
      entry.hwi.hw = 'Paris';
      return entry;
    }) }
  };
  var capitalized = await translate('paris');
  check('大小写回退', function () {
    expect(capitalized.result && capitalized.result.toDict, '大小写回退失败');
    expectEqual(capitalized.result.toDict.word, 'Paris');
  });
  // 老版本 Bob（< 1.21.0）不支持 Markdown，要退化成纯文本 + toParagraphs
  responses = { good: { status: 200, payload: fixture('collegiate-good.json') } };
  global.$env.appVersion = '1.20.5';
  var legacy = await translate('good');
  global.$env.appVersion = '1.21.0';
  check('老版本 Bob 退回纯文本', function () {
    expectEqual(legacy.result.content.format, 'plain');
    expect(Array.isArray(legacy.result.toParagraphs), '缺少 toParagraphs');
    expect(legacy.result.toParagraphs.length > 3, 'toParagraphs 段落太少');
    expectNotContains(legacy.result.content.text, '**');
    expectNotContains(legacy.result.content.text, '###');
  });

  // 接口有时直接给 JSON 字符串
  responses = { good: { status: 200, payload: JSON.stringify(fixture('collegiate-good.json')) } };
  var raw = await translate('good');
  check('字符串形式的响应也能解析', function () {
    expect(raw.result && raw.result.toDict, '解析字符串响应失败');
    expectEqual(raw.result.toDict.word, 'good');
  });
}

async function testCache() {
  console.log('\n本地缓存');
  memoryFS = {};
  httpLog = [];
  responses = { good: { status: 200, payload: fixture('collegiate-good.json') } };

  await translate('good', { cacheDays: '7' });
  await translate('good', { cacheDays: '7' });

  check('缓存命中后不再请求接口', function () {
    expectEqual(httpLog.length, 1, '请求次数');
  });
  check('缓存文件写进沙盒', function () {
    var keys = Object.keys(memoryFS);
    expect(keys.length === 1, '应写入 1 个缓存文件，实际 ' + keys.length);
    expectContains(keys[0], '$sandbox/cache/collegiate-', '缓存路径');
  });

  // 关闭缓存后每次都请求
  memoryFS = {};
  httpLog = [];
  await translate('good', { cacheDays: '0' });
  await translate('good', { cacheDays: '0' });
  check('关闭缓存后每次都请求', function () {
    expectEqual(httpLog.length, 2, '请求次数');
  });
}

async function testOtherDictionaries() {
  console.log('\n其他词典');

  responses = { above: { status: 200, payload: fixture('thesaurus-above.json') } };
  var thesaurus = await translate('above', { dictionary: 'thesaurus' });
  check('同义词词典用同义词 Key', function () {
    var url = httpLog.length ? httpLog[httpLog.length - 1].url : '';
    expectContains(url, '/thesaurus/');
    expectContains(url, 'key=TEST-THESAURUS-KEY');
    expect(url.indexOf('TEST-KEY') < 0, '同义词词典不该用主词典 Key');
  });
  check('同义词词典渲染', function () {
    var text = thesaurus.result.content.text;
    expectContains(text, 'Synonyms');
    expectContains(text, 'aloft');
    expectContains(text, 'Antonyms');
    expectContains(text, 'beneath');
  });
  check('同一词的不同词性词条带上序号', function () {
    var text = thesaurus.result.content.text;
    expectContains(text, '### above');
  });
  check('同义词词典的近义、相关、近反义词', function () {
    var text = thesaurus.result.content.text;
    expectContains(text, '- **Synonyms** aloft, over, overhead');
    expectContains(text, '- **Antonyms** below, beneath');
    expectContains(text, '- **Related** higher, up');
    expectContains(text, '- **Near antonyms** on top of, atop');
  });
  check('同义词词典面板', function () {
    var additions = thesaurus.result.toDict.additions || [];
    var names = additions.map(function (item) {
      return item.name;
    });
    expect(names.indexOf('Synonyms') >= 0, '词典面板缺少同义词');
  });

  // 请求地址应该跟着词典走
  check('接口地址使用所选词典', function () {
    var url = require(path.join(ROOT, 'src/api.js')).buildURL('above', 'thesaurus', 'KEY');
    expectEqual(url, 'https://dictionaryapi.com/api/v3/references/thesaurus/json/above?key=KEY');
  });
}

async function testNestedSenses() {
  console.log('\n复杂义项结构');
  responses = { tab: { status: 200, payload: fixture('collegiate-tab.json') } };
  var result = await translate('tab');
  check('pseq / bs 结构能解析出括号义项', function () {
    var means = result.result.toDict.parts[0].means.join(' | ');
    expectContains(means, 'small flap or loop');
    expectContains(means, 'projection from a card');
  });
  check('交叉引用只显示词本身', function () {
    expectContains(result.result.content.text, 'bounce, rebound');
  });

  // 字段缺失的响应不应该让插件崩掉
  responses = { minimal: { status: 200, payload: fixture('collegiate-minimal.json') } };
  var minimal = await translate('minimal');
  check('字段缺失时仍能渲染', function () {
    expect(minimal.result, '应返回 result 而不是 error');
    expect(minimal.result.toDict || minimal.result.content, '既没有 toDict 也没有 content');
    expectContains(minimal.result.content.text, 'something without any extra fields');
  });
}

async function testRealResponseShapes() {
  console.log('\n真实接口里的几种特殊情况');
  responses = { run: { status: 200, payload: fixture('collegiate-run.json') } };
  var run = await translate('run');
  check('限定语并进上一组，重复形式只留一次', function () {
    var text = run.result.content.text;
    expectContains(text, '*also chiefly dialectal* **run**');
    expectNotContains(text, '**run**；**run**');
  });
  check('释义正文里的例句跟着义项走', function () {
    expectContains(run.result.content.text, '*run* to catch the bus');
  });

  // 同一个词头下有多个变体，只显示能发音的那几条
  responses = {
    tassel: {
      status: 200,
      payload: [{
        meta: { id: 'tassel:1', src: 'collegiate', section: 'alpha', stems: ['tassel'], offensive: false },
        hom: 1,
        hwi: { hw: 'tas*sel', prs: [
          { mw: 'ˈta-səl', sound: { audio: 'tassel01' } },
          { mw: 'ˈtä-' },
          { mw: 'ˈtȯ-' }
        ] },
        fl: 'noun',
        def: [{ sseq: [[['sense', { dt: [['text', '{bc}an ornament ']] }]]] }],
        shortdef: ['an ornament']
      }]
    }
  };
  var tassel = await translate('tassel');
  check('面板里优先只放能播放的音标', function () {
    expectEqual(tassel.result.toDict.phonetics.length, 1);
    expectContains(tassel.result.toDict.phonetics[0].tts.value, 'tassel01.mp3');
  });

  // 面板 + 完整释义同时显示时，完整释义开头加一条分隔线
  responses = { good: { status: 200, payload: fixture('collegiate-good.json') } };
  var both = await translate('good');
  var fullOnly = await translate('good', { resultStyle: 'full' });
  var dictOnly = await translate('good', { resultStyle: 'dict' });
  global.$env.appVersion = '1.20.5';
  var legacySep = await translate('good');
  global.$env.appVersion = '1.21.0';
  check('面板与完整释义之间有分隔线', function () {
    expect(both.result.toDict, '应返回词典面板');
    var lines = both.result.content.text.split('\n');
    expect(lines[0] === '---', '分隔线应在最前面，实际：' + lines[0]);
    expect(!/^---/.test(fullOnly.result.content.text), '没有面板时不该有分隔线');
    expect(!dictOnly.result.content, '只看面板时不该有完整释义');
    expect(legacySep.result.toParagraphs[0].indexOf('———') === 0, '纯文本分隔线应在第一段');
  });

  // sen 元素没有自己的定义文本时是标题义项（例如 good 的 g / h），后面的兄弟元素属于它
  responses = { good: { status: 200, payload: fixture('collegiate-sen-heading.json') } };
  var senResult = await translate('good');
  check('sen 标题义项不漏编号', function () {
    var text = senResult.result.content.text;
    expectContains(text, '**g**');
    expectContains(text, 'sports');
    expectContains(text, '**h**');
    expectContains(text, 'informal');
    expectContains(text, 'landing in the proper area of the court');
    expectContains(text, 'having everything desired or required');
    // g 的 (1)(2) 要挂在 g 后面，不能出现在 g 之前成为孤儿
    var gIndex = text.indexOf('**g**');
    var serveIndex = text.indexOf('landing in the proper area');
    expect(gIndex >= 0 && gIndex < serveIndex, 'g 应出现在它自己的子义项之前');
    // 下一个顶层义项不能被收进 h
    expectContains(text, '2 a (1)');
    var hIndex = text.indexOf('**h**');
    var nextIndex = text.indexOf('2 a (1)');
    expect(hIndex < nextIndex, '2 a 不应被 h 吞掉');
  });

  // Key 有效但没订阅这部词典：接口返回 200 + 一行纯文本
  responses = {
    quux: { status: 200, rawText: 'Invalid API key. Not subscribed for this reference.' }
  };
  var unsubscribed = await translate('quux', { dictionary: 'thesaurus' });
  check('未订阅词典给出可读的提示', function () {
    expectEqual(unsubscribed.error.type, 'secretKey');
    expectContains(unsubscribed.error.message, 'not subscribed');
  });

  var noThesaurusKey = await translate('above', { dictionary: 'thesaurus', thesaurusApiKey: '' });
  check('选了同义词词典但没填它的 Key', function () {
    expectEqual(noThesaurusKey.error.type, 'secretKey');
    expectContains(noThesaurusKey.error.message, 'thesaurus');
    expectContains(noThesaurusKey.error.addition, 'dictionaryapi.com');
  });
}

async function testUsageNoteArrow() {
  console.log('\n用法说明的箭头');

  responses = { good: { status: 200, payload: fixture('collegiate-uns.json') } };
  var uns = await translate('good');
  check('只有用法说明的义项：箭头直接跟在编号后面', function () {
    var text = uns.result.content.text;
    expectContains(text, '**(8)** → used in speech as a response signaling approval or agreement');
    expectContains(text, '> "I\'m ready to go when you are." "*Good*, let\'s get going.');
  });
  check('定义例句之后的用法说明另起一行', function () {
    var text = uns.result.content.text;
    expectContains(text, '\n\n→ often used in faint praise\n');
    var previous = text.indexOf('Keep up the *good* work.');
    var arrow = text.indexOf('→ often used in faint praise');
    var following = text.indexOf('The movie was *good* but not great.');
    expect(previous >= 0 && arrow > previous && following > arrow, '顺序应为：例句 → 用法说明 → 说明的例句');
  });
  check('用法说明自己的例句排在箭头之后', function () {
    var text = uns.result.content.text;
    var arrow = text.indexOf('→ used in speech');
    var example = text.indexOf('*Good*, let\'s get going');
    expect(arrow >= 0 && example > arrow, '例句应该在用法说明之后');
  });
  check('缩进仍是 1.1.0 的排版（没有 &nbsp; 实体）', function () {
    expectNotContains(uns.result.content.text, '&nbsp;');
  });

  // 老版本 Bob 走纯文本，也不能把实体露出来
  global.$env.appVersion = '1.20.5';
  var legacy = await translate('good');
  global.$env.appVersion = '1.21.0';
  check('纯文本模式不出现 &nbsp; 实体', function () {
    var text = legacy.result.content.text;
    expectNotContains(text, '&nbsp;');
    expectNotContains(text, '**');
  });
}

async function testBadgeAndLayout() {
  console.log('\n灰色底标签与释义排版');

  responses = { water: { status: 200, payload: fixture('collegiate-water.json') } };
  var water = await translate('water');
  check('词形变化排在编号后面、标签用行内代码', function () {
    var text = water.result.content.text;
    expectContains(text, '**1 a (1)** **wa·ters** /ˈwȯ-tərz/ `plural`: the water occupying');
  });
  check('词头标签用行内代码', function () {
    expectContains(water.result.content.text, '**n.** `often attributive`');
  });
  check('具体化说明不带项目符号', function () {
    var text = water.result.content.text;
    expectContains(text, '\n\n*specifically* a lustrous appearance');
    expectNotContains(text, '- *specifically*');
  });

  responses = { good: { status: 200, payload: fixture('collegiate-sen-heading.json') } };
  var good = await translate('good');
  check('义项标签用行内代码', function () {
    expectContains(good.result.content.text, '**g** `sports`');
  });

  // 纯文本模式不应该露出反引号
  global.$env.appVersion = '1.20.5';
  var legacy = await translate('good');
  global.$env.appVersion = '1.21.0';
  check('纯文本模式不出现反引号', function () {
    expectNotContains(legacy.result.content.text, '`');
  });
}

async function testValidate() {
  console.log('\n密钥验证');
  responses = { test: { status: 200, payload: fixture('collegiate-good.json') } };
  var ok = await validate();
  check('Key 可用', function () {
    expectEqual(ok.result, true);
  });

  responses = { test: { status: 403 } };
  var bad = await validate();
  check('Key 无效', function () {
    expectEqual(bad.result, false);
    expectEqual(bad.error.type, 'secretKey');
  });

  var missing = await validate({ apiKey: '' });
  check('未填写 Key', function () {
    expectEqual(missing.result, false);
    expectEqual(missing.error.type, 'secretKey');
  });
}

function testMetadata() {
  console.log('\n插件元信息');
  check('语言列表', function () {
    var languages = plugin.supportLanguages();
    expect(languages.indexOf('en') >= 0, '应支持 en');
    expect(languages.indexOf('zh-Hans') >= 0, '应支持 zh-Hans');
  });
  check('超时时间在允许范围内', function () {
    var interval = plugin.pluginTimeoutInterval();
    expect(interval >= 30 && interval <= 300, '超时时间应为 30-300 秒');
  });
  check('info.json 与 main.js 一致', function () {
    var info = JSON.parse(fs.readFileSync(path.join(ROOT, 'info.json'), 'utf8'));
    expectEqual(info.identifier, 'com.cdacl.bobplugin.merriamwebster');
    expectEqual(info.category, 'translate');
    expect(info.options.length >= 4, '选项太少');
    var ids = info.options.map(function (option) {
      return option.identifier;
    });
    ['apiKey', 'dictionary', 'resultStyle', 'showExamples', 'cacheDays'].forEach(function (id) {
      expect(ids.indexOf(id) >= 0, '缺少选项 ' + id);
    });
  });
}

async function preview() {
  console.log('\n===== 渲染效果预览 =====');
  resetOptions({});
  responses = { good: { status: 200, payload: fixture('collegiate-good.json') } };
  var result = await translate('good');
  console.log(result.result.content.text);
  console.log('\n===== 词典面板数据 =====');
  console.log(JSON.stringify(result.result.toDict, null, 2));

  responses = { tab: { status: 200, payload: fixture('collegiate-tab.json') } };
  var nested = await translate('tab');
  console.log('\n===== 复杂义项（pseq / bs / sx） =====');
  console.log(nested.result.content.text);

  responses = { good: { status: 200, payload: fixture('collegiate-good.json') } };
  global.$env.appVersion = '1.20.5';
  var legacy = await translate('good', { showExamples: 'off' });
  global.$env.appVersion = '1.21.0';
  console.log('\n===== 老版本 Bob 的纯文本输出 =====');
  console.log(legacy.result.content.text);

  responses = { above: { status: 200, payload: fixture('thesaurus-above.json') } };
  var thesaurus = await translate('above', { dictionary: 'thesaurus' });
  console.log('\n===== 同义词词典 =====');
  console.log(thesaurus.result.content.text);
}

async function main() {
  console.log('Merriam-Webster 词典插件的单元测试');

  testMarkup();
  testAudio();
  testMetadata();
  await testTranslate();
  await testCache();
  await testOtherDictionaries();
  await testNestedSenses();
  await testRealResponseShapes();
  await testUsageNoteArrow();
  await testBadgeAndLayout();
  await testValidate();
  await preview();

  console.log('\n通过 ' + passed + ' 项，失败 ' + failed + ' 项');
  if (failed) {
    console.log('失败项：');
    failures.forEach(function (item) {
      console.log('  - ' + item);
    });
    process.exit(1);
  }
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
