export interface Parameter {
  name: string;
  in: string;
  description?: string;
  required?: boolean;
  schema?: {
    type: string;
    format?: string;
    items?: {
      type?: string;
      format?: string;
      $ref?: string;
    };
  };
}

export interface MediaTypeObject {
  schema?: any;
}

export interface ResponseObject {
  description: string;
  content?: {
    [key: string]: MediaTypeObject;
  };
}

export interface OperationObject {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  responses?: {
    [key: string]: ResponseObject;
  };
  requestBody?: {
    content: {
      [key: string]: {
        schema: any;
      };
    };
  };
}

export interface PathItemObject {
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  delete?: OperationObject;
  patch?: OperationObject;
}

export interface Tag {
  name: string;
  description?: string;
}

export interface OpenAPISpec {
  openapi: string;
  tags: Tag[];
  paths: {
    [path: string]: PathItemObject;
  };
  components?: {
    schemas?: Record<string, any>;
  };
}
