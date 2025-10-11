import Lyric from "../lyric";
import DateEx from "../internal-expand/date-ex";
import { LrcParser } from "./lrc";
import { inflate, deflate } from "pako";

// 公共常量与工具函数，供解析与生成复用，避免冗余
const KRC_HEAD = "krc1";
const KRC_XOR_KEY = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];

/**
 * 对字节数组进行异或操作
 * @param bytes - 待编码/解码的字节数组
 * @param key - 用于异或的密钥
 * @returns - 异或后的字节数组
 */
function xorWithKey(bytes: Uint8Array, key: number[] = KRC_XOR_KEY): Uint8Array {
    const out = new Uint8Array(bytes.length);
    const m = key.length;
    for (let i = 0; i < bytes.length; i++) {
        out[i] = bytes[i] ^ (key[i % m] & 0xff);
    }
    return out;
}

/**
 * 将字符串进行 Base64 编码
 * @param str - 待编码字符串
 * @returns - Base64 编码后的字符串
 */
function base64Encode(str: string): string {
    const g: any = (globalThis as any);
    if (typeof g?.btoa === "function") return g.btoa(str);
    if (typeof Buffer !== "undefined") return Buffer.from(str, "utf-8").toString("base64");
    // 最低限度保障：直接返回原文（不建议，但可避免崩溃）
    return str;
}

/**
 * 将 Base64 字符串进行解码
 * @param b64 - 待解码的 Base64 字符串
 * @returns - 解码后的字符串
 */
function base64Decode(b64: string): string {
    const g: any = (globalThis as any);
    if (typeof g?.atob === "function") return g.atob(b64);
    if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf-8");
    // 无法解码时返回输入，外层捕获异常或兼容处理
    return b64;
}

/**
 * 移除文本中的 BOM（Byte Order Mark）
 * @param text - 待处理文本
 * @returns 处理后的文本
 */
