/**
 * 歌词测试
 * https://jyo.app/old/music/1.lrc
 * https://jyo.app/old/music/3.trc
 * https://jyo.app/old/music/6.krc
 */


import Lyric, { LyricController } from "../dist/lyric.js";

// 状态变量
let audio, lyricInner, lyricWrapper, emptyTip;
let audioFileInput, lyricFileInput;
let optFontSize, optSplit, optAlign, optColorBefore, optColorAfter, optColorHighlight, optColorTranslation, optGradient, optScrollMs;
let optLang1, optLang2; // 语言开关
let btnPlay, btnScrollTop, btnClear;
let statusSong, statusTime;

let parsedLyric = null; // dist/lyric.js 产生的实例
let lines = []; // 行数组
let currentLine = -1;
let currentWord = -1;
let rowHeights = []; // 每行高度 + 行距
let dragging = false;
let dragStartY = 0;
let dragStartScrollTop = 0;
let logicalScrollTop = 0; // 以中心为 0 的位移（等价于 vue 版 scrollTop）
let lastUserInteractTs = 0;
let autoScrollEnabled = true;
let scrollAnimMs = 280;
let autoReturnTimer = null; // 手动滚动后，3秒无操作自动返回当前行

// 配置
let cfg = {
	fontSize: 24,
	split: 20,
	align: 'center',
	colorBefore: '#42d392',
	colorAfter: '#ffb347',
	colorHighlight: '#ffffff',
	colorTranslation: '#8a8f95',
	gradient: true,
	showLang1: true,
	showLang2: true
};

window.addEventListener('DOMContentLoaded', () => {
	bindElements();
	bindEvents();
	tick();
});

// 行是否支持逐字精准：改为使用模型层的判断
function supportsPerWord(line) {
	return Lyric.supportsPerWord ? Lyric.supportsPerWord(line) : (line?.hasPerWordTiming ? line.hasPerWordTiming() : ((line?.words || []).some(w => (w?.duration || 0) > 0 && !w.singleLine)));
}
// 判断文本是否换行（用于屏蔽行级渐变在多行时误染第二行）
function isWrapped(frameEl) {
	if (!frameEl) return false;
	const cs = getComputedStyle(frameEl);
	const lh = parseFloat(cs.lineHeight) || (cfg.fontSize * 1.35);
	const h = frameEl.getBoundingClientRect().height;
}

