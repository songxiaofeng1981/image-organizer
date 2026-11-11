// Steps 1–13: install the extension, then the Mac helper. Each step: a scene (HTML of the pretend screen),
// cursor keyframes [ms, target], events, length. Targets are a CSS selector or [x, y] on the 960×600 stage.
// Events: ['show', t0, sel, t1?] ['hide', t0, sel] ['cls', t0, sel, class, t1?] ['type', t0, t1, sel, text]
//         ['follow', t0, t1, sel, dx, dy] ['prog', t0, t1, sel] ['key', t0, t1, label] ['click', t0]
// 第 1–13 步：安装插件，再安装本机助手。每一步有画面、光标关键帧、事件和时长。

const ICON = 'icon.png';
const FOLDER = 'image-organizer-v2.5.0';
const PUZZLE = '<svg viewBox="0 0 24 24"><path d="M10 3a2 2 0 0 1 4 0v2h4a1 1 0 0 1 1 1v4h-2a2 2 0 0 0 0 4h2v4a1 1 0 0 1-1 1h-4v-2a2 2 0 0 0-4 0v2H6a1 1 0 0 1-1-1v-4h2a2 2 0 0 0 0-4H5V6a1 1 0 0 1 1-1h4Z"/></svg>';
const PIN = '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M14 3l7 7-3 1-4 4 1 5-2 1-4-4-5 5-1-1 5-5-4-4 1-2 5 1 4-4z" fill="currentColor"/></svg>';

const menubar = (T, app) => `<div class="menubar"><span class="apple"></span><b>${app}</b><span>${T('文件', 'File')}</span><span>${T('编辑', 'Edit')}</span><span>${T('显示', 'View')}</span><span class="r">${T('周三 上午10:30', 'Wed 10:30 AM')}</span></div>`;

/** A Chrome window filling the screen. pinned: 'yes' | 'no' | 'later' (the toolbar icon appears during the step). */
function chrome(T, { url, tab, body, extra = '', pinned = 'yes', fav = '' }) {
  const io = pinned === 'no' ? '' : `<span class="tb-ico${pinned === 'later' ? ' hid' : ''}" id="ioIcon"><img src="${ICON}" alt=""></span>`;
  return menubar(T, 'Google Chrome') + `<div class="win chrome" style="left:0;top:24px;width:960px;height:576px;border-radius:10px 10px 0 0">
    <div class="tabs"><span class="lights"><i></i><i></i><i></i></span><div class="tab">${fav || '<i class="fav"></i>'}<span>${tab}</span>×</div></div>
    <div class="tbar"><span class="nav">‹ › ↻</span><div class="omni">${url}</div>${io}<span class="tb-ico" id="puzzle">${PUZZLE}</span><span class="avatar"></span></div>
    <div class="cbody">${body}</div>${extra}</div>`;
}

const GALLERY_URL = 'chrome-extension://…/gallery.html';
const galleryTab = T => ({ url: GALLERY_URL, tab: T('待整理 · 图片整理', 'To Sort · Image Organizer'), fav: `<img src="${ICON}" alt="">` });
const CATS = T => [[T('工作', 'Work'), '#34c759'], [T('家庭', 'Family'), '#007aff'], [T('参考素材', 'Reference'), '#ff9500']];

/** The gallery page. foot: 'ok' | 'bad' | 'switch' (bad until #footOk is shown). */
function gallery(T, { main, foot = 'ok' }) {
  const cats = CATS(T).map(([n, c], i) => `<div class="gs-i"><i class="dot" style="background:${c}"></i>${n}<kbd>${i + 1}</kbd></div>`).join('');
  const ok = `<div class="gs-foot${foot === 'switch' ? ' hid' : ''}" id="footOk"><i></i>${T('本机助手已连接', 'Helper connected')}</div>`;
  const bad = `<div class="gs-foot" id="footBad"><i class="bad"></i>${T('本机助手未连接', 'Helper not connected')}</div>`;
  return `<div class="gal"><aside class="gside">
    <div class="gs-h">${T('待整理', 'To Sort')}</div><div class="gs-i act">${T('下载', 'Downloads')}<span>26</span></div>
    <div class="gs-h">${T('图片库', 'Picture Library')}</div><div class="gs-i">${T('全部图片', 'All Pictures')}<span>0</span></div>${cats}
    <div class="gs-h">${T('智能分类', 'Smart Categories')}</div><div class="gs-i">${T('截图', 'Screenshots')}<span>4</span></div><div class="gs-i">${T('小红书', 'Xiaohongshu')}<span>6</span></div><div class="gs-i">${T('重复的副本', 'Duplicates')}<span>2</span></div>
    ${foot === 'bad' ? bad : foot === 'switch' ? bad.replace('class="gs-foot"', 'class="gs-foot" ') + ok : ok}
  </aside><section class="gmain">${main}</section></div>`;
}

