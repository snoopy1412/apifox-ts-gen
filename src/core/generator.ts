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

function generateTypeProps(schema: any, indent = "", schemas?: any): string {
  if (!schema) return "";

  // 处理引用类型
  if (schema.$ref) {
    const refType = schema.$ref.split("/").pop();
    if (schemas && schemas[refType]) {
      return generateTypeProps(schemas[refType], indent, schemas);
    }
    return `${indent}${refType}`;
  }

  // 处理数组类型
  if (schema.type === "array") {
    if (schema.items.$ref) {
      const itemType = schema.items.$ref.split("/").pop();
      if (schemas && schemas[itemType]) {
        return `${indent}{\n${generateTypeProps(
          schemas[itemType],
          indent + "  ",
          schemas
        )}\n${indent}}[]`;
      }
      return `${indent}${itemType}[]`;
    }
    if (schema.items.type === "object") {
      return `${indent}{\n${generateTypeProps(
        schema.items,
        indent + "  ",
        schemas
      )}\n${indent}}[]`;
    }
    const itemType =
      schema.items.type === "integer" ? "number" : schema.items.type;
    return `${indent}${itemType}[]`;
  }

  // 处理对象类型
  if (schema.type === "object" && schema.properties) {
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
            return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: {\n${generateTypeProps(
              schemas[refType],
              indent + "  ",
              schemas
            )}\n${indent}};`;
          }
          return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: ${refType};`;
        }

        if (prop.type === "array") {
          if (prop.items.$ref) {
            const itemType = prop.items.$ref.split("/").pop();
            if (schemas && schemas[itemType]) {
              return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: {\n${generateTypeProps(
                schemas[itemType],
                indent + "  ",
                schemas
              )}\n${indent}}[];`;
            }
            return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: ${itemType}[];`;
          }
          if (prop.items.type === "object") {
            return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: {\n${generateTypeProps(
              prop.items,
              indent + "  ",
              schemas
            )}\n${indent}}[];`;
          }
          const itemType =
            prop.items.type === "integer" ? "number" : prop.items.type;
          return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: ${itemType}[];`;
        }

        if (prop.type === "object") {
          return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: {\n${generateTypeProps(
            prop,
            indent + "  ",
            schemas
          )}\n${indent}};`;
        }

        const type = prop.type === "integer" ? "number" : prop.type || "any";
        return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: ${type};`;
      })
      .join("\n");
    return props;
  }

  if (schema.type) {
    const type = schema.type === "integer" ? "number" : schema.type;
    return `${indent}${type}`;
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
        if (operation.parameters?.length) {
          const parameterProps = operation.parameters
            .map((param: Parameter) => {
              const required = param.required ? "" : "?";
              const description = param.description
                ? `\n   * ${param.description}` +
                  (param.schema?.type
                    ? `\n   * 类型: ${param.schema.type}`
                    : "")
                : "";
              return `  /**${description}\n   */\n  ${param.name}${required}: string;`;
            })
            .join("\n");

          typeDefinitions += `
/**
 * 接口 [${operation.summary}↗](${path}) 的 **请求类型**
 *
 * @分类 [${tag}↗](${path})
 * @请求头 \`${method.toUpperCase()} ${path}\`
 * @更新时间 \`${updateTime}\`
 */
export interface ${requestInterfaceName} {
${parameterProps}
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