// 将一个非逐字的 frame（纯文本）按浏览器的换行结果拆分为若干物理行 span.segline（只对当前行使用）
function ensureSegmented(frameEl) {
	if (!frameEl || frameEl.dataset.segReady === '1') return;
	// 仅在 frame 内只有文本节点时进行分段
	const text = frameEl.textContent || '';
	if (!text || frameEl.querySelector('.lyric_word')) return; // 逐字/已有结构不处理
	const tn = Array.from(frameEl.childNodes).find(n => n.nodeType === 3);
	if (!tn) return;
	const n = tn.length;
	if (n === 0) return;

	const rangesTopCache = new Map();
	const getLastRectTop = (start, end) => {
		const key = start + ':' + end;
		if (rangesTopCache.has(key)) return rangesTopCache.get(key);
		const r = document.createRange();
		r.setStart(tn, start);
		r.setEnd(tn, Math.max(start + 1, end));
		const rects = r.getClientRects();
		const top = rects.length ? rects[rects.length - 1].top : 0;
		rangesTopCache.set(key, top);
		return top;
	};

	const segments = [];
	let start = 0;
	while (start < n) {
		// 当前起点所在行的基准 top
		const baseTop = getLastRectTop(start, start + 1);
		// 二分查找该物理行的结束索引（不包含）
		let lo = start + 1, hi = n, ok = lo;
		while (lo <= hi) {
			const mid = Math.floor((lo + hi) / 2);
			const top = getLastRectTop(start, mid);
			if (Math.abs(top - baseTop) < 1) { // 仍在同一物理行
				ok = mid;
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}
		segments.push(text.slice(start, ok));
		start = ok;
	}

	// 用测得的分段重建 DOM（每段独立一行，禁止再换行）
	frameEl.innerHTML = segments.map((s, i) => `<span class="segline" data-seg="${i}" style="display:block; white-space:pre;">${escapeHtml(s)}</span>`).join('');
	frameEl.dataset.segReady = '1';
}

// 对已分段的换行行，按照 line.progress 进行逐行渐变填充
function applyWrappedLineProgress(frameEl, lineProgress) {
	if (!frameEl) return;
	ensureSegmented(frameEl);
	const segs = Array.from(frameEl.querySelectorAll('.segline'));
	if (!segs.length) return;
	// 计算所有物理行的宽度总和
	const widths = segs.map(el => el.getBoundingClientRect().width);
	const total = widths.reduce((a, b) => a + b, 0) || 1;
	const filled = Math.max(0, Math.min(1, lineProgress || 0)) * total;
	// 逐段填充
	let acc = 0;
	segs.forEach((el, idx) => {
		const w = widths[idx] || 1;
		const startX = acc;
		const endX = acc + w;
		// 三种状态：未开始 / 完成 / 进行中
		if (filled <= startX + 0.01) {
			// 未开始：移除剪裁，直接用未来色覆盖，避免被父级 state-current 的白色影响
			el.classList.remove('segline-clip');
			el.style.backgroundImage = '';
			el.style.color = `var(--colorBefore, ${cfg.colorBefore})`;
		} else if (filled >= endX - 0.01) {
			// 完整：使用 100% 渐变，相当于纯色 color2
			el.classList.add('segline-clip');
			el.style.color = '';
			el.style.backgroundImage = `linear-gradient(to right, var(--colorAfter, ${cfg.colorAfter}) 100%, var(--colorBefore, ${cfg.colorBefore}) 0%)`;
		} else {
			// 进行中：在该物理行内部分填充
			const ratio = (filled - startX) / w;
			const pct = (ratio * 100).toFixed(2);
			el.classList.add('segline-clip');
			el.style.color = '';
			el.style.backgroundImage = `linear-gradient(to right, var(--colorAfter, ${cfg.colorAfter}) ${pct}%, var(--colorBefore, ${cfg.colorBefore}) 0%)`;
		}
		acc += w;
	});
}

function clearWrappedLineStyles(frameEl) {
	if (!frameEl) return;
	const segs = frameEl.querySelectorAll('.segline');
	segs.forEach(el => {
		el.classList.remove('segline-clip');
		el.style.backgroundImage = '';
		el.style.color = '';
	});
}

// 关闭渐变时，清理逐字高亮/状态，使整行用统一颜色
function clearPerWordStyles(rowEl) {
	if (!rowEl) return;
	const domWords = rowEl.querySelectorAll('.lyric_word');
	domWords.forEach(w => {
		w.classList.remove('lyric_word__done', 'lyric_word__future', 'lyric_word__current', 'active');
		w.style.backgroundImage = '';
		w.style.color = '';
	});
}

function bindElements() {
	audio = document.getElementById('audio');
	lyricInner = document.getElementById('lyricInner');
	lyricWrapper = document.getElementById('lyricWrapper');
	emptyTip = document.getElementById('emptyTip');
	audioFileInput = document.getElementById('audioFile');
	lyricFileInput = document.getElementById('lyricFile');
	optFontSize = document.getElementById('optFontSize');
	optSplit = document.getElementById('optSplit');
	optAlign = document.getElementById('optAlign');
	optColorBefore = document.getElementById('optColorBefore');
	optColorAfter = document.getElementById('optColorAfter');
	optColorHighlight = document.getElementById('optColorHighlight');
	optColorTranslation = document.getElementById('optColorTranslation');
	optGradient = document.getElementById('optGradient');
	optScrollMs = document.getElementById('optScrollMs');
	optLang1 = document.getElementById('optLang1');
	optLang2 = document.getElementById('optLang2');
	btnPlay = document.getElementById('btnPlay');
	btnScrollTop = document.getElementById('btnScrollTop');
	btnClear = document.getElementById('btnClear');
	statusSong = document.getElementById('statusSong');
	statusTime = document.getElementById('statusTime');
}

function bindEvents() {
	audio.addEventListener('timeupdate', handleTimeUpdate);
	audio.addEventListener('play', () => autoScrollEnabled = true);
	audio.addEventListener('pause', () => { });
	audio.addEventListener('seeked', handleSeeked);
	audio.addEventListener('seeking', handleSeeked);

	audioFileInput.addEventListener('change', handleLocalAudio);
	lyricFileInput.addEventListener('change', handleLocalLyric);
	optFontSize.addEventListener('input', () => { cfg.fontSize = parseInt(optFontSize.value) || 24; rerenderLyricStructure(); });
	optSplit.addEventListener('input', () => { cfg.split = parseInt(optSplit.value) || 20; rerenderLyricStructure(); });
	optAlign.addEventListener('change', () => { cfg.align = optAlign.value; lyricInner.style.textAlign = cfg.align; });
	optColorBefore.addEventListener('input', () => { cfg.colorBefore = optColorBefore.value; updateWordGradients(true); });
	optColorAfter.addEventListener('input', () => { cfg.colorAfter = optColorAfter.value; updateWordGradients(true); });
	optColorHighlight.addEventListener('input', () => { cfg.colorHighlight = optColorHighlight.value; updateWordGradients(true); });
	optColorTranslation.addEventListener('input', () => { cfg.colorTranslation = optColorTranslation.value; updateWordGradients(true); });
	optGradient.addEventListener('change', () => { cfg.gradient = optGradient.checked; rerenderLyricStructure(); });
	optScrollMs.addEventListener('input', () => { scrollAnimMs = parseInt(optScrollMs.value) || 0; });
	if (optLang1) optLang1.addEventListener('change', () => { cfg.showLang1 = !!optLang1.checked; rerenderLyricStructure(); });
	if (optLang2) optLang2.addEventListener('change', () => { cfg.showLang2 = !!optLang2.checked; rerenderLyricStructure(); });
	btnPlay.addEventListener('click', () => { if (audio.src) audio.paused ? audio.play() : audio.pause(); });
	btnScrollTop.addEventListener('click', () => { autoScrollEnabled = true; scrollToCurrentLine(true); });
	btnClear.addEventListener('click', clearLyric);

	// 拖拽 / 触摸滚动
	lyricWrapper.addEventListener('mousedown', startDrag);
	window.addEventListener('mousemove', moveDrag);
	window.addEventListener('mouseup', endDrag);
	lyricWrapper.addEventListener('touchstart', e => startDrag(e.touches[0]));
	lyricWrapper.addEventListener('touchmove', e => { moveDrag(e.touches[0]); e.preventDefault(); }, { passive: false });
	lyricWrapper.addEventListener('touchend', endDrag);
	lyricWrapper.addEventListener('wheel', (e) => { if (!lines.length) return; autoScrollEnabled = false; logicalScrollTop += e.deltaY; clampManualScroll(); applyScrollTransform(false); scheduleAutoReturn(); });

	// 监听宽度变化：在容器或窗口尺寸变化时，重新测量并保持当前行锚点
	setupResizeWatch();

	// 页面可见性变化：从后台恢复后补一次渲染，避免 rAF 丢帧导致整行未着色
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			const t = (audio?.currentTime || 0) * 1000;
			refreshAllWords(t);
			markActiveLine();
			if (autoScrollEnabled) scrollToCurrentLine(true); else applyScrollTransform(false);
		}
	});
}