const gheader = (T, title, sub) => `<div class="gh"><div><b>${title}</b><small>${sub}</small></div><div class="gtools"><span class="gsearch">${T('搜索', 'Search')}</span><span class="gsel" id="kind"><span id="kindAll">${T('全部', 'All')}</span><span id="kindVid" class="hid">${T('视频', 'Videos')}</span> ⌄</span><span class="gsel">${T('最新在前', 'Newest First')} ⌄</span></div></div>`;
const tiles = list => list.map(([p, w, badge, id]) => `<div class="tile ph ${p}" style="width:${w}px"${id ? ` id="${id}"` : ''}>${badge ? `<span class="badge">${badge}</span>` : ''}</div>`).join('');
const INBOX = [['p0', 200], ['p1', 150], ['p2', 180, '', 't3'], ['p3', 192], ['p4', 160], ['p5', 220], ['p6', 120, 'GIF'], ['p7', 222], ['p1', 180], ['p3', 170, '▶ 0:42'], ['p0', 190], ['p2', 182]];
const inboxGrid = T => `<div class="ggrid" id="grid"><h5>${T('今天', 'Today')}</h5>${tiles(INBOX)}</div>`;
const inboxHeader = T => gheader(T, T('待整理', 'To Sort'), T('24 张图片、2 个视频', '24 pictures, 2 videos'));

function statusCard(T) {
  const steps = T(['点下面的“下载本机助手”，然后在“下载”文件夹里双击 image-organizer.zip 解压。', '打开“终端”，输入 bash 和一个空格，把解压出来的文件夹里的 install.sh 拖进窗口，按回车。', '回到这里，点“重试”。'],
    ['Click “Download the Helper” below, then double-click image-organizer.zip in Downloads to unzip it.', 'Open Terminal, type bash and a space, drag install.sh from the unzipped folder into the window, and press Return.', 'Come back here and click Try Again.']);
  return `<div class="status" id="status"><div class="scard"><div class="sic">⬇︎</div>
    <h2>${T('还差一步：安装本机助手', 'One more step: install the helper')}</h2>
    <p>${T('Chrome 插件自己无法读取“下载”文件夹，需要一个小助手程序替它读取。', 'A Chrome extension can’t read your Downloads folder by itself, so a small helper app does it.')}</p>
    <ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol>
    <span class="gbtn pri" id="retry">${T('重试', 'Try Again')}</span><span class="gbtn" id="dl">${T('下载本机助手', 'Download the Helper')}</span><span class="gbtn">${T('看安装演示', 'Watch the Guide')}</span>
  </div></div>`;
}

const webPage = T => `<div class="web"><h2>${T('秋天的厨房灵感', 'Kitchen ideas for autumn')}</h2><p>example.com · ${T('一篇有很多图的文章', 'an article with many pictures')}</p>
  <div class="pics"><div class="ph p0" id="wimg"></div><div class="ph p3"></div><div class="ph p5"></div></div>
  <div class="lines"><i style="width:92%"></i><i style="width:80%"></i><i style="width:86%"></i><i style="width:60%"></i></div></div>`;

