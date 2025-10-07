// This file is auto-generated, don't edit it
// 依赖的模块可通过下载工程中的模块依赖文件或右上角的获取 SDK 依赖信息查看
// import OpenApi, * as $OpenApi from '@alicloud/openapi-client';
// import * as $Util from '@alicloud/tea-util';
const { camelCase } = require('lodash');
const OpenApi = require('@alicloud/openapi-client').default;
const $OpenApi = require('@alicloud/openapi-client');
const $Util = require('@alicloud/tea-util');

// 动态导入配置
async function loadConfig() {
  try {
    const { cosmiconfig } = require('cosmiconfig');
    const { pathToFileURL } = require('url');

    const explorer = cosmiconfig("apifox", {
      searchPlaces: [
        "apifox.config.js",
        "apifox.config.mjs",
        "apifox.config.cjs",
        ".apifoxrc",
        ".apifoxrc.json",
        "package.json"
      ],
      loaders: {
        '.js': (filepath) => require(filepath),
        '.mjs': async (filepath) => {
          const fileUrl = pathToFileURL(filepath).href;
          const module = await import(fileUrl);
          return module.default;
        },
        '.cjs': (filepath) => require(filepath)
      }
    });

    const result = await explorer.search();
    
    if (!result || !result.config) {
      throw new Error('No configuration file found');
    }

    return result.config;
  } catch (error) {
    console.error('Error loading configuration:', error);
    process.exit(1);
  }
}

class Client {
  /**
   * 使用AK&SK初始化账号Client
   * @param accessKeyId
   * @param accessKeySecret
   * @return Client
   * @throws Exception
   */
  static async createClient(accessKeyId, accessKeySecret) {
    let config = new $OpenApi.Config({
      accessKeyId: accessKeyId,
      accessKeySecret: accessKeySecret
    });
    config.endpoint = `mt.cn-hangzhou.aliyuncs.com`;
    return new OpenApi(config);
  }

  /**
   * API 相关
   * @param path params
   * @return OpenApi.Params
   */
  static createApiInfo() {
    let params = new $OpenApi.Params({
      // 接口名称
      action: 'TranslateGeneral',
      // 接口版本
      version: '2018-10-12',
      // 接口协议
      protocol: 'HTTPS',
      // 接口 HTTP 方法
      method: 'POST',
      authType: 'AK',
      style: 'RPC',
      // 接口 PATH
      pathname: `/`,
      // 接口请求体内容格式
      reqBodyType: 'formData',
      // 接口响应体内容格式
      bodyType: 'json'
    });
    return params;
  }

  static async main(text) {
    const config = await loadConfig();
    const credentials = config.alibabaCloud || {};

    if (!credentials.accessKeyId || !credentials.accessKeySecret) {
      return null;
    }

    let client = await Client.createClient(
      credentials.accessKeyId,
      credentials.accessKeySecret
    );
    let params = Client.createApiInfo();
    // body params
    let body = {};
    body['FormatType'] = 'text';
    body['SourceLanguage'] = 'zh';
    body['TargetLanguage'] = 'en';
    body['SourceText'] = text;
    body['Scene'] = 'general';
    // runtime options
    let runtime = new $Util.RuntimeOptions({});
    let request = new $OpenApi.OpenApiRequest({
      body: body
    });
    // 复制代码运行请自行打印 API 的返回值
    // 返回值为 Map 类型，可从 Map 中获得三类数据：响应体 body、响应头 headers、HTTP 返回的状态码 statusCode。
    return await client.callApi(params, request, runtime);
  }
}

async function translateAndConvert(str) {
  const result = await Client.main(str);
  if (!result) {
    return str;
  }
  const newStr = result?.body?.Data?.Translated;
  return camelCase(newStr) ?? str;
}

module.exports = {
  translateAndConvert
};