function handleLocalAudio() {
	const f = audioFileInput.files?.[0];
	if (!f) return;
	audio.src = URL.createObjectURL(f);
	statusSong.textContent = f.name;
	audio.play();
}

async function handleLocalLyric() {
	const f = lyricFileInput.files?.[0];
	if (!f) return;
	const buf = await f.arrayBuffer();
	parseLyricBuffer(buf, f.name);
}

async function loadSong(audioUrl, lyricUrl) {
	try {
		audio.src = audioUrl;
		statusSong.textContent = audioUrl.split('/').pop();
		audio.play();
		// 解析歌词前先清空当前歌词，避免失败时与旧内容重叠
		clearLyric();
		// 重置行索引，确保 rerenderLyricStructure 走首次渲染逻辑
		currentLine = -1; currentWord = -1; logicalScrollTop = 0; lyricInner.style.transform = 'translateY(0)';
		let l = await Lyric.createFromUri(lyricUrl);
		console.dir(l);
		console.dir(new TextDecoder().decode(Lyric.generate(l, "qrc")));
		l = new Lyric(Lyric.generate(l, "qrc")); // 测试生成与再解析
		parsedLyric = l;
		lines = l.lines;
		rerenderLyricStructure();
		// 初始化一次状态
		try {
			const ret = LyricController.updateByTime(parsedLyric, audio.currentTime * 1000);
			currentLine = ret?.lineIndex ?? currentLine;
			currentWord = ret?.wordIndex ?? currentWord;
			markActiveLine();
			if (cfg.gradient && currentLine >= 0 && supportsPerWord(lines[currentLine])) applyWordStates(currentLine);
		} catch { }
		emptyTip.style.display = 'none';
	} catch (e) {
		console.error(e);
		emptyTip.style.display = 'flex';
		emptyTip.textContent = '加载失败';
	}
}

