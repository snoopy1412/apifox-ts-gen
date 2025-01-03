export interface ApifoxConfig {
  /**
   * Apifox OpenAPI 规范的 URL
   * @description 从 Apifox 导出的 OpenAPI 规范地址
   * @required
   * @example "http://localhost:4523/export/openapi/2?version=3.0"
   */
  url: string;

  /**
   * 生成的类型文件输出目录
   * @description 生成的 TypeScript 类型定义文件的输出目录
   * @default "src/types"
   * @example "src/types" | "out/types"
   */
  outputDir: string;

  /**
   * 生成的类型前缀
   * @description 生成的类型名称前缀，用于避免命名冲突
   * @default "Api"
   * @example "Api" | "Service" | "Client"
   */
  typePrefix: string;

  /**
   * 阿里云翻译配置
   * @description 用于中文到英文的翻译服务配置
   */
  alibabaCloud: {
    /**
     * 阿里云访问密钥 ID
     * @description 从阿里云控制台获取的 AccessKey ID
     * @required
     * @example "LTAI5t******"
     */
    accessKeyId: string;

    /**
     * 阿里云访问密钥密码
     * @description 从阿里云控制台获取的 AccessKey Secret
     * @required
     * @example "dWzPO******"
     */
    accessKeySecret: string;
  };

  /**
   * API 请求方法导入配置
   */
  requestConfig?: {
    /**
     * 请求方法导入路径
     * @example "@/utils/request"
     */
    importPath: string;

    /**
     * API 服务文件生成路径
     * @example "src/services"
     */
    servicesPath: string;

    /**
     * API 类型文件生成路径
     * @example "out/types"
     */
    typesPath: string;
  };
}
