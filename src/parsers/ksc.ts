import Lyric from "../lyric";
import Line from "../line";
import Word from "../word";
import { LrcParser } from "./lrc";

/**
 * 简单的 BOM 去除
 * @param text - 待处理文本
 * @returns 处理后的文本
 */
function removeBOM(text: string): string {
	return text && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * 解析 'mm:ss.mmm' 或 'm:ss.ms' 等时间格式为毫秒
 * @param str - 待解析的时间字符串
 * @returns 解析后的毫秒数
 */
function parseTimeToMs(str: string): number {
	const s = (str || "").trim();
	// 允许 mm:ss 或 mm:ss.mmm
	const m = /^(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?$/.exec(s);
	if (!m) return NaN;
	const mm = parseInt(m[1], 10) || 0;
	const ss = parseInt(m[2], 10) || 0;
	const ms = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) : 0;
	return mm * 60_000 + ss * 1_000 + ms;
}

/**
 * 解析类似 "229,264,229,259" 为数字数组
 * @param csv - 待解析的 CSV 字符串
 * @returns 解析后的数字数组
 */
function parseDurations(csv: string): number[] {
	return (csv || "").split(/\s*,\s*/).filter(Boolean).map(v => {
		const n = parseInt(v, 10);
		return Number.isFinite(n) && n > 0 ? n : 0;
	});
}

/**
 * 安全分割为 Unicode code point 序列（避免错误拆分代理对）
 * @param text - 待处理文本
 * @returns Unicode code point 序列
 */
function splitTextToCodePoints(text: string): string[] {
	return Array.from(text || "");
}

/**
 * KSC 歌词解析器（文本脚本格式）
 * 形如：
 *   karaoke.add('01:01.069', '01:02.897', '终于做了这个决定', '229,264,229,...');
 * @class
 */
export class KscParser {
	/**
	 * 解析 KSC 歌词文件
	 * @param lyric - 目标 Lyric 实例
	 * @param source - 包含 KSC 歌词数据的 ArrayBuffer
	 */
	static parse(lyric: Lyric, source: ArrayBuffer): void;

	/**
	 * 解析 KSC 歌词文件
	 * @param lyric - 目标 Lyric 实例
	 * @param text - 包含 KSC 歌词数据的文本
	 */
	static parse(lyric: Lyric, text: string): void;

	/**
	 * 解析 KSC 歌词文件
	 * @param lyric - 目标 Lyric 实例
	 * @param sourceOrText - 包含 KSC 歌词数据的 ArrayBuffer 或文本
	 */
	static parse(lyric: Lyric, sourceOrText: ArrayBuffer | string): void {
		let text = "";
		if (sourceOrText instanceof ArrayBuffer) {
			// 自动编码检测：先严格 UTF-8，失败再尝试 GB18030（GBK 兼容）
			const buf = sourceOrText;
			const tryDecode = (label: string, fatal = false) => {
				try { return new TextDecoder(label, { fatal }).decode(buf); } catch { return null; }
			};
			// 1) 严格 UTF-8（fatal=true，会在非法序列抛错）
			let t = tryDecode("utf-8", true);
			if (t == null) {
				// 2) 尝试 GB18030（等价于 GBK 的超集）
				t = tryDecode("gb18030") || tryDecode("gbk") || tryDecode("gb2312") || tryDecode("utf-8", false);
			} else {
				// 如果严格 utf-8 成功，但疑似大量替换字符，尝试 GB 解码优选更少的替换
				const replCount = (t.match(/\uFFFD/g) || []).length;
				if (replCount > 0) {
					const g = tryDecode("gb18030");
					if (g && (g.match(/\uFFFD/g) || []).length < replCount) t = g;
				}
			}
			text = t ?? "";
		} else {
			text = sourceOrText;
		}
		text = removeBOM(text || "");
		if (!/karaoke\s*\./i.test(text)) {
			// 非 KSC 文本，交给后续解析器
			throw new TypeError("非 KSC 内容");
		}

	// 去除行注释 // ...
	const lines = text.split(/\r?\n/).map(l => l.replace(/\/\/.*$/, "").trim()).filter(l => l.length > 0);

		// 支持的语句：
		// - karaoke.rows := 2;
		// - karaoke.tag('key', 'value');
		// - karaoke.internalnumber := 1798; / karaoke.videofilename := '...'; / karaoke.audiofilename := '...';
		// - karaoke.add('start','end','text','d1,d2,...');

		const tagRe = /^karaoke\.tag\(\s*'([^']*)'\s*,\s*'([^']*)'\s*\)\s*;?$/i;
		const rowsRe = /^karaoke\.rows\s*:=\s*(\d+)\s*;?$/i;
		const assignStrRe = /^karaoke\.(videofilename|audiofilename)\s*:=\s*'([^']*)'\s*;?$/i;
		const assignNumRe = /^karaoke\.(internalnumber)\s*:=\s*(\d+)\s*;?$/i;
		const addRe = /^karaoke\.add\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)\s*;?$/i;

	let rows: number | undefined;
	let outLrc = "";

		for (const line of lines) {
			let m: RegExpExecArray | null;
			if ((m = tagRe.exec(line))) {
				const key = (m[1] || "").trim();
				const val = (m[2] || "").trim();
				// 常见映射：歌名->ti，歌手->ar
				if (key === "歌名") lyric.metadata.set("ti", val);
				else if (key === "歌手") lyric.metadata.set("ar", val);
				// 其他标签保留原名，避免信息丢失
				lyric.metadata.set(key, val);
				if (key === "歌名") outLrc += `[ti:${val}]\n`;
				if (key === "歌手") outLrc += `[ar:${val}]\n`;
				continue;
			}
			if ((m = rowsRe.exec(line))) {
				rows = parseInt(m[1], 10);
				if (Number.isFinite(rows)) lyric.metadata.set("rows", rows as any);
				continue;
			}
			if ((m = assignStrRe.exec(line))) {
				const key = m[1].toLowerCase();
				const val = m[2];
				lyric.metadata.set(key, val);
				continue;
			}
			if ((m = assignNumRe.exec(line))) {
				const key = m[1].toLowerCase();
				const num = parseInt(m[2], 10);
				lyric.metadata.set(key, Number.isFinite(num) ? num : m[2]);
				continue;
			}
			if ((m = addRe.exec(line))) {
				const startMs = parseTimeToMs(m[1]);
				const endMs = parseTimeToMs(m[2]);
				if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
					// 跳过非法时间行
					continue;
				}
				const text = m[3] || "";
				const durations = parseDurations(m[4] || "");
				const chars = splitTextToCodePoints(text);
				// 生成 TRC 样式行并追加到 outLrc
				const tag = (() => {
					const totalSeconds = Math.floor(startMs / 1000);
					const minutes = Math.floor(totalSeconds / 60);
					const seconds = totalSeconds % 60;
					const milliseconds = startMs % 1000;
					return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}]`;
				})();
				let content = "";
				if (durations.length === chars.length && chars.length > 0) {
					for (let i = 0; i < chars.length; i++) {
						const d = Math.max(0, Math.round(durations[i] || 0));
						content += `<${d}>${chars[i]}`;
					}
				} else {
					const dur = Math.max(0, Math.round(endMs - startMs));
					const safeText = text && text.length > 0 ? text : "\u200b";
					content = `<${dur}>${safeText}`;
				}
				outLrc += `${tag}${content}\n`;
				continue;
			}
			// 其他语句忽略（如 clear、CreateKaraokeObject 等）
		}
		// 将拼好的 LRC/TRC 文本交由 LrcParser 解析，以复用其合并、排序等逻辑
		LrcParser.parse(lyric, outLrc);
	}
}

/**
 * KSC 歌词生成器
 * @class
 */
export class KscGenerator {
	/**
	 * 生成 KSC 歌词文件
	 * @param lyric - 目标 Lyric 实例
	 * @returns 包含 KSC 歌词数据的 ArrayBuffer
	 */
    static generate(lyric: Lyric): ArrayBuffer {
        if (!(lyric instanceof Lyric)) {
            throw new TypeError("参数 1 必须为 Lyric 实例");
        }

		// 工具：时间与转义
		const fmtTime = (ms: number) => {
			const total = Math.max(0, Math.floor(ms));
			const mm = Math.floor(total / 60000);
			const ss = Math.floor((total % 60000) / 1000);
			const mss = total % 1000;
			const m = String(mm).padStart(2, "0");
			const s = String(ss).padStart(2, "0");
			const ms3 = String(mss).padStart(3, "0");
			return `${m}:${s}.${ms3}`;
		};
		const esc = (s: string) => (s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
		const normalize = (s: string) => (s || "").replace(/[\s\u200b]+/g, "");

		const out: string[] = [];
		out.push("karaoke := CreateKaraokeObject;");

		// 计算 rows：按最大多语言行数推断
		let rowsMax = 1;
		for (const line of lyric.lines) {
			const rts = (line.rowTexts && line.rowTexts.length > 0) ? line.rowTexts : (line.text ? line.text.split("\n") : [""]);
			if (rts.length > rowsMax) rowsMax = rts.length;
		}
		out.push(`karaoke.rows := ${Math.max(1, Math.min( rowsMax, 4 ))};`);
		out.push("karaoke.clear;");

		// 写入元数据：优先映射常见字段
		const meta = lyric.metadata;
		const writtenTagKeys = new Set<string>();
		const writeTag = (k: string, v: string) => { out.push(`karaoke.tag('${esc(k)}', '${esc(v)}');`); writtenTagKeys.add(k); };
		const writeAssignStr = (k: string, v: string) => out.push(`karaoke.${k} := '${esc(v)}';`);
		const writeAssignNum = (k: string, n: number) => out.push(`karaoke.${k} := ${Math.trunc(n)};`);

		const ti = meta.get("ti"); if (typeof ti === "string" && ti) writeTag("歌名", String(ti));
		const ar = meta.get("ar"); if (typeof ar === "string" && ar) writeTag("歌手", String(ar));

		const vfile = meta.get("videofilename"); if (typeof vfile === "string" && vfile) writeAssignStr("videofilename", vfile);
		const afile = meta.get("audiofilename"); if (typeof afile === "string" && afile) writeAssignStr("audiofilename", afile);
		const inum = meta.get("internalnumber"); if (typeof inum === "number") writeAssignNum("internalnumber", inum as number);

		// 其余元数据以 tag 形式输出（排除已映射与技术性键）
		meta.forEach((v, k) => {
			if (k === "ti" || k === "ar" || k === "rows" || k === "videofilename" || k === "audiofilename" || k === "internalnumber") return;
			if (writtenTagKeys.has(k)) return;
			if (typeof v === "string" || typeof v === "number") {
				writeTag(k, String(v));
			}
		});

		// 行输出：对每个多语言行分别生成一条 add 语句
		for (const line of lyric.lines) {
			const isPseudo = (line as any).pseudoPerWord === true;
			const start = Math.max(0, Math.round(line.startTime || 0));
			let duration = Math.round(line.duration || 0);
			if (!Number.isFinite(duration) || duration < 0) duration = 0;
			const end = start + duration;

			const allNonSingleWords = (line.words || []).filter(w => !w.singleLine);
			const allWordsTextNorm = normalize(allNonSingleWords.map(w => w.text || "").join(""));

			const rowTexts = (line.rowTexts && line.rowTexts.length > 0) ? line.rowTexts : (line.text ? line.text.split("\n") : [""]);
			for (let i = 0; i < rowTexts.length; i++) {
				const rowIndex = i + 1;
				let content = rowTexts[i] || "";
				if (!content || !content.trim()) continue; // 空行不输出

				// 选择本行分词
				let rowWords = isPseudo ? [] : (line.words || []).filter(w => !w.singleLine && (w?.lineNo || 0) === rowIndex);
				const selfNorm = normalize(content);
				if (rowWords.length > 0) {
					const candidateNorm = normalize(rowWords.map(w => w.text || "").join(""));
					if (candidateNorm && selfNorm && candidateNorm !== selfNorm) {
						// 若更像另一行，放弃这些词
						const otherIdx = rowTexts.findIndex((t, idx) => idx !== i && normalize(t) === candidateNorm);
						if (otherIdx !== -1) rowWords = [];
					}
				}
				if (rowWords.length === 0 && allNonSingleWords.length > 0) {
					if (allWordsTextNorm && allWordsTextNorm === selfNorm) rowWords = allNonSingleWords;
				}

				const chars = Array.from(content);
				let durationsCSV = "";

				const packEven = (total: number, count: number): number[] => {
					const n = Math.max(1, count);
					const base = Math.floor(total / n);
					const out = new Array(n).fill(base);
					let rest = total - base * n;
					for (let j = 0; j < n && rest > 0; j++, rest--) out[j] += 1;
					return out;
				};

				if (!isPseudo && rowWords.length > 0) {
					// 优先精确映射：词拼接后与内容完全相同
					const wordsText = rowWords.map(w => w.text || "").join("");
					if (wordsText === content) {
						const ds: number[] = [];
						for (const w of rowWords) {
							const wdur = Math.max(0, Math.round(w.duration || 0));
							const cps = Array.from(w.text || "");
							if (cps.length <= 0) continue;
							const base = Math.floor(wdur / cps.length);
							let rest = wdur - base * cps.length;
							for (let k = 0; k < cps.length; k++) {
								const d = base + (rest > 0 ? 1 : 0);
								if (rest > 0) rest--;
								ds.push(d);
							}
						}
						// 长度若仍与字符数不符（极端情况），回退为均分整行时长
						if (ds.length !== chars.length) {
							const total = rowWords.reduce((s, w) => s + Math.max(0, Math.round(w.duration || 0)), 0);
							durationsCSV = packEven(total || duration, chars.length).join(",");
						} else {
							durationsCSV = ds.join(",");
						}
					} else {
						// 回退：用词时长总和均分到当前内容的字符数
						const total = rowWords.reduce((s, w) => s + Math.max(0, Math.round(w.duration || 0)), 0);
						durationsCSV = packEven(total || duration, chars.length).join(",");
					}
				} else {
					// 无逐字：输出单个时长，保持 singleLine 语义
					durationsCSV = String(duration);
				}

				out.push(`karaoke.add('${fmtTime(start)}', '${fmtTime(end)}', '${esc(content)}', '${durationsCSV}')` + ";");
			}
		}

		const text = out.join("\n");
		// 输出 UTF-8 文本（与解析侧可能使用 GB 编码解码无关；若需要特定编码，由上层处理）
		return new TextEncoder().encode(text).buffer;
	}
}