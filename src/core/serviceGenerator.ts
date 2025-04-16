import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { formatModuleName, formatTypeName } from "../utils/formatters";
import type { PathItemObject, OperationObject } from "../types/openapi";
import { API_CONFIG } from "../config/apiConfig";
import { fetchOpenApiSpec } from "./generator";

interface ServiceGenerateOptions {
  moduleName: string;
  tags: string[];
}

function getContentType(operation: OperationObject): string {
  if (operation.requestBody?.content) {
    if (operation.requestBody.content["multipart/form-data"]) {
      return "multipart/form-data";
    }
    if (operation.requestBody.content["application/x-www-form-urlencoded"]) {
      return "application/x-www-form-urlencoded";
    }
  }
  return "application/json";
}

function formatMethodName(method: string, path: string): string {
  // 移除路径参数的大括号，保留参数名作为方法名的一部分
  const cleanPath = path.replace(/\{([^}]+)\}/g, (_, param) => {
    return param
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
  });

  // 分割路径并过滤空字符串
  const parts = cleanPath.split("/").filter(Boolean);

  // 处理特殊字符并保持正确的驼峰格式
  const formattedParts = parts.map((part, index) => {
    // 如果部分已经是驼峰格式，保持原样但确保首字母大写
    if (!/[-_]/.test(part) && part.length > 0) {
      // 始终将第一个字母大写，除非是第一个部分
      return index === 0
        ? part.charAt(0).toLowerCase() + part.slice(1)
        : part.charAt(0).toUpperCase() + part.slice(1);
    }

    // 处理连字符和下划线分隔的词
    return part
      .split(/[-_]/)
      .map((word, i) => {
        // 如果是第一个部分的第一个词，保持小写
        if (index === 0 && i === 0) {
          return word.toLowerCase();
        }
        // 其他情况，首字母大写
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join("");
  });

  // 组合方法名，确保第一个单词之后的所有单词首字母大写
  const methodPrefix = method.toLowerCase();
  const pathPart = formattedParts.join("");

  // 确保路径部分的首字母大写
  const formattedPathPart =
    pathPart.charAt(0).toUpperCase() + pathPart.slice(1);

  return `${methodPrefix}${formattedPathPart}`;
}

function generateFormDataRequestCode(): string {
  return `(() => {
    if (!params) return new FormData();
    const formData = new FormData();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      
      if (value instanceof File) {
        formData.append(key, value);
      } else if (Array.isArray(value)) {
        value.forEach(item => {
          if (item instanceof File) {
            formData.append(key, item);
          } else if (item !== undefined && item !== null) {
            formData.append(key, String(item));
          }
        });
      } else {
        formData.append(key, String(value));
      }
    });
    return formData;
  })()`;
}

function generateUrlEncodedRequestCode(): string {
  return `(() => {
    if (!params) return new URLSearchParams();
    return new URLSearchParams(
      Object.entries(params)
        .filter(([_, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)])
    );
  })()`;
}

function generateServiceMethod(
  path: string,
  method: string,
  operation: OperationObject,
  typePrefix: string
): string {
  const methodName = formatMethodName(method, path);
  const interfaceBaseName = formatTypeName(path, method, typePrefix);
  const requestType = `${interfaceBaseName}Request`;
  const responseType = `${interfaceBaseName}Response`;
  const methodUpper = method.toUpperCase();

  // 提取路径参数和查询参数
  const pathParams =
    operation.parameters?.filter((param) => param.in === "path") || [];
  const queryParams =
    operation.parameters?.filter((param) => param.in === "query") || [];

  // 检查是否有查询参数
  const hasQueryParams = queryParams.length > 0;

  // 构建 URL 模板字符串
  let urlTemplate = path;
  pathParams.forEach((param) => {
    urlTemplate = urlTemplate.replace(
      `{${param.name}}`,
      "${params." + param.name + "}"
    );
  });

  // 确定内容类型
  let contentType = getContentType(operation);

  // 如果是POST/PUT/PATCH请求且有查询参数，优先使用application/x-www-form-urlencoded
  if (["POST", "PUT", "PATCH"].includes(methodUpper) && hasQueryParams) {
    contentType = "application/x-www-form-urlencoded";
  }

  // 构建请求配置
  let requestConfig: string[] = [];

  // 添加 URL
  requestConfig.push(`    url: \`${urlTemplate}\``);

  // 非路径参数（需要根据HTTP方法和内容类型处理）
  const allParamsForPath = [...pathParams, ...queryParams];

  // 根据 HTTP 方法处理参数
  if (["GET", "DELETE"].includes(methodUpper)) {
    // GET 和 DELETE 请求将所有非路径参数放在 params 中
    if (allParamsForPath.length > 0) {
      requestConfig.push(`    params: (() => {
        const { ${allParamsForPath
          .map((p) => p.name)
          .join(", ")}, ...rest } = params;
        return rest;
      })() as ${requestType}`);
    } else {
      requestConfig.push(`    params: params`);
    }
  } else {
    // POST, PUT, PATCH 等请求处理
    if (contentType === "multipart/form-data") {
      requestConfig.push(`    data: ${generateFormDataRequestCode()}`);
    } else if (contentType === "application/x-www-form-urlencoded") {
      requestConfig.push(`    data: ${generateUrlEncodedRequestCode()}`);
    } else {
      // JSON 请求
      if (pathParams.length > 0) {
        requestConfig.push(`    data: (() => {
          const { ${pathParams
            .map((p) => p.name)
            .join(", ")}, ...rest } = params;
          return rest;
        })()`);
      } else {
        requestConfig.push(`    data: params`);
      }
    }
  }

  // 添加配置展开
  requestConfig.push("    config");

  return `
/**
 * ${operation.summary || ""}
 * @分类 [${operation.tags?.[0] || "未分类"}↗](${path})
 * @请求头 \`${methodUpper} ${path}\`
 * @contentType ${contentType}
 */
export const ${methodName} = (
  params${
    !operation.parameters ||
    operation.parameters?.length === 0 ||
    operation.parameters?.every((p) => !p.required)
      ? "?"
      : ""
  }: ${requestType},
  config?: AxiosRequestConfig<${requestType}>
) => {
  return ${methodUpper}<unknown, ${responseType}>({
${requestConfig.join(",\n")}
  });
};`;
}

export async function generateServices(options: ServiceGenerateOptions) {
  const { moduleName, tags } = options;
  const { requestConfig, typePrefix } = API_CONFIG;

  if (
    !requestConfig?.importPath ||
    !requestConfig?.servicesPath ||
    !requestConfig?.typesPath
  ) {
    throw new Error("Missing requestConfig in apifox.config.js");
  }

  const outputDir = requestConfig.servicesPath;
  const outputFile = join(outputDir, `${formatModuleName(moduleName)}.ts`);

  try {
    const spec = await fetchOpenApiSpec();
    mkdirSync(dirname(outputFile), { recursive: true });

    let serviceContent = `// This file is auto-generated. DO NOT EDIT.
import type { AxiosRequestConfig } from "axios";
import { GET, POST, PUT, DELETE } from "${requestConfig.importPath}";
import type {
`;

    // 收集需要导入的类型
    const types = new Set<string>();
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const [method, operation] of Object.entries(
        pathItem as PathItemObject
      )) {
        if (!operation || !operation.tags?.some((tag) => tags.includes(tag)))
          continue;

        // 使用 formatTypeName 来保持一致的类型命名
        const interfaceBaseName = formatTypeName(path, method, typePrefix);
        const requestType = `${interfaceBaseName}Request`;
        const responseType = `${interfaceBaseName}Response`;

        types.add(requestType);
        types.add(responseType);
      }
    }

    // 添加类型导入，使用 .d.ts 文件
    serviceContent +=
      Array.from(types).join(",\n  ") +
      `,
} from "${requestConfig.typesPath}/${formatModuleName(moduleName)}.d";

`;

    // 生成服务方法
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const [method, operation] of Object.entries(
        pathItem as PathItemObject
      )) {
        if (!operation || !operation.tags?.some((tag) => tags.includes(tag)))
          continue;

        serviceContent += generateServiceMethod(
          path,
          method,
          operation,
          typePrefix
        );
        serviceContent += "\n\n";
      }
    }

    writeFileSync(outputFile, serviceContent);
    return outputFile;
  } catch (error) {
    console.error(`Error generating services for ${moduleName}:`, error);
    throw error;
  }
}
