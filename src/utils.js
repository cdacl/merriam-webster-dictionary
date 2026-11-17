/**
 * 一些通用的小工具
 */

// 比较版本号，a > b 返回 1，a < b 返回 -1，相等返回 0
function compareVersion(a, b) {
  var pa = String(a || '0').split('.');
  var pb = String(b || '0').split('.');
  var len = Math.max(pa.length, pb.length);
  for (var i = 0; i < len; i++) {
    var na = parseInt(pa[i] || '0', 10);
    var nb = parseInt(pb[i] || '0', 10);
    if (isNaN(na)) na = 0;
    if (isNaN(nb)) nb = 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// 从若干可能的字段里取出一段文本，兼容 string 和 {name: '...'} 两种写法
function textOf(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    if (typeof value.name === 'string') return value.name;
    if (typeof value.text === 'string') return value.text;
    if (typeof value.l === 'string') return value.l;
  }
  return '';
}

// 合并多余空白
function collapse(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

// 截断过长的文本
function truncate(text, max) {
  text = String(text || '');
  if (!max || text.length <= max) return text;
  return text.slice(0, max - 1).replace(/[\s,;:]$/, '') + '…';
}

// 数组去重、去空
function uniqueList(list) {
  var seen = {};
  var out = [];
  (list || []).forEach(function (item) {
    var k = String(item);
    if (!k || seen[k]) return;
    seen[k] = true;
    out.push(item);
  });
  return out;
}

// 安全地解析 JSON
function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

module.exports = {
  compareVersion: compareVersion,
  textOf: textOf,
  collapse: collapse,
  truncate: truncate,
  uniqueList: uniqueList,
  parseJSON: parseJSON
};
