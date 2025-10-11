import Lyric from "./lyric";
import Line from "./line";

/**
 * 纯逻辑控制器：封装行/词状态、滚动目标与边界等计算
 * 不依赖 UI 或 DOM，仅接受必要的数字/结构参数
 */
export default class LyricController {
    /**
     * 使用 Lyric 内置状态机推进时间并返回当前行/词索引
     * @param lyric - Lyric 实例
     * @param timeMs - 当前时间，单位：毫秒
     * @returns 当前行/词索引对象
     */
    static updateByTime(lyric: Lyric, timeMs: number): { lineIndex: number; wordIndex: number } {
        return lyric.setCurrentTime(timeMs);
    }

    /**
     * 计算当前行的“活跃词”索引：优先 current，否则最后一个 past，否则 0；无词返回 -1
     * 不涉及任何 UI。
     * @param line - 当前行实例
     * @returns 活跃词索引（-1 表示无活跃词）
     */
    static computeActiveWordIndex(line: Line | undefined | null): number {
        if (!line || !line.words || line.words.length === 0) return -1;
        // 若该行不支持逐字（无有效计时词），则不返回词索引
        try { if (!Lyric.supportsPerWord(line)) return -1; } catch { }
        const words = line.words;
        let idx = words.findIndex(w => w.state === "current");
        if (idx !== -1) return idx;
        for (let k = words.length - 1; k >= 0; k--) {
            if (words[k].state === "past") return k;
        }
        return 0;
    }

    /**
     * 计算滚动目标（把给定行居中）
     * 返回与示例中一致的“逻辑 scrollTop”：负的“到行中心”的平移量
     * @param rowHeights - 各行高度数组
     * @param split - 行间距
     * @param lineIndex - 目标行索引
     * @param normalize - 可选的归一化参数，activeIndex 为当前活跃行索引，activeScale 为该行的缩放比例（默认为 1）
     * @returns 逻辑 scrollTop 值（负的“到行中心”的平移量）
     */
    static computeScrollTarget(rowHeights: number[], split: number, lineIndex: number, normalize?: { activeIndex?: number; activeScale?: number }): number {
        if (!rowHeights.length || lineIndex < 0 || lineIndex >= rowHeights.length) return 0;
        const arr = rowHeights.slice();
        if (normalize && typeof normalize.activeIndex === 'number' && normalize.activeIndex! >= 0) {
            const ai = normalize.activeIndex!;
            const s = normalize.activeScale && isFinite(normalize.activeScale) && normalize.activeScale > 0 ? normalize.activeScale : 1;
            if (ai >= 0 && ai < arr.length && s !== 1) arr[ai] = (arr[ai] || 0) / s;
        }
        let offsetTop = 0;
        for (let i = 0; i < lineIndex; i++) offsetTop += (arr[i] || 0) + (split || 0);
        const currentH = arr[lineIndex] || 0;
        return -offsetTop - currentH / 2;
    }

    /**
     * 计算可滚动总高度
     * @param rowHeights - 各行高度数组
     * @param split - 行间距
     * @param normalize - 可选的归一化参数，activeIndex 为当前活跃行索引，activeScale 为该行的缩放比例（默认为 1）
     * @returns 可滚动总高度
     */
    static computeTotalScrollableHeight(rowHeights: number[], split: number, normalize?: { activeIndex?: number; activeScale?: number }): number {
        if (!rowHeights.length) return 0;
        const arr = rowHeights.slice();
        if (normalize && typeof normalize.activeIndex === 'number' && normalize.activeIndex! >= 0) {
            const ai = normalize.activeIndex!;
            const s = normalize.activeScale && isFinite(normalize.activeScale) && normalize.activeScale > 0 ? normalize.activeScale : 1;
            if (ai >= 0 && ai < arr.length && s !== 1) arr[ai] = (arr[ai] || 0) / s;
        }
        const sum = arr.reduce((a, b) => a + (b || 0), 0);
        return sum + (rowHeights.length - 1) * (split || 0);
    }

    /**
     * 计算滚动夹取范围（min/max），padding 为上下各额外缓冲
     * 返回的 min/max 可直接用于限制 scrollTop。
     * @param rowHeights - 各行高度数组
     * @param split - 行间距
     * @param padding - 夹取范围的额外缓冲，默认 50
     * @param normalize - 可选的归一化参数，activeIndex 为当前活跃行索引，activeScale 为该行的缩放比例（默认为 1）
     * @returns 夹取范围对象 { min, max }
     */
    static computeScrollClamp(rowHeights: number[], split: number, padding = 50, normalize?: { activeIndex?: number; activeScale?: number }): { min: number; max: number } {
        if (!rowHeights.length) return { min: 0, max: 0 };
        const arr = rowHeights.slice();
        if (normalize && typeof normalize.activeIndex === 'number' && normalize.activeIndex! >= 0) {
            const ai = normalize.activeIndex!;
            const s = normalize.activeScale && isFinite(normalize.activeScale) && normalize.activeScale > 0 ? normalize.activeScale : 1;
            if (ai >= 0 && ai < arr.length && s !== 1) arr[ai] = (arr[ai] || 0) / s;
        }
        const total = this.computeTotalScrollableHeight(arr, split);
        const lastH = arr[arr.length - 1] || 0;
        const firstH = arr[0] || 0;
        const min = -(total - lastH / 2) - padding; // 最后一行中心
        const max = -firstH / 2 + padding; // 第一行中心
        return { min, max };
    }

    /**
     * 估算滚动百分比（0~100，保留两位小数的字符串）
     * 返回的百分比可用于进度条等显示。
     * @param lineIndex - 当前行索引
     * @param rowHeights - 各行高度数组
     * @param split - 行间距
     * @param normalize - 可选的归一化参数，activeIndex 为当前活跃行索引，activeScale 为该行的缩放比例（默认为 1）
     * @returns 滚动百分比字符串（0~100，保留两位小数）
     */
    static calcScrollPercent(lineIndex: number, rowHeights: number[], split: number, normalize?: { activeIndex?: number; activeScale?: number }): string {
        if (!rowHeights.length || lineIndex < 0) return "0";
        const arr = rowHeights.slice();
        if (normalize && typeof normalize.activeIndex === 'number' && normalize.activeIndex! >= 0) {
            const ai = normalize.activeIndex!;
            const s = normalize.activeScale && isFinite(normalize.activeScale) && normalize.activeScale > 0 ? normalize.activeScale : 1;
            if (ai >= 0 && ai < arr.length && s !== 1) arr[ai] = (arr[ai] || 0) / s;
        }
        let passed = 0;
        for (let i = 0; i < lineIndex; i++) passed += (arr[i] || 0) + (split || 0);
        const total = this.computeTotalScrollableHeight(arr, split);
        const pct = total ? (passed / total * 100) : 0;
        return pct.toFixed(2);
    }
}