function removeBOM(text: string): string {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const TAG_REG = /\[([a-z#]+):([^\]]*)\]/i;
const TIME_REG = /\[(\d+),(\d+)\]/;
const WORD_TIME_REG = /<(\d+),(\d+),0>([^<]+)/;

/**
 * KRC 歌词解析器
 * 先解密解压，再转为 LRC 格式，最后复用 LrcParser 解析
 * @class
 */
export class KrcParser {
    /**
     * 解析 KRC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @param source - 包含 KRC 歌词数据的 ArrayBuffer
     */
    static parse(lyric: Lyric, source: ArrayBuffer) {
        const decoded = this.#decodeToString(new Uint8Array(source));
        let out = { lrc: "" };
        decoded.split(/\r?\n/).forEach(text => this.#parseLine(lyric, text, out));
        LrcParser.parse(lyric, out.lrc);
    }

    /**
     * 解密解压为字符串
     * @param source - 包含 KRC 歌词数据的字节数组
     * @returns 解密解压后的字符串
     */
    static #decodeToString(source: Uint8Array): string {
        if (source.byteLength < 4) throw new RangeError();
        const headMagic = new TextDecoder().decode(source.slice(0, 4));
        if (KRC_HEAD !== headMagic) throw new TypeError();
        const encodedBytes = source.slice(KRC_HEAD.length);
        const zippedBytes = xorWithKey(encodedBytes, KRC_XOR_KEY);
        const decodeStr = inflate(zippedBytes, { to: "string" });
        return removeBOM(decodeStr);
    }

    /**
     * 解析单行
     * @param lyric - 目标 Lyric 实例
     * @param text - 待解析文本行
     * @param out - 输出对象，包含 lrc 字段用于累积转换后的 LRC 文本
     */
    static #parseLine(lyric: Lyric, text: string, out: { lrc: string }) {
        if (TAG_REG.test(text)) {
            this.#parseTagLine(lyric, text, out);
        } else if (TIME_REG.test(text)) {
            this.#parseLyricLine(lyric, text, out);
        }
    }

    /**
     * 解析标签行
     * @param lyric - 目标 Lyric 实例
     * @param text - 待解析文本行
     * @param out - 输出对象，包含 lrc 字段用于累积转换后的 LRC 文本
     */
    static #parseTagLine(lyric: Lyric, text: string, out: { lrc: string }) {
        const match = TAG_REG.exec(text);
        if (!match) return;
        const tagName = match[1].toLowerCase();
        switch (tagName) {
            case "language":
                try {
                    const str = base64Decode(match[2]);
                    lyric.metadata.set("language", JSON.parse(str));
                } catch { }
                break;
            default:
                out.lrc += text + "\n";
        }
    }

    /**
     * 解析歌词内容行
     * @param lyric - 目标 Lyric 实例
     * @param text - 待解析文本行
     * @param out - 输出对象，包含 lrc 字段用于累积转换后的 LRC 文本
     */
    static #parseLyricLine(lyric: Lyric, text: string, out: { lrc: string }) {
        let result = "";
        let t = text;
        let m: RegExpExecArray | null;
        while ((m = TIME_REG.exec(t))) {
            result += `[${new DateEx(parseInt(m[1])).format("mm:ss:S")}]`;
            t = t.replace(m[0], "");
        }
        while ((m = WORD_TIME_REG.exec(t))) {
            result += `<${m[2]}>${m[3]}`;
            t = t.replace(m[0], "");
        }
        out.lrc += result + "\n";
    }
}

/**
 * KRC 歌词生成器
 * @class
 */
export class KrcGenerator {
    /**
     * 生成 KRC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @returns KRC 歌词文件的字节数组
     */
    static generate(lyric: Lyric): ArrayBuffer {
        if (!(lyric instanceof Lyric)) {
            throw new TypeError("参数 1 必须为 Lyric 实例");
        }

        // 1) 先生成 KRC 文本（未压缩未编码）
        const lines: string[] = [];

        // 元数据：language 需要 base64(JSON)，其他直接输出
        lyric.metadata.forEach((value, key) => {
            if (key.toLowerCase() === "language") {
                try {
                    // 尽量保证写入的是合法 JSON
                    let obj: any = value as any;
                    if (typeof value === "string") {
                        try { obj = JSON.parse(value); } catch { obj = value; }
                    }
                    const json = JSON.stringify(obj);
                    const b64 = base64Encode(json);
                    lines.push(`[language:${b64}]`);
                } catch {
                    // 回退为普通键值
                    lines.push(`[language:${String(value)}]`);
                }
            } else {
                lines.push(`[${key}:${String(value)}]`);
            }
        });

        // 歌词行：每个多语言行分别输出一条 KRC 行（相同时间戳）
        for (const line of lyric.lines) {
            const isPseudo = (line as any).pseudoPerWord === true;
            const start = Math.max(0, Math.round(line.startTime || 0));
            let duration = Math.round(line.duration || 0);
            if (!Number.isFinite(duration) || duration < 0) duration = 0;

            const rowTexts = (line.rowTexts && line.rowTexts.length > 0)
                ? line.rowTexts
                : (line.text ? line.text.split("\n") : [""]);

            // 预计算：去空白的对比文本
            const normalize = (s: string) => (s || "").replace(/[\s\u200b]+/g, "");
            const normRowTexts = rowTexts.map(t => normalize(t));
            const allNonSingleWords = (line.words || []).filter(w => !w.singleLine);
            const allWordsTextNorm = normalize(allNonSingleWords.map(w => w.text || "").join(""));
            // 判断整行分词文本更像对应哪一行（用于修正合并时的行号错位）
            let globalMatchIdx = -1;
            if (allWordsTextNorm) {
                globalMatchIdx = normRowTexts.findIndex(t => t === allWordsTextNorm);
            }

            for (let i = 0; i < rowTexts.length; i++) {
                const rowIndex = i + 1; // words 的 lineNo 从 1 开始
                let rowWords = isPseudo ? [] : (line.words || []).filter(w => !w.singleLine && (w?.lineNo || 0) === rowIndex);

                let content = rowTexts[i] || "";
                // 内容清洗：
                // 1) 去掉自身内部换行（防止误把译文拼进来）
                if (content.includes("\n")) content = content.split("\n")[0] || "";
                // 2) 若 content 尾部错误拼接了其它行的文本（常见于上游输入异常），这里裁掉
                const cNormInit = normalize(content);
                for (let j = 0; j < rowTexts.length; j++) {
                    if (j === i) continue;
                    const other = rowTexts[j] || "";
                    const otherNorm = normalize(other);
                    if (!otherNorm) continue;
                    if (cNormInit.endsWith(otherNorm)) {
                        // 从末尾裁去 other 的长度
                        const idx = cNormInit.lastIndexOf(otherNorm);
                        content = content.slice(0, Math.max(0, content.length - (cNormInit.length - idx)));
                        break;
                    }
                }

                // 若该行存在逐字（非 singleLine 的词），根据 KRC 语法输出 <offset,duration,0>text
                // 纠错：若当前行取到的分词文本与本行文本不匹配、却与另一行匹配，视为行号错位 -> 不使用这些词
                if (rowWords.length > 0) {
                    const candidateNorm = normalize(rowWords.map(w => w.text || "").join(""));
                    const selfMatch = candidateNorm && candidateNorm === normRowTexts[i];
                    if (!selfMatch && candidateNorm && normRowTexts.length > 1) {
                        const matchedOther = normRowTexts.findIndex((t, idx) => idx !== i && t === candidateNorm);
                        if (matchedOther !== -1) {
                            // 当前行不使用这些分词
                            rowWords = [];
                        }
                    }
                }

                // 如果当前行没有可用分词，但整行的分词文本能与本行匹配，则把整行分词归到本行（修正错位）
                if (rowWords.length === 0 && globalMatchIdx === i && allNonSingleWords.length > 0) {
                    rowWords = allNonSingleWords;
                }

                if (!isPseudo && rowWords.length > 0) {
                    let offset = 0;
                    const parts: string[] = [];
                    const targetNorm = normalize(content);
                    let builtNorm = "";
                    for (const w of rowWords) {
                        const d = Math.max(0, Math.round(w.duration || 0));
                        const t = (w.text && w.text.length > 0) ? w.text : "\u200b";
                        const nextNorm = (builtNorm + normalize(t));
                        // 仅当累积仍是目标文本前缀时，才将该词纳入；否则视为超出本行（可能是译文部分），停止
                        if (targetNorm && nextNorm.length > targetNorm.length) break;
                        if (targetNorm && !targetNorm.startsWith(nextNorm)) break;
                        parts.push(`<${offset},${d},0>${t}`);
                        offset += d;
                        builtNorm = nextNorm;
                        if (targetNorm && builtNorm.length === targetNorm.length) break; // 恰好覆盖到本行末
                    }
                    // 如果没有任何分词被纳入，回退到兜底 token
                    content = parts.length > 0 ? parts.join("") : `<0,${duration},0>${(content && content.length > 0) ? content : "\u200b"}`;
                } else {
                    // 为兼容解析器，总是输出一个 token，避免纯文本被忽略
                    const textOut = (content && content.length > 0) ? content : "\u200b";
                    content = `<0,${duration},0>${textOut}`;
                }

                lines.push(`[${start},${duration}]${content}`);
            }
        }

        const plainText = lines.join("\n");

        // 2) 压缩（zlib）
        const zipped: Uint8Array = deflate(plainText);

        // 3) 与 XOR 表编码
        const encoded = xorWithKey(zipped, KRC_XOR_KEY);

        // 4) 头部 'krc1' + 编码内容
        const headBytes = new TextEncoder().encode(KRC_HEAD);
        const out = new Uint8Array(headBytes.length + encoded.length);
        out.set(headBytes, 0);
        out.set(encoded, headBytes.length);
        return out.buffer;
    }
}