import Line from "./line";
import Word from "./word";
export { default as LyricController } from "./controller";
import { LrcParser, LrcGenerator, TrcGenerator } from "./parsers/lrc";
import { KrcParser, KrcGenerator } from "./parsers/krc";
import { KscParser, KscGenerator } from "./parsers/ksc";
import { QrcParser, QrcGenerator } from "./parsers/qrc";

/**
 * 歌词类
 */
export default class Lyric {
    /**
     * 歌词元数据，键值对形式
     */
    #metadata: Map<string, string | number> = new Map();

    /**
     * 多行歌词数组，按 startTime 升序排列
     */
    #lines: Array<Line> = [];

    // 记录已规范化（words 已克隆为独立实例）的行，避免重复处理
    #normalizedLines: WeakSet<Line> = new WeakSet();

    /**
     * 歌词元数据，键值对形式
     * @returns 元数据 Map 实例
     */
    get metadata() {
        return this.#metadata;
    }

    /**
     * 多行歌词数组，按 startTime 升序排列
     * @returns 行数组
     */
    get lines() {
        return this.#lines;
    }

    /**
     * 获取数据是否为空
     */
    get isEmpty() {
        if (this.#metadata.size === 0 && this.#lines.length === 0) return true;
        return false;
    }

    /**
     * 构造函数
     * @param buffer - 包含歌词数据的 ArrayBuffer
     * @returns 无返回值
     */
    public constructor(buffer: ArrayBuffer) {
        if (arguments.length !== 1) {
            throw new TypeError("参数数量必须为 1");
        }

        if (typeof buffer !== "object" || !(buffer instanceof ArrayBuffer)) {
            throw new TypeError("参数 1 必须为 ArrayBuffer 实例");
        }

        this.#reset();

        // 解析优先级：QRC 二进制 -> KRC -> KSC 文本 -> LRC 文本
        const PARSERS = [QrcParser, KrcParser, KscParser, LrcParser];
        for (let i = 0; i < PARSERS.length; i++) {
            try {
                PARSERS[i].parse(this, buffer);
                if (!this.isEmpty) {
                    return;
                }
            } catch {
                this.#reset();
            }
        }

        if (this.isEmpty) {
            throw new SyntaxError();
        }
    }

    /**
     * 从资源 URI 创建歌词实例
     * @param uri - 包含歌词数据的资源 URI
     * @returns 用 Promise 包裹的歌词实例
     */
    public static async createFromUri(uri: string): Promise<Lyric> {
        if (arguments.length !== 1) {
            throw new TypeError("参数数量必须为 1");
        }

        if (typeof uri !== "string") {
            throw new TypeError("参数 1 必须为字符串");
        }

        const response = await fetch(uri);
        const data = await response.arrayBuffer();
        return new Lyric(data);
    }

    /**
     * 统一的行级工具：判断该行是否支持逐字（存在非 singleLine 且 duration>0 的词）
     * @param line - 歌词行实例
     * @returns 是否支持逐字
     */
    public static supportsPerWord(line: Line | undefined | null): boolean {
        if (!line) return false;
        // 优先走实例方法，向后兼容无实例方法的情况
        if ((line as any).pseudoPerWord === true) return true;
        if (typeof line.hasPerWordTiming === "function") return line.hasPerWordTiming();
        const ws = line.words || [];
        return ws.some((w: Word) => (w?.duration || 0) > 0 && !w.singleLine);
    }

    /**
     * 生成指定类型的歌词数据
     * @param lyric - 歌词实例
     * @param type - 歌词类型
     * @returns 生成的歌词数据 ArrayBuffer
     */
    public static generate(lyric: Lyric, type: "lrc" | "trc" | "qrc" | "krc" | "ksc"): ArrayBuffer {
        switch (type) {
            case "lrc":
                return LrcGenerator.generate(lyric);
            case "trc":
                return TrcGenerator.generate(lyric);
            case "qrc":
                return QrcGenerator.generate(lyric);
            case "krc":
                return KrcGenerator.generate(lyric);
            case "ksc":
                return KscGenerator.generate(lyric);
            default:
                throw new TypeError("不支持的歌词格式：" + type);
        }
    }

    /**
     * 设置当前播放时间
     * @param time - 当前播放时间，单位：毫秒
     * @returns 当前行和当前词的索引
     */
    public setCurrentTime(time: number): {
        /**
         * 当前行索引，-1 表示早于第一行，lines.length 表示晚于最后一行
         */
        lineIndex: number;
        /**
         * 当前词索引，-1 表示当前行无词或无当前词
         */
        wordIndex: number
    } {
        if (typeof time !== "number" || Number.isNaN(time) || !Number.isFinite(time) || time < 0) {
            throw new TypeError("参数 1 必须为非负数");
        }

        // 应用全局 offset（单位：毫秒，LRC 可带 offset）
        const offset = (typeof this.#metadata.get("offset") === "number" ? this.#metadata.get("offset") as number : 0) as number;
        const t = time + (offset || 0);

        const lines = this.#lines;
        if (lines.length === 0) return { lineIndex: -1, wordIndex: -1 };

        // 确保每行的 words 是独立实例（LRC 解析可能让多行共享同一 words 数组/对象）
        for (const line of lines) {
            if (!this.#normalizedLines.has(line)) {
                const cloned = line.words.map(w => {
                    const nw = new Word();
                    nw.text = w.text;
                    nw.duration = w.duration;
                    nw.progress = w.progress;
                    nw.singleLine = w.singleLine;
                    nw.lineNo = w.lineNo;
                    nw.state = w.state ?? "future";
                    return nw;
                });
                line.words = cloned;
                this.#normalizedLines.add(line);
            }
        }

        // 二分查找行：找到 startTime <= t 的最大索引 pos
        let pos = -1;
        if (t >= lines[0].startTime) {
            let l = 0, r = lines.length - 1;
            while (l <= r) {
                const m = (l + r) >> 1;
                if (lines[m].startTime <= t) { pos = m; l = m + 1; }
                else { r = m - 1; }
            }
        }
        // 判断是否在最后一行之后
        let curIdx: number | null = null; // null: 早于第一行； lines.length: 晚于最后一行
        if (pos < 0) {
            curIdx = null; // 早于第一行
        } else {
            const line = lines[pos];
            const end = line.startTime + line.duration;
            if (t < end) curIdx = pos; else curIdx = lines.length; // 超过最后一行的结束
        }

        // 每次都完整更新所有行与词状态，避免 seek 后残留
        let returnedLineIndex = curIdx === null ? 0 : (curIdx >= lines.length ? lines.length - 1 : curIdx);
        let returnedWordIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (curIdx === null) {
                // 早于第一行：全部 future
                line.state = "future";
                line.progress = 0;
                // 非逐字行：渲染进度为 0
                line.renderProgress = 0;
                for (const w of line.words) { w.state = "future"; w.progress = 0; }
                continue;
            }
            if (curIdx >= lines.length) {
                // 晚于最后一行：全部 past
                line.state = "past";
                line.progress = 1;
                // 非逐字行：渲染进度为 1
                line.renderProgress = Lyric.supportsPerWord(line) ? 0 : 1;
                for (const w of line.words) { w.state = "past"; w.progress = 1; }
                continue;
            }
            if (i < curIdx) {
                line.state = "past";
                line.progress = 1;
                line.renderProgress = Lyric.supportsPerWord(line) ? 0 : 1;
                for (const w of line.words) { w.state = "past"; w.progress = 1; }
            } else if (i === curIdx) {
                line.state = "current";
                // 行进度
                if (line.duration > 0 && Number.isFinite(line.duration)) {
                    line.progress = Math.min(1, Math.max(0, (t - line.startTime) / line.duration));
                } else {
                    line.progress = 0;
                }
                // 非逐字行：渲染进度 = 行进度；逐字行保持 0 以便 UI 走词级
                line.renderProgress = Lyric.supportsPerWord(line) ? 0 : line.progress;
                // 计算当前行的词状态与进度
                let acc = line.startTime;
                for (let wi = 0; wi < line.words.length; wi++) {
                    const w = line.words[wi];
                    if (w.singleLine) {
                        // 无逐字时间的整行词：跟随整行进度
                        const lineEnd = line.startTime + line.duration;
                        if (t < line.startTime) { w.state = "future"; w.progress = 0; }
                        else if (t >= lineEnd) { w.state = "past"; w.progress = 1; }
                        else { w.state = "current"; w.progress = Math.min(1, Math.max(0, (t - line.startTime) / (line.duration || Infinity))); }
                    } else if (w.duration <= 0) {
                        // 零时长词：按“瞬时事件”处理，不展示 current 渐变
                        const wordStart = acc;
                        if (t < wordStart) { w.state = "future"; w.progress = 0; }
                        else { w.state = "past"; w.progress = 1; }
                    } else {
                        const wordStart = acc;
                        const wordEnd = acc + w.duration;
                        if (t < wordStart) { w.state = "future"; w.progress = 0; }
                        else if (t >= wordEnd) { w.state = "past"; w.progress = 1; }
                        else { w.state = "current"; w.progress = (t - wordStart) / (w.duration || 1); }
                    }
                    acc += w.duration;
                }
                // 计算返回的词索引
                if (i === returnedLineIndex) {
                    const words = line.words;
                    let idx = words.findIndex(w => w.state === "current");
                    if (idx === -1 && words.length) {
                        for (let k = words.length - 1; k >= 0; k--) { if (words[k].state === "past") { idx = k; break; } }
                        if (idx === -1) idx = 0;
                    }
                    returnedWordIndex = idx;
                }
            } else {
                line.state = "future";
                line.progress = 0;
                line.renderProgress = 0;
                for (const w of line.words) { w.state = "future"; w.progress = 0; }
            }
        }

        return { lineIndex: returnedLineIndex, wordIndex: returnedWordIndex };
    }

    /**
     * 重置数据
     */
    #reset() {
        this.#metadata.clear();
        this.#lines.length = 0;
        // 重置已规范化集合，避免后续解析继承旧状态
        this.#normalizedLines = new WeakSet();
    }
}