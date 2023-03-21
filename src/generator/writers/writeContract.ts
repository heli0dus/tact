import { contractErrors } from "../../abi/errors";
import { enabledInline, enabledMaterchain } from "../../config/features";
import { InitDescription, TypeDescription, TypeOrigin } from "../../types/types";
import { WriterContext } from "../Writer";
import { fn, id } from "./id";
import { ops } from "./ops";
import { resolveFuncPrimitive } from "./resolveFuncPrimitive";
import { resolveFuncType } from "./resolveFuncType";
import { resolveFuncTypeUnpack } from "./resolveFuncTypeUnpack";
import { writeValue } from "./writeExpression";
import { writeGetter, writeStatement } from "./writeFunction";
import { writeInterfaces } from "./writeInterfaces";
import { writeRouter } from "./writeRouter";

export function writeStorageOps(type: TypeDescription, origin: TypeOrigin, ctx: WriterContext) {

    // Load function
    ctx.fun(`__gen_load_${type.name}`, () => {
        ctx.signature(`${resolveFuncType(type, ctx)} __gen_load_${type.name}()`);
        ctx.flag('impure');
        ctx.flag('inline');
        if (origin === 'stdlib') {
            ctx.context('stdlib');
        }
        ctx.body(() => {

            // Load data slice
            ctx.append(`slice $sc = get_data().begin_parse();`);

            // Load context
            ctx.append(`__tact_context_sys = $sc~load_ref();`);
            ctx.append(`int $loaded = $sc~load_int(1);`);

            // Load data
            ctx.append(`if ($loaded) {`);
            ctx.inIndent(() => {
                if (type.fields.length > 0) {
                    ctx.used(`__gen_read_${type.name}`);
                    ctx.append(`return $sc~__gen_read_${type.name}();`);
                } else {
                    ctx.append(`return null();`);
                }
            });
            ctx.append(`} else {`);
            ctx.inIndent(() => {

                // Allow only workchain deployments
                if (!enabledMaterchain(ctx.ctx)) {
                    ctx.write(`;; Allow only workchain deployments`);
                    ctx.write(`throw_unless(${contractErrors.masterchainNotEnabled.id}, my_address().preload_uint(11) == 1024);`);
                }

                // Load arguments
                if (type.init!.args.length > 0) {
                    ctx.used(`__gen_read_$init$${type.name}`);
                    ctx.append(`(${type.init!.args.map((v) => resolveFuncType(v.type, ctx) + ' ' + v.name).join(', ')}) = $sc~__gen_read_$init$${type.name}();`);
                    ctx.append(`$sc.end_parse();`);
                }

                // Execute init function
                ctx.used(`__gen_${type.name}_init`);
                ctx.append(`return ${fn(`__gen_${type.name}_init`)}(${[...type.init!.args.map((v) => v.name)].join(', ')});`);
            });

            ctx.append(`}`);
        });
    });

    // Store function
    ctx.fun(`__gen_store_${type.name}`, () => {
        const sig = `() __gen_store_${type.name}(${resolveFuncType(type, ctx)} v)`;
        ctx.signature(sig);
        ctx.flag('impure');
        ctx.flag('inline');
        if (origin === 'stdlib') {
            ctx.context('stdlib');
        }
        ctx.body(() => {
            ctx.append(`builder b = begin_cell();`);

            // Persist system cell
            ctx.append(`b = b.store_ref(__tact_context_sys);`);

            // Persist deployment flag
            ctx.append(`b = b.store_int(true, 1);`);

            // Build data
            if (type.fields.length > 0) {
                ctx.append(`b = ${ops.writer(type.name, ctx)}(b, v);`);
            }

            // Persist data
            ctx.append(`set_data(b.end_cell());`);
        });
    });
}

