// The "Videos on this page" rows at the top of the toolbar popup (Xiaohongshu and X): size, length, a check box,
// and progress while saving. The popup only asks it how many are picked and tells it when to save.
// 工具栏小窗口顶部的“本页视频”（小红书和 X）：尺寸、时长、勾选框，保存时显示进度。小窗口只问它选了几个、告诉它何时保存。

import { t } from '../i18n.js';
import { pageName } from '../page.js';
import { helperTakesVideos, videosOn, saveVideo } from './save.js';

const state = { tabId: null, videos: [], picked: new Set(), canSave: false, el: null, changed: () => {} };

const mb = bytes => (bytes ? `${(bytes / 1048576).toFixed(1)} MB` : '');
const clock = s => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');

function render() {
  state.el.hidden = !state.videos.length;
  state.el.replaceChildren(
    ...state.videos.map((v, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `p-video${state.picked.has(i) ? ' on' : ''}`;
      row.disabled = !state.canSave;
      const cover = document.createElement('span');
      cover.className = 'p-video-cover';
      if (v.poster) {
        const img = document.createElement('img');
        img.src = v.poster;
        img.referrerPolicy = 'no-referrer';
        img.alt = '';
        cover.append(img);
      }
      const text = document.createElement('span');
      text.className = 'p-video-text';
      const title = document.createElement('strong');
      title.textContent = t('video.title');
      const info = document.createElement('span');
      info.className = 'p-video-info';
      info.textContent = [v.width ? `${v.width}×${v.height}` : '', clock(v.duration), mb(v.size)].filter(Boolean).join(' · ');
      text.append(title, info);
      const check = document.createElement('span');
      check.className = 'p-check';
      row.append(check, cover, text);
      row.onclick = () => {
        state.picked.has(i) ? state.picked.delete(i) : state.picked.add(i);
        render();
        state.changed();
      };
      return row;
    }),
  );
  if (state.videos.length && !state.canSave) {
    const note = document.createElement('p');
    note.className = 'p-video-note';
    note.textContent = t('video.needsHelper');
    state.el.append(note);
  }
}

function status(i, text, kind = '') {
  const row = state.el.children[i];
  if (!row) return;
  row.querySelector('.p-video-info').textContent = text;
  row.classList.toggle('done', kind === 'done');
  row.classList.toggle('fail', kind === 'fail');
}

export const videoPanel = {
  /** Looks for videos on the tab and shows them in `el`. `changed` runs when the choice changes. / 查找视频并显示。 */
  async start(tabId, el, changed) {
    Object.assign(state, { tabId, el, changed });
    try {
      state.videos = await videosOn(tabId);
    } catch {
      state.videos = [];
    }
    if (!state.videos.length) return;
    state.canSave = await helperTakesVideos();
    if (state.canSave) state.picked.add(0);
    render();
    changed();
  },

  picked: () => state.picked.size,

  /** Saves the picked videos into `category`. Returns { saved, already, failed }. / 把选中的视频存进分类。 */
  async save(category, page) {
    const counts = { saved: 0, already: 0, failed: 0 };
    for (const i of [...state.picked].sort()) {
      const name = state.videos.length > 1 ? `${pageName(page)}_video_${i + 1}` : pageName(page);
      try {
        status(i, t('video.saving', 0));
        const r = await saveVideo(state.tabId, state.videos[i], name, category, page, f => status(i, t('video.saving', Math.round(f * 100))));
        r.duplicate ? counts.already++ : counts.saved++;
        status(i, r.duplicate ? t('popup.already') : t('popup.saved'), 'done');
      } catch (e) {
        counts.failed++;
        console.warn('video save failed', e);
        status(i, t('popup.failed', e.message), 'fail');
      }
      state.picked.delete(i);
    }
    state.changed();
    return counts;
  },
};
