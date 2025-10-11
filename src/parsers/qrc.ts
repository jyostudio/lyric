import Lyric from "../lyric";
import { inflate, inflateRaw, deflate } from "pako";
import { LrcParser } from "./lrc";
import { ENCRYPT_MODE, DECRYPT_MODE, desProcess, generateKeySchedule, processDesBlock } from "../encrypt/des";

// QRC 头部（可选），遇到该头时需跳过前 11 字节
const QRC_HEADER_HEX = "9825B0ACE3028368E8FC6C"; // 22 hex chars => 11 bytes

// 与文件内容进行异或的表（十六进制字符串，循环使用）
let XOR_KEY_HEX =
    "629F5B0900C35E95239F13117ED8923FBC90BB740EC347743D90AA3F51D8F411849FDE951DC3C609D59FFA66F9D8F0F7A090A1D6F3C3F3D6A190A0F7F0D8F966FA9FD509C6C31D95DE9F8411F4D8513FAA903D7447C30E74BB90BC3F92D87E11139F23955EC300095B9F6266A1D852F76790CAD64AC34AD6CA9067F752D8A166";

// 三个 DES 密钥（8 字节各，按 D -> E -> D 顺序使用）
const KEY1 = "!@#)(NHLiuy*$%^&"; // 16 chars -> 16 bytes in UTF-8, DES 仅取前 8 字节
const KEY2 = "123ZXC!@#)(*$%^&";
const KEY3 = "!@#)(*$%^&abcDEF";

/**
 * 将十六进制字符串转换为字节数组
 * @param hex - 十六进制字符串，允许空格
 * @returns 字节数组
 */
function hexToBytes(hex: string): Uint8Array {
    const clean = hex.replace(/\s+/g, "").toLowerCase();
    if (clean.length % 2 !== 0) throw new Error("非法 hex 长度");
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
}

/**
 * 将字节数组转换为十六进制字符串
 * @param bytes - 字节数组
 * @returns 十六进制字符串
 */
function bytesToHex(bytes: Uint8Array): string {
    let s = "";
    for (let i = 0; i < bytes.length; i++) {
        const h = bytes[i].toString(16).padStart(2, "0");
        s += h;
    }
    return s.toUpperCase();
}

/**
 * 对十六进制字符串逐字节异或（循环 key），与参考实现一致
 * @param inputHex - 输入的十六进制字符串
 * @param keyHex - 用于异或的十六进制字符串
 * @returns 异或后的十六进制字符串
 */
function xorHexStrings(inputHex: string, keyHex: string): string {
    let a = inputHex.replace(/\s+/g, "");
    let b = keyHex.replace(/\s+/g, "");
    if (a.length % 2 !== 0) a = "0" + a;
    if (b.length % 2 !== 0) b = "0" + b;
    const aBytes = hexToBytes(a);
    const bBytes = hexToBytes(b);
    const out = new Uint8Array(aBytes.length);
    for (let i = 0; i < aBytes.length; i++) out[i] = aBytes[i] ^ bBytes[i % bBytes.length];
    return bytesToHex(out);
}

/**
 * 三重 DES 解密 - 解密 - 加密（D-E-D）
 * @param data - 输入数据
 * @returns 解密后的数据
 */
function tripleDesDED(data: Uint8Array): Uint8Array {
    const k1 = new TextEncoder().encode(KEY1).slice(0, 8);
    const k2 = new TextEncoder().encode(KEY2).slice(0, 8);
    const k3 = new TextEncoder().encode(KEY3).slice(0, 8);
    let s1 = desProcess(data, k1, DECRYPT_MODE);
    let s2 = desProcess(s1, k2, ENCRYPT_MODE);
    let s3 = desProcess(s2, k3, DECRYPT_MODE);
    return s3;
}

/**
 * 移除文本中的 BOM（Byte Order Mark）
 * @param text - 输入文本
 * @returns 处理后的文本
 */