export function writeInit(t: TypeDescription, init: InitDescription, ctx: WriterContext) {
    ctx.fun(`__gen_${t.name}_init`, () => {
        const args = init.args.map((v) => resolveFuncType(v.type, ctx) + ' ' + id(v.name));
        const sig = `${resolveFuncType(t, ctx)} ${fn(`__gen_${t.name}_init`)}(${args.join(', ')})`;
        ctx.signature(sig);
        ctx.flag('impure');
        if (t.origin === 'stdlib') {
            ctx.context('stdlib');
        }
        ctx.body(() => {
            // Unpack args
            for (let a of init.args) {
                if (!resolveFuncPrimitive(a.type, ctx)) {
                    ctx.append(`var (${resolveFuncTypeUnpack(a.type, id(a.name), ctx)}) = ${id(a.name)};`);
                }
            }

            // Generate self initial tensor
            let initValues: string[] = [];
            for (let i = 0; i < t.fields.length; i++) {
                let init = 'null()';
                if (t.fields[i].default !== undefined) {
                    init = writeValue(t.fields[i].default!, ctx);
                }
                initValues.push(init);
            }
            if (initValues.length > 0) { // Special case for empty contracts
                ctx.append(`var (${resolveFuncTypeUnpack(t, id('self'), ctx)}) = (${initValues.join(', ')});`);
            } else {
                ctx.append(`tuple ${id('self')} = null();`);
            }

            // Generate statements
            let returns = resolveFuncTypeUnpack(t, id('self'), ctx);
            for (let s of init.ast.statements) {
                writeStatement(s, returns, null, ctx);
            }

            // Return result
            if (init.ast.statements.length === 0 || init.ast.statements[init.ast.statements.length - 1].kind !== 'statement_return') {
                ctx.append(`return ${returns};`);
            }
        });
    });

    ctx.fun(`__gen_${t.name}_init_child`, () => {
        const args = [`cell sys'`, ...init.args.map((v) => resolveFuncType(v.type, ctx) + ' ' + id(v.name))];
        const sig = `(cell, cell) ${fn(`__gen_${t.name}_init_child`)}(${args.join(', ')})`;
        ctx.signature(sig);
        if (enabledInline(ctx.ctx)) {
            ctx.flag('inline');
        }
        ctx.body(() => {
            ctx.write(`
                slice sc' = sys'.begin_parse();
                cell source = sc'~load_dict();
                cell contracts = new_dict();

                ;; Contract Code: ${t.name}
                cell mine = ${ctx.used(`__tact_dict_get_code`)}(source, ${t.uid});
                contracts = ${ctx.used(`__tact_dict_set_code`)}(contracts, ${t.uid}, mine);
            `);

            // Copy contracts code
            for (let c of t.dependsOn) {
                ctx.append();
                ctx.write(`
                ;; Contract Code: ${c.name}
                cell code_${c.uid} = __tact_dict_get_code(source, ${c.uid});
                contracts = ${ctx.used(`__tact_dict_set_code`)}(contracts, ${c.uid}, code_${c.uid});
            `);
            }

            // Build cell
            ctx.append();
            ctx.append(`;; Build cell`);
            ctx.append(`builder b = begin_cell();`);
            ctx.append(`b = b.store_ref(begin_cell().store_dict(contracts).end_cell());`);
            ctx.append(`b = b.store_int(false, 1);`);
            let args = t.init!.args.length > 0 ? ['b', '(' + t.init!.args.map((a) => id(a.name)).join(', ') + ')'].join(', ') : 'b, null()';
            ctx.append(`b = ${ops.writer(`$init$${t.name}`, ctx)}(${args});`);
            ctx.append(`return (mine, b.end_cell());`);
        });
    });
}

export function writeMainContract(type: TypeDescription, abiLink: string, ctx: WriterContext) {

    // Main field
    ctx.main(() => {

        // Comments
        ctx.append(`;;`);
        ctx.append(`;; Public Interface of a Contract ${type.name}`);
        ctx.append(`;;`);
        ctx.append(``);

        // Write router
        writeRouter(type, ctx);

        // Render body
        ctx.append(``)
        ctx.append(`() recv_internal(int msg_value, cell in_msg_cell, slice in_msg) impure {`);
        ctx.inIndent(() => {

            // Load context
            ctx.append();
            ctx.append(`;; Context`);
            ctx.append(`var cs = in_msg_cell.begin_parse();`);
            ctx.append(`var msg_flags = cs~load_uint(4);`); // int_msg_info$0 ihr_disabled:Bool bounce:Bool bounced:Bool
            ctx.append(`var msg_bounced = ((msg_flags & 1) == 1 ? true : false);`);
            ctx.append(`slice msg_sender_addr = ${ctx.used('__tact_verify_address')}(cs~load_msg_addr());`);
            ctx.append(`__tact_context = (msg_bounced, msg_sender_addr, msg_value, cs);`);
            ctx.append(`__tact_context_sender = msg_sender_addr;`);
            ctx.append();

            // Load self
            ctx.append(`;; Load contract data`);
            ctx.used(`__gen_load_${type.name}`);
            ctx.append(`var self = __gen_load_${type.name}();`);
            ctx.append();

            // Process operation
            ctx.append(`;; Handle operation`);
            ctx.append(`int handled = self~__gen_router_${type.name}(msg_bounced, in_msg);`);
            ctx.append();

            // Throw if not handled
            ctx.append(`;; Throw if not handled`);
            ctx.append(`throw_unless(handled, ${contractErrors.invalidMessage.id});`);
            ctx.append();

            // Persist state
            ctx.append(`;; Persist state`);
            ctx.used(`__gen_store_${type.name}`);
            ctx.append(`__gen_store_${type.name}(self);`);
        });
        ctx.append('}');
        ctx.append();

        // Getters
        for (let f of type.functions.values()) {
            if (f.isGetter) {
                writeGetter(f, ctx)
            }
        }

        // Interfaces
        writeInterfaces(type, ctx);

        // ABI
        ctx.append(`_ get_abi_ipfs() {`);
        ctx.inIndent(() => {
            ctx.append(`return "${abiLink}";`);
        });
        ctx.append(`}`);
        ctx.append();

        // Deployed
        ctx.append(`_ lazy_deployment_completed() {`);
        ctx.inIndent(() => {
            ctx.append(`return get_data().begin_parse().load_int(1);`);
        });
        ctx.append(`}`);
        ctx.append();
    });
}