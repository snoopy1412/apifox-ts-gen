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
  // 使用 lodash 的 camelCase 处理文件名
  // 例如：
  // "认证相关" -> "authenticationRelated"
  // "用户相关" -> "userRelated"
  // "基础物质" -> "basicSubstance"
  return camelCase(name);
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