function removeBOM(text: string): string {
    return text && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * 将 QRC XML 映射到 LRC 文本，方便复用 LrcParser
 * @param xml - 输入的 QRC XML
 * @returns 转换后的 LRC 文本
 */
function qrcXmlToLrc(xml: string): string {
    // 优先处理包含 LyricContent 的变体
    const lyricContentMatch = /<Lyric_\d+\b[^>]*?LyricContent="([\s\S]*?)"/i.exec(xml);
    if (lyricContentMatch && lyricContentMatch[1]) {
        const content = decodeEntities(lyricContentMatch[1]);
        const out: string[] = [];
        const lines = content.split(/\r?\n/);

        for (const raw of lines) {
            const line = raw; // 保留原始空格
            // 直接透传常见 LRC 头信息
            if (/^\s*\[(ti|ar|al|by|offset):[^\]]*\]\s*$/i.test(line)) {
                out.push(line.trim());
                continue;
            }

            // 形如 [start,duration] 后接一串 token 的行
            const lm = /^\s*\[(\d+)\s*,\s*(\d+)\]\s*(.*)$/.exec(line);
            if (lm) {
                const start = parseInt(lm[1], 10);
                const body = lm[3] || "";
                const tag = msToTag(isFinite(start) ? start : 0);

                // 将 body 中每个 “(offset,duration)” 与其前面的文本片段配对
                const segs: string[] = [];
                const re = /\((\d+)\s*,\s*(\d+)\)/g;
                let last = 0; let m: RegExpExecArray | null;
                while ((m = re.exec(body))) {
                    const textSeg = body.slice(last, m.index);
                    const dur = parseInt(m[2], 10);
                    const safeDur = isFinite(dur) ? Math.max(0, dur) : 0;
                    const text = decodeEntities(textSeg);
                    // 跳过仅由空白与括号组成的“分组”片段
                    if (!isParensOnly(text)) {
                        // 即便 text 为空，也放一个零宽占位，避免丢 token
                        segs.push(`<${safeDur}>${text.length ? text : "\u200b"}`);
                    }
                    last = re.lastIndex;
                }
                // 剩余尾巴没有配到时长，按原文附在末尾
                const tailRaw = body.slice(last);
                const tail = decodeEntities(tailRaw);
                out.push(tag + segs.join("") + (tail && !isParensOnly(tail) ? tail : ""));
                continue;
            }

            // 其他未知行，原样透传（避免丢信息）
            if (line.trim()) out.push(line);
        }
        return out.join("\n");
    }

    // 回退：解析带 BeginTime/Duration 的 XML 元素
    const lines: string[] = [];

    // 解析行：匹配任意带 BeginTime/Duration 的元素，提取内部文本与（可选）词级
    const lineRe = /<([a-zA-Z_][\w\-]*)\b[^>]*?BeginTime="(\d+)"[^>]*?Duration="(\d+)"[^>]*>([\s\S]*?)<\/\1>/g;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(xml))) {
        const begin = parseInt(m[2]);
        const body = m[4] || "";
        const words: Array<{ d: number; t: string; single?: boolean }> = [];

        // 词级：宽松匹配任何含 Duration/Len/Length 属性的子元素
        const wordRe = /<([a-zA-Z_][\w\-]*)\b[^>]*?(?:Duration|Len|Length)="(\d+)"[^>]*>([\s\S]*?)<\/\1>/g;
        let wm: RegExpExecArray | null;
        while ((wm = wordRe.exec(body))) {
            const d = parseInt(wm[2]);
            const t = decodeEntities(stripTags(wm[3] || "").trim());
            words.push({ d: isFinite(d) ? d : 0, t });
        }

        const pureText = decodeEntities(stripTags(body).trim());
        const ts = msToTag(begin);
        if (words.length > 0) {
            const segs = words.map(w => `<${Math.max(0, w.d)}>\u200b${w.t}`);
            lines.push(`${ts}${segs.join("")}`);
        } else {
            lines.push(`${ts}${pureText}`);
        }
    }
    return lines.join("\n");
}

/**
 * 移除文本中的 HTML 标签
 * @param s - 输入字符串
 * @returns 处理后的字符串
 */
function stripTags(s: string) {
    return s.replace(/<[^>]+>/g, "");
}

/**
 * 解码 HTML 实体
 * @param s - 输入字符串
 * @returns 处理后的字符串
 */
