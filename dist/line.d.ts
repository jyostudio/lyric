import Word from "./word";
/**
 * 行类
 */
export default class Line {
    /**
     * 行状态：past（已过去）| current（当前）| future（未到）
     */
    state: "past" | "current" | "future";
    /**
     * 行进度（0~1），用于逐行渐变
     */
    progress: number;
    /**
     * 行级渲染进度（0~1）。
     * 针对非逐字行用于 UI 渲染：future=0，current=progress，past=1。
     * 对逐字行通常无意义，可保持为 0。
     */
    renderProgress: number;
    /**
     * 空数据行
     * @returns 空数据行实例
     */
    static get Empty(): Line;
    /**
     * 歌词行号，正常从 1 开始，空数据始终为 0
     */
    no: number;
    /**
     * 行开始时间，单位：毫秒
     */
    startTime: number;
    /**
     * 行时长，单位：毫秒
     */
    duration: number;
    /**
     * 行文本，多行分割符为 '\n'
     */
    text: string;
    /**
     * 行歌词单词数组
     */
    words: Word[];
    /**
     * 多行歌词行号，从 1 开始
     */
    lineNo: number;
    /**
     * 多行文本数组
     */
    rowTexts: string[];
    /**
     * 是否为“伪逐字精准”
     * 解析阶段：当该行原本不支持逐字精准、但具备行时长与文本时，会将行时长均分到每个字符以模拟逐字播放，并把本标志设为 true。
     * 生成阶段：若本标志为 true，应当将其视为“无逐字精准”进行生成（不输出逐字时间）。
     */
    pseudoPerWord: boolean;
    /**
     * 是否支持逐字（本行中是否存在带正时长且非 singleLine 的词）
     * 纯逻辑判断，不涉及任何 UI。
     * @return 是否支持逐字
     */
    hasPerWordTiming(): boolean;
    /**
     * 主文本（第一行）
     * 仅当 rowTexts 有多行时有效，否则尝试从 text 中拆分
     * @returns 主文本
     */
    get primaryText(): string;
    /**
     * 副文本（第二行，如多语言）
     * 仅当 rowTexts 有多行时有效，否则尝试从 text 中拆分
     * @returns 副文本
     */
    get secondaryText(): string;
}
//# sourceMappingURL=line.d.ts.map