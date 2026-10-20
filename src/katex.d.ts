declare module 'katex' {
  export interface KatexOptions {
    displayMode?: boolean;
    throwOnError?: boolean;
    strict?: boolean | string;
  }
  export function renderToString(tex: string, options?: KatexOptions): string;
  const katex: {
    renderToString(tex: string, options?: KatexOptions): string;
  };
  export default katex;
}
