/**
 * Merriam-Webster 接口请求
 *
 * 接口：GET https://dictionaryapi.com/api/v3/references/{ref}/json/{word}?key={KEY}
 * 返回：JSON 数组。命中时是词条对象数组，未收录时是「你是不是想查」的字符串数组。
 */

var Config = require('./config.js');
var Cache = require('./cache.js');
var Utils = require('./utils.js');

function buildURL(word, dictKey, apiKey) {
  var dictionary = Config.DICTIONARIES[dictKey] || Config.DICTIONARIES.collegiate;
  return (
    Config.API_PREFIX + dictionary.ref + '/json/' +
    encodeURIComponent(word) + '?key=' + encodeURIComponent(apiKey)
  );
}

// 从 $http 的回包里取出 JSON 数据
function payloadOf(response) {
  var data = response ? response.data : null;
  if (typeof data === 'string') return Utils.parseJSON(data);
  if (data && typeof data === 'object') {
    if (typeof $data !== 'undefined' && $data && typeof $data.isData === 'function' && $data.isData(data)) {
      return Utils.parseJSON(data.toUTF8() || '');
    }
    return data;
  }
  return null;
}

// 把各种失败情况统一成 Bob 的 service error
function serviceError(statusCode, response) {
  if (statusCode === 401 || statusCode === 403) {
    return {
      type: 'secretKey',
      message: Config.TEXT.badKey,
      addition: Config.TEXT.badKeyHint,
      troubleshootingLink: Config.TEXT.keyLink
    };
  }
  if (statusCode === 404) {
    return { type: 'notFound', message: Config.TEXT.notFound };
  }
  if (statusCode === 429) {
    return {
      type: 'api',
      message: Config.TEXT.quota,
      addition: Config.TEXT.quotaHint,
      troubleshootingLink: Config.TEXT.keyLink
    };
  }
  var detail = '';
  if (response && response.rawData) {
    var raw = response.rawData.toUTF8 ? response.rawData.toUTF8() : '';
    detail = Utils.truncate(Utils.collapse(raw), 120);
  }
  return {
    type: 'api',
    message: Config.TEXT.apiError,
    addition: detail || (statusCode ? 'HTTP ' + statusCode : '')
  };
}

/**
 * 发起一次查询，resolve 出接口返回的 JSON 数组
 */
function request(word, dictKey, options, cancelSignal) {
  var url = buildURL(word, dictKey, options.apiKey);
  return new Promise(function (resolve, reject) {
    var params = {
      url: url,
      timeout: 20,
      handler: function (response) {
        if (response && response.error) {
          reject({
            type: 'network',
            message: Config.TEXT.network,
            addition: response.error.message || ''
          });
          return;
        }
        var statusCode = response && response.response ? response.response.statusCode : 0;
        // 先把 HTTP 层的失败处理干净，免得 403 被当成「未收录」
        if (statusCode >= 400) {
          reject(serviceError(statusCode, response));
          return;
        }
        var payload = payloadOf(response);
        if (payload === null || payload === undefined) {
          // Key 有效但没订阅这部词典时，接口会返回 200 + 一行纯文本
          var raw = '';
          if (response && response.rawData) {
            raw = response.rawData.toUTF8 ? response.rawData.toUTF8() : String(response.rawData);
          }
          if (/not subscribed|invalid api key/i.test(raw)) {
            var dictionary = Config.DICTIONARIES[dictKey] || Config.DICTIONARIES.collegiate;
            reject({
              type: 'secretKey',
              message: Config.TEXT.notSubscribed,
              addition: 'Merriam-Webster registers keys per dictionary: generate a key for "' +
                dictionary.name + '" at dictionaryapi.com, or switch back to a dictionary your key covers.',
              troubleshootingLink: Config.TEXT.keyLink
            });
            return;
          }
          reject(serviceError(statusCode, response));
          return;
        }
        resolve(payload);
      }
    };
    if (cancelSignal) params.cancelSignal = cancelSignal;
    $http.get(params);
  });
}

/**
 * 带缓存的查询
 */
function lookup(word, dictKey, options, cancelSignal) {
  var ttlDays = options.cacheDays || 0;
  var cached = Cache.read(dictKey, word, ttlDays);
  if (cached) {
    return Promise.resolve({ response: cached, cached: true });
  }
  return request(word, dictKey, options, cancelSignal).then(function (response) {
    Cache.write(dictKey, word, response);
    return { response: response, cached: false };
  });
}

module.exports = {
  buildURL: buildURL,
  request: request,
  lookup: lookup
};