function parseLyricBuffer(buf, name = 'local') {
	try {
		// 解析歌词前先清空当前歌词，避免失败时与旧内容重叠
		clearLyric();
		parsedLyric = new Lyric(buf);
		console.dir(Lyric.generate(parsedLyric, "lrc"));
		lines = parsedLyric.lines;
		currentLine = -1; currentWord = -1; logicalScrollTop = 0; lyricInner.style.transform = 'translateY(0)';
		statusSong.textContent = name + ' (本地)';
		rerenderLyricStructure();
		emptyTip.style.display = 'none';
		// 初始化一次状态
		try {
			const ret = LyricController.updateByTime(parsedLyric, audio.currentTime * 1000);
			currentLine = ret?.lineIndex ?? currentLine;
			currentWord = ret?.wordIndex ?? currentWord;
			markActiveLine();
			if (cfg.gradient && currentLine >= 0 && supportsPerWord(lines[currentLine])) applyWordStates(currentLine);
		} catch { }
	} catch (e) {
		console.error(e);
		emptyTip.style.display = 'flex';
		emptyTip.textContent = '解析失败';
		throw e
	}
}

function clearLyric() {
	parsedLyric = null; lines = []; lyricInner.innerHTML = ''; currentLine = -1; currentWord = -1; logicalScrollTop = 0; lyricInner.style.transform = 'translateY(0)'; emptyTip.style.display = 'flex'; emptyTip.textContent = '已清空';
}

function rerenderLyricStructure() {
	if (!lines.length) { lyricInner.innerHTML = ''; return; }
	lyricInner.style.setProperty('--colorBefore', cfg.colorBefore);
	lyricInner.style.setProperty('--colorAfter', cfg.colorAfter);
	lyricInner.style.setProperty('--colorHighlight', cfg.colorHighlight);
	lyricInner.style.setProperty('--colorTranslation', cfg.colorTranslation);
	lyricInner.style.textAlign = cfg.align;
	const wasFirstRender = currentLine === -1; // 记录是否首次渲染（或切换导致需要重新定位）
	const fontSize = cfg.fontSize;
	lyricInner.innerHTML = lines.map((line, idx) => {
		const words = line.words || [];
		const allText = line.text || words.map(w => w.text).join('');
		const primary = (typeof line.primaryText === 'string' ? line.primaryText : (allText.split('\n')[0] || ''));
		const secondary = (typeof line.secondaryText === 'string' ? line.secondaryText : (allText.split('\n')[1] || ''));
		// 按行号拆分逐字词：1 为主行，2 为译文行
		const row1Words = words.filter(w => !w.singleLine && (w?.lineNo || 0) === 1);
		const row2Words = words.filter(w => !w.singleLine && (w?.lineNo || 0) === 2);
		let html = '';
		html += `<div class="lyric_row" data-line="${idx}" style="font-size:${fontSize}px;">`;
		if (cfg.showLang1) {
			html += `<div class="lyric_wordFrame lyric_subline" data-kind="primary">`;
			// 仅当主行有逐字数据时，才渲染逐字；否则渲染纯文本主行
			if (row1Words.length > 0) {
				html += row1Words.map(w => {
					// 使用原始索引映射（通过 data-word），便于状态同步
					const i = words.indexOf(w);
					return `<span class="lyric_word" data-word="${i}">${escapeHtml(w.text)}</span>`;
				}).join('');
			} else {
				html += escapeHtml(primary);
			}
			html += `</div>`;
		}
		if (cfg.showLang2 && secondary.trim()) {
			// 译文行：若存在逐字数据（lineNo=2），优先词级渲染，否则渲染纯文本
			if (row2Words.length > 0) {
				html += `<div class="lyric_wordFrame lyric_subline secondary" data-kind="secondary">` +
					row2Words.map(w => {
						const i = words.indexOf(w);
						return `<span class=\"lyric_word\" data-word=\"${i}\">${escapeHtml(w.text)}</span>`;
					}).join('') +
					`</div>`;
			} else {
				html += `<div class="lyric_wordFrame lyric_subline secondary" data-kind="secondary">${escapeHtml(secondary)}</div>`;
			}
		}
		html += `</div>`;
		if (idx > 0) html = `<div style="height:${cfg.split}px"></div>` + html;
		return html;
	}).join('');
	measureRows();
	if (wasFirstRender && rowHeights.length) {
		// 初次渲染：先把第一行置为当前并静态居中，避免出现“看见底部”闪动
		currentLine = 0;
		logicalScrollTop = -(rowHeights[0] / 2);
		applyScrollTransform(false);
		markActiveLine();
	} else {
		// 后续（如切换参数）根据当前行重新对齐
		if (currentLine >= 0) scrollToCurrentLine(true);
	}
	// 渲染后刷新激活行/词样式，避免因 DOM 重建丢失状态
	if (currentLine >= 0) {
		markActiveLine();
		if (cfg.gradient && supportsPerWord(lines[currentLine])) applyWordStates(currentLine);
	}
}

