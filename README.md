# Merriam-Webster 词典 · Bob 插件

在 [Bob](https://bobtranslate.com) 里直接查 Merriam-Webster（韦氏词典）的词条：音标、真人发音、英文释义、例句、词形变化、词源，以及同义词 / 反义词。

数据来自 [Merriam-Webster Dictionary API](https://www.dictionaryapi.com/products/json)，插件本身不采集、不上传任何用户数据。

## 功能

- **词典面板**：词头、音标（可点击发音）、按词性分组的释义、词形变化（plural / past / comparative…，带各自的音标）、词源与首次使用年代。
- **分隔线**：面板和完整释义上下并列时，完整释义最前面有一条分隔线，两块内容不会糊在一起。
- **完整释义**：Markdown 排版的整条词条，包含义项编号（1 a、b、2 a…）、用法标签、例句、派生词。
- **Markdown 分块**：词条用三级标题（`### good`），词性分隔、用法说明、派生词、参见用四级标题（`#### Related`）；例句用引用块（`> *good news*`）与释义正文分开；同一词的不同词条之间用分割线隔开。
- **用法说明**：像 `good` 的「Good vs. Well: Usage Guide」这类用法辨析、以及同义词辨析，会作为独立小节排在释义后面。
- **参见**：条目里的 `see also` 交叉引用。
- **只显示查的那个词**：Merriam-Webster 对 `good` 会连带返回 `best`、`better`、`good and` 等词条，插件只保留词头与查询词一致的条目，不会混进面板。
- **两部词典**：韦氏大学词典（Collegiate，默认）与韦氏同义词词典（Thesaurus），设置里切换。
- **同义词词典**：选「同义词词典」即可查近义词、反义词、相关词与近反义词（thesaurus 的 `syn_list` / `ant_list` / `rel_list` / `near_list`）。
- **纯英文输出**：面板与释义里没有任何中文标签，全部使用英文词典术语（`comparative`、`Etymology`、`Synonyms` 等）。
- **查不到时给出建议**：拼错了会把 Merriam-Webster 的建议词放进词典面板的「Did you mean」，一个词一行、可直接点击，点一下就把该词填回查询框再查一次。
- **本地缓存**：查询结果缓存在插件沙盒里，重复查询不消耗每日额度。

> **关于 Markdown**：标题、引用块、分割线需要 Bob 1.21.0 及以上且 macOS 13 及以上才会渲染；更早的 Bob 会自动退回纯文本排版（用 `·` 和缩进表示层级），内容不变。Bob 的「偏好设置 - 翻译 - Markdown」里可以关闭渲染。

> **关于发音**：可点击播放的发音按钮来自 Bob 词典面板的 `phonetics` 字段，只能挂在词头上；词形变化（better / best 等）的音标会以文本形式跟在单词后面。Markdown 完整释义里不支持播放音频。

> **关于「用法指南」**：插件读取的是 API 的 `usages` / `syns` 字段。Merriam-Webster 网页上少数文章（如独立的 Usage Guide 专题页）不在 API 返回范围内，插件自然拿不到。

> 这是一个**英英词典**插件：它返回的是 Merriam-Webster 的英文释义，不是中英翻译。查 `good` 得到的是 `of a favorable character or tendency`，而不是「好的」。

## 安装

1. 到 [Releases](https://github.com/cdacl/merriam-webster-dictionary/releases/latest) 下载
   [`merriam-webster-dictionary-1.1.0.bobplugin`](https://github.com/cdacl/merriam-webster-dictionary/releases/download/v1.1.0/merriam-webster-dictionary-1.1.0.bobplugin)。
2. 双击安装（或者在 Bob 的「插件」页面里拖入）。
3. 在 Bob → 插件 → Merriam-Webster 词典 → 设置里填入 API Key。

插件已配置 `appcast`，之后有新版本时 Bob 会在插件页提示更新。
这个仓库同时打了 `bobplugin` topic，可以在
[GitHub bobplugin 列表](https://github.com/topics/bobplugin) 里被检索到。

也可以手动安装：把本仓库的 `info.json`、`main.js`、`icon.png`、`src/` 放进
`~/Library/Application Support/Bob/Plugins/com.cdacl.bobplugin.merriamwebster/`。

## 申请 API Key

Merriam-Webster 的接口需要 Key：

1. 打开 <https://dictionaryapi.com/register/index>，注册一个账号。
2. 在账号页面按需申请：**Collegiate Dictionary** 与 **Collegiate Thesaurus**，**每部词典的 Key 各自独立**。
3. 复制 Key 填进插件设置。

插件报「这把 Key 未订阅当前词典」时，说明 Key 本身有效，但没订阅设置里选中的那部词典 ——
到 dictionaryapi.com 后台为它再申请一把 Key，或者在设置里换回已订阅的词典。

免费 Key 的额度是**每把 Key 每天 1000 次查询**，仅限非商业用途；商业使用或需要更高额度请向 Merriam-Webster 购买授权。
如果插件报「Key 无效或已过期」，通常是复制时多了空格，或者拿错了词典的 Key。

Merriam-Webster 的 Key 与词典绑定，用错了插件会直接提示「未订阅」。

设置里有两栏 Key：**API Key** 给主词典用，**同义词词典 Key** 只在把「词典」选成「同义词词典」时才会用到。
两栏都填上之后，切换「词典」就能在英英释义和同义词之间来回查，不用再手动换 Key。

## 设置项

| 设置 | 说明 |
| --- | --- |
| API Key | 韦氏大学词典的接口密钥，保存在 Bob 的本地设置里（密文输入框）。 |
| 同义词词典 Key | 只在「词典」选成「同义词词典」时使用；Thesaurus 的 Key 与主词典不通用，没填会提示。 |
| 词典 | 韦氏大学词典（默认）/ 韦氏同义词词典。 |
| 结果显示 | 词典面板 + 完整释义（默认）/ 只看词典面板 / 只看完整释义。 |
| 例句 | 是否在释义里显示例句。 |
| 缓存有效期 | 1 / 7（默认）/ 30 天，或关闭缓存。 |

## 支持的查询

- 单个英文单词，以及词典收录的短语（如 `give up`、`in spite of`）。
- 大小写会自动回退：查 `paris` 查不到时会再试 `Paris`。
- 中文、日文、韩文输入会直接提示「Merriam-Webster 是英英词典」，不浪费接口额度。

## 目录结构

```
.
├── info.json               插件信息与设置项定义
├── main.js                 入口：supportLanguages / translate / pluginValidate
├── icon.png                插件图标（256×256）
├── src
│   ├── api.js              接口请求、错误映射、带缓存的查询
│   ├── cache.js            沙盒内的 JSON 缓存
│   ├── config.js           接口地址、词典列表、词性缩写、文案
│   ├── markup.js           Merriam-Webster 的 {bc} {it} {dxt|…} 等标记渲染
│   ├── parse.js            接口 JSON → 词条模型
│   ├── render.js           词条模型 → Markdown 释义 / 词典面板数据
│   └── utils.js            版本比较、文本处理等小工具
├── test
│   ├── run.js              Node 下的单元测试（模拟 Bob 环境）
│   └── fixtures            真实结构的接口响应样本
└── build
    ├── gen_icon.py         生成图标
    └── package.sh          打包成 .bobplugin
```

插件跑在 Bob 的 JavaScriptCore 里，没有 Node、没有浏览器 API，只能使用
`$http`、`$option`、`$file`、`$data`、`$env` 这些 Bob 注入的全局对象和自身的 `require`。

## 开发

```bash
# 单元测试（模拟 $http / $option / $file / $data / $env）
# 真实接口联调（Key 只从环境变量读，不会写进仓库）
MW_KEY=你的Key node test/live.js good run little
node test/run.js

# 重新生成图标
python3 build/gen_icon.py

# 打包
bash build/package.sh
```

改完代码后，把插件目录以 `.bobplugin` 结尾命名再双击，Bob 会用调试模式加载它，方便看 `$log` 输出。

## 许可与声明

- 插件代码：MIT。
- 词条数据版权归 Merriam-Webster 所有，接口使用须遵守
  [Merriam-Webster API 条款](https://dictionaryapi.com/products/api-collegiate-dictionary)。
- 公开发布本插件（包括上架应用商店）需要遵守 Merriam-Webster 的品牌规范，
  如果分发请自行确认授权范围。

## 更新记录

### 1.1.0

- 用 Bob 1.21.0 的 Markdown 渲染重排完整释义：词性分隔、用法说明、派生词、参见改成四级标题（`####`），例句改成引用块（`>`），同一词的不同词条之间加分割线，同义词/反义词等列表的标签加粗。
- 老版本 Bob（< 1.21.0）继续走纯文本排版，内容一致。

### 1.0.0

- 词典面板 + 完整释义：词头、音标（可点击发音）、按词性分组的释义、例句、词形变化（带各自的音标）、词源、首次使用、用法说明、参见。
- 两部词典：韦氏大学词典（Collegiate）与韦氏同义词词典（Thesaurus），Thesaurus 的 Key 单独一栏保存。
- 面板与释义全部为英文，不含中文标签。
- 拼错的词把 Merriam-Webster 的建议词放进面板的「Did you mean」，一个词一行、点击即回填查询框。
- 本地缓存（默认 7 天）、错误分类（未填 Key / Key 无效 / 未订阅 / 额度用尽 / 网络错误）。
