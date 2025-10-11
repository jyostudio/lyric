/**
 * 单词类
 */
export default class Word {
    /**
     * 词状态：past（已过去）| current（当前）| future（未到）
     */
    state: "past" | "current" | "future";
    /**
     * 单词文本
     */
    text: string;
    /**
     * 单词时长，单位：毫秒
     */
    duration: number;
    /**
     * 单词进度，单位：百分比 (0 ~ 1)
     */
    progress: number;
    /**
     * 是否直接代表了一行
     */
    singleLine: boolean;
    /**
     * 单词所在行号
     */
    lineNo: number;
    /**
     * 是否具有有效逐字计时（非 singleLine 且 duration>0）
     * @return 是否具有有效逐字计时
     */
    get hasTiming(): boolean;
}
//# sourceMappingURL=word.d.ts.map