function measureRows() {
	const rows = Array.from(lyricInner.querySelectorAll('.lyric_row'));
	rowHeights = rows.map(r => r.getBoundingClientRect().height);
}

function handleTimeUpdate() {
	// 仅更新状态栏，核心渲染交由 rAF
	updateStatusLine();
}

function markActiveLine() {
	const rows = lyricInner.querySelectorAll('.lyric_row');
	rows.forEach((row, i) => {
		row.classList.toggle('active', i === currentLine);
		// 行状态统一使用 line.state
		const st = lines[i]?.state || 'future';
		row.classList.remove('state-past', 'state-current', 'state-future');
		row.classList.add(`state-${st}`);
		// 渲染策略：按行自动判断
		const perWord = supportsPerWord(lines[i]);
		const frame = row.querySelector('.lyric_wordFrame[data-kind="primary"]');
		if (!cfg.gradient && perWord) {
			// 关闭渐变且逐字：整行统一高亮，不做逐字跳动
			if (frame) { frame.classList.remove('line-grad'); frame.style.backgroundImage = ''; clearWrappedLineStyles(frame); }
			clearPerWordStyles(row);
		} else if (!cfg.gradient && !perWord) {
			// 关闭渐变且非逐字：清理行级渐变
			if (frame) { frame.classList.remove('line-grad'); frame.style.backgroundImage = ''; clearWrappedLineStyles(frame); }
		} else if (perWord) {
			// 当前行：词级渐变；其他行：移除行级渐变
			if (i === currentLine) applyWordStates(i);
			if (frame) { frame.classList.remove('line-grad'); frame.style.backgroundImage = ''; }
		} else {
			// 当前行：行级渐变；其他行：不应用渐变
			if (frame) {
				if (i === currentLine) {
					if (!isWrapped(frame)) {
						frame.classList.add('line-grad');
						const p = Math.max(0, Math.min(1, lines[i]?.renderProgress || 0));
						const pct = (p * 100).toFixed(2);
						frame.style.backgroundImage = `linear-gradient(to right, var(--colorAfter, ${cfg.colorAfter}) ${pct}%, var(--colorBefore, ${cfg.colorBefore}) 0%)`;
					} else {
						// 折行：按物理行逐段渐变
						frame.classList.remove('line-grad');
						frame.style.backgroundImage = '';
						applyWrappedLineProgress(frame, lines[i]?.renderProgress || 0);
					}
				} else {
					// 非当前行：根据模型层 renderProgress 渲染（past=1，future=0）
					const rp = Math.max(0, Math.min(1, lines[i]?.renderProgress || 0));
					if (rp > 0) {
						if (!isWrapped(frame)) {
							frame.classList.add('line-grad');
							frame.style.backgroundImage = `linear-gradient(to right, var(--colorAfter, ${cfg.colorAfter}) ${(rp * 100).toFixed(2)}%, var(--colorBefore, ${cfg.colorBefore}) 0%)`;
						} else {
							frame.classList.remove('line-grad');
							frame.style.backgroundImage = '';
							applyWrappedLineProgress(frame, rp);
						}
					} else {
						frame.classList.remove('line-grad');
						frame.style.backgroundImage = '';
						clearWrappedLineStyles(frame);
					}
				}
			}
		}
	});
}

function applyWordStates(lineIdx) {
	const row = lyricInner.querySelectorAll('.lyric_row')[lineIdx];
	if (!row) return;
	// 仅对当前渲染出来的逐字元素做更新（data-word 为词索引）
	const domWords = row.querySelectorAll('.lyric_word[data-word]');
	const line = lines[lineIdx];
	domWords.forEach((el) => {
		// 先彻底清理样式，避免 seek 或行切换后保留旧 class
		el.classList.remove('lyric_word__done', 'lyric_word__future', 'lyric_word__current', 'active');
		el.style.backgroundImage = '';
		el.style.color = '';
		const idx = parseInt(el.getAttribute('data-word'));
		const w = line.words[idx];
		if (!w) return;
		// 按状态打类
		if (w.state === 'past') {
			el.classList.add('lyric_word__done');
		} else if (w.state === 'future') {
			el.classList.add('lyric_word__future');
		} else {
				// current
			if (cfg.gradient) {
				el.classList.add('lyric_word__current', 'active');
				const pct = ((w.progress || 0) * 100).toFixed(2);
				el.style.backgroundImage = `linear-gradient(to right, ${cfg.colorAfter} ${pct}%, ${cfg.colorBefore} 0%)`;
			} else {
					// 关闭渐变：用纯色高亮当前词（使用 colorHighlight）
					el.classList.add('active');
					const c3 = getComputedStyle(lyricInner).getPropertyValue('--colorHighlight')?.trim() || cfg.colorHighlight || '#fff';
					el.style.color = c3;
			}
		}
	});
}

