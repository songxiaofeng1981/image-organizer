// Steps 14–21 (everyday use; installing without the store), the chapters, page texts and the questions.
// 第 14–21 步（日常使用；不用商店的安装方式）、章节、页面文字和常见问题。

const STORE_URL = ''; // filled in once the store listing is live / 上架后填上
const RELEASES = 'https://github.com/songxiaofeng1981/image-organizer/releases/latest';

function viewer(T, { imgs, count, cat = '' }) {
  return `<div class="viewer" id="viewer"><div class="vbar"><span class="back">‹ ${T('返回', 'Back')}</span>
    <div class="vt"><b>IMG_3988.jpeg</b><small>${count}</small></div>
    <span class="pill"><i${cat ? ' style="background:#34c759"' : ''}></i>${cat || T('未分类', 'Uncategorized')} ⌄</span><span>ⓘ</span><span>🗑</span></div>
    <div class="vstage">${imgs}</div>
    <div class="vstrip">${['p1', 'p0', 'p2', 'p4', 'p3', 'p5', 'p7'].map((p, i) => `<i class="ph ${p}${i === 2 ? ' cur' : ''}"></i>`).join('')}</div></div>`;
}
const vimg = (id, p, hid) => `<div class="vimg ph ${p}${hid ? ' hid' : ''}" id="${id}"></div>`;
const toast = (id, text, T) => `<div class="toast hid" id="${id}">${text}<b>${T('撤销', 'Undo')}</b></div>`;
const libDialog = T => `<div class="sheet hid" id="libdlg"><h4>${T('图片库放在哪里？', 'Where should the picture library go?')}</h4>
  <p>${T('归类时，图片会从“下载”移到这个文件夹里，每个分类一个子文件夹。可以放在外置硬盘上。', 'Filing moves pictures out of Downloads into this folder, one sub-folder per category. An external drive works well.')}</p>
  <div class="lbl">${T('建议的位置', 'Suggested')}</div><div class="sug" id="sug1">/Volumes/SSD/${T('图片库', 'Picture Library')} <span style="color:#8a8a8e">· ${T('外置硬盘', 'external drive')}</span></div><div class="sug">~/Pictures/${T('图片库', 'Picture Library')}</div>
  <div class="btns"><span class="gbtn">${T('取消', 'Cancel')}</span><span class="gbtn pri" id="libSave">${T('保存', 'Save')}</span></div></div>`;

