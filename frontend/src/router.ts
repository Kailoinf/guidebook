// 极简 hash 路由 —— 零依赖，基于 location.hash
// 支持的路径：
//   #/d/:id      —— 扫码查看页（公开）
//   #/login      —— 管理员登录
//   #/admin      —— 管理后台（需登录）

export type RouteHandler = (params: Record<string, string>) => void;

interface RouteEntry {
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

const routes: RouteEntry[] = [];
let notFoundHandler: RouteHandler = () => {};

// 把 "/d/:id" 编译成正则 + 参数名列表
function compile(pattern: string): { regex: RegExp; names: string[] } {
  const names: string[] = [];
  const regexStr = pattern
    .replace(/\/:([^/]+)/g, (_, name) => {
      names.push(name);
      return '/([^/]+)';
    })
    .replace(/\//g, '\\/');
  return { regex: new RegExp(`^${regexStr}$`), names };
}

export function route(pattern: string, handler: RouteHandler): void {
  const { regex, names } = compile(pattern);
  routes.push({ pattern: regex, paramNames: names, handler });
}

export function notFound(handler: RouteHandler): void {
  notFoundHandler = handler;
}

// 当前 hash 去掉 # 前缀，默认 '/'
function currentPath(): string {
  const hash = location.hash.replace(/^#/, '');
  return hash || '/';
}

export function navigate(path: string): void {
  location.hash = path;
}

function resolve(): void {
  const path = currentPath();
  for (const entry of routes) {
    const match = path.match(entry.pattern);
    if (match) {
      const params: Record<string, string> = {};
      entry.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });
      entry.handler(params);
      return;
    }
  }
  notFoundHandler({});
}

export function startRouter(): void {
  window.addEventListener('hashchange', resolve);
  resolve();
}
