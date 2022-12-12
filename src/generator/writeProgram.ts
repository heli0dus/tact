import { ContractABI } from "../abi/ContractABI";
import { CompilerContext } from "../context";
import { getAllocation, getAllocations } from "../storage/resolveAllocation";
import { getAllStaticFunctions, getAllTypes } from "../types/resolveDescriptors";
import { TypeDescription } from "../types/types";
import { WriterContext } from "./Writer";
import { resolveFuncType } from "./writers/resolveFuncType";
import { writeParser, writeSerializer, writeStorageOps } from "./writers/writeSerialization";
import { writeStdlib } from "./writers/writeStdlib";
import { resolveFuncTensor, tensorToString } from "./writers/resolveFuncTensor";
import { writeAccessors } from "./writers/writeAccessors";
import { beginCell } from "ton";
import { writeFunction, writeGetter, writeInit, writeReceiver } from "./writers/writeFunction";

function writeMainEmpty(ctx: WriterContext) {
    ctx.fun('$main', () => {
        ctx.append(`() recv_internal(cell in_msg_cell, slice in_msg) impure {`);
        ctx.inIndent(() => {
            ctx.append(`throw(100);`);
        });
        ctx.append(`}`);
    });
}

function writeMainContract(type: TypeDescription, ctx: WriterContext) {

    // Main field
    ctx.fun('$main', () => {

        // Render body
        ctx.append(``)
        ctx.append(`() recv_internal(int msg_value, cell in_msg_cell, slice in_msg) impure {`);
        ctx.inIndent(() => {

            // Require context function
            ctx.used('__tact_context');

            // Load operation
            ctx.append();
            ctx.append(`;; Parse incoming message`);
            ctx.append(`int op = 0;`);
            ctx.append(`if (slice_bits(in_msg) >= 32) {`);
            ctx.inIndent(() => {
                ctx.append(`op = in_msg.preload_uint(32);`);
            });
            ctx.append(`}`);
            ctx.append(`var cs = in_msg_cell.begin_parse();`);
            ctx.append(`var msg_flags = cs~load_uint(4);`); // int_msg_info$0 ihr_disabled:Bool bounce:Bool bounced:Bool
            ctx.append(`var msg_bounced = ((msg_flags & 1) == 1 ? true : false);`);
            ctx.append(`slice msg_sender_addr = cs~load_msg_addr();`);
            ctx.append(`__tact_context = (msg_bounced, msg_sender_addr, msg_value);`);
            ctx.append();

            // Handle bounced
            ctx.append(`;; Handle bounced messages`);
            ctx.append(`if (msg_bounced) {`);
            ctx.inIndent(() => {
                let bouncedHandler = type.receivers.find(f => f.selector.kind === 'internal-bounce');
                if (bouncedHandler) {

                    // Resolve tensors
                    let selfTensor = resolveFuncTensor(type.fields, ctx, `self'`);

                    // Load storage
                    ctx.used(`__gen_load_${type.name}`);
                    ctx.append(`var (${tensorToString(selfTensor, 'full').join(', ')}) = __gen_load_${type.name}();`);

                    // Execute function
                    ctx.used(`__gen_${type.name}_receive_bounced`);
                    ctx.append(`(${tensorToString(selfTensor, 'names').join(', ')})~__gen_${type.name}_receive_bounced(in_msg);`);

                    // Persist
                    ctx.used(`__gen_store_${type.name}`);
                    ctx.append(`__gen_store_${type.name}(${tensorToString(selfTensor, 'names').join(', ')});`);
                    ctx.append(`return ();`);
                } else {
                    ctx.append(`return ();`);
                }
            });
            ctx.append(`}`);

            // Non-empty receivers
            for (const f of type.receivers) {
                const selector = f.selector;

                // Generic receiver
                if (selector.kind === 'internal-binary') {
                    let allocation = getAllocation(ctx.ctx, selector.type);
                    if (!allocation.prefix) {
                        throw Error('Invalid allocation');
                    }
                    ctx.append();
                    ctx.append(`;; Receive ${selector.type} message`);
                    ctx.append(`if (op == ${allocation.prefix}) {`);
                    ctx.inIndent(() => {

                        // Resolve tensors
                        let selfTensor = resolveFuncTensor(type.fields, ctx, `self'`);
                        let msgTensor = resolveFuncTensor(allocation.fields, ctx, `msg'`);

                        // Load storage
                        ctx.used(`__gen_load_${type.name}`);
                        ctx.append(`var (${tensorToString(selfTensor, 'full').join(', ')}) = __gen_load_${type.name}();`);

                        // Read message
                        ctx.used(`__gen_read_${selector.type}`);
                        ctx.append(`var (${tensorToString(msgTensor, 'full').join(', ')}) = in_msg~__gen_read_${selector.type}();`);

                        // Execute function
                        ctx.used(`__gen_${type.name}_receive_${selector.type}`);
                        ctx.append(`(${tensorToString(selfTensor, 'names').join(', ')})~__gen_${type.name}_receive_${selector.type}(${tensorToString(msgTensor, 'names').join(', ')});`);

                        // Persist
                        ctx.used(`__gen_store_${type.name}`);
                        ctx.append(`__gen_store_${type.name}(${tensorToString(selfTensor, 'names').join(', ')});`);

                        // Exit
                        ctx.append(`return ();`);
                    })
                    ctx.append(`}`);
                }

                if (selector.kind === 'internal-empty') {
                    ctx.append();
                    ctx.append(`;; Receive empty message`);
                    ctx.append(`if ((op == 0) & (slice_bits(in_msg) <= 32)) {`);
                    ctx.inIndent(() => {

                        // Resolve tensors
                        let selfTensor = resolveFuncTensor(type.fields, ctx, `self'`);

                        // Load storage
                        ctx.used(`__gen_load_${type.name}`);
                        ctx.append(`var (${tensorToString(selfTensor, 'full').join(', ')}) = __gen_load_${type.name}();`);

                        // Execute function
                        ctx.used(`__gen_${type.name}_receive`);
                        ctx.append(`(${tensorToString(selfTensor, 'names').join(', ')})~__gen_${type.name}_receive();`);

                        // Persist
                        ctx.used(`__gen_store_${type.name}`);
                        ctx.append(`__gen_store_${type.name}(${tensorToString(selfTensor, 'names').join(', ')});`);

                        // Exit
                        ctx.append(`return ();`);
                    })
                    ctx.append(`}`);
                }
            }

            // Text resolvers
            let hasComments = !!type.receivers.find((v) => v.selector.kind === 'internal-comment');
            if (hasComments) {
                ctx.append();
                ctx.append(`;; Text Receivers`);
                ctx.append(`if (op == 0) {`);
                ctx.inIndent(() => {
                    ctx.append(`var text_op = slice_hash(in_msg);`);
                    for (const r of type.receivers) {
                        const selector = r.selector;
                        if (selector.kind === 'internal-comment') {
                            let hash = beginCell()
                                .storeUint(0, 32)
                                .storeBuffer(Buffer.from(selector.comment, 'utf8'))
                                .endCell()
                                .hash()
                                .toString('hex', 0, 64);
                            ctx.append();
                            ctx.append(`;; Receive "${selector.comment}" message`);
                            ctx.append(`if (text_op == 0x${hash}) {`);
                            ctx.inIndent(() => {

                                // Resolve tensors
                                let selfTensor = resolveFuncTensor(type.fields, ctx, `self'`);

                                // Load storage
                                ctx.used(`__gen_load_${type.name}`);
                                ctx.append(`var (${tensorToString(selfTensor, 'full').join(', ')}) = __gen_load_${type.name}();`);

                                // Execute function
                                ctx.used(`__gen_${type.name}_receive_comment_${hash}`);
                                ctx.append(`(${tensorToString(selfTensor, 'names').join(', ')})~__gen_${type.name}_receive_comment_${hash}();`);

                                // Persist
                                ctx.used(`__gen_store_${type.name}`);
                                ctx.append(`__gen_store_${type.name}(${tensorToString(selfTensor, 'names').join(', ')});`);

                                // Exit
                                ctx.append(`return ();`);
                            })
                            ctx.append(`}`);
                        }
                    }
                });
                ctx.append(`}`);
            }

            // Fallback
            let fallbackReceiver = type.receivers.find((v) => v.selector.kind === 'internal-fallback');
            if (fallbackReceiver) {

                ctx.append();
                ctx.append(`;; Receiver fallback`);
                // Resolve tensors
                let selfTensor = resolveFuncTensor(type.fields, ctx, `self'`);

                // Load storage
                ctx.used(`__gen_load_${type.name}`);
                ctx.append(`var (${tensorToString(selfTensor, 'full').join(', ')}) = __gen_load_${type.name}();`);

                // Execute function
                ctx.used(`__gen_${type.name}_receive_fallback`);
                ctx.append(`(${tensorToString(selfTensor, 'names').join(', ')})~__gen_${type.name}_receive_fallback(in_msg);`);

                // Persist
                ctx.used(`__gen_store_${type.name}`);
                ctx.append(`__gen_store_${type.name}(${tensorToString(selfTensor, 'names').join(', ')});`);

            } else {
                ctx.append();
                ctx.append(`throw(100);`);
            }
        });
        ctx.append('}');

        // Init method
        if (type.init) {
            ctx.append();
            ctx.append(`cell init_${type.name}(${[`cell sys'`, ...type.init.args.map((a) => resolveFuncType(a.type, ctx) + ' ' + a.name)].join(', ')}) method_id {`);
            ctx.inIndent(() => {
                ctx.used(`__gen_${type.name}_init`);
                ctx.append(`return __gen_${type.name}_init(${[`sys'`, ...type.init!.args.map((a) => a.name)].join(', ')});`);
            });
            ctx.append(`}`);
        }

        // Implicit dependencies
        for (let f of Object.values(type.functions)) {
            if (f.isGetter) {
                ctx.used(`__gen_get_${f.name}`);
            }
        }
    });
}

export function writeProgram(ctx: CompilerContext, abi: ContractABI, name: string | null, debug: boolean = false) {
    const wctx = new WriterContext(ctx);
    let allTypes = Object.values(getAllTypes(ctx));
    let contracts = allTypes.filter((v) => v.kind === 'contract');

    // Stdlib
    writeStdlib(wctx);

    // Serializators
    let allocations = getAllocations(ctx);
    for (let k of allocations) {
        writeSerializer(k.type.name, k.allocation, wctx);
        writeParser(k.type.name, k.allocation, wctx);
    }

    // Accessors
    for (let t of allTypes) {
        if (t.kind === 'contract' || t.kind === 'struct') {
            writeAccessors(t, wctx);
        }
    }

    // Storage Functions
    for (let k of allocations) {
        if (k.type.kind === 'contract') {
            writeStorageOps(k.type, wctx);
        }
    }

    // Static functions
    let sf = getAllStaticFunctions(ctx);
    for (let k in sf) {
        let f = sf[k];
        writeFunction(f, wctx);
    }

    // Extensions
    for (let c of allTypes) {
        if (c.kind !== 'contract') { // We are rendering contract functions separately
            for (let f of Object.values(c.functions)) {
                writeFunction(f, wctx);
            }
        }
    }

    // Contract functions
    for (let c of contracts) {

        // Init
        if (c.init) {
            writeInit(c, c.init, wctx);
        }

        // Functions
        for (let f of Object.values(c.functions)) {
            writeFunction(f, wctx);

            // Render only needed getter
            if (!name || c.name === name) {
                if (f.isGetter) {
                    writeGetter(f, wctx);
                }
            }
        }

        // Receivers
        for (let r of Object.values(c.receivers)) {
            writeReceiver(c, r, wctx);
        }
    }

    // Find contract
    if (name) {
        let c = contracts.find((v) => v.name === name);
        if (!c) {
            throw Error(`Contract ${name} not found`);
        }
        writeMainContract(c, wctx);
    } else {

        // Contract
        if (contracts.length > 1) {
            throw Error('Too many contracts');
        }

        // Empty contract
        if (contracts.length === 0) {
            writeMainEmpty(wctx);
        }

        // Entry Point
        if (contracts.length === 1) {
            writeMainContract(contracts[0], wctx);
        }
    }

    // Render output
    return wctx.render(debug);
}