import {
    ASTConstant,
    ASTProgramImport,
    ASTNativeFunction,
    ASTProgram,
    ASTLvalueRef,
    ASTTypeRefBounced,
    ASTTypeRefMap,
    ASTTypeRefSimple,
    ASTReceive,
    ASTInitFunction,
    ASTStatementRepeat,
    ASTStatementUntil,
    ASTStatementWhile,
    ASTNewParameter,
    ASTCondition,
    ASTSTatementAugmentedAssign,
    ASTSTatementAssign,
    ASTStatementExpression,
    ASTStatementReturn,
    ASTStatementLet,
    ASTFunction,
    ASTTypeRef,
    ASTStatement,
    ASTExpression,
    ASTField,
    ASTPrimitive,
    ASTStruct,
    ASTContract,
    ASTTrait,
} from "./grammar/ast";

/**
 * PrettyPrinter class provides methods to format and indent Tact code.
 */
class PrettyPrinter {
    /**
     * @param indentLevel Initial level of indentation.
     * @param indentSpaces Number of spaces per indentation level.
     */
    constructor(
        private indentLevel: number = 0,
        private readonly indentSpaces: number = 2,
    ) {}

    private increaseIndent() {
        this.indentLevel += 1;
    }

    private decreaseIndent() {
        this.indentLevel -= 1;
    }

    private indent(): string {
        return " ".repeat(this.indentLevel * this.indentSpaces);
    }

    private formatList<T>(list: T[], formatter: (item: T) => string): string {
        return list.map(formatter).join(",\n" + this.indent());
    }

    ppASTPrimitive(primitive: ASTPrimitive): string {
        return `${this.indent()}primitive ${primitive.name};`;
    }

    //
    // Types
    //

    ppASTTypeRef(typeRef: ASTTypeRef): string {
        switch (typeRef.kind) {
            case "type_ref_simple":
                return this.ppASTTypeRefSimple(typeRef);
            case "type_ref_map":
                return this.ppASTTypeRefMap(typeRef);
            case "type_ref_bounced":
                return this.ppASTTypeRefBounced(typeRef);
            default:
                throw new Error(`Unknown TypeRef kind: ${typeRef}`);
        }
    }

    ppASTTypeRefSimple(typeRef: ASTTypeRefSimple): string {
        return `${typeRef.name}${typeRef.optional ? "?" : ""}`;
    }

    ppASTTypeRefMap(typeRef: ASTTypeRefMap): string {
        const keyAlias = typeRef.keyAs ? ` as ${typeRef.keyAs}` : "";
        const valueAlias = typeRef.valueAs ? ` as ${typeRef.valueAs}` : "";
        return `map<${typeRef.key}${keyAlias}, ${typeRef.value}${valueAlias}>`;
    }

    ppASTTypeRefBounced(typeRef: ASTTypeRefBounced): string {
        return `bounced<${typeRef.name}>`;
    }

    //
    // Expressions
    //

    /**
     * Returns precedence used in unary/binary operations.
     * Lower number means higher precedence
     */
    getPrecedence(kind: string, op?: string): number {
        switch (kind) {
            case "op_binary":
                switch (op) {
                    case "||":
                        return 1;
                    case "&&":
                        return 2;
                    case "==":
                    case "!=":
                        return 3;
                    case "<":
                    case ">":
                    case "<=":
                    case ">=":
                        return 4;
                    case "+":
                    case "-":
                        return 5;
                    case "*":
                    case "/":
                    case "%":
                        return 6;
                    default:
                        return 10;
                }
            case "op_unary":
                return 7;
            default:
                return 10;
        }
    }