// 在拖动进度条或外部跳转后，使用库内状态刷新行/词样式
function refreshAllWords(currentTimeMs) {
	if (!lines.length) return;
	try {
		if (parsedLyric) {
			const ret = LyricController.updateByTime(parsedLyric, currentTimeMs);
			currentLine = ret?.lineIndex ?? currentLine;
			currentWord = ret?.wordIndex ?? currentWord;
		}
	} catch { }
	const rows = lyricInner.querySelectorAll('.lyric_row');
	rows.forEach((row, lineIdx) => {
		const st = lines[lineIdx]?.state || 'future';
		row.classList.remove('state-past', 'state-current', 'state-future');
		row.classList.add(`state-${st}`);
		const perWord = supportsPerWord(lines[lineIdx]);
		const frame = row.querySelector('.lyric_wordFrame[data-kind="primary"]');
		if (!cfg.gradient && perWord) {
			// 关闭渐变 + 逐字：整行统一颜色，移除逐字状态
			clearPerWordStyles(row);
			if (frame) { frame.classList.remove('line-grad'); frame.style.backgroundImage = ''; clearWrappedLineStyles(frame); }
		} else if (!cfg.gradient && !perWord) {
			// 关闭渐变 + 非逐字：清理行级渐变
			const domWords = row.querySelectorAll('.lyric_word');
			domWords.forEach(w => { w.style.backgroundImage = ''; w.classList.remove('lyric_word__current', 'active'); w.style.color = ''; });
		} else if (perWord) {
			// 词级：seek 场景统一刷新所有逐字行的词样式，避免残留
			applyWordStates(lineIdx);
			if (frame) { frame.classList.remove('line-grad'); frame.style.backgroundImage = ''; clearWrappedLineStyles(frame); }
		} else {
			// 行级：当前行按进度渐变，非当前行若为 past 则补 100% 上色
			if (frame) {
				if (lineIdx === currentLine) {
					if (!isWrapped(frame)) {
						const p = Math.max(0, Math.min(1, lines[lineIdx]?.renderProgress || 0));
						const pct = (p * 100).toFixed(2);
						frame.classList.add('line-grad');
						frame.style.backgroundImage = `linear-gradient(to right, var(--colorAfter, ${cfg.colorAfter}) ${pct}%, var(--colorBefore, ${cfg.colorBefore}) 0%)`;
					} else {
						// 折行：按物理行逐段渐变
						frame.classList.remove('line-grad');
						frame.style.backgroundImage = '';
						applyWrappedLineProgress(frame, lines[lineIdx]?.renderProgress || 0);
					}
				} else {
					// 非当前行：若 past 则补 100% 上色，否则清理
					const rp = Math.max(0, Math.min(1, lines[lineIdx]?.renderProgress || 0));
					if (rp > 0) {
						if (!isWrapped(frame)) {
							frame.classList.add('line-grad');
							frame.style.backgroundImage = `linear-gradient(to right, var(--colorAfter, ${cfg.colorAfter}) ${(rp * 100).toFixed(2)}%, var(--colorBefore, ${cfg.colorBefore}) 0%)`;
						} else {
							frame.classList.remove('line-grad');
							frame.style.backgroundImage = '';
							applyWrappedLineProgress(frame, rp);
						}
					} else {
						frame.classList.remove('line-grad');
						frame.style.backgroundImage = '';
						clearWrappedLineStyles(frame);
					}
				}
			}
			// 行级模式下，移除词级渐变类
			const domWords = row.querySelectorAll('.lyric_word');
			domWords.forEach(w => { w.style.backgroundImage = ''; w.classList.remove('lyric_word__current', 'active'); });
		}
	});
	// 同步 currentWord：使用控制器
	const curLineObj = lines[currentLine];
	currentWord = LyricController.computeActiveWordIndex(curLineObj);
}

