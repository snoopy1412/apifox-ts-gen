import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import axios from "axios";
import { API_CONFIG } from "../config/apiConfig";
import { formatTypeName, formatModuleName } from "../utils/formatters";
import type {
  OpenAPISpec,
  PathItemObject,
  OperationObject,
  Parameter,
  ResponseObject,
  MediaTypeObject,
} from "../types/openapi";

export interface GenerateOptions {
  moduleName: string;
  tags: string[];
  outputDir: string;
  typePrefix: string;
}

// 添加一个新的类型来跟踪已处理的引用
type ProcessedRefs = Set<string>;

function generateTypeProps(
  schema: any,
  indent = "",
  schemas?: any,
  processedRefs: ProcessedRefs = new Set(),
  depth = 0
): string {
  // 防止过深递归
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) {
    console.warn(
      `Warning: Maximum depth of ${MAX_DEPTH} reached at schema:`,
      schema
    );
    return `${indent}any // Max depth reached`;
  }

  if (!schema) return "";

  // 处理引用类型
  if (schema.$ref) {
    const refType = schema.$ref.split("/").pop();

    // 检测循环引用
    if (processedRefs.has(refType)) {
      console.warn(`Circular reference detected for type: ${refType}`);
      return `${indent}any // Circular reference to ${refType}`;
    }

    if (schemas && schemas[refType]) {
      processedRefs.add(refType);
      return generateTypeProps(
        schemas[refType],
        indent,
        schemas,
        processedRefs,
        depth + 1
      );
    }
    return `${indent}${refType}`;
  }

  // 处理数组类型
  if (schema.type === "array") {
    // 首先检查 schema.items 是否存在
    if (!schema.items) {
      console.warn("Array schema missing items definition:", schema);
      return `${indent}any[]`;
    }

    // 处理引用类型的数组项
    if (schema.items.$ref) {
      const itemType = schema.items.$ref.split("/").pop();
      if (schemas && schemas[itemType]) {
        if (processedRefs.has(itemType)) {
          return `${indent}${itemType}[]`;
        }
        processedRefs.add(itemType);
        return `${indent}{\n${generateTypeProps(
          schemas[itemType],
          indent + "  ",
          schemas,
          processedRefs,
          depth + 1
        )}\n${indent}}[]`;
      }
      return `${indent}${itemType}[]`;
    }

    // 处理对象类型的数组项
    if (schema.items.type === "object") {
      return `${indent}{\n${generateTypeProps(
        schema.items,
        indent + "  ",
        schemas,
        processedRefs,
        depth + 1
      )}\n${indent}}[]`;
    }

    // 处理基本类型的数组项
    const itemType =
      schema.items.type === "integer" ? "number" : schema.items.type || "any";
    return `${indent}${itemType}[]`;
  }

  // 处理对象类型
  if (schema.type === "object" && schema.properties) {
    try {
      const props = Object.entries(schema.properties)
        .map(([name, prop]: [string, any]) => {
          const required = schema.required?.includes(name) ? "" : "?";
          const description = prop.description
            ? `\n${indent} * ${prop.description}` +
              (prop.type ? `\n${indent} * 类型: ${prop.type}` : "")
            : "";

          if (prop.$ref) {
            const refType = prop.$ref.split("/").pop();
            if (schemas && schemas[refType]) {
              // 检查是否已处理过该引用
              if (processedRefs.has(refType)) {
                return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: ${refType};`;
              }
              processedRefs.add(refType);
              return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: {\n${generateTypeProps(
                schemas[refType],
                indent + "  ",
                schemas,
                processedRefs,
                depth + 1
              )}\n${indent}};`;
            }
            return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: ${refType};`;
          }

          if (prop.type === "array") {
            if (prop.items.$ref) {
              const itemType = prop.items.$ref.split("/").pop();
              if (schemas && schemas[itemType]) {
                if (processedRefs.has(itemType)) {
                  return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: ${itemType}[];`;
                }
                processedRefs.add(itemType);
                return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: {\n${generateTypeProps(
                  schemas[itemType],
                  indent + "  ",
                  schemas,
                  processedRefs,
                  depth + 1
                )}\n${indent}}[];`;
              }
              return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: ${itemType}[];`;
            }
            if (prop.items.type === "object") {
              if (processedRefs.has(prop.items.type)) {
                return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: ${prop.items.type}[];`;
              }
              processedRefs.add(prop.items.type);
              return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: {\n${generateTypeProps(
                prop.items,
                indent + "  ",
                schemas,
                processedRefs,
                depth + 1
              )}\n${indent}}[];`;
            }
            const itemType =
              prop.items.type === "integer" ? "number" : prop.items.type;
            if (processedRefs.has(itemType)) {
              return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: ${itemType}[];`;
            }
            processedRefs.add(itemType);
            return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: ${itemType}[];`;
          }

          if (prop.type === "object") {
            if (processedRefs.has(prop.items.type)) {
              return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: ${prop.items.type};`;
            }
            processedRefs.add(prop.items.type);
            return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: {\n${generateTypeProps(
              prop,
              indent + "  ",
              schemas,
              processedRefs,
              depth + 1
            )}\n${indent}};`;
          }

          const type = prop.type === "integer" ? "number" : prop.type || "any";
          if (processedRefs.has(type)) {
            return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: ${type};`;
          }
          processedRefs.add(type);
          return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: ${type};`;
        })
        .filter(Boolean)
        .join("\n");

      return props;
    } catch (error) {
      console.error("Error processing object properties:", error);
      return `${indent}any // Error processing properties`;
    }
  }

  // 处理基本类型
  if (
    schema.type === "string" ||
    schema.type === "boolean" ||
    schema.type === "number" ||
    schema.type === "integer"
  ) {
    // 将 integer 类型映射为 TypeScript 的 number 类型
    const tsType = schema.type === "integer" ? "number" : schema.type;
    return `${indent}${tsType}`;
  }

  return `${indent}any`;
}

function generateRequestBodyType(
  operation: OperationObject,
  schemas: any
): string {
  if (!operation.requestBody?.content) return "";

  // 处理 application/json 类型的请求体
  const jsonContent = operation.requestBody.content["application/json"];
  if (jsonContent?.schema) {
    return generateTypeProps(jsonContent.schema, "  ", schemas);
  }

  // 处理 multipart/form-data 类型的请求体
  const multipartContent = operation.requestBody.content["multipart/form-data"];
  if (multipartContent?.schema) {
    return generateTypeProps(multipartContent.schema, "  ", schemas);
  }

  return "";
}

export async function fetchOpenApiSpec() {
  const response = await axios.get(API_CONFIG.url);
  if (!response.data || !response.data.openapi) {
    throw new Error("Invalid OpenAPI specification");
  }
  return response.data as OpenAPISpec;
}

export async function generateTypes(options: GenerateOptions) {
  const { moduleName, tags, outputDir, typePrefix } = options;
  const outputFile = join(outputDir, `${formatModuleName(moduleName)}.d.ts`);

  try {
    const spec = await fetchOpenApiSpec();
    mkdirSync(outputDir, { recursive: true });

    const paths = spec.paths || {};
    let typeDefinitions = "";

    for (const [path, pathItem] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(
        pathItem as PathItemObject
      )) {
        if (!operation || !operation.tags?.some((tag) => tags.includes(tag))) {
          continue;
        }

        const interfaceBaseName = formatTypeName(path, method, typePrefix);
        const requestInterfaceName = `${interfaceBaseName}Request`;
        const responseInterfaceName = `${interfaceBaseName}Response`;

        const tag = operation.tags?.[0] || "Uncategorized";
        const updateTime = new Date()
          .toISOString()
          .split("T")
          .join(" ")
          .split(".")[0];

        // 生成请求类型
        if (operation.parameters?.length || operation.requestBody) {
          let parameterProps = "";

          // 处理 URL 参数
          if (operation.parameters?.length) {
            parameterProps = operation.parameters
              .map((param: Parameter) => {
                const required = param.required ? "" : "?";
                const description = param.description
                  ? `\n   * ${param.description}` +
                    (param.schema?.type
                      ? `\n   * 类型: ${param.schema.type}`
                      : "")
                  : "";

                // 处理数组类型参数
                if (param.schema?.type === "array") {
                  // 检查 items 是否存在
                  if (!param.schema.items) {
                    console.warn(
                      "Array parameter missing items definition:",
                      param
                    );
                    return `  /**${description}\n   */\n  ${param.name}${required}: any[];`;
                  }

                  // 获取数组项的类型
                  const itemType =
                    // 如果是引用类型
                    param.schema.items.$ref
                      ? param.schema.items.$ref.split("/").pop()
                      : // 如果是基本类型
                      param.schema.items.type === "integer"
                      ? "number"
                      : param.schema.items.type || "any";

                  return `  /**${description}\n   */\n  ${param.name}${required}: ${itemType}[];`;
                }

                // 处理其他类型参数
                const type =
                  param.schema?.type === "integer"
                    ? "number"
                    : param.schema?.type || "string";
                return `  /**${description}\n   */\n  ${param.name}${required}: ${type};`;
              })
              .join("\n");
          }

          // 处理请求体
          const requestBodyProps = generateRequestBodyType(
            operation,
            spec.components?.schemas
          );

          // 合并参数和请求体属性
          const allProps = [parameterProps, requestBodyProps]
            .filter(Boolean)
            .join("\n\n");

          typeDefinitions += `
/**
 * 接口 [${operation.summary}↗](${path}) 的 **请求类型**
 *
 * @分类 [${tag}↗](${path})
 * @请求头 \`${method.toUpperCase()} ${path}\`
 * @更新时间 \`${updateTime}\`
 */
export interface ${requestInterfaceName} {
${allProps}
}

`;
        }

        // 生成响应类型
        const responseContent =
          operation.responses?.["200"]?.content?.["application/json"]?.schema;
        if (responseContent) {
          const schemas = spec.components?.schemas || {};
          const responseProps = generateTypeProps(
            responseContent,
            "  ",
            schemas
          );
          typeDefinitions += `
/**
 * 接口 [${operation.summary}↗](${path}) 的 **返回类型**
 *
 * @分类 [${tag}↗](${path})
 * @请求头 \`${method.toUpperCase()} ${path}\`
 * @更新时间 \`${updateTime}\`
 */
export interface ${responseInterfaceName} {
${responseProps}
}

`;
        }
      }
    }

    writeFileSync(
      outputFile,
      `/* eslint-disable */
// Generated Types for ${moduleName}
// DO NOT EDIT - This file is automatically generated

${typeDefinitions}
`
    );

    return outputFile;
  } catch (error) {
    console.error(`Error generating types for ${moduleName}:`, error);
    throw error;
  }
}

// 导出类型定义，以便其他文件使用
export type {
  OpenAPISpec,
  PathItemObject,
  OperationObject,
  Parameter,
  ResponseObject,
  MediaTypeObject,
};
