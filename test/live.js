/**
 * 真实接口联调：用真的 Merriam-Webster API 跑一遍插件
 *
 * 用法（Key 只从环境变量读，不写进仓库）：
 *   MW_KEY=xxxx node test/live.js [词1] [词2] ...
 *
 * 不带参数时跑一组默认词：常见词、动词、名词复数、有「或」并列词形的形容词、
 * 拼错词（看建议），以及同义词词典与西英词典各查一个。
 */

var https = require('https');

var KEY = process.env.MW_KEY || '';
var THE_KEY = process.env.MW_THESAURUS_KEY || '';
if (!KEY) {
  console.error('缺少 MW_KEY 环境变量');
  process.exit(1);
}

var WORDS = process.argv.slice(2);
var DEFAULTS = [
  ['good', 'collegiate'],
  ['run', 'collegiate'],
  ['child', 'collegiate'],
  ['little', 'collegiate'],
  ['tassel', 'collegiate'],
  ['gaood', 'collegiate'],
  ['above', 'thesaurus']
];
if (!WORDS.length) WORDS = DEFAULTS.map(function (item) { return item[0]; });

// ---------- 模拟 Bob 注入的宿主对象 ----------
var memoryFS = {};

global.$env = {
  appVersion: '1.21.3',
  appBuild: '210',
  macOSVersion: '14.5',
  macModel: 'Mac14,2'
};
global.$log = {
  info: function () {},
  warn: function () {},
  error: function () {}
};
global.$option = {};
global.$data = {
  fromUTF8: function (text) {
    return { toUTF8: function () { return text; } };
  },
  isData: function (value) {
    return !!(value && typeof value.toUTF8 === 'function');
  }
};
global.$file = {
  read: function (path) { return memoryFS[path] || null; },
  write: function (params) {
    memoryFS[params.path] = params.data;
    return true;
  },
  delete: function (path) {
    delete memoryFS[path];
    return true;
  },
  exists: function (path) { return !!memoryFS[path]; },
  mkdir: function () { return true; }
};

global.$http = {
  get: function (params) {
    var req = https.get(params.url, { headers: params.header || {} }, function (res) {
      var chunks = [];
      res.on('data', function (chunk) { chunks.push(chunk); });
      res.on('end', function () {
        var body = Buffer.concat(chunks).toString('utf8');
        var parsed = null;
        try { parsed = JSON.parse(body); } catch (error) { parsed = body; }
        params.handler({
          data: parsed,
          rawData: body,
          response: { statusCode: res.statusCode, headers: res.headers }
        });
      });
    });
    req.on('error', function (error) {
      params.handler({ error: { message: error.message } });
    });
    req.setTimeout(20000, function () {
      req.destroy(new Error('timeout'));
    });
    return req;
  }
};

var main = require('../main.js');

function lookup(text, dictKey) {
  return new Promise(function (resolve) {
    global.$option = {
      apiKey: KEY,
      thesaurusApiKey: THE_KEY,
      dictionary: dictKey || 'collegiate',
      resultStyle: 'both',
      showExamples: 'on',
      cacheDays: '0'
    };
    var started = Date.now();
    main.translate(
      {
        text: text,
        from: 'en',
        to: 'zh-Hans',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
        onCompletion: function (data) {
          resolve({ data: data, ms: Date.now() - started });
        }
      },
      function () {}
    );
  });
}

function print(text, dictKey, outcome) {
  var data = outcome.data;
  console.log('\n' + '='.repeat(64));
  console.log('# ' + text + '  (' + (dictKey || 'collegiate') + ')  ' + outcome.ms + 'ms');
  if (data.error) {
    console.log('❌ 错误：' + data.error.type + ' / ' + data.error.message);
    return;
  }
  var result = data.result || {};
  if (result.toDict) {
    var dict = result.toDict;
    console.log('词头：' + dict.word);
    console.log('音标：' + JSON.stringify((dict.phonetics || []).map(function (item) {
      return item.value + ' [' + item.type + '] ' + (item.tts ? item.tts.value : '');
    })));
    console.log('词性：' + JSON.stringify((dict.parts || []).map(function (part) {
      return part.part + '×' + part.means.length;
    })));
    if (dict.exchanges) {
      console.log('变化：' + JSON.stringify(dict.exchanges));
    }
    if (dict.additions) {
      console.log('附加：' + JSON.stringify(dict.additions.map(function (item) { return item.name; })));
    }
  }
  if (result.content) {
    console.log('--- ' + result.content.format + ' ---');
    console.log(result.content.text);
  }
}

(async function () {
  for (var i = 0; i < WORDS.length; i++) {
    var word = WORDS[i];
    var dictKey = 'collegiate';
    DEFAULTS.forEach(function (pair) {
      if (pair[0] === word) dictKey = pair[1];
    });
    var outcome = await lookup(word, dictKey);
    print(word, dictKey, outcome);
  }
  // 顺带验证一下 Key 校验接口
  var validated = await new Promise(function (resolve) {
    global.$option = { apiKey: KEY, thesaurusApiKey: THE_KEY, dictionary: 'collegiate' };
    main.pluginValidate(function (data) { resolve(data); });
  });
  console.log('\n' + '='.repeat(64));
  console.log('pluginValidate → ' + JSON.stringify(validated));
})();
