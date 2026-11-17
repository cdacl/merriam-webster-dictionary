/**
 * 本地缓存
 *
 * 把接口返回的原始 JSON 存到插件沙盒（$sandbox/cache）里，
 * 同一单词在有效期内重复查询不再消耗每天 1000 次的额度。
 */

var CACHE_DIR = '$sandbox/cache';
var MAX_SIZE = 200 * 1024; // 单条响应超过这个大小就不缓存了

// 简单的 FNV-1a 哈希，用来生成文件名
function hash(text) {
  var value = 0x811c9dc5;
  for (var i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return ('00000000' + value.toString(16)).slice(-8);
}

function pathOf(dictKey, word) {
  // 大小写敏感：Mercury（水星）和 mercury（水银）是两个不同的词条
  return CACHE_DIR + '/' + dictKey + '-' + hash(String(word)) + '.json';
}

function available() {
  return typeof $file !== 'undefined' && typeof $data !== 'undefined';
}

/**
 * 读取缓存，未命中或已过期返回 null
 * @param {string} dictKey 词典标识
 * @param {string} word 查询词
 * @param {number} ttlDays 有效期（天），0 表示不缓存
 */
function read(dictKey, word, ttlDays) {
  if (!ttlDays || !available()) return null;
  try {
    var path = pathOf(dictKey, word);
    if (!$file.exists(path)) return null;
    var data = $file.read(path);
    if (!data) return null;
    var text = data.toUTF8();
    if (!text) return null;
    var cached = JSON.parse(text);
    if (!cached || cached.word !== word || !cached.time) return null;
    if (Date.now() - cached.time > ttlDays * 86400000) return null;
    return cached.response;
  } catch (e) {
    return null;
  }
}

/**
 * 写入缓存，失败时静默忽略（缓存不该影响正常查询）
 */
function write(dictKey, word, response) {
  if (!available()) return false;
  try {
    var text = JSON.stringify({ word: word, time: Date.now(), response: response });
    if (text.length > MAX_SIZE) return false;
    if (!$file.exists(CACHE_DIR)) $file.mkdir(CACHE_DIR);
    return $file.write({
      data: $data.fromUTF8(text),
      path: pathOf(dictKey, word)
    });
  } catch (e) {
    return false;
  }
}

// 清空缓存
function clear() {
  if (!available()) return false;
  try {
    if (!$file.exists(CACHE_DIR)) return true;
    $file.list(CACHE_DIR).forEach(function (name) {
      $file.delete(CACHE_DIR + '/' + name);
    });
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  read: read,
  write: write,
  clear: clear,
  pathOf: pathOf
};
