
import Line from "../line";
import Lyric from "../lyric";
import Word from "../word";

const LINE_TIME_TAG = /^\[[^:]+:[^\]]*\]/;
const ALT_LINE_STYLE = /^(\[(\d+),(\d+)\])/;
const TIME_TAG = /\[(\d+):(\d+)(?:[.:](\d+))?\]/;
const WORD_TIME_TAG = /\<(\d+)\>/;
const WORD_TIME_SPLIT = /\<\d+\>/;
const META_TAG = /\[([a-z#]+):([^\]]*)\]/i;

/**
 * LRC 歌词解析器  
 * 支持 TRC 格式以及兼容了一些特殊变种格式
 * @class
 */
export class LrcParser {
    /** 歌词末尾时长无限大以确保兼容 */
    static optionLastLyricIsInfinity = false;

    /**
     * 解析 LRC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @param source - 输入的 LRC 文件数据
     * @returns 无返回值
     */
    static parse(lyric: Lyric, source: ArrayBuffer): void;

    /**
     * 解析 LRC 歌词文本
     * @param lyric - 目标 Lyric 实例
     * @param text - 输入的 LRC 歌词文本
     * @returns 无返回值
     */
    static parse(lyric: Lyric, text: string): void;

    /**
     * 解析 LRC 歌词文件或文本
     * @param lyric - 目标 Lyric 实例
     * @param sourceOrText - 输入的 LRC 文件数据或文本
     * @returns 无返回值
     */
    static parse(lyric: Lyric, sourceOrText: ArrayBuffer | string): void {
        let text = "";
        if (sourceOrText instanceof ArrayBuffer) {
            text = new TextDecoder("utf-8").decode(sourceOrText);
        } else {
            text = sourceOrText;
        }
        text.split(/\r?\n/).forEach(line => this.#parseLine(lyric, line));
        this.#mergeAndSortLyric(lyric);
    }

    /**
     * 解析单行数据
     * @param lyric - 目标 Lyric 实例
     * @param text - 行文本
     * @returns 无返回值
     */
    static #parseLine(lyric: Lyric, text: string) {
        if (ALT_LINE_STYLE.test(text)) {
            text = this.#processAltLineStyle(text);
        }
        if (!LINE_TIME_TAG.test(text)) return;
        if (META_TAG.test(text)) {
            this.#parseMetaTag(lyric, text);
        } else if (TIME_TAG.test(text)) {
            this.#parseLyricLine(lyric, text);
        }
    }

    /**
     * 处理特殊样式歌词行
     * @param text - 行文本
     * @returns 处理后的行文本
     */
    static #processAltLineStyle(text: string): string {
        text = text.replace(ALT_LINE_STYLE, (_: string, _all: string, min: string) => {
            const d = new Date(parseFloat(min));
            return `[${d.getMinutes()}:${d.getSeconds()}.${d.getMilliseconds()}]`;
        });
        text = text.replace(/\(0,(\d+)\)/gi, (_: string, ms: string) => `<${ms}>`);
        return text;
    }

    /**
     * 解析标签行
     * @param lyric - 目标 Lyric 实例
     * @param text - 行文本
     * @returns 无返回值
     */
    static #parseMetaTag(lyric: Lyric, text: string) {
        const match = META_TAG.exec(text);
        if (!match) return;
        const tag = match[1].toLowerCase();
        const value = match[2] || "";
        switch (tag) {
            case "ar": case "au": case "ti": case "al": case "by":
            case "re": case "ve": case "key": case "sign": case "qq":
            case "id": case "hash": case "length":
                lyric.metadata.set(tag, value);
                break;
            case "total": {
                const time = Math.floor(parseInt(value) / 1000 + 0.5);
                const m = String(Math.floor(time / 60)).padStart(2, "0");
                const s = String(time % 60).padStart(2, "0");
                lyric.metadata.set("length", `${m}:${s}`);
                break;
            }
            case "offset": {
                let num = parseInt(value);
                if (isNaN(num)) num = 0;
                lyric.metadata.set("offset", num);
                break;
            }
        }
    }

    /**
     * 解析歌词内容行
     * @param lyric - 目标 Lyric 实例
     * @param text - 行文本
     * @returns 无返回值
     */
    static #parseLyricLine(lyric: Lyric, text: string) {
        const times: number[] = [];
        let timeText = text;
        let match: RegExpExecArray | null;
        while ((match = TIME_TAG.exec(timeText))) {
            const ms = match[3] ? parseInt(match[3].padEnd(3, "0")) : 0;
            const start = (parseInt(match[1]) * 60 + parseInt(match[2])) * 1000 + ms;
            times.push(start);
            timeText = timeText.replace(match[0], "");
        }
        let words: Word[] = [];
        const wordless = timeText.split(WORD_TIME_SPLIT);
        wordless.shift();
        let wordIdx = 0;
        let wordText = timeText;
        while ((match = WORD_TIME_TAG.exec(wordText))) {
            const word = new Word();
            word.lineNo = 1;
            word.duration = parseInt(match[1]);
            word.text = wordless[wordIdx++] ?? "";
            words.push(word);
            wordText = wordText.replace(match[0], "");
        }
        if (words.length === 0) {
            const word = new Word();
            word.lineNo = 1;
            word.singleLine = true;
            word.text = timeText;
            words.push(word);
        }
        times.forEach(startTime => {
            const line = new Line();
            line.startTime = startTime;
            // 若存在逐字词，则使用去除 <时长> 标签后的纯文本（wordText）；否则用 timeText
            line.text = words.length > 0 ? wordText : timeText;
            line.words = words;
            lyric.lines.push(line);
        });
    }

    /**
     * 合并、去重、排序歌词主流程
     * 1. 去重 2. 合并同一时间戳 3. 排序 4. 编号和时长 5. 处理最后一句时长
     * @returns 无返回值
     */
    static #mergeAndSortLyric(lyric: Lyric) {
        // 1. 去重
        let lines = this.#deduplicateLines(lyric.lines);
        // 2. 合并同一时间戳
        lines = this.#mergeSameTimestampLines(lines);
        // 3. 排序
        this.#sortLines(lines);
        // 4. 编号和时长
        this.#assignLineNumbersAndDurations(lines);
        // 5. 处理最后一句时长
        this.#setLastLineDuration(lines, lyric);
        // 6. 为无逐字精准的行自动均分生成“伪逐字”
        this.#autoDistributePseudoPerWord(lines);
        // 更新原歌词对象
        lyric.lines.length = 0;
        lyric.lines.push(...lines);
    }

    /**
     * 歌词去重，避免重复行（用 JSON 字符串做唯一标识，Map 提高效率）
     * @param lines - 歌词行数组
     * @returns 去重后的歌词行数组
     */
    static #deduplicateLines(lines: Line[]): Line[] {
        const seen = new Map<string, Line>();
        for (const line of lines) {
            // 用 JSON 字符串作为唯一 key
            const key = JSON.stringify(line);
            if (!seen.has(key)) {
                seen.set(key, line);
            }
        }
        return Array.from(seen.values());
    }

    /**
     * 合并同一时间戳的歌词行（同一时间戳的歌词合并为一行，words 也合并）
     * @param lines - 歌词行数组
     * @returns 合并后的歌词行数组
     */
    static #mergeSameTimestampLines(lines: Line[]): Line[] {
        const mergedMap = new Map<number, Line>();
        for (const line of lines) {
            // 以 startTime 作为唯一 key
            const exist = mergedMap.get(line.startTime);
            if (exist) {
                // 合并文本和分词
                exist.text += "\n" + line.text;
                line.words.forEach(w => w.lineNo = (exist.words[0]?.lineNo ?? 0) + 1);
                exist.words = exist.words.concat(line.words);
            } else {
                mergedMap.set(line.startTime, line);
            }
        }
        return Array.from(mergedMap.values());
    }

    /**
     * 按时间戳升序排序歌词行
     * @param lines - 歌词行数组
     * @returns 无返回值
     */
    static #sortLines(lines: Line[]) {
        lines.sort((a, b) => a.startTime - b.startTime);
    }

    /**
     * 给每行歌词分配编号、时长、分行文本
     * @param lines - 歌词行数组
     * @returns 无返回值
     */
    static #assignLineNumbersAndDurations(lines: Line[]) {
        lines.forEach((line, idx, arr) => {
            // 时长为下一行的 startTime - 当前行 startTime
            line.duration = arr[idx + 1] ? arr[idx + 1].startTime - line.startTime : line.duration;
            // 行号
            line.no = idx + 1;
            // 按换行符分割多行文本
            line.rowTexts = line.text.split("\n");
            // 将主文本回写到 text，仅保留第一行，避免 text 中混入译文
            if (line.rowTexts && line.rowTexts.length > 0) {
                line.text = line.rowTexts[0] || "";
            }
        });
    }

    /**
     * 设置最后一句歌词的时长（根据 optionLastLyricIsInfinity 或歌曲总时长自动处理）
     * @param lines - 歌词行数组
     * @param lyric - 歌词对象
     * @returns 无返回值
     */
    static #setLastLineDuration(lines: Line[], lyric: Lyric) {
        if (lines.length === 0) return;
        // 若未提供歌曲总时长或强制无限大，最后一句时长为 Infinity
        if (LrcParser.optionLastLyricIsInfinity || !lyric.metadata.has("length")) {
            lines[lines.length - 1].duration = Infinity;
        } else {
            const last = lines[lines.length - 1];
            // 解析歌曲总时长
            const match = TIME_TAG.exec(`[${lyric.metadata.get("length")}]`);
            if (match) {
                const ms = match[3] ? parseInt(match[3].padEnd(3, "0")) : 0;
                const songLen = (parseInt(match[1] || "0") * 60 + parseInt(match[2] || "0")) * 1000 + ms;
                last.duration = songLen - last.startTime;
                if (last.duration <= 0) last.duration = Infinity;
            } else {
                last.duration = Infinity;
            }
        }
    }

    /**
     * 为不支持逐字精准的行，按字符均分其行时长以生成“伪逐字”。
     * 规则：
     * - 仅当 line.words 中不存在有效的逐字计时（非 singleLine 且 duration>0）时生效；
     * - 且 line.duration 为有限正数，line.text（或 rowTexts）存在可用内容；
     * - 将每个字符分配一个 duration，使总和≈line.duration，余数从前往后+1 分配；
     * - 生成的 Word.singleLine=false，lineNo=1（或对应多行行号），并将 line.pseudoPerWord=true；
     */
    static #autoDistributePseudoPerWord(lines: Line[]) {
        const evenPack = (total: number, n: number): number[] => {
            const cnt = Math.max(1, n);
            const base = Math.floor(total / cnt);
            const out = new Array(cnt).fill(base);
            let rest = total - base * cnt;
            for (let i = 0; i < cnt && rest > 0; i++, rest--) out[i] += 1;
            return out;
        };

        for (const line of lines) {
            const nonSingleWords = (line.words || []).filter(w => !w.singleLine && (w.duration || 0) > 0);
            const hasFiniteLineDur = Number.isFinite(line.duration) && (line.duration || 0) > 0;

            // 多语言行文本优先用 rowTexts，否则从 text 拆分（后续也要用到）
            const rowTexts = (line.rowTexts && line.rowTexts.length > 0)
                ? line.rowTexts
                : (line.text ? line.text.split("\n") : [""]);

            // 判断“单 token 行”场景：每个行号最多 1 个 token，且总 token 数不大于非空行数
            const nonEmptyRows = rowTexts.reduce((s, t) => s + (Array.from(t || "").length > 0 ? 1 : 0), 0);
            const wordsByRow = new Map<number, number>();
            for (const w of nonSingleWords) wordsByRow.set(w.lineNo || 1, (wordsByRow.get(w.lineNo || 1) || 0) + 1);
            const atMostOnePerRow = Array.from(wordsByRow.values()).every(c => c <= 1);
            const isSingleTokenPerRow = nonSingleWords.length > 0 && atMostOnePerRow && nonSingleWords.length <= nonEmptyRows;

            // 触发条件：完全无 token，或“每行单 token”
            if (!(nonSingleWords.length === 0 || isSingleTokenPerRow)) continue;

            // 计算用于均分的总时长：优先使用行时长；若为 Infinity/无效，则回退为各 token 的最大 duration（避免多行累加翻倍）
            let totalForDistribute = hasFiniteLineDur ? Math.round(line.duration) : 0;
            if (!totalForDistribute && nonSingleWords.length > 0) {
                totalForDistribute = nonSingleWords.reduce((m, w) => Math.max(m, Math.max(0, Math.round(w.duration || 0))), 0);
            }
            if (!(totalForDistribute > 0)) continue;

            // 仅按第一行（若第一行为空则取首个非空行）进行伪逐字均分，避免把译文合并计算
            let timingRowIndex = 0;
            if (!rowTexts[0] || Array.from(rowTexts[0]).length === 0) {
                const idx = rowTexts.findIndex(t => Array.from(t || "").length > 0);
                timingRowIndex = idx >= 0 ? idx : 0;
            }
            const primaryText = rowTexts[timingRowIndex] || "";
            const chars = Array.from(primaryText);
            if (chars.length === 0) continue;

            const durations = evenPack(totalForDistribute, chars.length);
            const newWords: Word[] = [];
            for (let i = 0; i < chars.length; i++) {
                const w = new Word();
                w.text = chars[i];
                w.duration = durations[i] || 0;
                w.singleLine = false;
                w.lineNo = (timingRowIndex + 1);
                newWords.push(w);
            }

            if (newWords.length > 0) {
                line.words = newWords;
                // 行主文本更新为第一行文本，保持一致
                if (rowTexts && rowTexts.length > 0) line.text = rowTexts[0] || "";
                // 标记伪逐字
                (line as any).pseudoPerWord = true;
            }
        }
    }
}