STEPS.push(
  { // 14
    short: ['单击打开大图', 'Click to open a picture'],
    cap: ['单击一张图打开大图。用 ← → 翻看，或在触控板上双指左右滑。', 'Click a picture to open it. Use ← → or swipe sideways with two fingers to move.'],
    dur: 4200,
    scene: T => chrome(T, { ...galleryTab(T), body: gallery(T, { main: inboxHeader(T) + inboxGrid(T) + `<div class="hid" id="vw">${viewer(T, { imgs: vimg('vi1', 'p2') + vimg('vi2', 'p4', 1), count: T('3 / 26 · 还剩 26 张待整理', '3 / 26 · 26 left to sort') })}</div>` }) }),
    cur: [[0, [700, 540]], [1200, '#t3'], [1600, '#t3'], [3800, [480, 330]]],
    ev: () => [['click', 1400], ['show', 1600, '#vw'], ['key', 2600, 3200, '→'], ['hide', 2800, '#vi1'], ['show', 2800, '#vi2']],
  },
  { // 15
    short: ['按 1–9 归类', 'Press 1–9 to file'],
    cap: ['按数字键 1–9，把这张图归进对应的分类（侧边栏里分类旁边的数字），然后自动跳到下一张。', 'Press a number key 1–9 to file the picture into that category (the number next to it in the sidebar) and go to the next one.'],
    tip: ['第一次归类时会问图片库放在哪里，比如外置硬盘上的一个文件夹。之后图片会从“下载”移到“图片库/分类名/”里。', 'The first time, it asks where the picture library goes, for example a folder on an external drive. Filed pictures move from Downloads into “Library/Category/”.'],
    dur: 6400,
    scene: T => chrome(T, { ...galleryTab(T), body: gallery(T, { main: `${viewer(T, { imgs: vimg('vi2', 'p4') + vimg('vi3', 'p5', 1), count: `<span id="vc1">${T('4 / 26 · 还剩 26 张待整理', '4 / 26 · 26 left to sort')}</span><span id="vc2" class="hid">${T('4 / 25 · 还剩 25 张待整理', '4 / 25 · 25 left to sort')}</span>` })}${libDialog(T)}${toast('toast1', T('已将 1 张移到“工作”', 'Moved 1 to “Work”'), T)}` }) }),
    cur: [[0, [700, 540]], [1800, '#sug1'], [2500, '#sug1'], [3100, '#libSave'], [3500, '#libSave'], [4600, [700, 540]]],
    ev: () => [['key', 700, 1400, '1'], ['show', 1300, '#libdlg', 3600], ['click', 2300], ['cls', 2300, '#sug1', 'sel'], ['click', 3300], ['cls', 3300, '#libSave', 'pressed', 3500],
      ['show', 3700, '#toast1'], ['hide', 3700, '#vi2'], ['show', 3700, '#vi3'], ['hide', 3700, '#vc1'], ['show', 3700, '#vc2']],
  },
  { // 16
    short: ['⌫ 删除，⌘Z 撤销', '⌫ to Trash, ⌘Z to undo'],
    cap: ['不要的图按 ⌫ 移到废纸篓。按错了就按 ⌘Z 撤销，所有操作都能撤销。', 'Press ⌫ to move a picture you don’t want to the Trash. Pressed the wrong key? ⌘Z undoes anything.'],
    tip: ['图片只会进废纸篓，不会被直接删除，在访达里随时能放回原处。', 'Pictures only ever go to the Trash, never deleted outright; Finder can put them back.'],
    dur: 5000,
    scene: T => chrome(T, { ...galleryTab(T), body: gallery(T, { main: viewer(T, { imgs: vimg('vi3', 'p5'), count: T('4 / 25 · 还剩 25 张待整理', '4 / 25 · 25 left to sort') }) + toast('toast2', T('已将 1 张移到废纸篓', 'Moved 1 to the Trash'), T) }) }),
    ev: () => [['key', 600, 1300, '⌫'], ['cls', 1000, '#vi3', 'gone', 3300], ['show', 1300, '#toast2', 3300], ['key', 2700, 3400, '⌘ Z']],
  },
  { // 17
    short: ['视频：筛选和播放', 'Videos: filter and play'],
    cap: ['视频和图片放在一起。右上角“全部 / 图片 / 视频”可以只看一种；点开视频直接播放，空格暂停，F 全屏。', 'Videos sit with the pictures. “All / Pictures / Videos” at the top right shows one kind; open a video and it plays. Space pauses, F goes full screen.'],
    tip: ['菜单变成蓝色，说明现在只显示视频，改回“全部”就都回来了。', 'The menu turns blue while it shows only videos; set it back to “All” to see everything.'],
    dur: 7200,
    scene: T => {
      const vids = [['p1', 236, '▶ 0:42', 'vt1'], ['p5', 236, '▶ 1:15'], ['p3', 236, '▶ 12:03']];
      const main = gheader(T, T('全部图片', 'All Pictures'), `<span id="subAll">${T('120 张图片、3 个视频', '120 pictures, 3 videos')}</span><span id="subVid" class="hid">${T('3 个视频', '3 videos')}</span>`) +
        `<div class="ggrid" id="gAll"><h5>${T('今天', 'Today')}</h5>${tiles(INBOX.map((x, i) => (i === 9 ? ['p1', 170, '▶ 0:42'] : x)))}</div>
         <div class="ggrid hid" id="gVid"><h5>${T('今天', 'Today')}</h5>${tiles(vids)}</div>
         <div class="gmenu hid" id="kmenu" style="right:112px;top:44px"><div>✓ ${T('全部', 'All')}</div><div>${T('图片', 'Pictures')}</div><div id="kv">${T('视频', 'Videos')}</div></div>
         <div class="vplayer hid" id="vplayer"><div class="ph p1"></div><div class="vctl">❚❚<span>0:03 / 0:42</span><div class="track"><i id="prog"></i></div>🔊 ⛶</div></div>`;
      return chrome(T, { ...galleryTab(T), body: gallery(T, { main }) });
    },
    cur: [[0, [600, 520]], [1000, '#kind'], [1500, '#kind'], [2000, '#kv'], [2400, '#kv'], [3200, '#vt1'], [3600, '#vt1'], [4600, [480, 540]]],
    ev: T => [['click', 1200], ['show', 1300, '#kmenu', 2300], ['cls', 1900, '#kv', 'hl', 2300], ['click', 2200], ['hide', 2300, '#kindAll'], ['show', 2300, '#kindVid'], ['cls', 2300, '#kind', 'blue'],
      ['hide', 2300, '#gAll'], ['show', 2300, '#gVid'], ['hide', 2300, '#subAll'], ['show', 2300, '#subVid'], ['click', 3400], ['show', 3600, '#vplayer'], ['prog', 3600, 12000, '#prog'],
      ['key', 5600, 6300, T('空格 = 暂停', 'Space = pause')]],
  },
  { // 18
    short: ['存网页上的图片', 'Save pictures from a page'],
    cap: ['在网页上看到想要的图？点工具栏的“图片整理”图标，勾选图片，选好分类，点“存到分类”。', 'Like the pictures on a page? Click the Image Organizer icon, tick them, pick a category and click “Save to Category”.'],
    tip: ['小红书、X、抖音页面上的视频也会列在小窗口里，一样能存。', 'Videos on Xiaohongshu, X and Douyin pages are listed in the popup too, and saved the same way.'],
    dur: 6400,
    scene: T => chrome(T, { url: 'example.com/kitchen', tab: T('秋天的厨房灵感', 'Kitchen ideas'), body: webPage(T),
      extra: `<div class="cpanel pop hid" id="pop2"><header><img src="${ICON}" width="20" alt=""><b>${T('秋天的厨房灵感', 'Kitchen ideas for autumn')}</b></header>
        <div class="pgrid">${['p0', 'p3', 'p5', 'p2', 'p7', 'p1'].map((p, i) => `<div class="ph ${p}" id="q${i + 1}"><span class="chk"></span></div>`).join('')}</div>
        <div class="pfoot"><span class="gsel" id="pcat">● ${T('参考素材', 'Reference')} ⌄</span><span class="gbtn pri" id="psave"><span id="ps0">${T('存到分类', 'Save to Category')}</span><span id="ps2" class="hid">${T('把 2 张存到分类', 'Save 2 to Category')}</span></span></div>
        <p class="note hid" id="pnote">✓ ${T('已将 2 张存到“参考素材”。', 'Saved 2 to “Reference”.')}</p></div>` }),
    cur: [[0, [480, 420]], [900, '#ioIcon'], [1300, '#ioIcon'], [2000, '#q1'], [2300, '#q1'], [2800, '#q3'], [3100, '#q3'], [3700, '#psave'], [4100, '#psave'], [6400, [600, 520]]],
    ev: () => [['click', 1100], ['show', 1200, '#pop2'], ['click', 2200], ['cls', 2200, '#q1', 'on'], ['click', 3000], ['cls', 3000, '#q3', 'on'], ['hide', 3000, '#ps0'], ['show', 3000, '#ps2'],
      ['click', 3900], ['cls', 3900, '#psave', 'pressed', 4100], ['show', 4300, '#pnote']],
  },
  { // 19
    short: ['右键“保存到图片库”', 'Right-click to save'],
    cap: ['也可以对着网页上的图片点右键 →“保存到图片库”→ 选分类。工具栏图标出现 ✓ 就存好了。', 'Or right-click a picture → “Save to Picture Library” → a category. A ✓ on the toolbar icon means it is saved.'],
    dur: 6000,
    scene: T => chrome(T, { url: 'example.com/kitchen', tab: T('秋天的厨房灵感', 'Kitchen ideas'), body: webPage(T),
      extra: `<div class="ctx hid" id="ctx" style="left:200px;top:280px"><div>${T('在新标签页中打开图片', 'Open Image in New Tab')}</div><div>${T('将图片另存为…', 'Save Image As…')}</div><div>${T('复制图片', 'Copy Image')}</div><hr>
          <div id="ctxSave"><img src="${ICON}" width="14" alt="" style="margin-right:6px">${T('保存到图片库', 'Save to Picture Library')}<span>▸</span></div></div>
        <div class="ctx hid" id="ctxSub" style="left:408px;top:368px;width:170px">${CATS(T).map(([n], i) => `<div${i === 2 ? ' id="ctxRef"' : ''}>${n}</div>`).join('')}<hr><div>${T('只存到“下载”', 'Downloads only')}</div></div>` }),
    cur: [[0, [700, 520]], [1100, [200, 300]], [1400, [200, 300]], [2100, '#ctxSave'], [2700, '#ctxSave'], [3200, '#ctxRef'], [3600, '#ctxRef'], [4700, '#ioIcon']],
    ev: T => [['key', 1200, 1800, T('右键（双指轻点）', 'Right-click (two-finger tap)')], ['click', 1300], ['show', 1400, '#ctx', 3700], ['cls', 2200, '#ctxSave', 'hl', 3700], ['show', 2400, '#ctxSub', 3700],
      ['cls', 3100, '#ctxRef', 'hl', 3700], ['click', 3500], ['cls', 3900, '#ioIcon', 'ok']],
  },
  { // 20
    short: ['打开“开发者模式”', 'Turn on Developer mode'],
    cap: ['没有从商店安装？运行完 install.sh 以后，在地址栏打开 chrome://extensions，打开右上角的“开发者模式”。', 'Not using the store? After running install.sh, open chrome://extensions and turn on “Developer mode” at the top right.'],
    tip: ['从 GitHub 安装的版本才需要这两步；从商店装的跳过即可。', 'Only the GitHub version needs these two steps; skip them if you installed from the store.'],
    dur: 4000,
    scene: T => chrome(T, { url: 'chrome://extensions', tab: T('扩展程序', 'Extensions'), pinned: 'no', body: `<div class="ext"><div class="eh">${T('扩展程序', 'Extensions')}<span class="dev">${T('开发者模式', 'Developer mode')}<span class="tgl" id="devT"></span></span></div>
      <div class="erow hid" id="devRow"><span class="btn" id="loadU">${T('加载已解压的扩展程序', 'Load unpacked')}</span><span class="btn">${T('打包扩展程序', 'Pack extension')}</span><span class="btn">${T('更新', 'Update')}</span></div></div>` }),
    cur: [[0, [500, 400]], [1100, '#devT'], [1500, '#devT'], [3800, '#loadU']],
    ev: () => [['click', 1300], ['cls', 1300, '#devT', 'on'], ['show', 1500, '#devRow'], ['cls', 2000, '#loadU', 'ring']],
  },
  { // 21
    short: ['加载已解压的扩展程序', 'Load unpacked'],
    cap: ['点“加载已解压的扩展程序”，按 ⌘⇧G，再按 ⌘V（install.sh 已经复制好了路径），按回车，最后点“选择”。', 'Click “Load unpacked”, press ⌘⇧G, then ⌘V (install.sh already copied the path), press Return, then click “Select”.'],
    tip: ['以后更新只要点插件卡片上的 ↻。不要点“移除”，那会清空你的分类和组。', 'To update later, click ↻ on the card. Don’t click “Remove”: that erases your categories and groups.'],
    dur: 7600,
    scene: T => chrome(T, { url: 'chrome://extensions', tab: T('扩展程序', 'Extensions'), pinned: 'no', body: `<div class="ext"><div class="eh">${T('扩展程序', 'Extensions')}<span class="dev">${T('开发者模式', 'Developer mode')}<span class="tgl on"></span></span></div>
      <div class="erow"><span class="btn" id="loadU">${T('加载已解压的扩展程序', 'Load unpacked')}</span><span class="btn">${T('打包扩展程序', 'Pack extension')}</span><span class="btn">${T('更新', 'Update')}</span></div>
      <div class="ecard hid" id="card"><img src="${ICON}" alt=""><div><b>${T('图片整理', 'Image Organizer')}</b> 2.5.0<small>ID：gjmkfcibnihdnoahklpfdjcjekangjhh</small></div></div></div>` }) +
      `<div class="fdlg hid" id="fdlg"><div class="fside"><div class="gs-h">${T('个人收藏', 'Favorites')}</div><div class="gs-i">${T('应用程序', 'Applications')}</div><div class="gs-i">${T('下载', 'Downloads')}</div></div>
        <div class="fmain"><div class="fi" id="fdSel"><div class="ic folder"></div><span>extension</span></div></div>
        <div class="fb"><span class="gbtn">${T('取消', 'Cancel')}</span><span class="gbtn pri" id="choose">${T('选择', 'Select')}</span></div>
        <div class="goto hid" id="goto"><div style="font-size:12px;margin-bottom:6px">${T('前往文件夹：', 'Go to the folder:')}</div><div class="in" id="gotoIn"></div></div></div>`,
    cur: [[0, [400, 300]], [800, '#loadU'], [1200, '#loadU'], [4600, '#choose'], [5000, '#choose'], [6600, [500, 420]]],
    ev: T => [['click', 1000], ['show', 1300, '#fdlg', 5200], ['key', 1800, 2500, '⌘ ⇧ G'], ['show', 2200, '#goto', 4300], ['key', 2800, 3400, '⌘ V'],
      ['type', 3000, 3150, '#gotoIn', '~/Applications/Image Organizer/extension'], ['key', 3700, 4300, T('回车', 'Return')], ['cls', 4300, '#fdSel', 'sel'], ['click', 4800], ['show', 5400, '#card'], ['cls', 5500, '#card', 'ring']],
  },
);

