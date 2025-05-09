"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.__test = exports.generateSchemaTSDeclarationFiles = void 0;
var fs_1 = require("fs");
var lodash_1 = require("lodash");
var helper_string_1 = require("@guanghechen/helper-string");
var node_os_1 = require("node:os");
var utils_1 = require("../../utils");
var types_1 = require("./types");
var formatName = function (name, nested) {
    if (nested === void 0) { nested = false; }
    if (nested)
        return name.includes('-') ? "'".concat(name, "'") : name;
    return (0, helper_string_1.toPascalCase)(name);
};
var ws = (0, lodash_1.memoize)(function (depth) {
    if (depth === void 0) { depth = 1; }
    return depth < 0 ? '' : new Array(depth).fill('  ').join('');
});
var end = (0, lodash_1.memoize)(function (nested) { return !nested || nested === 'object' ? ';' : ''; });
var wrapParens = function (v) {
    return v.includes('| ') || v.includes('& ')
        ? "(".concat(v, ")")
        : v;
};
var printComment = function (comment, depth, deprecated) {
    if (comment === void 0) { comment = ''; }
    if (depth === void 0) { depth = 0; }
    if (deprecated === void 0) { deprecated = false; }
    if (!comment && !deprecated)
        return '';
    if (!comment && deprecated) {
        return "".concat(ws(depth), "/**").concat(node_os_1.EOL).concat(ws(depth), " * @deprecated").concat(node_os_1.EOL).concat(ws(depth), " */").concat(node_os_1.EOL);
    }
    var nl = comment.includes(node_os_1.EOL) ? node_os_1.EOL : '\n';
    return __spreadArray(__spreadArray([
        "".concat(ws(depth), "/**").concat(deprecated ? "".concat(node_os_1.EOL).concat(ws(depth), " * @deprecated") : '')
    ], comment.split(nl).map(function (line) { return "".concat(ws(depth), " * ").concat(line); }), true), [
        "".concat(ws(depth), " */").concat(node_os_1.EOL),
    ], false).join(node_os_1.EOL);
};
var printTypeName = function (title, key, nested, optional) {
    if (optional === void 0) { optional = false; }
    if (!nested) {
        return "type ".concat(formatName(title || key), " = ");
    }
    if (nested === 'object') {
        return "".concat(formatName(key, true)).concat(optional ? '?' : '', ": ");
    }
    // Don't print the name when nested within arrays or enums
    return '';
};
var printEnumSchema = function (schema, key, depth, nested, optional) {
    if (optional === void 0) { optional = false; }
    var values = schema.enum || [];
    if (values.length === 1) {
        return printConstSchema(__assign(__assign({}, schema), { const: values[0] }), key, depth, nested, optional);
    }
    if (schema.nullable && !values.includes(null))
        values.unshift(null);
    return "".concat(printComment(schema.description, depth, schema.deprecated)).concat(ws(depth)).concat(printTypeName(schema.title, key, nested, optional)).concat(values.map(function (v) { return "".concat(node_os_1.EOL).concat(ws(depth + 1), "| ").concat(typeof v === 'string' ? "'".concat(v, "'") : v); }).join('')).concat(end(nested));
};
var printStringSchema = function (schema, key, depth, nested, optional) {
    if (optional === void 0) { optional = false; }
    return "".concat(printComment(schema.description, depth, schema.deprecated)).concat(ws(depth)).concat(printTypeName(schema.title, key, nested, optional)).concat(schema.nullable ? 'null | ' : '', "string").concat(end(nested));
};
var printNumberSchema = function (schema, key, depth, nested, optional) {
    if (optional === void 0) { optional = false; }
    return "".concat(printComment(schema.description, depth, schema.deprecated)).concat(ws(depth)).concat(printTypeName(schema.title, key, nested, optional)).concat(schema.nullable ? 'null | ' : '', "number").concat(end(nested));
};
var printBooleanSchema = function (schema, key, depth, nested, optional) {
    if (optional === void 0) { optional = false; }
    return "".concat(printComment(schema.description, depth, schema.deprecated)).concat(ws(depth)).concat(printTypeName(schema.title, key, nested, optional)).concat(schema.nullable ? 'null | ' : '', "boolean").concat(end(nested));
};
var printNullSchema = function (schema, key, depth, nested, optional) {
    if (optional === void 0) { optional = false; }
    return "".concat(printComment(schema.description, depth, schema.deprecated)).concat(ws(depth)).concat(printTypeName(schema.title, key, nested, optional), "null").concat(end(nested));
};
var printObjectSchema = function (schema, key, depth, nested, optional) {
    if (optional === void 0) { optional = false; }
    var result = "".concat(printComment(schema.description, depth, schema.deprecated)).concat(ws(depth)).concat(printTypeName(schema.title, key, nested, optional), "{");
    if (schema.properties || schema.patternProperties || schema.additionalProperties) {
        if (schema.properties) {
            Object.entries(schema.properties).forEach(function (_a) {
                var _b;
                var k = _a[0], v = _a[1];
                result = "".concat(result).concat(node_os_1.EOL).concat(printSchemaAsType(v, k, depth + 1, 'object', !((_b = schema.required) === null || _b === void 0 ? void 0 : _b.includes(k))));
            });
        }
        if (schema.patternProperties) {
            // If single pattern property or many with same type then printSchemaAsType with key: `[k: string]`
            // If multiple types then printSchemaAsType with key: `[k: string]` and union type for value
            var subschemas = Array.from(Object.values(schema.patternProperties));
            var types = new Set(subschemas.map(function (s) { return JSON.stringify(s); }));
            var subschema = void 0;
            if (typeof schema.additionalProperties === 'object') {
                subschema = { anyOf: subschemas.concat(schema.additionalProperties) };
            }
            else if (types.size === 1) {
                subschema = JSON.parse(Array.from(types.values())[0]);
            }
            else {
                subschema = { anyOf: subschemas };
            }
            result = "".concat(result).concat(node_os_1.EOL).concat(printSchemaAsType(subschema, '[k: string]', depth + 1, 'object'));
        }
        else if (schema.additionalProperties) {
            if (typeof schema.additionalProperties === 'object') {
                result = "".concat(result).concat(node_os_1.EOL).concat(printSchemaAsType(schema.additionalProperties, '[k: string]', depth + 1, 'object'));
            }
            else {
                result = "".concat(result).concat(node_os_1.EOL).concat(ws(depth + 1), "[k: string]: unknown;");
            }
        }
        result = "".concat(result).concat(node_os_1.EOL).concat(ws(depth), "}").concat(end(nested));
    }
    else {
        result = "".concat(result, "}").concat(end(nested));
    }
    return result;
};
var printTupleSchema = function (schema, key, depth, nested, optional) {
    if (optional === void 0) { optional = false; }
    if (!Array.isArray(schema.items))
        throw new Error('schema.items should be an array to use this function');
    var result = "".concat(printComment(schema.description, depth, schema.deprecated)).concat(ws(depth)).concat(printTypeName(schema.title, key, nested, optional));
    if (!schema.items.length) {
        result = "".concat(result, "void[]").concat(end(nested));
    }
    else {
        // tuple type
        result = "".concat(result, "[").concat(node_os_1.EOL).concat(schema.items.map(function (item) { return printSchemaAsType(item, '', depth + 1, 'array'); }).join(",".concat(node_os_1.EOL)));
        if (schema.additionalItems) {
            if (typeof schema.additionalItems === 'object') {
                var child = printSchemaAsType(schema.additionalItems, '', depth + 1, 'array').trim();
                if (child.includes(node_os_1.EOL)) {
                    result = "".concat(result, ",").concat(node_os_1.EOL).concat(ws(depth + 1), "...Array<").concat(child, ">");
                }
                else {
                    result = "".concat(result, ",").concat(node_os_1.EOL).concat(ws(depth + 1), "...").concat(child, "[]");
                }
            }
            else {
                result = "".concat(result, ",").concat(node_os_1.EOL).concat(ws(depth + 1), "...unknown[]");
            }
        }
        result = "".concat(result).concat(node_os_1.EOL).concat(ws(depth), "]").concat(end(nested));
    }
    return result;
};
var printArraySchema = function (schema, key, depth, nested, optional) {
    if (optional === void 0) { optional = false; }
    if (Array.isArray(schema.items))
        return printTupleSchema(schema, key, depth, nested, optional);
    var result = "".concat(printComment(schema.description, depth, schema.deprecated)).concat(ws(depth)).concat(printTypeName(schema.title, key, nested, optional));
    if (schema.items) {
        var child = printSchemaAsType(schema.items, '', depth + 1, 'array');
        if (child.includes(node_os_1.EOL)) {
            result = "".concat(result, "Array<").concat(node_os_1.EOL).concat(child).concat(node_os_1.EOL).concat(ws(depth), ">").concat(end(nested));
        }
        else {
            result = "".concat(result).concat(child.trim(), "[]").concat(end(nested));
        }
    }
    else {
        result = "".concat(result, "unknown[]").concat(end(nested));
    }
    return result;
};
var printMultiTypeSchema = function (schema, key, depth, nested, optional) {
    if (optional === void 0) { optional = false; }
    if (!Array.isArray(schema.type) || !schema.type.length)
        throw new Error('schema.type should be a non-empty array to use this function');
    return "".concat(printComment(schema.description, depth, schema.deprecated)).concat(ws(depth)).concat(printTypeName(schema.title, key, nested, optional)).concat(schema.type.join(' | ')).concat(end(nested));
};
var printIntersectionSchema = function (schema, key, depth, nested, optional) {
    if (optional === void 0) { optional = false; }
    if (!Array.isArray(schema.allOf) || !schema.allOf.length)
        throw new Error('schema.allOf should be a non-empty array to use this function');
    if (schema.allOf.length === 1) {
        // no need to print as an intersection type since only one value
        return printSchemaAsType(__assign(__assign(__assign({}, schema), schema.allOf[0]), { allOf: undefined }), key, depth, nested, optional);
    }
    var subtypes = schema.allOf
        .map(function (s) { return printSchemaAsType(s, '', depth, 'intersection'); })
        // wrap subschemas in parens if needed
        .map(function (v) { return wrapParens(v.trim()); })
        .join(' & ');
    if (schema.nullable) {
        subtypes = "null | (".concat(subtypes, ")");
    }
    return "".concat(printComment(schema.description, depth, schema.deprecated)).concat(ws(depth)).concat(printTypeName(schema.title, key, nested, optional)).concat(subtypes).concat(end(nested));
};
var printUnionSchema = function (schema, key, depth, nested, optional) {
    if (optional === void 0) { optional = false; }
    if (!Array.isArray(schema.anyOf) || !schema.anyOf.length)
        throw new Error('schema.anyOf should be a non-empty array to use this function');
    if (schema.anyOf.length === 1) {
        // no need to print as a union type since only one value
        return printSchemaAsType(__assign(__assign(__assign({}, schema), schema.anyOf[0]), { anyOf: undefined }), key, depth, nested, optional);
    }
    var subtypes = schema.anyOf
        .map(function (s) { return printSchemaAsType(s, '', depth + 1, 'union'); })
        .map(function (v, i) { return "".concat(node_os_1.EOL).concat(ws(depth + 1)).concat(i || !nested || nested === 'object' ? '| ' : '').concat(wrapParens(v.trim())); })
        .join('');
    return "".concat(printComment(schema.description, depth, schema.deprecated)).concat(ws(depth)).concat(printTypeName(schema.title, key, nested, optional)).concat(schema.nullable ? "".concat(node_os_1.EOL).concat(ws(depth + 1), "| null") : '').concat(subtypes).concat(end(nested));
};
var printPolyRefSchema = function (schema, key, depth, nested, optional) {
    if (optional === void 0) { optional = false; }
    return "".concat(printComment(schema.description, depth, schema.deprecated)).concat(ws(depth)).concat(printTypeName(schema.title, key, nested, optional)).concat(schema['x-poly-ref'].publicNamespace ? "".concat(schema['x-poly-ref'].publicNamespace, ".") : '').concat(schema['x-poly-ref'].path.split('.').map(function (v) { return formatName(v); }).join('.')).concat(end(nested));
};
var printAnySchema = function (schema, key, depth, nested, optional) {
    if (optional === void 0) { optional = false; }
    return "".concat(printComment(schema.description, depth, schema.deprecated)).concat(ws(depth)).concat(printTypeName(schema.title, key, nested, optional), "unknown").concat(end(nested));
};
var printUnresolvedSchema = function (schema, key, depth, nested, optional) {
    if (optional === void 0) { optional = false; }
    return "".concat(printComment(schema.description, depth, schema.deprecated)).concat(ws(depth)).concat(printTypeName(schema.title, key, nested, optional), "unknown /* Unresolved type */").concat(end(nested));
};
var printConstSchema = function (schema, key, depth, nested, optional) {
    if (optional === void 0) { optional = false; }
    return "".concat(printComment(schema.description, depth, schema.deprecated)).concat(ws(depth)).concat(printTypeName(schema.title, key, nested, optional)).concat(schema.nullable && schema.const !== null ? 'null | ' : '').concat(typeof schema.const === 'string' ? "'".concat(schema.const, "'") : schema.const).concat(end(nested));
};
var printSchemaAsType = function (schema, key, depth, nested, optional) {
    if (depth === void 0) { depth = 0; }
    if (optional === void 0) { optional = false; }
    if (schema['x-poly-ref'])
        return printPolyRefSchema(schema, key, depth, nested, optional);
    if (schema.const !== undefined)
        return printConstSchema(schema, key, depth, nested, optional);
    if (Array.isArray(schema.enum) && schema.enum.length)
        return printEnumSchema(schema, key, depth, nested, optional);
    if (Array.isArray(schema.type) && schema.type.length)
        return printMultiTypeSchema(schema, key, depth, nested, optional);
    if (Array.isArray(schema.anyOf) && schema.anyOf.length)
        return printUnionSchema(schema, key, depth, nested, optional);
    if (Array.isArray(schema.allOf) && schema.allOf.length)
        return printIntersectionSchema(schema, key, depth, nested, optional);
    switch (schema.type) {
        case 'object': return printObjectSchema(schema, key, depth, nested, optional);
        case 'array': return printArraySchema(schema, key, depth, nested, optional);
        case 'string': return printStringSchema(schema, key, depth, nested, optional);
        case 'integer':
        case 'number':
            return printNumberSchema(schema, key, depth, nested, optional);
        case 'boolean': return printBooleanSchema(schema, key, depth, nested, optional);
        case 'null': return printNullSchema(schema, key, depth, nested, optional);
        case 'unresolved': return printUnresolvedSchema(schema, key, depth, nested, optional);
    }
    return printAnySchema(schema, key, depth, nested, optional);
};
var printSchemaTreeAsTypes = function (schema, name, depth) {
    if (depth === void 0) { depth = 0; }
    var result = "".concat(ws(depth), "namespace ").concat(formatName(name, false), " {");
    for (var _i = 0, _a = Object.entries(schema); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], child = _b[1];
        // null/undefined child is placeholder type so that we can generate namespaces with nothing inside them
        if (!child)
            continue;
        var generated = '';
        if ('type' in child && child.type === 'schema') {
            try {
                generated = printSchemaAsType(child.definition, (child.name || key), depth + 1);
            }
            catch (err) {
                console.error(err);
                (0, utils_1.echoGenerationError)(child);
                (0, types_1.setGenerationErrors)(true);
            }
        }
        else {
            generated = printSchemaTreeAsTypes(child, key, depth + 1);
        }
        result = "".concat(result).concat(node_os_1.EOL).concat(generated);
    }
    result = "".concat(result).concat(node_os_1.EOL).concat(ws(depth), "}");
    return result;
};
var normalizeSchema = function (schema) {
    var _a;
    if (schema.type === 'schema') {
        schema.definition.title = schema.name;
        schema.definition.description = schema.definition.description || schema.description;
        schema.definition = normalizeSchema(schema.definition);
        return schema;
    }
    if (Array.isArray(schema.oneOf)) {
        // Treat oneOf as equivalent to anyOf
        schema.anyOf = schema.oneOf;
        schema.oneOf = undefined;
    }
    if (schema.discriminator) {
        // TODO: Need to fix backend code to handle discriminators more effectively
        var _b = schema.discriminator, propertyName = _b.propertyName, mapping = _b.mapping;
        var property = (_a = schema.properties) === null || _a === void 0 ? void 0 : _a[propertyName];
        if (property && !property.enum) {
            property.enum = Object.keys(mapping);
        }
    }
    if (Array.isArray(schema.anyOf)) {
        schema.anyOf = schema.anyOf.map(function (s) { return normalizeSchema(s); });
    }
    if (Array.isArray(schema.allOf)) {
        schema.allOf = schema.allOf.map(function (s) { return normalizeSchema(s); });
    }
    if (schema.type === 'object' || (Array.isArray(schema.type) && schema.type.includes('object'))) {
        if (schema.additionalProperties == null) {
            schema.additionalProperties = {};
        }
        if (!Array.isArray(schema.required)) {
            schema.required = [];
        }
    }
    else if (schema.type === 'array' || (Array.isArray(schema.type) && schema.type.includes('array'))) {
        if (schema.items && !Array.isArray(schema.items) && schema.additionalItems) {
            // Convert schema.items to tuple type
            schema.items = [schema.items];
        }
        if (!schema.items) {
            schema.items = {};
        }
        if (schema.additionalItems === true) {
            schema.additionalItems = {};
        }
    }
    if (Array.isArray(schema.enum) && schema.enum.length === 1) {
        schema.const = schema.enum[0];
        schema.enum = undefined;
    }
    return schema;
};
var getPolySchemaRefs = function (schema) {
    if (schema['x-poly-ref'])
        return [schema['x-poly-ref'].path];
    var toSearch = [];
    if (schema.schemas)
        toSearch = toSearch.concat(Object.values(schema.schemas));
    if (schema.properties)
        toSearch = toSearch.concat(Object.values(schema.properties));
    if (schema.patternProperties)
        toSearch = toSearch.concat(Object.values(schema.patternProperties));
    if (schema.items) {
        if (Array.isArray(schema.items)) {
            toSearch = toSearch.concat(schema.items);
        }
        else {
            toSearch.push(schema.items);
        }
    }
    if (typeof schema.additionalItems === 'object')
        toSearch.push(schema.items);
    if (typeof schema.additionalProperties === 'object')
        toSearch.push(schema.additionalProperties);
    if (Array.isArray(schema.allOf))
        toSearch = toSearch.concat(schema.allOf);
    if (Array.isArray(schema.anyOf))
        toSearch = toSearch.concat(schema.anyOf);
    return toSearch.flatMap(function (s) { return getPolySchemaRefs(s); });
};
var fillInUnresolvedSchemas = function (specs) {
    var _a;
    var schemas = new Map();
    for (var _i = 0, specs_1 = specs; _i < specs_1.length; _i++) {
        var spec = specs_1[_i];
        schemas.set(spec.contextName, spec);
        // If schema is unresolved then it doesn't exist in the database so we add a placeholder type
        if ((_a = spec.unresolvedPolySchemaRefs) === null || _a === void 0 ? void 0 : _a.length) {
            for (var _b = 0, _c = spec.unresolvedPolySchemaRefs; _b < _c.length; _b++) {
                var unresolved = _c[_b];
                if (schemas.has(unresolved.path))
                    continue;
                var parts = unresolved.path.split('.');
                var name_1 = parts.pop();
                var fillerSpec = {
                    id: '',
                    type: 'schema',
                    name: name_1,
                    context: parts.join('.'),
                    contextName: unresolved.path,
                    definition: { type: 'unresolved', title: name_1, description: "Unresolved schema, please add schema `".concat(unresolved.path, "` to complete it.") },
                    visibilityMetadata: {
                        // @ts-expect-error - it's fine
                        visibility: 'ENVIRONMENT',
                    },
                };
                schemas.set(unresolved.path, fillerSpec);
            }
        }
        // Look for any schema references which are missing (exist in the DB but some part of context was excluded in generation command)
        var refs = getPolySchemaRefs(spec.definition);
        for (var _d = 0, refs_1 = refs; _d < refs_1.length; _d++) {
            var contextName = refs_1[_d];
            if (schemas.has(contextName))
                continue;
            var parts = contextName.split('.');
            var name_2 = parts.pop();
            var context = parts.join('.');
            var fillerSpec = {
                id: '',
                type: 'schema',
                name: name_2,
                context: context,
                contextName: contextName,
                definition: { type: 'unresolved', title: name_2, description: "Missing schema, as context `".concat(context, "` was not generated.") },
                visibilityMetadata: {
                    // @ts-expect-error - it's fine
                    visibility: 'ENVIRONMENT',
                },
            };
            schemas.set(contextName, fillerSpec);
        }
    }
    return Array.from(schemas.values());
};
var printSchemaRoot = function (root) {
    // print the interfaces
    var result = "declare namespace schemas {".concat(node_os_1.EOL).concat(ws(1), "interface ").concat(root.interfaceName, " {").concat(Object.entries(root.interfaces).map(function (_a) {
        var k = _a[0], v = _a[1];
        return "".concat(node_os_1.EOL).concat(ws(2)).concat(k, ": ").concat(v, ";");
    }).join('')).concat(node_os_1.EOL).concat(ws(1), "}");
    // print the namespaces
    for (var _i = 0, _a = Object.entries(root.namespaces); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], tree = _b[1];
        var types = 'type' in tree && tree.type === 'schema'
            ? printSchemaAsType(tree, key, 1)
            : printSchemaTreeAsTypes(tree, (0, helper_string_1.toPascalCase)(key), 1);
        result = "".concat(result).concat(node_os_1.EOL).concat(types);
    }
    // close the module
    result = "".concat(result).concat(node_os_1.EOL, "}");
    return result;
};
var buildSchemaTree = function (specs) {
    var schemas = {
        default: {
            path: 'default',
            interfaceName: 'Schemas',
            interfaces: {},
            namespaces: {},
            hasTypes: false,
        },
    };
    for (var _i = 0, specs_2 = specs; _i < specs_2.length; _i++) {
        var spec = specs_2[_i];
        if (!spec.context) {
            schemas.default.interfaces[spec.name] = spec.name;
            schemas.default.namespaces[spec.name] = spec;
            schemas.default.hasTypes = true;
            continue;
        }
        var specInterfaceName = (0, helper_string_1.toPascalCase)(spec.context);
        var contextParts = spec.context.split('.');
        var last = contextParts.length - 1;
        for (var i = 0; i <= last; i++) {
            var name_3 = contextParts[i];
            var interfaceName = i === last ? specInterfaceName : (0, helper_string_1.toPascalCase)(contextParts[i]);
            var path = contextParts.slice(0, i + 1).join('.');
            var parent_1 = i ? contextParts.slice(0, i).join('.') : 'default';
            if (schemas[path])
                continue;
            schemas[path] = {
                path: path,
                interfaceName: interfaceName,
                interfaces: {},
                namespaces: {},
                hasTypes: false,
            };
            schemas[parent_1].interfaces[name_3] = interfaceName;
            (0, lodash_1.set)(schemas[parent_1].namespaces, path, {});
        }
        (0, lodash_1.set)(schemas[spec.context].namespaces, spec.contextName, spec);
        schemas[spec.context].interfaces[spec.name] = spec.contextName.split('.').map(function (v) { return (0, helper_string_1.toPascalCase)(v); }).join('.');
        schemas[spec.context].hasTypes = true;
    }
    return Array.from(Object.values(schemas));
};
var printSchemaSpecs = function (specs) {
    // first normalize the schemas and fill in unresolved ones
    var normalized = fillInUnresolvedSchemas(specs.map(function (schema) { return normalizeSchema(schema); }));
    // then build schema trees
    var trees = buildSchemaTree(normalized);
    // then print all the schema types as strings ready to be saved to disk
    var fileMap = Object.fromEntries(trees.map(function (tree) { return ["".concat(tree.path, ".d.ts"), printSchemaRoot(tree)]; }));
    fileMap['index.d.ts'] = Object.keys(fileMap).map(function (file) { return "/// <reference path=\"./".concat(file, "\" />"); }).join(node_os_1.EOL);
    return fileMap;
};
var generateSchemaTSDeclarationFiles = function (libPath, specs) { return __awaiter(void 0, void 0, void 0, function () {
    var files;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                files = printSchemaSpecs(specs);
                return [4 /*yield*/, Promise.all(Object.entries(files)
                        .map(function (_a) {
                        var file = _a[0], contents = _a[1];
                        return new Promise(function (resolve, reject) {
                            return fs_1.default.writeFile("".concat(libPath, "/schemas/").concat(file), contents, function (err) { return err ? reject(err) : resolve(); });
                        });
                    }))];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); };
exports.generateSchemaTSDeclarationFiles = generateSchemaTSDeclarationFiles;
exports.__test = {
    printComment: printComment,
    printSchemaAsType: printSchemaAsType,
    buildSchemaTree: buildSchemaTree,
    printSchemaSpecs: printSchemaSpecs,
};
