import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  formatModuleName,
  formatMethodName,
  formatTypeName,
} from "../utils/formatters";
import type { PathItemObject, OperationObject } from "../types/openapi";
import { API_CONFIG } from "../config/apiConfig";
import { fetchOpenApiSpec } from "./generator";

interface ServiceGenerateOptions {
  moduleName: string;
  tags: string[];
}

function generateServiceMethod(
  path: string,
  method: string,
  operation: OperationObject,
  typePrefix: string,
  baseURL?: string
): string {
  const methodName = formatMethodName(method, path);
  console.log("path", path);
  console.log("method", method);
  console.log("typePrefix", typePrefix);

  const interfaceBaseName = formatTypeName(path, method, typePrefix);
  console.log("interfaceBaseName", interfaceBaseName);
  const requestType = `${interfaceBaseName}Request`;
  const responseType = `${interfaceBaseName}Response`;
  const methodUpper = method.toUpperCase();
  const fullURL = baseURL ? `${baseURL}${path}` : path;

  return `
/**
 * ${operation.summary || ""}
 * @分类 [${operation.tags?.[0] || "未分类"}↗](${path})
 * @请求头 \`${methodUpper} ${path}\`
 */
export const ${methodName} = ({
  params,
  config,
}: {
  params: ${requestType};
  config?: AxiosRequestConfig<${requestType}>;
}) => {
  return ${methodUpper}<${requestType}, AxiosResponse<${responseType}>>({
    url: "${fullURL}",
    data: params,
    ...config,
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
import type { AxiosRequestConfig, AxiosResponse } from "axios";
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
          typePrefix,
          requestConfig.baseURL
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
