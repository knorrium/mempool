import { Project, SourceFile, Node, SyntaxKind, CallExpression, PropertyAccessExpression, StringLiteral, Identifier, BinaryExpression, IfStatement, Block, ExpressionStatement } from 'ts-morph';
import * as path from 'path';

export interface ParsedRoute {
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  path: string;
  handler: string;
  condition?: string;
  sourceFile: string;
  line: number;
}

export interface ConditionalBlock {
  condition: string;
  routes: ParsedRoute[];
}

export function createProject(backendPath: string): Project {
  const project = new Project({
    tsConfigFilePath: path.join(backendPath, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });
  return project;
}

export function addSourceFile(project: Project, filePath: string): SourceFile {
  return project.addSourceFileAtPath(filePath);
}

export function isHttpMethodCall(node: Node): node is CallExpression {
  if (!Node.isCallExpression(node)) return false;

  const expression = node.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return false;

  const methodName = expression.getName();
  return ['get', 'post', 'put', 'delete', 'patch'].includes(methodName);
}

export function extractRouteFromCall(call: CallExpression): { method: string; pathArg: string; handler: string } | null {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return null;

  const method = expression.getName();
  const args = call.getArguments();

  if (args.length < 2) return null;

  const pathArg = extractPathString(args[0]);
  if (!pathArg) return null;

  let handler = 'unknown';
  const handlerArg = args[1];
  if (Node.isPropertyAccessExpression(handlerArg)) {
    handler = handlerArg.getName();
  } else if (Node.isIdentifier(handlerArg)) {
    handler = handlerArg.getText();
  } else if (Node.isCallExpression(handlerArg)) {
    // Handle .bind(this) patterns
    const innerExpr = handlerArg.getExpression();
    if (Node.isPropertyAccessExpression(innerExpr)) {
      const innerMethod = innerExpr.getName();
      if (innerMethod === 'bind') {
        const bindTarget = innerExpr.getExpression();
        if (Node.isPropertyAccessExpression(bindTarget)) {
          handler = bindTarget.getName();
        }
      }
    }
  }

  return { method, pathArg, handler };
}

export function extractPathString(node: Node): string | null {
  // Handle string literals directly
  if (Node.isStringLiteral(node)) {
    return node.getLiteralValue();
  }

  // Handle template literals
  if (Node.isTemplateExpression(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getText().replace(/`/g, '').replace(/\$\{[^}]+\}/g, ':param');
  }

  // Handle binary expressions (concatenation)
  if (Node.isBinaryExpression(node)) {
    return extractConcatenatedPath(node);
  }

  return null;
}

export function extractConcatenatedPath(node: BinaryExpression): string | null {
  const parts: string[] = [];

  function extractParts(n: Node): void {
    if (Node.isStringLiteral(n)) {
      parts.push(n.getLiteralValue());
    } else if (Node.isBinaryExpression(n)) {
      extractParts(n.getLeft());
      extractParts(n.getRight());
    } else if (Node.isPropertyAccessExpression(n)) {
      // Handle config.MEMPOOL.API_URL_PREFIX - skip it, we'll prepend /api/v1/
      const text = n.getText();
      if (text.includes('API_URL_PREFIX')) {
        // This represents the /api/v1/ prefix (with trailing slash)
        parts.push('/api/v1/');
      }
    }
  }

  extractParts(node);

  if (parts.length === 0) return null;

  // Join and clean up the path
  let result = parts.join('');
  // Remove duplicate slashes
  result = result.replace(/\/+/g, '/');
  // Ensure leading slash
  if (!result.startsWith('/')) {
    result = '/' + result;
  }

  return result;
}

export function findIfStatements(sourceFile: SourceFile): IfStatement[] {
  return sourceFile.getDescendantsOfKind(SyntaxKind.IfStatement);
}

export function extractConditionText(ifStatement: IfStatement): string {
  return ifStatement.getExpression().getText();
}

export function findCallExpressionsInBlock(block: Block | Node): CallExpression[] {
  return block.getDescendantsOfKind(SyntaxKind.CallExpression);
}

export function isAppMethodChain(node: Node): boolean {
  if (!Node.isCallExpression(node)) return false;

  // Walk up the chain to find 'app'
  let current: Node = node;
  while (current) {
    if (Node.isPropertyAccessExpression(current)) {
      const expr = current.getExpression();
      if (Node.isIdentifier(expr) && expr.getText() === 'app') {
        return true;
      }
      current = expr;
    } else if (Node.isCallExpression(current)) {
      current = current.getExpression();
    } else if (Node.isIdentifier(current)) {
      return current.getText() === 'app';
    } else {
      break;
    }
  }

  return false;
}

export function normalizeRoutePath(path: string): string {
  // Normalize various path formats to OpenAPI format
  let normalized = path;

  // Replace :param with {param}
  normalized = normalized.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');

  // Ensure starts with /
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  // Remove trailing slash (except for root)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}
