import { translateAndConvert } from "../lib/translate";

export async function translateText(text: string): Promise<string> {
  try {
    // 如果文本已经是英文，直接返回
    if (/^[a-zA-Z0-9\s]+$/.test(text)) {
      return text;
    }

    const translated = await translateAndConvert(text);

    // 处理翻译结果，转换为驼峰命名
    return translated
      .split(/[\s-]+/)
      .map((word, index) => {
        word = word.toLowerCase();
        return index === 0
          ? word
          : word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join("");
  } catch (error) {
    console.error(`Failed to translate "${text}":`, error);
    // 翻译失败时返回原文
    return text;
  }
}
