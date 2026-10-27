"""Evaluates the formulas admins type into scoring rules and custom aggregations.

Formulas are Python expressions limited to arithmetic, comparisons,
conditionals (`a if cond else b`), comprehensions and a few math functions.
Attribute access, imports and names outside the allowed list are rejected.

- Scoring rule formulas get `x` (raw answer), `lo` and `hi` (node scale bounds).
- Aggregation formulas get `s` (child scores) and `w` (child weights, summing to 1).
"""
import ast
import math

FUNCTIONS = {
    'abs': abs, 'min': min, 'max': max, 'sum': sum, 'len': len, 'round': round, 'zip': zip,
    'sqrt': math.sqrt, 'log': math.log, 'exp': math.exp, 'pow': pow, 'prod': math.prod,
}

ALLOWED_NODES = (
    ast.Expression, ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare, ast.IfExp, ast.Call,
    ast.Name, ast.Load, ast.Store, ast.Constant, ast.List, ast.Tuple, ast.Subscript, ast.Slice,
    ast.GeneratorExp, ast.ListComp, ast.comprehension,
    ast.operator, ast.unaryop, ast.boolop, ast.cmpop,
)


class FormulaError(ValueError):
    pass


def check(formula, variables):
    """Parses the formula and returns its compiled code, or raises FormulaError."""
    try:
        tree = ast.parse(formula, mode='eval')
    except SyntaxError as e:
        raise FormulaError(f'syntax error: {e.msg}') from None
    bound = {t.id for n in ast.walk(tree) if isinstance(n, ast.comprehension)
             for t in ast.walk(n.target) if isinstance(t, ast.Name)}
    for node in ast.walk(tree):
        if not isinstance(node, ALLOWED_NODES):
            raise FormulaError(f'{type(node).__name__} is not allowed')
        if isinstance(node, ast.Name) and node.id not in variables and node.id not in FUNCTIONS and node.id not in bound:
            raise FormulaError(f'unknown name "{node.id}"')
    return compile(tree, '<formula>', 'eval')


def evaluate(formula, **variables):
    """Returns the formula's value as a finite float, or raises FormulaError."""
    code = check(formula, variables)
    try:
        # Variables go into globals so comprehensions can see them.
        value = eval(code, {'__builtins__': {}, **FUNCTIONS, **variables})  # noqa: S307 - AST checked above
        value = float(value)
    except FormulaError:
        raise
    except Exception as e:  # noqa: BLE001 - any runtime error is a formula error
        raise FormulaError(str(e)) from None
    if not math.isfinite(value):
        raise FormulaError('formula did not return a finite number')
    return value
