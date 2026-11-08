declare module 'jmespath' {
  /** Evaluates a JMESPath expression against a JSON value. */
  export function search(data: any, expression: string, options?: any): any

  /** Parses an expression, throwing on a syntax error. */
  export function compile(expression: string): unknown

  /** Tokenizes an expression, throwing on a syntax error. */
  export function tokenize(expression: string): unknown[]

  const jmespath: {
    search: typeof search
    compile: typeof compile
    tokenize: typeof tokenize
  }
  export default jmespath
}