const storePage = T => `<div class="store"><div class="st-logo"><i></i>chrome web store</div>
  <div class="st-head"><img src="${ICON}" alt=""><div><h2>${T('图片整理', 'Image Organizer')}</h2><p>songxiaofeng1981 · ${T('工具', 'Tools')}</p></div><span class="btn pri" id="addBtn">${T('添加至 Chrome', 'Add to Chrome')}</span></div>
  <div class="st-shots"><div class="ph p1"></div><div class="ph p2"></div><div class="ph p5"></div></div></div>`;

// ---------- Finder and Terminal / 访达和终端 ----------

const fi = (kind, name, id = '', cls = '') => {
  const ic = kind === 'img' ? `<div class="ic ph ${cls}"></div>` : kind === 'doc' ? `<div class="ic doc" data-x="${name.split('.').pop().toUpperCase()}"></div>` : `<div class="ic ${kind}"></div>`;
  return `<div class="fi"${id ? ` id="${id}"` : ''}>${ic}<span>${name}</span></div>`;
};
const folderItems = T => [fi('folder', 'docs'), fi('folder', 'extension'), fi('folder', 'helper'), fi('sh', 'install.sh', 'inst'), fi('doc', 'README.md'), fi('sh', 'selftest.sh'), fi('sh', 'uninstall.sh')].join('');
const dlItems = (T, withFolder) => [fi('img', T('截屏2026-11-10.png', 'Screenshot 2026-11-10.png'), '', 'p4'), fi('img', 'IMG_4021.HEIC', '', 'p0'),
  fi('zip', 'image-organizer.zip', 'zip'), `<div class="fi${withFolder === 'later' ? ' hid' : ''}" id="fold"><div class="ic folder"></div><span>${FOLDER}</span></div>`].join('');

function finder(T, { x = 120, y = 60, w = 720, h = 440, body, title = T('下载', 'Downloads'), side = 'dl' }) {
  const s = (id, name) => `<div class="gs-i${side === id ? ' act' : ''}" id="sb${id}">${name}</div>`;
  return `<div class="win finder" id="finder" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">
    <div class="ftop"><span class="lights"><i></i><i></i><i></i></span><b>${title}</b></div>
    <div class="fside"><div class="gs-h">${T('个人收藏', 'Favorites')}</div>${s('recent', T('最近使用', 'Recents'))}${s('apps', T('应用程序', 'Applications'))}${s('desk', T('桌面', 'Desktop'))}${s('docs', T('文稿', 'Documents'))}${s('dl', T('下载', 'Downloads'))}</div>
    <div class="fmain">${body}</div></div>`;
}
const smallFinder = T => finder(T, { x: 16, y: 44, w: 440, h: 420, title: FOLDER, body: folderItems(T) });
const PROMPT = 'you@MacBook ~ % ';
const PATH = T => `/Users/${T('你', 'you')}/Downloads/${FOLDER}/install.sh `;
const term = (body, extra = '') => `<div class="win term" id="term" style="left:476px;top:44px;width:468px;height:420px${extra}"><div class="ttop"><span class="lights"><i></i><i></i><i></i></span><span>you — -zsh — 80×24</span></div><div class="tbody">${body}</div></div>`;

const alertBox = T => `<div class="alert" id="alert"><svg class="aic" viewBox="0 0 54 54"><rect x="4" y="12" width="46" height="34" rx="5" fill="#47a7ef"/><path d="M4 16a5 5 0 0 1 5-5h12l4 5Z" fill="#6ab9f4"/></svg>
  <b>${T('“Image Organizer Helper”想要访问“下载”文件夹中的文件。', '“Image Organizer Helper” would like to access files in your Downloads folder.')}</b>
  <p>${T('你可以稍后在“系统设置”的“隐私与安全性”中更改此决定。', 'You can change this decision later in Privacy & Security settings.')}</p>
  <div class="ab"><span id="deny">${T('不允许', 'Don’t Allow')}</span><span class="pri" id="allow">${T('允许', 'Allow')}</span></div></div>`;

// ---------- the steps / 步骤 ----------

