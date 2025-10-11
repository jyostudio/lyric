/**
 * 单词类
 */
export default class Word {
    /**
     * 词状态：past（已过去）| current（当前）| future（未到）
     */
    public state: "past" | "current" | "future" = "future";
    
    /**
     * 单词文本
     */
    public text = "";

    /**
     * 单词时长，单位：毫秒
     */
    public duration = 0;

    /**
     * 单词进度，单位：百分比 (0 ~ 1)
     */
    public progress = 0;

    /**
     * 是否直接代表了一行
     */
    public singleLine = false;

    /**
     * 单词所在行号
     */
    public lineNo = 0;

    /**
     * 是否具有有效逐字计时（非 singleLine 且 duration>0）
     * @return 是否具有有效逐字计时
     */
    get hasTiming(): boolean {
        return !this.singleLine && (this.duration || 0) > 0;
    }
}