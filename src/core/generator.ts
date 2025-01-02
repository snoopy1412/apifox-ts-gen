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

function handleRecursiveType(
  typeName: string,
  schema: any,
  indent: string,
  schemas: any,
  processedRefs: ProcessedRefs
): string {
  // 如果已经处理过这个类型，直接返回类型名称
  if (processedRefs.has(typeName)) {
    return `${typeName}`;
  }

  // 标记该类型正在处理中
  processedRefs.add(typeName);

  // 生成类型定义
  return `{\n${generateTypeProps(
    schema,
    indent + "  ",
    schemas,
    processedRefs
  )}\n${indent}}`;
}

function generateTypeProps(
  schema: any,
  indent = "",
  schemas?: any,
  processedRefs: ProcessedRefs = new Set(),
  depth = 0,
  typeDefinitions = { value: "" }
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
    if (!schema.items) {
      console.warn("Array schema missing items definition:", schema);
      return `${indent}any[]`;
    }

    // 处理引用类型的数组项
    if (schema.items.$ref) {
      const itemType = schema.items.$ref.split("/").pop();
      if (schemas && schemas[itemType]) {
        // 检查是否是递归类型
        const isRecursive = processedRefs.has(itemType);
        if (isRecursive) {
          // 如果是递归类型，直接使用类型名称
          return `${indent}${itemType}[]`;
        }

        // 生成接口定义（如果还没有）
        if (!processedRefs.has(`interface:${itemType}`)) {
          processedRefs.add(`interface:${itemType}`);
          typeDefinitions.value = `interface ${itemType} ${handleRecursiveType(
            itemType,
            schemas[itemType],
            "",
            schemas,
            new Set([...processedRefs])
          )}\n\n${typeDefinitions.value}`;
        }

        return `${indent}${itemType}[]`;
      }
      // 如果找不到引用的类型，使用空对象类型
      console.warn(`Referenced type ${itemType} not found, using empty object`);
      return `${indent}{}[]`;
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
            // 对象类型不应该检查 items
            if (!prop.properties) {
              return `${indent}/**${description}\n${indent} */\n${indent}${name}${required}: Record<string, any>;`;
            }
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

function shouldUseTypeInsteadOfInterface(schema: any): boolean {
  // 如果是基本类型，直接使用 type
  if (
    typeof schema === "string" ||
    typeof schema === "number" ||
    typeof schema === "boolean"
  ) {
    return true;
  }

  // 如果是数组类型，使用 type
  if (schema.type === "array") {
    return true;
  }

  // 如果是简单类型，使用 type
  if (["string", "number", "integer", "boolean"].includes(schema.type)) {
    return true;
  }

  // 如果是对象类型但没有properties，使用 type
  if (schema.type === "object" && !schema.properties) {
    return true;
  }

  return false;
}

function generateRequestBodyType(
  operation: OperationObject,
  schemas: any
): { type: "interface" | "type"; content: string } {
  if (!operation.requestBody?.content)
    return { type: "interface", content: "" };

  const jsonContent = operation.requestBody.content["application/json"];
  if (!jsonContent?.schema) {
    return { type: "interface", content: "" };
  }

  const schema = jsonContent.schema;
  const useType = shouldUseTypeInsteadOfInterface(schema);

  if (useType) {
    let typeContent: string;

    if (schema.type === "array") {
      // 修改数组类型的处理方式，确保正确的大括号位置
      const itemProps = generateTypeProps(schema.items, "  ", schemas);
      typeContent = `Array<{
${itemProps}
}>`;
    } else if (
      ["string", "number", "integer", "boolean"].includes(schema.type)
    ) {
      typeContent = schema.type === "integer" ? "number" : schema.type;
    } else {
      typeContent = generateTypeProps(schema, "", schemas);
    }

    return {
      type: "type",
      content: typeContent,
    };
  }

  // 使用 interface 的情况
  return {
    type: "interface",
    content: generateTypeProps(schema, "  ", schemas),
  };
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
    const processedTypes = new Set<string>();

    // 添加一个函数来收集和生成所有被引用的类型
    function collectReferencedTypes(schema: any) {
      if (!schema) return;

      if (schema.$ref) {
        const refType = schema.$ref.split("/").pop();
        if (
          refType &&
          !processedTypes.has(refType) &&
          spec.components?.schemas?.[refType]
        ) {
          processedTypes.add(refType);
          typeDefinitions = `interface ${refType} ${handleRecursiveType(
            refType,
            spec.components?.schemas[refType],
            "",
            spec.components?.schemas,
            new Set()
          )}\n\n${typeDefinitions}`;
          // 递归处理引用的类型
          collectReferencedTypes(spec.components?.schemas[refType]);
        }
      }

      // 处理数组类型
      if (schema.type === "array" && schema.items) {
        collectReferencedTypes(schema.items);
      }

      // 处理对象类型
      if (schema.type === "object" && schema.properties) {
        Object.values(schema.properties).forEach((prop: any) => {
          collectReferencedTypes(prop);
        });
      }
    }

    // 在生成类型之前，先收集所有被引用的类型
    for (const [path, pathItem] of Object.entries(paths)) {
      for (const operation of Object.values(pathItem as PathItemObject)) {
        // 检查请求体
        if (operation.requestBody?.content?.["application/json"]?.schema) {
          collectReferencedTypes(
            operation.requestBody.content["application/json"].schema
          );
        }
        // 检查响应
        if (
          operation.responses?.["200"]?.content?.["application/json"]?.schema
        ) {
          collectReferencedTypes(
            operation.responses["200"].content["application/json"].schema
          );
        }
      }
    }

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
          const { type: requestBodyType, content: requestBodyProps } =
            generateRequestBodyType(operation, spec.components?.schemas);

          // 处理参数
          let parameterProps = "";
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

          if (requestBodyType === "type") {
            typeDefinitions += `
/**
 * 接口 [${operation.summary}↗](${path}) 的 **请求类型**
 *
 * @分类 [${tag}↗](${path})
 * @请求头 \`${method.toUpperCase()} ${path}\`
 * @更新时间 \`${updateTime}\`
 */
export type ${requestInterfaceName} = ${requestBodyProps};

`;
          } else {
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
