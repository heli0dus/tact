import { getType } from "../../types/resolveDescriptors";
import { TypeDescription, TypeRef } from "../../types/types";
import { WriterContext } from "../Writer";

export function resolveFuncType(descriptor: TypeRef | TypeDescription, ctx: WriterContext): string {

    // TypeRef
    if (descriptor.kind === 'ref') {
        return resolveFuncType(getType(ctx.ctx, descriptor.name), ctx);
    }
    if (descriptor.kind === 'map') {
        return 'cell';
    }
    if (descriptor.kind === 'void') {
        return '()';
    }

    // TypeDescription
    if (descriptor.kind === 'primitive') {
        if (descriptor.name === 'Int') {
            return 'int';
        } else if (descriptor.name === 'Bool') {
            return 'int';
        } else if (descriptor.name === 'Slice') {
            return 'slice';
        } else if (descriptor.name === 'Cell') {
            return 'cell';
        } else if (descriptor.name === 'Builder') {
            return 'builder';
        } else if (descriptor.name === 'Address') {
            return 'slice';
        } else {
            throw Error('Unknown primitive type: ' + descriptor.name);
        }
    } else if (descriptor.kind === 'struct') {
        return '(' + descriptor.fields.map((v) => resolveFuncType(v.type, ctx)).join(', ') + ')';
    } else if (descriptor.kind === 'contract') {
        return '(' + descriptor.fields.map((v) => resolveFuncType(v.type, ctx)).join(', ') + ')';
    }

    // Unreachable
    throw Error('Unknown type: ' + descriptor.kind);
}