const STEPS = [
  { // 1
    short: ['在商店点“添加至 Chrome”', 'Add to Chrome in the store'],
    cap: ['打开 Chrome 应用商店里的“图片整理”页面，点右边蓝色的“添加至 Chrome”。', 'Open Image Organizer in the Chrome Web Store and click the blue “Add to Chrome”.'],
    tip: ['商店链接在本页最下面的“常见问题”里。', 'The store link is in the questions at the bottom of this page.'],
    dur: 3600,
    scene: T => chrome(T, { url: 'chromewebstore.google.com/detail/image-organizer', tab: 'Chrome Web Store', pinned: 'no', body: storePage(T) }),
    cur: [[0, [640, 470]], [1300, '#addBtn'], [3600, '#addBtn']],
    ev: () => [['click', 1500], ['cls', 1500, '#addBtn', 'pressed', 1750]],
  },
  { // 2
    short: ['确认“添加扩展程序”', 'Confirm “Add extension”'],
    cap: ['Chrome 会问要不要添加，点“添加扩展程序”。', 'Chrome asks whether to add it. Click “Add extension”.'],
    tip: ['“与协作的本机应用通信”说的就是下一章要装的 Mac 本机助手。', '“Communicate with cooperating native applications” means the Mac helper you install in the next chapter.'],
    dur: 4600,
    scene: T => chrome(T, { url: 'chromewebstore.google.com/detail/image-organizer', tab: 'Chrome Web Store', pinned: 'no', body: storePage(T),
      extra: `<div class="cdlg hid" id="dlg" style="left:280px;top:84px"><h4>${T('要添加“图片整理”吗？', 'Add “Image Organizer”?')}</h4>${T('它可以：', 'It can:')}<ul><li>${T('管理您的下载内容', 'Manage your downloads')}</li><li>${T('与协作的本机应用通信', 'Communicate with cooperating native applications')}</li></ul>
        <div class="btns"><span class="btn">${T('取消', 'Cancel')}</span><span class="btn pri" id="addExt">${T('添加扩展程序', 'Add extension')}</span></div></div>
        <div class="cpanel cbubble hid" id="added"><img src="${ICON}" alt=""><div><b>${T('“图片整理”已添加到 Chrome', 'Image Organizer has been added to Chrome')}</b><small>${T('点拼图图标就能找到它', 'Find it under the puzzle icon')}</small></div></div>` }),
    cur: [[0, [640, 470]], [1300, '#addExt'], [2000, '#addExt'], [3400, [700, 330]]],
    ev: () => [['show', 200, '#dlg', 1900], ['click', 1500], ['cls', 1500, '#addExt', 'pressed', 1750], ['show', 2000, '#added']],
  },
  { // 3
    short: ['把图标固定到工具栏', 'Pin it to the toolbar'],
    cap: ['把它固定到工具栏：点右上角的拼图图标，再点“图片整理”旁边的图钉。', 'Pin it to the toolbar: click the puzzle icon at the top right, then the pin next to Image Organizer.'],
    tip: ['固定以后，以后点这个图标就能打开图片整理。', 'From now on, this icon opens Image Organizer.'],
    dur: 5800,
    scene: T => chrome(T, { url: 'chromewebstore.google.com/detail/image-organizer', tab: 'Chrome Web Store', pinned: 'later', body: storePage(T),
      extra: `<div class="cpanel hid" id="pmenu" style="right:40px;top:72px;width:260px;padding:10px 12px"><b>${T('扩展程序', 'Extensions')}</b>
        <div style="display:flex;align-items:center;gap:8px;margin:10px 0"><img src="${ICON}" width="18" alt="">${T('图片整理', 'Image Organizer')}<span id="pin" style="margin-left:auto;color:#5f6368">${PIN}</span></div>
        <div style="color:#5f6368;border-top:1px solid #eee;padding-top:8px">⚙ ${T('管理扩展程序', 'Manage extensions')}</div></div>` }),
    cur: [[0, [600, 320]], [1100, '#puzzle'], [1900, '#puzzle'], [2700, '#pin'], [3500, '#pin'], [4400, '#ioIcon'], [5800, '#ioIcon']],
    ev: () => [['click', 1300], ['show', 1400, '#pmenu', 3300], ['click', 2900], ['show', 3000, '#ioIcon'], ['cls', 3300, '#ioIcon', 'ring']],
  },
  { // 4
    short: ['点图标，打开图片整理', 'Click the icon, open it'],
    cap: ['点工具栏上的“图片整理”图标，再点“打开图片整理”。', 'Click the Image Organizer icon in the toolbar, then “Open Image Organizer”.'],
    dur: 3900,
    scene: T => chrome(T, { url: 'example.com/kitchen', tab: T('秋天的厨房灵感', 'Kitchen ideas'), body: webPage(T),
      extra: `<div class="cpanel pop hid" id="pop"><header><img src="${ICON}" width="20" alt=""><b>${T('图片整理', 'Image Organizer')}</b><span class="gbtn" id="popOpen">${T('打开图片整理', 'Open Image Organizer')}</span></header>
        <p class="note">${T('图片会存到“下载”。要直接存进分类，请安装 Mac 本机助手：打开图片整理查看安装步骤。', 'Pictures will be saved to Downloads. To save straight into categories, install the Mac helper: open Image Organizer for the steps.')}</p></div>` }),
    cur: [[0, [480, 400]], [1000, '#ioIcon'], [1700, '#ioIcon'], [2700, '#popOpen'], [3900, '#popOpen']],
    ev: () => [['click', 1200], ['show', 1300, '#pop', 3300], ['click', 2900], ['cls', 2900, '#popOpen', 'pressed', 3100]],
  },
  { // 5
    short: ['点“下载本机助手”', 'Download the helper'],
    cap: ['图库会提示“还差一步”。点“下载本机助手”，Chrome 会把 image-organizer.zip 存进“下载”文件夹。', 'The gallery says “One more step”. Click “Download the Helper”: Chrome saves image-organizer.zip to your Downloads folder.'],
    tip: ['本机助手是一个很小的 Mac 程序，替插件读取和整理“下载”里的文件。它免费、开源，从不联网。', 'The helper is a tiny Mac app that reads and files what is in Downloads for the extension. Free, open source, and it never goes online.'],
    dur: 5400,
    scene: T => chrome(T, { ...galleryTab(T), body: gallery(T, { main: statusCard(T), foot: 'bad' }),
      extra: `<div class="cpanel cbubble hid" id="dlb"><div class="ic zip" style="width:30px;height:38px;position:relative;background:#f2f2f2;border:1px solid #d0d0d0;border-radius:3px"></div><div><b>image-organizer.zip</b><small>2.1 MB · ${T('已完成', 'Done')}</small></div></div>` }),
    cur: [[0, [640, 540]], [1500, '#dl'], [2300, '#dl'], [3600, [760, 160]]],
    ev: () => [['click', 1700], ['cls', 1700, '#dl', 'pressed', 1900], ['show', 2100, '#dlb']],
  },
  { // 6
    short: ['在“下载”里双击 zip', 'Double-click the zip'],
    cap: ['打开“访达”，点左边的“下载”，双击 image-organizer.zip。旁边会出现一个文件夹。', 'Open Finder, click Downloads on the left and double-click image-organizer.zip. A folder appears next to it.'],
    dur: 5600,
    scene: T => menubar(T, T('访达', 'Finder')) + finder(T, { side: 'recent', title: T('下载', 'Downloads'),
      body: `<div id="recent" style="display:contents">${fi('img', 'IMG_3988.jpeg', '', 'p3')}${fi('doc', T('报告.pdf', 'report.pdf'))}</div><div id="dlItems" class="hid" style="display:contents">${dlItems(T, 'later')}</div>` }),
    cur: [[0, [480, 560]], [900, '#sbdl'], [1400, '#sbdl'], [2500, '#zip'], [5600, '#zip']],
    ev: () => [['click', 1100], ['cls', 0, '#sbrecent', 'act', 1100], ['cls', 1100, '#sbdl', 'act'], ['hide', 1100, '#recent'], ['show', 1100, '#dlItems'],
      ['click', 2700], ['click', 2900], ['cls', 2700, '#zip', 'sel', 3300], ['show', 3300, '#fold'], ['cls', 3500, '#fold', 'ring']],
  },
  { // 7
    short: ['打开文件夹，找到 install.sh', 'Open it, find install.sh'],
    cap: [`双击打开 ${FOLDER} 文件夹。里面有一个 install.sh，等会儿要用到它。先别关这个窗口。`, `Double-click ${FOLDER} to open it. Inside is install.sh, which you need in a moment. Keep this window open.`],
    dur: 5200,
    scene: T => menubar(T, T('访达', 'Finder')) + finder(T, { title: `<span id="tDl">${T('下载', 'Downloads')}</span><span id="tF" class="hid">${FOLDER}</span>`,
      body: `<div id="dlItems" style="display:contents">${dlItems(T, 'yes')}</div><div id="fItems" class="hid" style="display:contents">${folderItems(T)}</div>` }),
    cur: [[0, [480, 520]], [800, '#fold'], [2000, '#fold'], [3200, '#inst'], [5200, '#inst']],
    ev: () => [['click', 1000], ['click', 1200], ['cls', 1000, '#fold', 'sel', 1400], ['hide', 1400, '#dlItems'], ['show', 1400, '#fItems'], ['hide', 1400, '#tDl'], ['show', 1400, '#tF'], ['cls', 2400, '#inst', 'ring']],
  },
  { // 8
    short: ['打开“终端”', 'Open Terminal'],
    cap: ['打开“终端”：按 ⌘ 空格，输入“终端”（英文系统输入 Terminal），按回车。', 'Open Terminal: press ⌘ Space, type Terminal and press Return.'],
    tip: ['“终端”是 Mac 自带的程序，用来输入命令。不用担心，只需要输入一行。', 'Terminal comes with every Mac. You only need to type one line.'],
    dur: 5600,
    scene: T => menubar(T, T('访达', 'Finder')) + smallFinder(T) + `<div class="hid" id="termWrap">${term(`${PROMPT}<span class="caret"></span>`)}</div>
      <div class="spot hid" id="spot"><div class="q"><svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 0 1 5.6 11.2l5 5-1.4 1.4-5-5A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/></svg><span id="spq"></span></div>
      <div class="r hid" id="spr"><i>&gt;_</i>${T('终端', 'Terminal')} <span style="opacity:.75">— ${T('应用程序', 'Application')}</span></div></div>`,
    ev: T => [['key', 300, 1300, T('⌘ 空格', '⌘ Space')], ['show', 800, '#spot', 3700], ['type', 1500, 2300, '#spq', T('终端', 'Terminal')], ['show', 2300, '#spr', 3700],
      ['key', 2900, 3600, T('回车', 'Return')], ['show', 3700, '#termWrap']],
  },
  { // 9
    short: ['输入 bash 和一个空格', 'Type bash and a space'],
    cap: ['点一下终端窗口，输入 bash，再按一下空格。先不要按回车。', 'Click the Terminal window, type bash, then press Space once. Don’t press Return yet.'],
    dur: 5200,
    scene: T => menubar(T, T('终端', 'Terminal')) + smallFinder(T) + term(`${PROMPT}<span id="cmd"></span><span class="caret"></span>`) +
      `<div class="callout hid" id="call" style="left:560px;top:110px">${T('bash 后面有一个空格', 'a space after bash')} ↑</div>`,
    cur: [[0, [640, 520]], [900, [700, 300]], [1300, [700, 300]]],
    ev: T => [['click', 1000], ['type', 1500, 2500, '#cmd', 'bash '], ['key', 2300, 3000, T('空格', 'Space')], ['show', 3000, '#call']],
  },
  { // 10
    short: ['把 install.sh 拖进终端', 'Drag install.sh into Terminal'],
    cap: ['把访达里的 install.sh 拖进终端窗口，松开。后面会自动出现它的完整路径。', 'Drag install.sh from Finder into the Terminal window and let go. Its full path appears after bash.'],
    tip: ['路径里的用户名和你的 Mac 有关，不用管它。', 'The user name in the path is yours; nothing to change.'],
    dur: 5400,
    scene: T => menubar(T, T('终端', 'Terminal')) + smallFinder(T) + term(`${PROMPT}bash <span id="cmd2"></span><span class="caret"></span>`) +
      `<div class="ghost fi hid" id="ghost"><div class="ic sh"></div><span>install.sh</span></div>`,
    cur: [[0, [700, 520]], [900, '#inst'], [1500, '#inst'], [3000, [710, 160]], [3300, [710, 160]], [4600, [740, 260]]],
    ev: T => [['cls', 1100, '#inst', 'sel'], ['follow', 1500, 3100, '#ghost', -40, -30], ['type', 3100, 3300, '#cmd2', PATH(T)], ['cls', 3100, '#term', 'ring', 4600]],
  },
  { // 11
    short: ['按回车，等“完成！”', 'Press Return, wait for Done'],
    cap: ['按回车。几秒钟后看到“完成！”就装好了，不需要输入密码。', 'Press Return. When “Done!” appears a few seconds later, it is installed. No password needed.'],
    tip: ['装好以后，下载的 zip 和这个文件夹都可以删掉。', 'Afterwards you can delete the zip and the folder.'],
    dur: 6600,
    scene: T => {
      const out = ['== 1/4 Preparing the helper / 准备本机助手', '== 2/4 Installing the helper / 安装本机助手', '   ~/Library/Application Support/ImageOrganizer', '== 3/4 Copying the extension / 复制插件文件',
        '== 4/4 Registering the helper with your browsers / 向浏览器登记本机助手', '   Google/Chrome', '<span class="ok">Done! Go back to the Image Organizer page in Chrome and click Try Again.</span>', '<span class="ok">完成！回到 Chrome 里的“图片整理”页面，点“重试”。</span>'];
      return menubar(T, T('终端', 'Terminal')) + smallFinder(T) + term(`${PROMPT}bash ${PATH(T)}\n${out.map((l, i) => `<span class="hid" id="o${i}">${l}\n</span>`).join('')}<span class="hid" id="o8">${PROMPT}</span><span class="caret"></span>`, ';width:468px');
    },
    ev: T => [['key', 300, 1000, T('回车', 'Return')], ...[900, 1400, 1700, 2100, 2500, 2800, 3300, 3600, 3900].map((at, i) => ['show', at, `#o${i}`]), ['cls', 3500, '#o6', 'ring'], ['cls', 3500, '#o7', 'ring']],
  },
  { // 12
    short: ['回到图库点“重试”', 'Back in Chrome: Try Again'],
    cap: ['回到 Chrome 里的图库页面，点“重试”。', 'Go back to the gallery in Chrome and click “Try Again”.'],
    dur: 3400,
    scene: T => chrome(T, { ...galleryTab(T), body: gallery(T, { main: statusCard(T), foot: 'bad' }) }) + `<div class="hid" id="alertWrap">${alertBox(T)}</div>`,
    cur: [[0, [640, 540]], [1300, '#retry'], [3400, '#retry']],
    ev: () => [['click', 1500], ['cls', 1500, '#retry', 'pressed', 1700], ['show', 1900, '#alertWrap']],
  },
  { // 13
    short: ['允许访问“下载”', 'Allow access to Downloads'],
    cap: ['macOS 会问本机助手能否访问“下载”文件夹，点“允许”。你的图片就出现了！', 'macOS asks whether the helper may access your Downloads folder. Click “Allow”, and your pictures appear!'],
    tip: ['只问一次。如果点成了“不允许”，看下面常见问题里的办法。', 'It asks only once. Clicked “Don’t Allow” by mistake? See the questions below.'],
    dur: 4600,
    scene: T => chrome(T, { ...galleryTab(T), body: gallery(T, { main: `${statusCard(T)}<div class="hid" id="gridWrap">${inboxHeader(T)}${inboxGrid(T)}</div>`, foot: 'switch' }) }) + `<div id="alertWrap">${alertBox(T)}</div>`,
    cur: [[0, [500, 430]], [1300, '#allow'], [4600, [640, 470]]],
    ev: () => [['click', 1500], ['hide', 1700, '#alertWrap'], ['hide', 1900, '#status'], ['show', 1900, '#gridWrap'], ['hide', 1900, '#footBad'], ['show', 1900, '#footOk']],
  },
];