function decodeEntities(s: string) {
    // 简易实体解码（够用即可）
    return s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

/**
 * 仅由空白和 ASCII 括号组成（用于清理分组括号）
 * @param s - 输入字符串
 * @returns 是否仅由空白和括号组成
 */
function isParensOnly(s: string) {
    return /^[\s()]*$/.test(s);
}

/**
 * 将毫秒时间转换为标签格式
 * @param ms - 毫秒时间
 * @returns 标签字符串
 */
function msToTag(ms: number) {
    const mm = Math.floor(ms / 60000);
    const ss = Math.floor((ms % 60000) / 1000);
    const mss = Math.floor(ms % 1000);
    const m = String(mm).padStart(2, "0");
    const s = String(ss).padStart(2, "0");
    const ms3 = String(mss).padStart(3, "0");
    return `[${m}:${s}.${ms3}]`;
}

/**
 * QRC 歌词解析器
 * @class
 */
export class QrcParser {
    /** 可在运行时覆盖 XOR_KEY_HEX，以兼容不同来源的 QRC 变种 */
    static setXorKeyHex(hex: string) { XOR_KEY_HEX = (hex || "").replace(/\s+/g, ""); }

    /**
     * 解析 QRC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @param source - 输入的 QRC 文件数据
     * @returns 无返回值
     */
    static parse(lyric: Lyric, source: ArrayBuffer) {
        // 1) 预处理：跳过头（可选）、异或
        const fileBytes = new Uint8Array(source);

        // 如果是文本（例如 .lrc），快速返回以避免误判
        // 这里简单判断前几个字节是否可打印字符，如果是则放弃 QRC
        let printable = 0;
        const probeMax = Math.min(16, fileBytes.length);
        for (let i = 0; i < probeMax; i++) {
            const c = fileBytes[i];
            if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126)) printable++;
        }
        if (printable > probeMax * 0.8) throw new TypeError("非 QRC 二进制");

        // 读取文件为 hex 字符串以执行 nibble 异或
        let hex = bytesToHex(fileBytes);
        if (hex.startsWith(QRC_HEADER_HEX)) hex = hex.slice(QRC_HEADER_HEX.length);
        const xoredHex = xorHexStrings(hex, XOR_KEY_HEX);
        const xored = hexToBytes(xoredHex);

        // 2) 三重 DES D-E-D
        const desOut = tripleDesDED(xored);

        // 3) zlib 解压
        let xml = "";
        try {
            xml = inflate(desOut, { to: "string" }) as string;
        } catch (e) {
            // 某些文件可能需要 inflateRaw，尝试一次
            try {
                xml = inflateRaw(desOut, { to: "string" }) as string;
            } catch {
                throw e;
            }
        }
        xml = removeBOM(xml || "");
        if (!xml || !/<QrcInfos[>\s]/i.test(xml)) {
            throw new SyntaxError("QRC 解密失败或内容无效");
        }

        // 4) 转 LRC 并复用 LrcParser
        const lrcText = qrcXmlToLrc(xml);
        if (!lrcText.trim()) throw new SyntaxError("QRC 转换为空");
        LrcParser.parse(lyric, lrcText);
    }
}

/**
 * QRC 歌词生成器
 * @class
 */