    ppASTExpression(expr: ASTExpression, parentPrecedence: number = 0): string {
        let result;
        let currentPrecedence = this.getPrecedence(expr.kind);

        switch (expr.kind) {
            case "op_binary":
                currentPrecedence = this.getPrecedence(expr.kind, expr.op);
                result = `${this.ppASTExpression(expr.left, currentPrecedence)} ${expr.op} ${this.ppASTExpression(expr.right, currentPrecedence)}`;
                break;
            case "op_unary":
                currentPrecedence = this.getPrecedence(expr.kind, expr.op);
                result = `${expr.op}${this.ppASTExpression(expr.right, currentPrecedence)}`;
                break;
            case "op_field":
                result = `${this.ppASTExpression(expr.src, currentPrecedence)}.${expr.name}`;
                break;
            case "op_call":
                result = `${this.ppASTExpression(expr.src, currentPrecedence)}.${expr.name}(${expr.args.map((arg) => this.ppASTExpression(arg, currentPrecedence)).join(", ")})`;
                break;
            case "op_static_call":
                result = `${expr.name}(${expr.args.map((arg) => this.ppASTExpression(arg, currentPrecedence)).join(", ")})`;
                break;
            case "op_new":
                result = `${expr.type}{${expr.args.map(this.ppASTNewParameter).join(", ")}}`;
                break;
            case "init_of":
                result = `initOf ${expr.name}(${expr.args.map((arg) => this.ppASTExpression(arg, currentPrecedence)).join(", ")})`;
                break;
            case "conditional":
                result = `${this.ppASTExpression(expr.condition, currentPrecedence)} ? ${this.ppASTExpression(expr.thenBranch, currentPrecedence)} : ${this.ppASTExpression(expr.elseBranch, currentPrecedence)}`;
                break;
            case "number":
                result = expr.value.toString();
                break;
            case "id":
                result = expr.value;
                break;
            case "boolean":
                result = expr.value.toString();
                break;
            case "string":
                result = `"${expr.value}"`;
                break;
            case "null":
                result = "null";
                break;
            case "lvalue_ref":
                result = `${expr.name}`;
                break;
            default:
                throw new Error(`Unsupported expression type: ${expr}`);
        }

        // Set parens when needed
        if (parentPrecedence > 0 && currentPrecedence > parentPrecedence) {
            result = `(${result})`;
        }

        return result;
    }

    ppASTNewParameter(param: ASTNewParameter): string {
        return `${param.name}: ${this.ppASTExpression(param.exp)}`;
    }

    //
    // Program
    //

    ppASTProgram(program: ASTProgram): string {
        const entriesFormatted = program.entries
            .map((entry) => this.ppProgramItem(entry))
            .join("\n\n");
        return entriesFormatted;
    }

    ppProgramItem(
        item:
            | ASTStruct
            | ASTContract
            | ASTPrimitive
            | ASTFunction
            | ASTNativeFunction
            | ASTTrait
            | ASTProgramImport
            | ASTConstant,
    ): string {
        switch (item.kind) {
            case "def_struct":
                return this.ppASTStruct(item);
            case "def_contract":
                return this.ppASTContract(item);
            case "primitive":
                return this.ppASTPrimitive(item);
            case "def_function":
                return this.ppASTFunction(item);
            case "def_native_function":
                return this.ppASTNativeFunction(item);
            case "def_trait":
                return this.ppASTTrait(item);
            case "program_import":
                return this.ppASTProgramImport(item);
            case "def_constant":
                return this.ppASTConstant(item);
            default:
                return `Unknown Program Item Type: ${item}`;
        }
    }

    ppASTProgramImport(importItem: ASTProgramImport): string {
        return `${this.indent()}import "${importItem.path.value}";`;
    }

    ppASTStruct(struct: ASTStruct): string {
        const typePrefix = struct.message ? "message" : "struct";
        const prefixFormatted =
            struct.prefix !== null ? `(${struct.prefix})` : "";
        this.increaseIndent();
        const fieldsFormatted = struct.fields
            .map((field) => this.ppASTField(field))
            .join("\n");
        this.decreaseIndent();
        return `${this.indent()}${typePrefix} ${prefixFormatted} ${struct.name} {\n${fieldsFormatted}\n}`;
    }

    ppASTTrait(trait: ASTTrait): string {
        const traitsFormatted = trait.traits.map((t) => t.value).join(", ");
        const attrsRaw = trait.attributes
            .map((attr) => `@${attr.type}("${attr.name.value}")`)
            .join(" ");
        const attrsFormatted = attrsRaw ? `${attrsRaw} ` : "";
        const bodyFormatted = trait.declarations
            .map((declaration) => this.ppTraitBody(declaration))
            .join(" ");
        const header = traitsFormatted
            ? `trait ${trait.name} with ${traitsFormatted}`
            : `trait ${trait.name}`;
        return `${this.indent()}${attrsFormatted}${header} {\n${bodyFormatted}\n${this.indent()}}`;
    }

    ppTraitBody(
        item: ASTField | ASTFunction | ASTReceive | ASTConstant,
    ): string {
        switch (item.kind) {
            case "def_field":
                return this.ppASTField(item);
            case "def_function":
                return this.ppASTFunction(item);
            case "def_receive":
                return this.ppASTReceive(item);
            case "def_constant":
                return this.ppASTConstant(item);
            default:
                return `Unknown Trait Body Type: ${item}`;
        }
    }

    ppASTField(field: ASTField): string {
        const typeFormatted = this.ppASTTypeRef(field.type);
        const initializer = field.init
            ? ` = ${this.ppASTExpression(field.init)}`
            : "";
        const asAlias = field.as ? ` as ${field.as}` : "";
        return `${this.indent()}${field.name}: ${typeFormatted}${asAlias}${initializer};`;
    }