const CHAPTERS = [
  { from: 0, title: ['安装插件', 'Install the extension'] },
  { from: 3, title: ['安装本机助手（只需一次）', 'Install the helper (once)'] },
  { from: 13, title: ['日常使用', 'Everyday use'] },
  { from: 19, title: ['不用商店的安装方式', 'Installing without the store'] },
];

const UI = {
  title: ['安装和使用演示', 'Install & use, step by step'],
  subtitle: ['图片整理：一个整理“下载”里图片和视频的 Chrome 插件。跟着动画一步步做，随时可以暂停。', 'Image Organizer: a Chrome extension that sorts the pictures and videos in Downloads. Follow along; pause any time.'],
  pauseEach: ['每步播完自动暂停（跟着做时打开）', 'Pause after each step (to follow along)'],
  keys: ['快捷键：<code>空格</code> 播放 / 暂停，<code>←</code> <code>→</code> 上一步 / 下一步。点画面也能暂停，点右边的步骤可以直接跳过去。', 'Keys: <code>Space</code> play / pause, <code>←</code> <code>→</code> previous / next step. Click the picture to pause; click a step on the right to jump to it.'],
  play: ['播放 / 暂停', 'Play / pause'],
  prev: ['上一步', 'Previous step'],
  next: ['下一步', 'Next step'],
  faqTitle: ['常见问题', 'Questions'],
  more: [`文字版安装说明：<a href="https://github.com/songxiaofeng1981/image-organizer/blob/main/docs/INSTALL.zh-CN.md">INSTALL.zh-CN.md</a> · 还是不行？<a href="https://github.com/songxiaofeng1981/image-organizer/issues/new/choose">提一个 issue</a>，写上 macOS 版本和你看到的情况。`,
    `Written guide: <a href="https://github.com/songxiaofeng1981/image-organizer/blob/main/docs/INSTALL.md">INSTALL.md</a> · Still stuck? <a href="https://github.com/songxiaofeng1981/image-organizer/issues/new/choose">Open an issue</a> with your macOS version and what you see.`],
};

