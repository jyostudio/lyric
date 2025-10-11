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
    static updateByTime(lyric: Lyric, timeMs: number): {
        lineIndex: number;
        wordIndex: number;
    };
    /**
     * 计算当前行的“活跃词”索引：优先 current，否则最后一个 past，否则 0；无词返回 -1
     * 不涉及任何 UI。
     * @param line - 当前行实例
     * @returns 活跃词索引（-1 表示无活跃词）
     */
    static computeActiveWordIndex(line: Line | undefined | null): number;
    /**
     * 计算滚动目标（把给定行居中）
     * 返回与示例中一致的“逻辑 scrollTop”：负的“到行中心”的平移量
     * @param rowHeights - 各行高度数组
     * @param split - 行间距
     * @param lineIndex - 目标行索引
     * @param normalize - 可选的归一化参数，activeIndex 为当前活跃行索引，activeScale 为该行的缩放比例（默认为 1）
     * @returns 逻辑 scrollTop 值（负的“到行中心”的平移量）
     */
    static computeScrollTarget(rowHeights: number[], split: number, lineIndex: number, normalize?: {
        activeIndex?: number;
        activeScale?: number;
    }): number;
    /**
     * 计算可滚动总高度
     * @param rowHeights - 各行高度数组
     * @param split - 行间距
     * @param normalize - 可选的归一化参数，activeIndex 为当前活跃行索引，activeScale 为该行的缩放比例（默认为 1）
     * @returns 可滚动总高度
     */
    static computeTotalScrollableHeight(rowHeights: number[], split: number, normalize?: {
        activeIndex?: number;
        activeScale?: number;
    }): number;
    /**
     * 计算滚动夹取范围（min/max），padding 为上下各额外缓冲
     * 返回的 min/max 可直接用于限制 scrollTop。
     * @param rowHeights - 各行高度数组
     * @param split - 行间距
     * @param padding - 夹取范围的额外缓冲，默认 50
     * @param normalize - 可选的归一化参数，activeIndex 为当前活跃行索引，activeScale 为该行的缩放比例（默认为 1）
     * @returns 夹取范围对象 { min, max }
     */
    static computeScrollClamp(rowHeights: number[], split: number, padding?: number, normalize?: {
        activeIndex?: number;
        activeScale?: number;
    }): {
        min: number;
        max: number;
    };
    /**
     * 估算滚动百分比（0~100，保留两位小数的字符串）
     * 返回的百分比可用于进度条等显示。
     * @param lineIndex - 当前行索引
     * @param rowHeights - 各行高度数组
     * @param split - 行间距
     * @param normalize - 可选的归一化参数，activeIndex 为当前活跃行索引，activeScale 为该行的缩放比例（默认为 1）
     * @returns 滚动百分比字符串（0~100，保留两位小数）
     */
    static calcScrollPercent(lineIndex: number, rowHeights: number[], split: number, normalize?: {
        activeIndex?: number;
        activeScale?: number;
    }): string;
}
//# sourceMappingURL=controller.d.ts.map