    ppASTConstant(constant: ASTConstant): string {
        const valueFormatted = constant.value
            ? ` = ${this.ppASTExpression(constant.value)}`
            : "";
        const attrsRaw = constant.attributes.map((attr) => attr.type).join(" ");
        const attrsFormatted = attrsRaw ? `${attrsRaw} ` : "";
        return `${this.indent()}${attrsFormatted}const ${constant.name}: ${this.ppASTTypeRef(constant.type)}${valueFormatted};`;
    }

    ppASTContract(contract: ASTContract): string {
        const traitsFormatted = contract.traits
            .map((trait) => trait.value)
            .join(", ");
        this.increaseIndent();
        const bodyFormatted = contract.declarations
            .map((dec) => this.ppContractBody(dec))
            .join("\n\n");
        this.decreaseIndent();
        const header = traitsFormatted
            ? `contract ${contract.name} with ${traitsFormatted}`
            : `contract ${contract.name}`;
        const attrsRaw = contract.attributes
            .map((attr) => `@interface("${attr.name.value}")`)
            .join(" ");
        const attrsFormatted = attrsRaw ? `${attrsRaw} ` : "";
        return `${this.indent()}${attrsFormatted}${header} {\n${bodyFormatted}\n${this.indent()}}`;
    }

    ppContractBody(
        declaration:
            | ASTField
            | ASTFunction
            | ASTInitFunction
            | ASTReceive
            | ASTConstant,
    ): string {
        switch (declaration.kind) {
            case "def_field":
                return this.ppASTField(declaration);
            case "def_function":
                return this.ppASTFunction(declaration);
            case "def_init_function":
                return this.ppASTInitFunction(declaration);
            case "def_receive":
                return this.ppASTReceive(declaration);
            case "def_constant":
                return this.ppASTConstant(declaration);
            default:
                return `Unknown Contract Body Type: ${declaration}`;
        }
    }

    public ppASTFunction(func: ASTFunction): string {
        const argsFormatted = func.args
            .map((arg) => `${arg.name}: ${this.ppASTTypeRef(arg.type)}`)
            .join(", ");
        const attrsRaw = func.attributes.map((attr) => attr.type).join(" ");
        const attrsFormatted = attrsRaw ? `${attrsRaw} ` : "";
        const returnType = func.return
            ? `: ${this.ppASTTypeRef(func.return)}`
            : "";
        this.increaseIndent();
        const stmtsFormatted = func.statements
            ? func.statements
                  .map((stmt) => this.ppASTStatement(stmt))
                  .join(",\n" + this.indent())
            : "";
        const body = func.statements
            ? `{\n${this.indent()}${stmtsFormatted}`
            : ";";
        this.decreaseIndent();
        return `${this.indent()}${attrsFormatted}fun ${func.name}(${argsFormatted})${returnType} ${body}\n${this.indent()}}`;
    }

    ppASTReceive(receive: ASTReceive): string {
        const selector =
            receive.selector.kind === "internal-simple"
                ? `(${receive.selector.arg.name}: ${this.ppASTTypeRef(receive.selector.arg.type)})`
                : "()";
        this.increaseIndent();
        const stmtsFormatted = this.formatList(
            receive.statements,
            this.ppASTStatement,
        );
        this.decreaseIndent();
        return `${this.indent()}receive ${selector} {\n${stmtsFormatted}\n}`;
    }

    ppASTNativeFunction(func: ASTNativeFunction): string {
        const argsFormatted = func.args
            .map((arg) => `${arg.name}: ${this.ppASTTypeRef(arg.type)}`)
            .join(", ");
        const returnType = func.return
            ? `: ${this.ppASTTypeRef(func.return)}`
            : "";
        return `${this.indent()}native fun ${func.name}(${argsFormatted})${returnType};`;
    }

    ppASTInitFunction(initFunc: ASTInitFunction): string {
        const argsFormatted = initFunc.args
            .map((arg) => `${arg.name}: ${this.ppASTTypeRef(arg.type)}`)
            .join(", ");
        const stmtsFormatted = this.formatList(
            initFunc.statements,
            this.ppASTStatement,
        );
        return `init(${argsFormatted}) { ${stmtsFormatted} }`;
    }

    //
    // Statements
    //