/**
 * TRC 歌词生成器
 * @class
 */
export class TrcGenerator {
    /**
     * 生成 TRC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @returns 生成的 TRC 文件数据
     */
    static generate(lyric: Lyric): ArrayBuffer {
        if (!(lyric instanceof Lyric)) {
            throw new TypeError("参数 1 必须为 Lyric 实例");
        }

        const lines: string[] = [];

        // 生成元数据行
        lyric.metadata.forEach((value, key) => {
            lines.push(`[${key}:${value}]`);
        });

        // 生成歌词行
        lyric.lines.forEach(line => {
            const timeTag = this.#formatTimeTag(line.startTime);
            const rowTexts = (line.rowTexts && line.rowTexts.length > 0)
                ? line.rowTexts
                : (line.text ? line.text.split("\n") : [""]);

            // 对每个多语言行（rowTexts）分别生成同时间戳的 LRC 行
            for (let i = 0; i < rowTexts.length; i++) {
                const rowIndex = i + 1; // lineNo 从 1 开始
                let content = rowTexts[i] || "";

                // 若该行具备逐字时间（并且针对该行存在有效分词），按 <duration>text 生成，保持时间线
                // 若为伪逐字，则按“无逐字”降级输出
                const isPseudo = (line as any).pseudoPerWord === true;
                if (!isPseudo && this.#hasPerWordForRow(line, rowIndex)) {
                    content = this.#buildRowTextFromWords(line, rowIndex);
                }

                lines.push(`${timeTag} ${content}`);
            }
        });

        const lrcText = lines.join("\n");
        return new TextEncoder().encode(lrcText).buffer;
    }