function handleSeeked() {
	const t = audio.currentTime * 1000;
	// 使用库状态更新后再刷新样式
	try {
		if (parsedLyric) {
			const ret = LyricController.updateByTime(parsedLyric, t);
			currentLine = ret?.lineIndex ?? currentLine;
			currentWord = ret?.wordIndex ?? currentWord;
		}
	} catch { }
	handleTimeUpdate();
	refreshAllWords(t);
	// 滚动复位（保持 anchor 逻辑）
	if (autoScrollEnabled) scrollToCurrentLine(true); else applyScrollTransform(false);
}

function scrollToCurrentLine(immediate = false) {
	if (currentLine < 0) return;
	// 累计当前行之前所有行高度 + 行距
	let offsetTop = 0;
	for (let i = 0; i < currentLine; i++) offsetTop += rowHeights[i] + cfg.split;
	const currentH = rowHeights[currentLine] || 0;
	// 由于 inner 采用 top:50%，理论中心基准为 wrapper 垂直中心，目标平移为 - (行顶部 + 行高度/2)
	const target = LyricController.computeScrollTarget(rowHeights, cfg.split, currentLine);
	logicalScrollTop = target;
	applyScrollTransform(!immediate);
}

function applyScrollTransform(withAnim) {
	if (withAnim && scrollAnimMs > 0) {
		lyricInner.style.transition = `transform ${scrollAnimMs}ms linear`;
	} else {
		lyricInner.style.transition = 'none';
	}
	lyricInner.style.transform = `translateY(${logicalScrollTop}px)`;
}

function startDrag(e) {
	if (!lines.length) return;
	dragging = true; dragStartY = e.pageY; dragStartScrollTop = logicalScrollTop; autoScrollEnabled = false; lyricWrapper.classList.add('dragging'); scheduleAutoReturn();
}
function moveDrag(e) {
	if (!dragging) return;
	const dy = e.pageY - dragStartY;
	logicalScrollTop = dragStartScrollTop + dy;
	clampManualScroll();
	applyScrollTransform(false);
	scheduleAutoReturn();
}
function endDrag() { if (!dragging) return; dragging = false; lyricWrapper.classList.remove('dragging'); scheduleAutoReturn(); }

function clampManualScroll() {
	// 计算可滚动范围：最小值为最后一行中心位置，最大值为第一行中心位置
	if (!rowHeights.length) return;
	const clamp = LyricController.computeScrollClamp(rowHeights, cfg.split, 50);
	const min = clamp.min;
	const max = clamp.max;
	if (logicalScrollTop < min) logicalScrollTop = min;
	if (logicalScrollTop > max) logicalScrollTop = max;
}

function updateWordGradients(force) {
	if (!force) return; // 简单处理
	lyricInner.style.setProperty('--colorBefore', cfg.colorBefore);
	lyricInner.style.setProperty('--colorAfter', cfg.colorAfter);
	lyricInner.style.setProperty('--colorHighlight', cfg.colorHighlight);
	lyricInner.style.setProperty('--colorTranslation', cfg.colorTranslation);
}

function updateStatusLine() {
	const cur = audio.currentTime; const dur = audio.duration || 0;
	statusTime.textContent = `${formatTime(cur * 1000)} / ${dur ? formatTime(dur * 1000) : '--:--'}`;
}

// 手动滚动后，若 3 秒无继续滚动，则自动回到当前行
function scheduleAutoReturn() {
	if (autoReturnTimer) clearTimeout(autoReturnTimer);
	autoReturnTimer = setTimeout(() => {
		autoReturnTimer = null;
		// 如果仍处于手动滚动模式，恢复自动滚动并回到当前行
		autoScrollEnabled = true;
		// 使用动画过渡回到当前行
		scrollToCurrentLine();
	}, 3000);
}