    ppASTStatement(stmt: ASTStatement): string {
        switch (stmt.kind) {
            case "statement_let":
                return this.ppASTStatementLet(stmt as ASTStatementLet);
            case "statement_return":
                return this.ppASTStatementReturn(stmt as ASTStatementReturn);
            case "statement_expression":
                return this.ppASTStatementExpression(
                    stmt as ASTStatementExpression,
                );
            case "statement_assign":
                return this.ppASTStatementAssign(stmt as ASTSTatementAssign);
            case "statement_augmentedassign":
                return this.ppASTStatementAugmentedAssign(
                    stmt as ASTSTatementAugmentedAssign,
                );
            case "statement_condition":
                return this.ppASTCondition(stmt as ASTCondition);
            case "statement_while":
                return this.ppASTStatementWhile(stmt as ASTStatementWhile);
            case "statement_until":
                return this.ppASTStatementUntil(stmt as ASTStatementUntil);
            case "statement_repeat":
                return this.ppASTStatementRepeat(stmt as ASTStatementRepeat);
            default:
                return `Unknown Statement Type: ${stmt}`;
        }
    }

    ppStatementBlock(stmts: ASTStatement[]): string {
        this.increaseIndent();
        const result = `${this.indent()}{\n${this.formatList(stmts, this.ppASTStatement)}\n${this.indent()}}`;
        this.decreaseIndent();
        return result;
    }

    ppASTStatementLet(statement: ASTStatementLet): string {
        const expression = this.ppASTExpression(statement.expression);
        return `${this.indent()}let ${statement.name}: ${this.ppASTTypeRef(statement.type)} = ${expression};`;
    }

    ppASTStatementReturn(statement: ASTStatementReturn): string {
        const expression = statement.expression
            ? this.ppASTExpression(statement.expression)
            : "";
        return `${this.indent()}return ${expression};`;
    }

    ppASTStatementExpression(statement: ASTStatementExpression): string {
        return `${this.indent()}${this.ppASTExpression(statement.expression)};`;
    }

    ppASTLvalueRef(lvalues: ASTLvalueRef[]) {
        return lvalues
            .reduce((acc, lvalue) => {
                acc.push(lvalue.name);
                return acc;
            }, [] as string[])
            .join(".");
    }

    ppASTStatementAssign(statement: ASTSTatementAssign): string {
        return `${this.indent()}${this.ppASTLvalueRef(statement.path)} = ${this.ppASTExpression(statement.expression)};`;
    }

    ppASTStatementAugmentedAssign(
        statement: ASTSTatementAugmentedAssign,
    ): string {
        return `${this.indent()}${this.ppASTLvalueRef(statement.path)} ${statement.op} ${this.ppASTExpression(statement.expression)};`;
    }

    ppASTCondition(statement: ASTCondition): string {
        const condition = this.ppASTExpression(statement.expression);
        const trueBranch = this.ppStatementBlock(statement.trueStatements);
        const falseBranch = statement.falseStatements
            ? `} else {\n${this.ppStatementBlock(statement.falseStatements)}\n}`
            : "";
        return `${this.indent()}if (${condition}) {\n${trueBranch}\n} ${falseBranch}`;
    }

    ppASTStatementWhile(statement: ASTStatementWhile): string {
        const condition = this.ppASTExpression(statement.condition);
        const stmts = this.ppStatementBlock(statement.statements);
        return `${this.indent()}while (${condition}) ${stmts}`;
    }

    ppASTStatementRepeat(statement: ASTStatementRepeat): string {
        const condition = this.ppASTExpression(statement.iterations);
        const stmts = this.ppStatementBlock(statement.statements);
        return `${this.indent()}repeat (${condition}) ${stmts}`;
    }

    ppASTStatementUntil(statement: ASTStatementUntil): string {
        const condition = this.ppASTExpression(statement.condition);
        const stmts = this.ppStatementBlock(statement.statements);
        return `${this.indent()}do ${stmts} until (${condition});`;
    }
}

/**
 * Formats an AST node into a pretty-printed string representation.
 * @param input The AST node to format.
 * @returns A string that represents the formatted AST node.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatAST(input: any): string {
    const pp = new PrettyPrinter();
    switch (input.kind) {
        case "program":
            return pp.ppASTProgram(input);
        case "op_binary":
        case "op_unary":
        case "op_field":
        case "op_call":
        case "op_static_call":
        case "op_new":
        case "init_of":
        case "conditional":
        case "number":
        case "id":
        case "boolean":
        case "string":
        case "null":
        case "lvalue_ref":
            return pp.ppASTExpression(input);
        case "def_struct":
            return pp.ppASTStruct(input);
        case "def_constant":
            return pp.ppASTConstant(input);
        case "def_function":
            return pp.ppASTFunction(input);
        case "def_contract":
            return pp.ppASTContract(input);
        case "def_trait":
            return pp.ppASTTrait(input);
        default:
            throw new Error(`Unsupported AST type: ${input.ref}`);
    }
}