    /**
     * 将毫秒时间转换为标签格式
     * @param timeMs - 时间，单位：毫秒
     * @returns 标签字符串
     */
    static #formatTimeTag(timeMs: number): string {
        const totalSeconds = Math.floor(timeMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = timeMs % 1000;
        return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}]`;
    }

    /**
     * 判断指定行号是否存在逐字时间词
     * @param line - 歌词行实例
     * @param rowIndex - 行号，从 1 开始
     * @returns 是否存在逐字时间词
     */
    static #hasPerWordForRow(line: Line, rowIndex: number): boolean {
        if (!line || !Array.isArray(line.words)) return false;
        return line.words.some(w => w && w.lineNo === rowIndex && !w.singleLine && (w.duration || 0) > 0);
    }

    /**
     * 从 words 中按行号拼接一行文本（逐字），形如 <duration>文本
     * 若该行只有 singleLine 词，则返回其 text。
     * @param line - 歌词行实例
     * @param rowIndex - 行号，从 1 开始
     * @returns 拼接后的行文本
     */
    static #buildRowTextFromWords(line: Line, rowIndex: number): string {
        const rowWords = (line.words || []).filter(w => w && w.lineNo === rowIndex);
        if (rowWords.length === 0) return "";
        // 如果全为 singleLine 或存在 singleLine 词，直接返回其文本（与解析时的建模一致）
        const single = rowWords.find(w => w.singleLine);
        if (single) return single.text || "";
        // 否则拼接逐字：<duration>text
        return rowWords.map(w => `\u003c${Math.max(0, Math.round(w.duration || 0))}\u003e${w.text || ""}`).join("");
    }

}

/**
 * LRC 歌词生成器
 * @class
 */
export class LrcGenerator {
    /**
     * 生成 LRC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @returns 生成的 LRC 文件数据
     */
    static generate(lyric: Lyric): ArrayBuffer {
        if (!(lyric instanceof Lyric)) {
            throw new TypeError("参数 1 必须为 Lyric 实例");
        }

        const trcBuffer = TrcGenerator.generate(lyric);
        const trcText = new TextDecoder("utf-8").decode(trcBuffer);
        const lrcText = trcText.replace(/<\d+>/g, '');
        return new TextEncoder().encode(lrcText).buffer;
    }
}