import Lyric, { LyricController } from './lyric';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host{ display:block; position:relative; }
    .wrapper{ position:relative; height:100%; overflow:hidden; background: var(--bg, transparent); user-select:none; -webkit-user-select:none; -ms-user-select:none; touch-action:none; overscroll-behavior: contain; }
    .inner{ position:absolute; left:0; width:100%; top:50%; will-change:transform; text-align:var(--align, center); z-index:0; user-select:none; -webkit-user-select:none; -ms-user-select:none; }
    .row{ font-size: var(--font-size, 24px); line-height: 1; padding:4px 0; margin:0; color:#5f6368; }
    .row.active{ color: var(--colorHighlight, #fff); font-weight:600; }
    .sub{ display:block; line-height:1.35; }
    .sub.secondary{ margin-top:4px; font-size:.78em; color: var(--colorTranslation, #8a8f95); }
    .wordFrame.line-grad{ background-clip:text; -webkit-background-clip:text; color: transparent; }
    .w{ display:inline; white-space:pre-wrap; position:relative; padding:0; margin:0; letter-spacing:0; }
    .w.done{ color: var(--colorAfter, #ffb347); }
    .w.future{ color: var(--colorBefore, #42d392); }
    .w.current{ background-clip:text; -webkit-background-clip:text; color:transparent; font-weight:600; }
    .segline{ display:block; white-space:pre; }
    .segline-clip{ background-clip:text; -webkit-background-clip:text; color:transparent; }
    .refline{ position:absolute; left:0; right:0; top:50%; transform: translateY(-0.5px); border-top: 1px dashed var(--reflineColor, rgba(255,255,255,.16)); pointer-events:none; z-index:1; }
    .refline.hidden{ display:none; }
    /* Overlay slots aligned to the reference line */
    .refslots{ position:absolute; left:0; right:0; top:50%; transform: translateY(-50%); display:flex; align-items:center; justify-content:space-between; padding: 0 8px; pointer-events:none; z-index:2; }
    .refslots.hidden{ display:none; }
    .refslot{ pointer-events:auto; display:flex; align-items:center; gap:6px; }
    .refslot[part="ref-center"]{ justify-content:center; margin: 0 auto; }
  </style>
  <div class="wrapper" part="wrapper">
    <slot name="before"></slot>
    <div class="inner" part="inner"></div>
    <div class="refline" part="refline"></div>
    <div class="refslots" part="refslots">
      <div class="refslot" part="ref-left"><slot name="ref-left"></slot></div>
      <div class="refslot" part="ref-center"><slot name="ref-center"></slot></div>
      <div class="refslot" part="ref-right"><slot name="ref-right"></slot></div>
    </div>
    <slot name="after"></slot>
  </div>
`;

/**
 * 歌词显示组件
 * @class
 */
export class JyoLyricElement extends HTMLElement {
  static get observedAttributes() {
    return ['src', 'gradient', 'align', 'font-size', 'line-gap', 'scroll-ms', 'show-lang1', 'show-lang2', 'show-refline', 'style', 'class'];
  }

  #root: ShadowRoot;
  #inner!: HTMLElement;
  #wrapper!: HTMLElement;
  #refline!: HTMLElement;
  #refslots!: HTMLElement;
  #parsed: any = null;
  #lines: any[] = [];
  #currentLine = -1;
  #logicalTop = 0;
  #autoScroll = true;
  #animMs = 280;
  #resizeObs?: ResizeObserver;
  #dragging = false;
  #dragStartY = 0;
  #dragStartTop = 0;
  #autoReturnTimer: any = null;
  #rowHeights: number[] = [];
  #currentWord = -1;
  #manualActive = false;
  #attrObs?: MutationObserver;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.appendChild(tpl.content.cloneNode(true));
    this.#inner = this.#root.querySelector('.inner') as HTMLElement;
    this.#wrapper = this.#root.querySelector('.wrapper') as HTMLElement;
    this.#refline = this.#root.querySelector('.refline') as HTMLElement;
  this.#refslots = this.#root.querySelector('.refslots') as HTMLElement;
  }

  connectedCallback() {
    this.style.setProperty('--align', this.getAttribute('align') || 'center');
    this.style.setProperty('--font-size', (this.getAttribute('font-size') || '24') + 'px');
    if (this.hasAttribute('src')) this.loadFromUrl(this.getAttribute('src')!);
    if ('ResizeObserver' in window) {
      this.#resizeObs = new ResizeObserver(() => this.#reflow());
      this.#resizeObs.observe(this);
    }
    this.#wrapper.addEventListener('wheel', (e: Event) => {
      const we = e as WheelEvent;
      if (!this.#lines.length) return;
      this.#autoScroll = false;
      this.#logicalTop += we.deltaY;
      this.#clampManualScroll();
      this.#applyTransform(false);
      this.#manualActive = true;
      this.#updateReflineVisibility();
      this.#scheduleAutoReturn();
      we.preventDefault();
      e.stopPropagation();
    }, { passive: false } as any);

    this.#wrapper.addEventListener('mousedown', (e: MouseEvent) => {
      if (!this.#lines.length) return;
      this.#dragging = true;
      this.#dragStartY = e.pageY;
      this.#dragStartTop = this.#logicalTop;
      this.#autoScroll = false;
      this.#manualActive = true;
      this.#updateReflineVisibility();
      this.#scheduleAutoReturn();
    });
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.#dragging) return;
      const dy = e.pageY - this.#dragStartY;
      this.#logicalTop = this.#dragStartTop + dy;
      this.#clampManualScroll();
      this.#applyTransform(false);
      this.#scheduleAutoReturn();
    });
    window.addEventListener('mouseup', () => {
      if (!this.#dragging) return;
      this.#dragging = false;
      this.#manualActive = false;
      this.#updateReflineVisibility();
      this.#scheduleAutoReturn();
    });

    this.#wrapper.addEventListener('touchstart', (e: TouchEvent) => {
      if (!this.#lines.length) return;
      if (e.touches.length !== 1) { this.#dragging = false; return; }
      const t = e.touches[0];
      this.#dragging = true;
      this.#dragStartY = t.pageY;
      this.#dragStartTop = this.#logicalTop;
      this.#autoScroll = false;
      this.#manualActive = true;
      this.#updateReflineVisibility();
      this.#scheduleAutoReturn();
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
    this.#wrapper.addEventListener('touchmove', (e: TouchEvent) => {
      if (!this.#dragging) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const dy = t.pageY - this.#dragStartY;
      this.#logicalTop = this.#dragStartTop + dy;
      this.#clampManualScroll();
      this.#applyTransform(false);
      this.#scheduleAutoReturn();
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
    this.#wrapper.addEventListener('touchend', (e: TouchEvent) => {
      if (!this.#dragging) return;
      if (e.touches.length === 0) {
        this.#dragging = false;
      }
      this.#manualActive = false;
      this.#updateReflineVisibility();
      this.#scheduleAutoReturn();
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
    this.#wrapper.addEventListener('touchcancel', (e: TouchEvent) => {
      if (!this.#dragging) return;
      this.#dragging = false;
      this.#manualActive = false;
      this.#updateReflineVisibility();
      this.#scheduleAutoReturn();
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    document.addEventListener('visibilitychange', this.#onVisChange);

    if ('MutationObserver' in window) {
      this.#attrObs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'class')) {
            this.#markActive();
          }
        }
      });
      this.#attrObs.observe(this, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    this.#updateReflineVisibility();
  }

  disconnectedCallback() {
    this.#resizeObs?.disconnect();
    document.removeEventListener('visibilitychange', this.#onVisChange);
    this.#attrObs?.disconnect();
  }

  attributeChangedCallback(name: string, _old: string | null, val: string | null) {
    if (name === 'align' && val) this.style.setProperty('--align', val);
    if (name === 'font-size' && val) this.style.setProperty('--font-size', `${parseInt(val) || 24}px`);
    if (name === 'src' && val) this.loadFromUrl(val);
    if (name === 'line-gap') this.#reflow();
    if (name === 'scroll-ms' && val) this.#animMs = Math.max(0, parseInt(val) || 0);
    if (name === 'gradient') this.#markActive();
    if (name === 'show-lang1' || name === 'show-lang2') this.#reflow();
    if (name === 'show-refline') this.#updateReflineVisibility();
    if (name === 'style' || name === 'class') this.#markActive();
  }

  /**
   * 设置主题颜色
   * @param colors 颜色配置项
   */
  public setColors(colors: {
    /**
     * 未播放部分颜色
     */
    before?: string;
    /**
     * 已播放部分颜色
     */
    after?: string;
    /**
     * 当前播放部分颜色
     */
    highlight?: string;
    /**
     * 翻译文字颜色
     */
    translation?: string
  }) {
    if (colors.before) this.style.setProperty('--colorBefore', colors.before);
    if (colors.after) this.style.setProperty('--colorAfter', colors.after);
    if (colors.highlight) this.style.setProperty('--colorHighlight', colors.highlight);
    if (colors.translation) this.style.setProperty('--colorTranslation', colors.translation);
    this.#markActive();
  }

  /**
   * 从 URL 加载歌词
   * @param url 歌词文件 URL
   */
  async loadFromUrl(url: string) {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    this.loadFromBuffer(new Uint8Array(buf));
  }

  /**
   * 从文本加载歌词
   * @param text 歌词文本
   */
  loadFromText(text: string) {
    const enc = new TextEncoder();
    this.loadFromBuffer(enc.encode(text));
  }

  /**
   * 从 Uint8Array 加载歌词
   * @param buf Uint8Array 数据
   */
  loadFromBuffer(buf: Uint8Array) {
    try {
      this.clear();
      const ab = new ArrayBuffer(buf.byteLength);
      new Uint8Array(ab).set(buf);
      this.#parsed = new Lyric(ab);
      this.#lines = this.#parsed.lines;
      this.#currentLine = -1;
      this.#logicalTop = 0;
      this.#inner.style.transform = 'translateY(0)';
      this.#renderStructure();
    } catch (err) {
      console.error('[jyo-lyric] parse fail:', err);
    }
  }

  /**
   * 清除所有数据
   */
  clear() {
    this.#parsed = null;
    this.#lines = [];
    this.#inner.innerHTML = '';
    this.#currentLine = -1;
    this.#currentWord = -1;
    this.#logicalTop = 0;
    this.#inner.style.transform = 'translateY(0)';
  }

  /**
   * 设置当前播放时间，单位秒
   * @param s 当前播放时间，单位秒
   */
  setCurrentTime(s: number) {
    if (!this.#parsed) return;
    try {
      const ret = LyricController.updateByTime(this.#parsed, s * 1000);
      const prevLine = this.#currentLine;
      const nextLine = ret?.lineIndex ?? -1;
      const nextWord = ret?.wordIndex ?? -1;
      const perWord = nextLine >= 0 ? ((Lyric as any).supportsPerWord?.(this.#lines[nextLine]) ?? false) : false;
      if (nextLine !== prevLine) {
        this.#currentLine = nextLine;
        this.#emit('linechange', { index: this.#currentLine, previousIndex: prevLine });
      }
      const prevWord = this.#currentWord;
      this.#currentWord = perWord ? nextWord : -1;
      if (this.#currentWord !== prevWord) {
        this.#emit('wordchange', { lineIndex: this.#currentLine, index: this.#currentWord });
      }
      this.#emit('seeked', { time: s });
      this.#markActive();
      if (this.#autoScroll) this.#scrollToCurrent();
    } catch { }
  }

  #renderStructure() {
    if (!this.#lines.length) { this.#inner.innerHTML = ''; return; }
    const fs = parseInt(this.getAttribute('font-size') || '24') || 24;
    const align = this.getAttribute('align') || 'center';
    this.style.setProperty('--align', align);
    this.style.setProperty('--font-size', fs + 'px');
    const showLang1 = (this.getAttribute('show-lang1') ?? 'true') !== 'false';
    const showLang2 = (this.getAttribute('show-lang2') ?? 'true') !== 'false';
    const split = this.#split();

    const html = this.#lines.map((line, idx) => {
      const words = line.words || [];
      const allText = line.text || words.map((w: any) => w.text).join('');
      const primary = (typeof line.primaryText === 'string' ? line.primaryText : (allText.split('\n')[0] || ''));
      const secondary = (typeof line.secondaryText === 'string' ? line.secondaryText : (allText.split('\n')[1] || ''));
      const perWord = (typeof Lyric.supportsPerWord === 'function') ? Lyric.supportsPerWord(line) : ((words || []).some((w: any) => (w?.duration || 0) > 0 && !w.singleLine));
      let s = '';
      if (idx > 0) s += `<div class="gap" style="height:${split}px"></div>`;
      s += `<div class="row" part="row" data-line="${idx}" style="font-size:${fs}px; text-align:${align};">`;
      if (showLang1) {
        if (perWord) {
          const row1 = (words as any[]).filter(w => !w.singleLine && ((w.lineNo || 0) === 1 || (w.lineNo == null)));
          const spans = row1.map((w, wi) => `<span class="w" part="word" data-word="${wi}">${escapeHtml(w.text || '')}</span>`).join('');
          s += `<div class="wordFrame" part="primary" data-kind="primary">${spans || escapeHtml(primary || '')}</div>`;
        } else {
          s += `<div class="wordFrame line-grad" part="primary" data-kind="primary">${primary ? escapeHtml(primary) : ''}</div>`;
        }
      }
      if (secondary && showLang2) {
        const row2 = (words as any[]).filter(w => !w.singleLine && (w.lineNo || 0) === 2);
        if (row2.length > 0) {
          const spans2 = row2.map((w, wi) => `<span class="w" part="word" data-word2="${wi}">${escapeHtml(w.text || '')}</span>`).join('');
          s += `<div class="wordFrame sub secondary" part="secondary" data-kind="secondary">${spans2}</div>`;
        } else {
          s += `<div class="wordFrame sub secondary" part="secondary" data-kind="secondary">${escapeHtml(secondary)}</div>`;
        }
      }
      s += `</div>`;
      return s;
    }).join('');
    this.#inner.innerHTML = html;
    this.#measureRows();
    if (this.#currentLine >= 0) this.#scrollToCurrent(true);
    this.#markActive();
  }

  #markActive() {
    const rows = this.#inner.querySelectorAll('.row');
    rows.forEach((r, i) => {
      r.classList.toggle('active', i === this.#currentLine);
      const frame = (r as HTMLElement).querySelector('.wordFrame[data-kind="primary"]') as HTMLElement | null;
      if (!frame) return;
      const gradientOn = (this.getAttribute('gradient') ?? 'true') !== 'false';
      const line = this.#lines[i];
      const perWord = typeof (Lyric as any).supportsPerWord === 'function' ? (Lyric as any).supportsPerWord(line) : false;
      const state: 'past' | 'current' | 'future' = (this.#lines[i]?.state as any) || (i === this.#currentLine ? 'current' : 'future');
      if (perWord) {
        frame.classList.remove('line-grad');
        frame.style.backgroundImage = '';
        if (i === this.#currentLine) {
          if (gradientOn) this.#applyWordStates(i, true);
          else {
            this.#clearPerWordStyles(r as HTMLElement);
            frame.style.color = '';
          }
        } else {
          this.#clearPerWordStyles(r as HTMLElement);
          if (!gradientOn) {
            frame.style.color = (state === 'past') ? 'var(--colorAfter, #ffb347)' : 'var(--colorBefore, #42d392)';
          } else {
            frame.style.color = (state === 'past') ? 'var(--colorAfter, #ffb347)' : 'var(--colorBefore, #42d392)';
          }
        }
      } else {
        const rp = Math.max(0, Math.min(1, this.#lines[i]?.renderProgress || 0));
        if (gradientOn) {
          this.#ensureSegmented(frame);
          if (frame.querySelector('.segline')) {
            this.#applyWrappedLineProgress(frame, rp);
            frame.classList.remove('line-grad');
            frame.style.backgroundImage = '';
            frame.style.color = '';
          } else {
            if (rp <= 0) {
              frame.classList.remove('line-grad');
              frame.style.backgroundImage = '';
              frame.style.color = 'var(--colorBefore, #42d392)';
            } else if (rp >= 1) {
              frame.classList.remove('line-grad');
              frame.style.backgroundImage = '';
              frame.style.color = 'var(--colorAfter, #ffb347)';
            } else {
              frame.classList.add('line-grad');
              frame.style.color = '';
              frame.style.backgroundImage = `linear-gradient(to right, var(--colorAfter, #ffb347) ${(rp * 100).toFixed(2)}%, var(--colorBefore, #42d392) 0%)`;
            }
          }
        } else {
          frame.classList.remove('line-grad');
          frame.style.backgroundImage = '';
          this.#clearWrappedLineStyles(frame);
          if (i === this.#currentLine) {
            frame.style.color = '';
          } else {
            frame.style.color = (state === 'past') ? 'var(--colorAfter, #ffb347)' : 'var(--colorBefore, #42d392)';
          }
        }
      }
    });
  }

  #scrollToCurrent(immediate = false) {
    if (this.#currentLine < 0) return;
    const target = LyricController.computeScrollTarget(this.#rowHeights, this.#split(), this.#currentLine);
    this.#logicalTop = target;
    this.#applyTransform(!immediate);
  }

  #applyTransform(withAnim: boolean) {
    if (withAnim && this.#animMs > 0) {
      (this.#inner as HTMLElement).style.transition = `transform ${this.#animMs}ms linear`;
    } else {
      (this.#inner as HTMLElement).style.transition = 'none';
    }
    (this.#inner as HTMLElement).style.transform = `translateY(${this.#logicalTop}px)`;
  }

  #measureRows() {
    const rows = Array.from(this.#inner.querySelectorAll('.row')) as HTMLElement[];
    this.#rowHeights = rows.map(r => r.getBoundingClientRect().height);
  }

  #split() {
    const v = parseInt(this.getAttribute('line-gap') || '20') || 20;
    return v;
  }

  #reflow() {
    const prev = this.#currentLine;
    this.#renderStructure();
    this.#measureRows();
    if (prev >= 0) {
      this.#logicalTop = LyricController.computeScrollTarget(this.#rowHeights, this.#split(), prev);
      this.#applyTransform(false);
    }
    this.#markActive();
  }

  #scheduleAutoReturn() {
    if (this.#autoReturnTimer) clearTimeout(this.#autoReturnTimer);
    this.#autoReturnTimer = setTimeout(() => {
      this.#autoReturnTimer = null;
      this.#autoScroll = true;
      this.#scrollToCurrent();
      this.#manualActive = false;
      this.#updateReflineVisibility();
    }, 3000);
  }

  #applyWordStates(lineIdx: number, gradientOn: boolean) {
    const row = this.#inner.querySelectorAll('.row')[lineIdx] as HTMLElement;
    if (!row) return;
    const frame = row.querySelector('.wordFrame[data-kind="primary"]') as HTMLElement | null;
    if (!frame) return;
    const domWords = frame.querySelectorAll('.w[data-word]') as NodeListOf<HTMLElement>;
    const line = this.#lines[lineIdx];
    domWords.forEach((el) => {
      el.classList.remove('done', 'future', 'current');
      el.style.backgroundImage = '';
      el.style.color = '';
      const wi = parseInt(el.getAttribute('data-word') || '-1');
      const w = line?.words?.filter((w: any) => !w.singleLine && ((w.lineNo || 0) === 1 || (w.lineNo == null)))[wi];
      if (!w) return;
      if (w.state === 'past') el.classList.add('done');
      else if (w.state === 'future') el.classList.add('future');
      else {
        if (gradientOn) {
          el.classList.add('current');
          const pct = (((w.progress || 0)) * 100).toFixed(2);
          el.style.backgroundImage = `linear-gradient(to right, var(--colorAfter, #ffb347) ${pct}%, var(--colorBefore, #42d392) 0%)`;
        } else {
          el.classList.add('current');
          el.style.backgroundImage = '';
          el.style.color = getComputedStyle(this).getPropertyValue('--colorHighlight')?.trim() || '#fff';
        }
      }
    });
  }

  #clearPerWordStyles(rowEl: HTMLElement) {
    const ws = rowEl.querySelectorAll('.w') as NodeListOf<HTMLElement>;
    ws.forEach(w => {
      w.classList.remove('done', 'future', 'current');
      w.style.backgroundImage = '';
      w.style.color = '';
    });
  }

  #ensureSegmented(frameEl: HTMLElement) {
    if (!frameEl || (frameEl as any).dataset?.segReady === '1') return;
    if (frameEl.querySelector('.w')) return;
    const tn = Array.from(frameEl.childNodes).find(n => n.nodeType === 3) as Text | null;
    const text = frameEl.textContent || '';
    if (!tn || !text) return;
    const n = tn.length;
    if (n === 0) return;

    const rangesTopCache = new Map<string, number>();
    const getLastRectTop = (start: number, end: number) => {
      const key = `${start}:${end}`;
      if (rangesTopCache.has(key)) return rangesTopCache.get(key)!;
      const r = document.createRange();
      r.setStart(tn, start);
      r.setEnd(tn, Math.max(start + 1, end));
      const rects = r.getClientRects();
      const top = rects.length ? rects[rects.length - 1].top : 0;
      rangesTopCache.set(key, top);
      return top;
    };

    const segments: string[] = [];
    let start = 0;
    while (start < n) {
      const baseTop = getLastRectTop(start, start + 1);
      let lo = start + 1, hi = n, ok = lo;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const top = getLastRectTop(start, mid);
        if (Math.abs(top - baseTop) < 1) { ok = mid; lo = mid + 1; }
        else { hi = mid - 1; }
      }
      segments.push(text.slice(start, ok));
      start = ok;
    }
    frameEl.innerHTML = segments.map((s, i) => `<span class="segline" data-seg="${i}">${escapeHtml(s)}</span>`).join('');
    (frameEl as any).dataset = Object.assign((frameEl as any).dataset || {}, { segReady: '1' });
  }

  #applyWrappedLineProgress(frameEl: HTMLElement, lineProgress: number) {
    if (!frameEl) return;
    this.#ensureSegmented(frameEl);
    const segs = Array.from(frameEl.querySelectorAll('.segline')) as HTMLElement[];
    if (!segs.length) return;
    const widths = segs.map(el => el.getBoundingClientRect().width);
    const total = widths.reduce((a, b) => a + b, 0) || 1;
    const filled = Math.max(0, Math.min(1, lineProgress || 0)) * total;
    let acc = 0;
    segs.forEach((el, idx) => {
      const w = widths[idx] || 1;
      const startX = acc;
      const endX = acc + w;
      if (filled <= startX + 0.01) {
        el.classList.remove('segline-clip');
        el.style.backgroundImage = '';
        el.style.color = `var(--colorBefore, #42d392)`;
      } else if (filled >= endX - 0.01) {
        el.classList.add('segline-clip');
        el.style.color = '';
        el.style.backgroundImage = `linear-gradient(to right, var(--colorAfter, #ffb347) 100%, var(--colorBefore, #42d392) 0%)`;
      } else {
        const ratio = (filled - startX) / w;
        const pct = (ratio * 100).toFixed(2);
        el.classList.add('segline-clip');
        el.style.color = '';
        el.style.backgroundImage = `linear-gradient(to right, var(--colorAfter, #ffb347) ${pct}%, var(--colorBefore, #42d392) 0%)`;
      }
      acc += w;
    });
  }

  #clearWrappedLineStyles(frameEl: HTMLElement) {
    const segs = frameEl.querySelectorAll('.segline') as NodeListOf<HTMLElement>;
    segs.forEach(el => {
      el.classList.remove('segline-clip');
      el.style.backgroundImage = '';
      el.style.color = '';
    });
  }

  #clampManualScroll() {
    if (!this.#rowHeights.length) return;
    const clamp = LyricController.computeScrollClamp(this.#rowHeights, this.#split(), 50);
    const min = clamp.min;
    const max = clamp.max;
    if (this.#logicalTop < min) this.#logicalTop = min;
    if (this.#logicalTop > max) this.#logicalTop = max;
  }

  #onVisChange = () => {
    if (document.visibilityState === 'visible') {
      this.#markActive();
      if (this.#autoScroll) this.#scrollToCurrent(true); else this.#applyTransform(false);
    }
  }

  /**
   * 手动滚动到当前行
   * @param immediate 是否立即滚动
   */
  scrollToCurrent(immediate = false) {
    this.#scrollToCurrent(immediate);
  }

  #emit(name: string, detail?: any) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  #updateReflineVisibility() {
    if (!this.#refline) return;
    const attr = this.getAttribute('show-refline');
    if (attr === 'true') {
      this.#refline.classList.remove('hidden');
      this.#refslots?.classList.remove('hidden');
    } else if (attr === 'false') {
      this.#refline.classList.add('hidden');
      this.#refslots?.classList.add('hidden');
    } else {
      const show = this.#dragging || this.#manualActive || !!this.#autoReturnTimer;
      this.#refline.classList.toggle('hidden', !show);
      this.#refslots?.classList.toggle('hidden', !show);
    }
  }
}

customElements.define('jyo-lyric', JyoLyricElement);
export default JyoLyricElement;

function escapeHtml(input: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
  return input.replace(/[&<>]/g, (c: string) => map[c] || c);
}