function tick() {
	requestAnimationFrame(tick);
	if (!parsedLyric || !lines.length) return;
	const t = audio.currentTime * 1000;
	// 每帧使用库计算状态并返回当前行/词索引
	let ret; try { ret = LyricController.updateByTime(parsedLyric, t); } catch { return; }
	const nextLine = ret?.lineIndex ?? -1;
	const nextWord = ret?.wordIndex ?? -1;

	// 行变化：更新行样式、词样式与滚动
	if (nextLine !== currentLine) {
		const prev = currentLine;
		currentLine = nextLine;
		markActiveLine();
		// 根据支持情况分别处理
		if (cfg.gradient && prev >= 0 && supportsPerWord(lines[prev])) applyWordStates(prev);
		if (cfg.gradient && currentLine >= 0 && supportsPerWord(lines[currentLine])) applyWordStates(currentLine);
		if (autoScrollEnabled) scrollToCurrentLine();
	} else {
		// 行未变更：只更新当前行对应模式
		const row = lyricInner.querySelectorAll('.lyric_row')[currentLine];
		if (row) {
			if (!cfg.gradient && supportsPerWord(lines[currentLine])) {
				// 关闭渐变 + 逐字：整行统一颜色
				clearPerWordStyles(row);
				const frame = row.querySelector('.lyric_wordFrame[data-kind="primary"]');
				if (frame) { frame.classList.remove('line-grad'); frame.style.backgroundImage = ''; clearWrappedLineStyles(frame); }
			} else if (!cfg.gradient) {
				// 关闭渐变 + 非逐字：清理当前行行级渐变
				const frame = row.querySelector('.lyric_wordFrame[data-kind="primary"]');
				if (frame) { frame.classList.remove('line-grad'); frame.style.backgroundImage = ''; clearWrappedLineStyles(frame); }
				const domWords = row.querySelectorAll('.lyric_word'); domWords.forEach(w => { w.style.backgroundImage = ''; w.classList.remove('lyric_word__current', 'active'); w.style.color = ''; });
			} else if (supportsPerWord(lines[currentLine])) {
				applyWordStates(currentLine);
			} else {
				const frame = row.querySelector('.lyric_wordFrame[data-kind="primary"]');
				if (frame) {
					if (!isWrapped(frame)) {
						const p = Math.max(0, Math.min(1, lines[currentLine]?.renderProgress || 0));
						const pct = (p * 100).toFixed(2);
						frame.classList.add('line-grad');
						frame.style.backgroundImage = `linear-gradient(to right, var(--colorAfter, ${cfg.colorAfter}) ${pct}%, var(--colorBefore, ${cfg.colorBefore}) 0%)`;
					} else {
						frame.classList.remove('line-grad');
						frame.style.backgroundImage = '';
						applyWrappedLineProgress(frame, lines[currentLine]?.renderProgress || 0);
					}
				}
			}
		}
	}

	// 同步当前词索引
	const line = lines[currentLine];
	if (line && line.words?.length && supportsPerWord(line)) {
		currentWord = Math.max(0, Math.min(line.words.length - 1, nextWord));
	} else {
		currentWord = -1;
	}
}

// 工具函数
function escapeHtml(str = '') {
	return str.replace(/[&<>"']/g, c => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;'
	}[c]));
}
function formatTime(ms) {
	const sec = Math.max(0, Math.floor(ms / 1000));
	const m = Math.floor(sec / 60).toString().padStart(2, '0');
	const s = (sec % 60).toString().padStart(2, '0');
	return `${m}:${s}`;
}

// 兼容旧 API 的空函数（已重写）
export { }

// ========== 尺寸监听与重测 ==========
let _resizeTimer = null;
let _lastWrapperWidth = 0;
function setupResizeWatch() {
	// 使用 ResizeObserver 优先监听容器宽度变化；退化到 window.resize
	try {
		if (window.ResizeObserver && lyricWrapper) {
			const ro = new ResizeObserver(entries => {
				// 仅在宽度变化时触发重排，避免音轨高度波动导致的重复工作
				const cr = entries[0].contentRect;
				if (!lines.length) return;
				const w = Math.round(cr.width || 0);
				if (w !== _lastWrapperWidth) {
					_lastWrapperWidth = w;
					debouncedReflow();
				}
			});
			ro.observe(lyricWrapper);
		}
	} catch { }
	window.addEventListener('resize', debouncedReflow);
}

function debouncedReflow() {
	if (!lines.length) return;
	if (_resizeTimer) clearTimeout(_resizeTimer);
	_resizeTimer = setTimeout(() => {
		// 宽度变化：
		// 1) 重建 DOM（清理可能存在的分段 segline）
		// 2) 重新测量 rowHeights
		// 3) 保持当前行锚点并立即居中
		const prevLine = currentLine;
		rerenderLyricStructure();
		// 因为当前行在行级渐变时可能进行物理分段，导致高度轻微变化，这里再次测量并精确校准
		measureRows();
		if (prevLine >= 0) {
			logicalScrollTop = LyricController.computeScrollTarget(rowHeights, cfg.split, prevLine);
			clampManualScroll();
			applyScrollTransform(false);
		}
	}, 60);
}
