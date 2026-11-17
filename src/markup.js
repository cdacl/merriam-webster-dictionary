/**
 * Merriam-Webster 富文本标记（running text markup）解析与渲染
 *
 * 文档：https://www.dictionaryapi.com/products/json#sec-2.29
 *
 * 标记分三类：
 *   1. 成对标记  {b}加粗{/b}、{it}斜体{/it}、{sc}小型大写{/sc}、{gloss}…{/gloss} 等
 *   2. 单个标记  {bc}加粗冒号、{ldquo}、{p_br} 换段、{ds|t|1|a|1} 日期义项 等
 *   3. 链接标记  {a_link|词}、{dxt|词|id}、{sx|词||3}、{mat|词|} 等，显示第一个字段
 *
 * 渲染模式：'md' 输出 Markdown 内联标记，'plain' 输出纯文本
 */

var LINK_TOKENS = {
  a_link: true,
  d_link: true,
  i_link: true,
  et_link: true,
  dxt: true,
  dxn: true,
  cxt: true,
  mat: true,
  sx: true,
  lx: true,
  cxl: true
};

// 成对标记在两种模式下的起止符号；返回 null 表示不是成对标记
function pairMarkers(name, markdown) {
  switch (name) {
    case 'b':
    case 'parahw':
      return markdown ? ['**', '**'] : ['', ''];
    case 'it':
    case 'wi':
    case 'qword':
      return markdown ? ['*', '*'] : ['', ''];
    case 'phrase':
      return markdown ? ['***', '***'] : ['', ''];
    case 'gloss':
      return ['[', ']'];
    case 'dx':
    case 'dx_ety':
      return ['— ', ''];
    case 'dx_def':
      return ['(', ')'];
    case 'sc':
    case 'sup':
    case 'inf':
    case 'ma':
    case 'un':
    case 'st':
    case 'pt':
    case 'emb':
      return ['', ''];
    default:
      return null;
  }
}

// Markdown 里有特殊含义的字符，出现在正文中时要转义
function escapeText(text, markdown) {
  if (!markdown) return text;
  return text.replace(/([*_`\[\]])/g, function (ch) {
    return '\\' + ch;
  });
}

// 日期义项标记：{ds|t|1|a|1} → （第 1a(1) 义）
function dateSenseToken(fields) {
  var num = (fields[2] || '') + (fields[3] || '');
  if (fields[4]) num += '(' + fields[4] + ')';
  if (!num) return '';
  return ' (sense ' + num + ')';
}

function normalize(text) {
  return text
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n{2} ?/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
}

function endsWithSpace(text) {
  return text.length === 0 || /[\s(（—]$/.test(text);
}

/**
 * 把一段 MW 标记文本渲染成字符串
 * @param {string} raw 原始标记文本
 * @param {string} mode 'md' | 'plain'
 */
function render(raw, mode) {
  if (raw === undefined || raw === null || raw === '') return '';
  var markdown = mode === 'md';
  var source = String(raw);
  var out = '';
  var open = [];
  var lastIndex = 0;
  var re = /\{([^{}]*)\}/g;
  var match;

  while ((match = re.exec(source)) !== null) {
    out += escapeText(source.slice(lastIndex, match.index), markdown);
    lastIndex = re.lastIndex;

    var token = match[1] || '';
    var fields = token.split('|');
    var name = (fields[0] || '').toLowerCase();

    if (!name) continue;

    // 闭合标记
    if (name.charAt(0) === '/') {
      out += closeTag(name.slice(1), open);
      continue;
    }

    var markers = pairMarkers(name, markdown);
    if (markers) {
      out += markers[0];
      open.push({ name: name, marker: markers[1] });
      continue;
    }

    out += singleToken(name, fields, markdown, out);
  }

  out += escapeText(source.slice(lastIndex), markdown);
  return normalize(out);
}

// 处理成对标记的闭合；MW 数据是良构的，这里只做容错
function closeTag(name, open) {
  for (var i = open.length - 1; i >= 0; i--) {
    if (open[i].name === name) {
      var out = '';
      while (open.length > i) {
        out += open.pop().marker;
      }
      return out;
    }
  }
  return '';
}

function singleToken(name, fields, markdown, soFar) {
  switch (name) {
    case 'bc':
      return ': ';
    case 'ldquo':
      return '“';
    case 'rdquo':
      return '”';
    case 'lsquo':
      return '‘';
    case 'rsquo':
      return '’';
    case 'p_br':
      return '\n\n';
    case 'plus':
      return '+';
    case 'minus':
      return '−';
    case 'lt':
      return '<';
    case 'gt':
      return '>';
    case 'amp':
      return '&';
    case 'ds':
      return dateSenseToken(fields);
    default:
      break;
  }

  // 「more at」链接：前面需要破折号和 more at
  if (name === 'mat') {
    var more = '— more at ' + (fields[1] || '');
    return endsWithSpace(soFar) ? more : ' ' + more;
  }

  // 带义项编号的交叉引用：{sx|word||3}
  if (name === 'sx') {
    var senseNumber = fields[3] || '';
    return (fields[1] || '') + (senseNumber ? ' ' + senseNumber : '');
  }

  if (LINK_TOKENS[name]) {
    return fields.length > 1 ? fields[1] || '' : '';
  }

  // 未知标记：有内容就显示第一个字段，否则直接丢弃
  return fields.length > 1 ? fields[1] || '' : '';
}

// 去掉所有标记，得到纯文本
function toPlainText(raw) {
  return render(raw, 'plain');
}

/**
 * 处理词头里的音节分隔符，例如 kab*ba*lah → kab·ba·lah
 */
function cleanHeadword(word) {
  if (!word) return '';
  return String(word).replace(/\*/g, '·').replace(/\s+/g, ' ').trim();
}

module.exports = {
  render: render,
  toPlainText: toPlainText,
  cleanHeadword: cleanHeadword
};