const FAQ = [
  [['在哪里下载？需要什么？', 'Where do I get it, and what do I need?'],
    [`插件：${STORE_URL ? `<a href="${STORE_URL}">Chrome 应用商店</a>` : 'Chrome 应用商店（上架后这里会放链接）'}。本机助手：<a href="${RELEASES}">GitHub 最新版本</a>，在 Assets 下载 image-organizer.zip。需要 macOS 12 或更新系统和 Google Chrome（Edge、Brave、Arc、Vivaldi 也可以）。`,
      `Extension: ${STORE_URL ? `<a href="${STORE_URL}">Chrome Web Store</a>` : 'the Chrome Web Store (link here once it is listed)'}. Helper: <a href="${RELEASES}">latest GitHub release</a>, image-organizer.zip under Assets. Needs macOS 12 or later and Google Chrome (Edge, Brave, Arc and Vivaldi work too).`]],
  [['为什么要装“本机助手”？安全吗？', 'Why a helper app? Is it safe?'],
    ['Chrome 插件自己读不了 Mac 上的文件夹，所以由一个很小的助手程序替它读取。它是开源的，只碰“下载”和你选的图片库里的图片和视频，不连外网；删除只会移到废纸篓。播放视频时，它只在本机 127.0.0.1 上临时提供这个视频。',
      'A Chrome extension can’t read folders on your Mac, so a tiny helper does it. It is open source, touches only pictures and videos in Downloads and your picture library, never goes online, and only ever moves files to the Trash. To play a video it serves that file on 127.0.0.1 (your own Mac) only.']],
  [['图库一直显示“还差一步：安装本机助手”', 'The gallery keeps saying “install the helper”'],
    ['重新做第 5–11 步，确认终端里出现了“完成！”，再点“重试”。如果用的是 Edge、Brave 等浏览器，先打开过一次那个浏览器，再运行 install.sh。', 'Redo steps 5–11, make sure Terminal says “Done!”, then click Try Again. Using Edge, Brave and so on? Open that browser once before running install.sh.']],
  [['点成了“不允许”访问“下载”', 'I clicked “Don’t Allow” for Downloads'],
    ['打开“系统设置”→“隐私与安全性”→“文件和文件夹”，找到 Image Organizer Helper，打开“下载”文件夹开关，回到图库点“重试”。', 'Open System Settings → Privacy & Security → Files and Folders, find Image Organizer Helper, turn on Downloads Folder, then click Try Again in the gallery.']],
  [['终端显示 No such file or directory', 'Terminal says No such file or directory'],
    ['bash 后面要有一个空格；拖进去的应该是 install.sh 这个文件，不是整个文件夹。', 'There must be a space after bash, and you should drag the install.sh file, not the whole folder.']],
  [['终端显示“没有现成的本机助手”', 'Terminal says there is no ready-made helper'],
    ['你下载的是 “Source code”（源代码）。回到 GitHub 最新版本页面，下载 Assets 里的 image-organizer.zip。', 'You downloaded “Source code”. Go back to the latest release and download image-organizer.zip under Assets.']],
  [['视频播放不了', 'A video won’t play'],
    ['有些剪辑格式（比如 ProRes）Chrome 播不了，画面上会出现“用 QuickTime Player 打开”的按钮；也可以在大图里按回车。', 'Chrome can’t play some editing formats (such as ProRes). The viewer then shows an “Open in QuickTime Player” button; Return does the same.']],
  [['怎么更新、怎么卸载？', 'How do I update or uninstall?'],
    ['更新：商店版会自动更新插件；本机助手需要时下载新的 zip，再运行一次 install.sh。卸载：在终端运行 <code>bash "$HOME/Library/Application Support/ImageOrganizer/uninstall.sh"</code>，再在 chrome://extensions 里移除插件（会清空分类和组）。你的图片不会被动。',
      'Update: the store updates the extension; when the helper needs it, download the new zip and run install.sh again. Uninstall: run <code>bash "$HOME/Library/Application Support/ImageOrganizer/uninstall.sh"</code> in Terminal, then remove the extension in chrome://extensions (this erases categories and groups). Your pictures are not touched.']],
];
