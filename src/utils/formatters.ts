import { camelCase, upperFirst } from "lodash";

export function formatTypeName(
  path: string,
  method: string,
  prefix: string = "Api"
): string {
  // 移除开头的斜杠，分割路径
  const segments = path.split("/").filter(Boolean);

  // 处理路径部分
  const pathPart = segments
    .map((segment) => upperFirst(camelCase(segment)))
    .join("");

  // 组合最终的接口名称：Api + Method + Path + Type
  return `${prefix}${upperFirst(method)}${pathPart}`;
}

export function formatModuleName(name: string): string {
  // 使用 lodash 的 camelCase 来生成基础结果，保持与现有输出风格一致
  const camelized = camelCase(name);

  // 去掉前缀中所有非字母字符，避免以数字或符号开头
  const sanitized = camelized.replace(/^[^a-zA-Z]+/, "");

  if (sanitized) {
    return sanitized;
  }

  // 如果去除后为空但 camelCase 仍有值（通常是纯数字），使用 module 作为安全前缀
  if (camelized) {
    return `module${upperFirst(camelized)}`;
  }

  // 极端情况下（例如输入为空或全部为无法识别的字符），返回默认名称
  return "module";
}

export function toCamelCase(str: string): string {
  return str
    .split(/[-/_]/)
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join("");
}

export function formatMethodName(method: string, path: string): string {
  const segments = path.split("/").filter(Boolean);
  const pathPart = segments
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  return `${method.toLowerCase()}${pathPart}`;
}
