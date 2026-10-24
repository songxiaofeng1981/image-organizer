// Clicking the toolbar icon opens the gallery, or focuses it if it is already open.
// 点工具栏图标打开图库；已经打开时切换到那个标签页。
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('gallery.html');
  const [open] = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [url] });
  if (open && open.tabId >= 0) {
    await chrome.tabs.update(open.tabId, { active: true });
    await chrome.windows.update(open.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});