export class QrcGenerator {
    /**
     * 生成 QRC 歌词文件
     * @param lyric - 目标 Lyric 实例
     * @returns 生成的 QRC 文件数据
     */
    static generate(lyric: Lyric): ArrayBuffer {
        if (!(lyric instanceof Lyric)) {
            throw new TypeError("参数 1 必须为 Lyric 实例");
        }

        // 1) 构造 LyricContent 文本（QRC 的常见变体），与解析器 qrcXmlToLrc 对应
        const contentLines: string[] = [];

        const esc = (s: string) => (s || "")
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        const normalize = (s: string) => (s || "").replace(/[\s\u200b]+/g, "");

        for (const line of lyric.lines) {
            const isPseudo = (line as any).pseudoPerWord === true;
            const start = Math.max(0, Math.round(line.startTime || 0));
            let duration = Math.round(line.duration || 0);
            if (!Number.isFinite(duration) || duration < 0) duration = 0;

            const rowTexts = (line.rowTexts && line.rowTexts.length > 0)
                ? line.rowTexts
                : (line.text ? line.text.split("\n") : [""]);

            // 预取该行的全部非 singleLine 词，便于错位修正
            const allWords = (line.words || []).filter(w => !w.singleLine);
            const allWordsTextNorm = normalize(allWords.map(w => w.text || "").join(""));

            for (let i = 0; i < rowTexts.length; i++) {
                const rowIndex = i + 1;
                const rawContent = rowTexts[i] || "";

                let rowWords = isPseudo ? [] : (line.words || []).filter(w => !w.singleLine && (w?.lineNo || 0) === rowIndex);

                // 清洗：仅保留本行第一段，避免误把译文拼入
                let content = rawContent.includes("\n") ? (rawContent.split("\n")[0] || "") : rawContent;

                // 若分词文本更像另一行，放弃这些词
                if (rowWords.length > 0) {
                    const candidateNorm = normalize(rowWords.map(w => w.text || "").join(""));
                    const selfNorm = normalize(content);
                    if (candidateNorm && selfNorm && candidateNorm !== selfNorm) {
                        const otherIdx = rowTexts.findIndex((t, idx) => idx !== i && normalize(t) === candidateNorm);
                        if (otherIdx !== -1) rowWords = [];
                    }
                }

                // 如果当前行没有可用分词，但整行分词文本能与本行匹配，则把整行分词归到本行（修正错位）
                if (rowWords.length === 0 && allWords.length > 0) {
                    if (allWordsTextNorm && allWordsTextNorm === normalize(content)) {
                        rowWords = allWords;
                    }
                }

                // 生成一行 LyricContent：形如 [start,duration] 文本1(offset,dur)文本2(offset,dur)...
                let body = "";
                if (!isPseudo && rowWords.length > 0) {
                    let offset = 0;
                    let builtNorm = "";
                    const targetNorm = normalize(content);
                    for (const w of rowWords) {
                        const d = Math.max(0, Math.round(w.duration || 0));
                        const t = (w.text && w.text.length > 0) ? w.text : "\u200b";
                        const nextNorm = normalize(builtNorm + t);
                        if (targetNorm && nextNorm.length > targetNorm.length) break;
                        if (targetNorm && !targetNorm.startsWith(nextNorm)) break;
                        body += `${t}(${offset},${d})`;
                        offset += d;
                        builtNorm = nextNorm;
                        if (targetNorm && builtNorm.length === targetNorm.length) break;
                    }
                    // 若未覆盖到整行文本尾部，不强制追加尾巴，避免错误映射；
                    // 解析时会透传 tail，但这里为保证稳健不再推测剩余片段。
                } else {
                    // 无逐字分词：仍然生成一个 token，保证解析时能得到一条词
                    const textOut = (content && content.length > 0) ? content : "\u200b";
                    body = `${textOut}(0,${duration})`;
                }

                contentLines.push(`[${start},${duration}]${body}`);
            }
        }

        const lyricContent = contentLines.join("\n");
        const xml = `<?xml version="1.0" encoding="utf-8"?>\n<QrcInfos>\n  <Lyric_1 LyricContent="${esc(lyricContent)}"/>\n</QrcInfos>`;

        // 2) 压缩（zlib）；若长度非 8 的整数倍，追加无害注释微调直至可整除
        let zipped: Uint8Array = deflate(xml);
        if (zipped.length % 8 !== 0) {
            for (let padTry = 0; padTry < 64; padTry++) {
                const paddedXml = xml + `\n<!--p${"x".repeat(padTry + 1)}-->`;
                const z = deflate(paddedXml);
                if (z.length % 8 === 0) { zipped = z; break; }
            }
        }

        // 3) 三重 DES E-D-E（与解析相反方向）
        // DES: 输出按 8 字节对齐的完整块，确保可逆
        const desProcessPad = (data: Uint8Array, key8: Uint8Array, mode: number): Uint8Array => {
            const ks: Uint8Array[] = Array.from({ length: 16 }, () => new Uint8Array(6));
            generateKeySchedule(key8, ks, mode);
            const out = new Uint8Array(Math.ceil(data.length / 8) * 8);
            let oi = 0;
            for (let i = 0; i < data.length; i += 8) {
                const block = data.subarray(i, Math.min(i + 8, data.length));
                let inb: Uint8Array = block.length === 8 ? block : (() => { const t = new Uint8Array(8); t.set(block); return t; })();
                const outb = processDesBlock(inb, ks);
                out.set(outb, oi); oi += 8;
            }
            return out;
        };

        const tripleDesEDE = (data: Uint8Array): Uint8Array => {
            const k1 = new TextEncoder().encode(KEY1).slice(0, 8);
            const k2 = new TextEncoder().encode(KEY2).slice(0, 8);
            const k3 = new TextEncoder().encode(KEY3).slice(0, 8);
            // 解析侧为 D(k1) -> E(k2) -> D(k3)，其逆序加密应为 E(k3) -> D(k2) -> E(k1)
            const s1 = desProcessPad(data, k3, ENCRYPT_MODE);
            const s2 = desProcessPad(s1, k2, DECRYPT_MODE);
            const s3 = desProcessPad(s2, k1, ENCRYPT_MODE);
            return s3;
        };
        const desEncrypted = tripleDesEDE(zipped);

        // 4) 与异或表编码，并添加头部（与解析保持互逆）
        const encHex = bytesToHex(desEncrypted);
        const fileHex = QRC_HEADER_HEX + xorHexStrings(encHex, XOR_KEY_HEX);
        const outBytes = hexToBytes(fileHex);
        return outBytes.buffer as ArrayBuffer;
    }
}