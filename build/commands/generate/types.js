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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
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
exports.generateVariablesTSDeclarationFile = exports.generateFunctionsTSDeclarationFile = exports.getGenerationErrors = exports.setGenerationErrors = void 0;
var fs_1 = require("fs");
var handlebars_1 = require("handlebars");
var helper_string_1 = require("@guanghechen/helper-string");
var json_schema_to_typescript_1 = require("json-schema-to-typescript");
var ts = require("typescript");
var utils_1 = require("@poly/common/utils");
var specs_1 = require("@poly/common/specs");
var utils_2 = require("../../utils");
var index_1 = require("@poly/common/json-schema/index");
var generationErrors = false;
var setGenerationErrors = function (value) {
    generationErrors = value;
};
exports.setGenerationErrors = setGenerationErrors;
var getGenerationErrors = function () { return generationErrors; };
exports.getGenerationErrors = getGenerationErrors;
var schemaToDeclarations = function (namespace, typeName, schema, value, options) {
    if (options === void 0) { options = {
        unknownAny: true,
    }; }
    return __awaiter(void 0, void 0, void 0, function () {
        var wrapToNamespace, appendPathUnionType, typeNameContextDelimiter, result, sourceFile, polySchemaTypeReferenceSet, polySchemaTypeReferenceList, polySchemaInterfaceDeclarationList, visitor, visitedPaths, getUnresolvedSchemaArg, getPolySchemaTypeParts, _loop_1, _i, polySchemaInterfaceDeclarationList_1, polySchemaInterfaceDeclaration, _a, polySchemaTypeReferenceList_1, polySchemaTypeReference, polySchemaTypeReferenceParts, resolvedStatus, isResolved, realPathParts;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    wrapToNamespace = function (code) { return "namespace ".concat(namespace, " {\n  ").concat(code, "\n}"); };
                    appendPathUnionType = function (code, value) {
                        if (Array.isArray(value) || (0, utils_1.isPlainObjectPredicate)(value)) {
                            var unionPath = (0, utils_2.getStringPaths)(value).map(function (value) { return "'".concat(value, "'"); });
                            // If the value is an empty array or object we naturally can't get any property paths
                            // So we fallback to an empty string as the type
                            var pathValue = unionPath.join(' | ') || '\'\'';
                            return "".concat(code, "\nexport type PathValue = ").concat(pathValue);
                        }
                        return code;
                    };
                    typeNameContextDelimiter = '$$$';
                    schema.title = typeName;
                    return [4 /*yield*/, (0, json_schema_to_typescript_1.compile)(schema, typeName, {
                            format: false,
                            bannerComment: '',
                            ignoreMinAndMaxItems: true,
                            unknownAny: options.unknownAny,
                            customName: function (innerSchema, keyNameFromDefinition) {
                                // eslint-disable-next-line @typescript-eslint/naming-convention
                                var ref = innerSchema['x-poly-ref'];
                                if (ref !== null && typeof ref === 'object' && !Array.isArray(ref)) {
                                    var schemaTypeNameParts = ['$PolySchema'];
                                    if (['Argument', 'ReturnType'].includes(innerSchema.title)) {
                                        schemaTypeNameParts.push("$".concat(innerSchema.title));
                                    }
                                    else {
                                        schemaTypeNameParts.push('___');
                                    }
                                    if (ref.publicNamespace) {
                                        schemaTypeNameParts.push('$Public');
                                    }
                                    else {
                                        schemaTypeNameParts.push('___');
                                    }
                                    if (ref['x-unresolved']) {
                                        schemaTypeNameParts.push('$Unresolved');
                                    }
                                    else {
                                        schemaTypeNameParts.push('$Resolved');
                                    }
                                    if (ref.publicNamespace) {
                                        schemaTypeNameParts.push.apply(schemaTypeNameParts, __spreadArray([ref.publicNamespace], ref.path.split('.'), false));
                                    }
                                    else {
                                        schemaTypeNameParts.push.apply(schemaTypeNameParts, ref.path.split('.'));
                                    }
                                    return schemaTypeNameParts.join(typeNameContextDelimiter);
                                }
                                return keyNameFromDefinition;
                            },
                        })];
                case 1:
                    result = _b.sent();
                    sourceFile = ts.createSourceFile('x.ts', result, ts.ScriptTarget.Latest);
                    polySchemaTypeReferenceSet = new Set();
                    polySchemaTypeReferenceList = [];
                    polySchemaInterfaceDeclarationList = [];
                    visitor = function (node) {
                        if (ts.isTypeReferenceNode(node)) {
                            var name_1 = node.getFullText(sourceFile).trim();
                            if (name_1.match(/^\$PolySchema\$\$\$/) && !polySchemaTypeReferenceSet.has(name_1)) {
                                polySchemaTypeReferenceSet.add(name_1);
                                polySchemaTypeReferenceList.push({
                                    name: name_1,
                                    path: '',
                                    replacement: '',
                                });
                            }
                        }
                        if (ts.isInterfaceDeclaration(node)) {
                            var children = node.getChildren(sourceFile);
                            var possibleIdentifier = children.find(function (node) { return node.kind === ts.SyntaxKind.Identifier; });
                            if (possibleIdentifier) {
                                var name_2 = possibleIdentifier.getFullText(sourceFile).trim();
                                var code = node.getFullText(sourceFile);
                                if (name_2.match(/^\$PolySchema\$\$\$/) || (['Argument', 'ReturnType'].includes(name_2) && code.match(/<path>.+?<\/path>/))) {
                                    polySchemaInterfaceDeclarationList.push({
                                        name: name_2,
                                        code: code,
                                    });
                                }
                            }
                        }
                        ts.forEachChild(node, visitor);
                    };
                    ts.forEachChild(sourceFile, visitor);
                    visitedPaths = [];
                    getUnresolvedSchemaArg = function (path, isPublic) {
                        return isPublic ? "Unresolved public schema `".concat(path, "`.") : "Unresolved schema, please add schema `".concat(path, "` to complete it.");
                    };
                    getPolySchemaTypeParts = function (typeName) { return typeName.split(typeNameContextDelimiter); };
                    _loop_1 = function (polySchemaInterfaceDeclaration) {
                        var _c = getPolySchemaTypeParts(polySchemaInterfaceDeclaration.name), argumentOrReturnType = _c[1], visibilityStatus = _c[2], resolvedStatus = _c[3], realContextParts = _c.slice(4);
                        var isResolved = resolvedStatus === '$Resolved';
                        var isPublic = visibilityStatus === '$Public';
                        var matchPathNameCommentInCode = polySchemaInterfaceDeclaration.code.match(/<path>(.+?)<\/path>/);
                        if (matchPathNameCommentInCode === null) {
                            return "continue";
                        }
                        var path = matchPathNameCommentInCode[1];
                        if (['$ReturnType', '$Argument'].includes(argumentOrReturnType)) {
                            if (isResolved) {
                                var typePath = "schemas.".concat(path.split('.').map(helper_string_1.toPascalCase).join('.'));
                                result = result.replace(polySchemaInterfaceDeclaration.code, "export interface ".concat(argumentOrReturnType.replace('$', ''), " extends ").concat(typePath, " {}"));
                            }
                            else {
                                result = result.replace(polySchemaInterfaceDeclaration.code, "/**\n    * ".concat(getUnresolvedSchemaArg(path, isPublic), "\n    */\n    export type ").concat(argumentOrReturnType.replace('$', ''), " = any;"));
                            }
                        }
                        else {
                            var polySchemaTypeReference = polySchemaTypeReferenceList.find(function (polySchemaTypeReference) { return polySchemaTypeReference.name === polySchemaInterfaceDeclaration.name; });
                            if (polySchemaTypeReference) {
                                polySchemaTypeReference.path = path;
                            }
                            if (isResolved) {
                                result = result.replace(polySchemaInterfaceDeclaration.code, '');
                            }
                            else {
                                var schemaPathVisited = visitedPaths.find(function (visitedPath) { return visitedPath.path === path; });
                                if (!schemaPathVisited) {
                                    visitedPaths.push({
                                        path: path,
                                        typeName: polySchemaInterfaceDeclaration.name,
                                    });
                                    result = result.replace(polySchemaInterfaceDeclaration.code, "/**\n    * ".concat(getUnresolvedSchemaArg(path, isPublic), "\n    */\n    type ").concat(__spreadArray(__spreadArray([], realContextParts, true), ['Schema'], false).join('$'), " = any"));
                                }
                                else {
                                    polySchemaTypeReference.replacement = schemaPathVisited.typeName;
                                    result = result.replace(polySchemaInterfaceDeclaration.code, '');
                                }
                            }
                        }
                    };
                    /*
                      1. Remove interfaces from resolved schemas that belong to some object property, also track them to fix each type that point to removed interfaces.
                      2. Extend argument/return type interfaces with linked schema if they are linked to a schema.
                      3. Replace interfaces from argument/return type that are linked to an unresolved schemas for an `any` type.
                    */
                    for (_i = 0, polySchemaInterfaceDeclarationList_1 = polySchemaInterfaceDeclarationList; _i < polySchemaInterfaceDeclarationList_1.length; _i++) {
                        polySchemaInterfaceDeclaration = polySchemaInterfaceDeclarationList_1[_i];
                        _loop_1(polySchemaInterfaceDeclaration);
                    }
                    /**
                     * Iterate over all removed interfaces and replace each type reference with proper schema reference.
                     */
                    for (_a = 0, polySchemaTypeReferenceList_1 = polySchemaTypeReferenceList; _a < polySchemaTypeReferenceList_1.length; _a++) {
                        polySchemaTypeReference = polySchemaTypeReferenceList_1[_a];
                        polySchemaTypeReferenceParts = getPolySchemaTypeParts(polySchemaTypeReference.name);
                        resolvedStatus = polySchemaTypeReferenceParts[3];
                        isResolved = resolvedStatus === '$Resolved';
                        if (isResolved) {
                            realPathParts = polySchemaTypeReference.path.split('.').map(helper_string_1.toPascalCase);
                            result = result.replace(polySchemaTypeReference.name, "schemas.".concat(realPathParts.join('.')));
                        }
                        else {
                            result = result.replace(polySchemaTypeReference.name, 'unknown');
                        }
                    }
                    return [2 /*return*/, wrapToNamespace(appendPathUnionType(result, value))];
            }
        });
    });
};
var getObjectTypeDeclarations = function (namespacePath, namespace, objectProperty, typeName) { return __awaiter(void 0, void 0, void 0, function () {
    var declarations;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, schemaToDeclarations(namespace, typeName, objectProperty.schema)];
            case 1:
                declarations = _a.sent();
                // setting typeName to be used when generating return type
                objectProperty.typeName = "".concat(namespacePath ? "".concat(namespacePath, ".") : '').concat(namespace, ".").concat(typeName);
                return [2 /*return*/, declarations];
        }
    });
}); };
var getArgumentsTypeDeclarations = function (namespacePath, parentType, properties, typeName) {
    if (typeName === void 0) { typeName = 'Argument'; }
    return __awaiter(void 0, void 0, void 0, function () {
        var typeDeclarations, objectProperties, functionProperties, _i, objectProperties_1, property, objectProperty, namespace, _a, _b, _c, _d, _e, _f, functionProperties_1, property, functionProperty, _g, _h, _j, _k, _l;
        return __generator(this, function (_m) {
            switch (_m.label) {
                case 0:
                    typeDeclarations = [];
                    objectProperties = properties.filter(function (property) { return property.type.kind === 'object'; });
                    functionProperties = properties.filter(function (property) { return property.type.kind === 'function'; });
                    _i = 0, objectProperties_1 = objectProperties;
                    _m.label = 1;
                case 1:
                    if (!(_i < objectProperties_1.length)) return [3 /*break*/, 6];
                    property = objectProperties_1[_i];
                    objectProperty = property.type;
                    if (!objectProperty.schema) return [3 /*break*/, 3];
                    namespace = "".concat(parentType, "$").concat((0, helper_string_1.toPascalCase)(property.name));
                    // setting typeName to be used when generating arguments type
                    objectProperty.typeName = "".concat(namespacePath ? "".concat(namespacePath, ".") : '').concat(namespace, ".").concat(typeName);
                    _b = (_a = typeDeclarations).push;
                    return [4 /*yield*/, schemaToDeclarations(namespace, typeName, objectProperty.schema)];
                case 2:
                    _b.apply(_a, [_m.sent()]);
                    return [3 /*break*/, 5];
                case 3:
                    if (!objectProperty.properties) return [3 /*break*/, 5];
                    _d = (_c = typeDeclarations.push).apply;
                    _e = [typeDeclarations];
                    return [4 /*yield*/, getArgumentsTypeDeclarations(namespacePath, "".concat(parentType, "$").concat((0, helper_string_1.toPascalCase)(property.name)), objectProperty.properties)];
                case 4:
                    _d.apply(_c, _e.concat([(_m.sent())]));
                    _m.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6:
                    _f = 0, functionProperties_1 = functionProperties;
                    _m.label = 7;
                case 7:
                    if (!(_f < functionProperties_1.length)) return [3 /*break*/, 11];
                    property = functionProperties_1[_f];
                    functionProperty = property.type;
                    if (functionProperty.name) {
                        // predefined type name
                        return [3 /*break*/, 10];
                    }
                    _h = (_g = typeDeclarations.push).apply;
                    _j = [typeDeclarations];
                    return [4 /*yield*/, getArgumentsTypeDeclarations(namespacePath, "".concat(parentType, "$").concat((0, helper_string_1.toPascalCase)(property.name)), functionProperty.spec.arguments.filter(function (arg) { return arg.type.kind === 'object'; }))];
                case 8:
                    _h.apply(_g, _j.concat([(_m.sent())]));
                    if (!(functionProperty.spec.returnType.kind === 'object' && functionProperty.spec.returnType.schema)) return [3 /*break*/, 10];
                    _l = (_k = typeDeclarations).push;
                    return [4 /*yield*/, getObjectTypeDeclarations(namespacePath, "".concat(parentType, "$").concat((0, helper_string_1.toPascalCase)(property.name)), functionProperty.spec.returnType, 'ReturnType')];
                case 9:
                    _l.apply(_k, [_m.sent()]);
                    _m.label = 10;
                case 10:
                    _f++;
                    return [3 /*break*/, 7];
                case 11: return [2 /*return*/, typeDeclarations];
            }
        });
    });
};
var getIDComment = function (specification) {
    switch (specification.type) {
        case 'apiFunction':
        case 'serverFunction':
        case 'customFunction':
            return "* Function ID: ".concat(specification.id);
        case 'authFunction':
            return "* Auth provider ID: ".concat(specification.id);
        case 'webhookHandle':
            return "* Webhook ID: ".concat(specification.id);
        default:
            return null;
    }
};
var getAdditionalComments = function (specification) {
    switch (specification.type) {
        case 'customFunction':
            if (!specification.requirements.length) {
                return null;
            }
            return "This function requires you to have the following libraries installed:\n- ".concat(specification.requirements.join('\n- '));
        default:
            return null;
    }
};
var getSpecificationWithFunctionComment = function (specification) {
    var descriptionComment = specification.description
        ? specification.description
            .split('\n')
            .map(function (line) { return "* ".concat(line); })
            .join('\n')
        : null;
    var toArgumentComment = function (arg, prefix) {
        if (prefix === void 0) { prefix = ''; }
        if (arg.name === 'payload' && arg.type.kind === 'object' && arg.type.properties) {
            return arg.type.properties
                .map(function (payloadProperty) { return toArgumentComment(payloadProperty, 'payload.'); })
                .filter(Boolean)
                .join('\n');
        }
        if (!arg.description) {
            return null;
        }
        return "* @param ".concat(prefix).concat(arg.name, " ").concat(arg.description);
    };
    var argumentsComment = specification.function.arguments
        .map(function (arg) { return toArgumentComment(arg); })
        .filter(Boolean)
        .join('\n');
    var additionalComments = getAdditionalComments(specification);
    var idComment = getIDComment(specification);
    return "".concat(descriptionComment ? "".concat(descriptionComment, "\n") : '').concat(argumentsComment ? "".concat(argumentsComment, "\n") : '').concat(additionalComments ? "".concat(additionalComments, "\n") : '').concat(idComment ? "*\n".concat(idComment, "\n") : '').trim();
};
var getSpecificationWithVariableComment = function (specification) {
    var descriptionComment = specification.description
        ? specification.description
            .split('\n')
            .map(function (line) { return "* ".concat(line); })
            .join('\n')
        : null;
    var secretComment = specification.variable.secret
        ? '* Note: The variable is secret and can be used only within Poly functions.'
        : null;
    var idComment = "* Variable ID: ".concat(specification.id);
    return "".concat(descriptionComment ? "".concat(descriptionComment, "\n") : '').concat(secretComment ? "".concat(secretComment, "\n") : '').concat(idComment ? "*\n".concat(idComment) : '').trim();
};
var getVariableValueTypeDeclarations = function (namespacePath, namespace, objectProperty, value) { return __awaiter(void 0, void 0, void 0, function () {
    var declarations;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, schemaToDeclarations(namespace, 'ValueType', objectProperty.schema, value, {
                    unknownAny: false,
                })];
            case 1:
                declarations = _a.sent();
                // setting typeName to be used when generating variable value type
                objectProperty.typeName = "".concat(namespacePath ? "".concat(namespacePath, ".") : '').concat(namespace, ".ValueType");
                return [2 /*return*/, declarations];
        }
    });
}); };
var getSpecificationsTypeDeclarations = function (namespacePath, specifications) { return __awaiter(void 0, void 0, void 0, function () {
    var errors, getDeclarationOrHandleError, argumentsTypeDeclarations, returnTypeDeclarations, variableValueDeclarations, schemaDeclarations;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                errors = [];
                getDeclarationOrHandleError = function (getDeclaration, specification) { return __awaiter(void 0, void 0, void 0, function () {
                    var error_1;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                _a.trys.push([0, 2, , 3]);
                                return [4 /*yield*/, getDeclaration()];
                            case 1: return [2 /*return*/, _a.sent()];
                            case 2:
                                error_1 = _a.sent();
                                (0, exports.setGenerationErrors)(true);
                                errors.push({
                                    specification: specification,
                                    stack: error_1.stack,
                                });
                                return [2 /*return*/, Promise.resolve('')];
                            case 3: return [2 /*return*/];
                        }
                    });
                }); };
                return [4 /*yield*/, Promise.all(specifications
                        .filter(function (spec) { return 'function' in spec; })
                        .map(function (spec) { return spec; })
                        .map(function (spec) {
                        return getDeclarationOrHandleError(function () { return getArgumentsTypeDeclarations(namespacePath, (0, helper_string_1.toPascalCase)(spec.name), spec.function.arguments); }, spec);
                    }))];
            case 1:
                argumentsTypeDeclarations = (_a.sent()).flat();
                return [4 /*yield*/, Promise.all(specifications
                        .filter(function (spec) {
                        return 'function' in spec &&
                            ((spec.function.returnType.kind === 'object' &&
                                spec.function.returnType.schema &&
                                !(0, specs_1.isBinary)(spec.function.returnType)) ||
                                (spec.type === 'serverFunction' && spec.serverSideAsync === true));
                    })
                        .map(function (spec) { return spec; })
                        .map(function (spec) {
                        if (spec.type === 'serverFunction' && spec.serverSideAsync === true) {
                            var ns = (0, helper_string_1.toPascalCase)(spec.name);
                            return Promise.resolve("namespace ".concat(ns, " {\n  export type ReturnType = { executionId: string };\n}"));
                        }
                        else {
                            return getDeclarationOrHandleError(function () {
                                return getObjectTypeDeclarations(namespacePath, (0, helper_string_1.toPascalCase)(spec.name), spec.function.returnType, 'ReturnType');
                            }, spec);
                        }
                    }))];
            case 2:
                returnTypeDeclarations = _a.sent();
                return [4 /*yield*/, Promise.all(specifications
                        .filter(function (spec) { return 'variable' in spec && spec.variable.valueType.kind === 'object' && spec.variable.valueType.schema; })
                        .map(function (spec) { return spec; })
                        .map(function (spec) {
                        return getDeclarationOrHandleError(function () { return getVariableValueTypeDeclarations(namespacePath, (0, helper_string_1.toPascalCase)(spec.name), spec.variable.valueType, spec.variable.value); }, spec);
                    }))];
            case 3:
                variableValueDeclarations = _a.sent();
                return [4 /*yield*/, Promise.all(specifications.filter(function (specification) { return specification.type === 'schema'; })
                        .map(function (spec) { return getDeclarationOrHandleError(function () { return getObjectTypeDeclarations(namespacePath, (0, helper_string_1.toPascalCase)(spec.name), {
                        schema: spec.definition,
                        kind: 'object',
                    }, 'Schema'); }, spec); }))];
            case 4:
                schemaDeclarations = _a.sent();
                if (errors.length) {
                    errors.forEach(function (err) {
                        (0, utils_2.echoGenerationError)(err.specification);
                    });
                }
                return [2 /*return*/, __spreadArray(__spreadArray(__spreadArray(__spreadArray([], argumentsTypeDeclarations, true), returnTypeDeclarations, true), variableValueDeclarations, true), schemaDeclarations, true).join('\n')];
        }
    });
}); };
var generateTSContextDeclarationFile = function (libPath, context, specifications, subContexts, pathPrefix) { return __awaiter(void 0, void 0, void 0, function () {
    var template, contextPaths, typeDeclarations, toFunctionDeclaration, toVariableDeclaration, toSchemaDeclaration, outputPath, _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                template = handlebars_1.default.compile((0, utils_2.loadTemplate)("".concat(pathPrefix, "/{{context}}.d.ts.hbs")));
                contextPaths = context.path === '' ? [] : context.path.split('.').map(helper_string_1.toPascalCase);
                return [4 /*yield*/, getSpecificationsTypeDeclarations(contextPaths.join('.'), specifications)];
            case 1:
                typeDeclarations = _d.sent();
                toFunctionDeclaration = function (specification) {
                    var toArgumentDeclaration = function (arg) { return ({
                        name: (0, helper_string_1.toCamelCase)(arg.name),
                        required: arg.required,
                        type: (0, specs_1.toTypeDeclaration)(arg.type),
                    }); };
                    var wrapInResponseType = function (returnType) {
                        switch (specification.type) {
                            case 'apiFunction':
                                return specification.apiType === 'graphql'
                                    ? "GraphqlAPIFunctionResponse<".concat(returnType, ">")
                                    : "ApiFunctionResponse<".concat(returnType, ">");
                            case 'authFunction':
                                return specification.name === 'getToken' ? returnType : "AuthFunctionResponse<".concat(returnType, ">");
                        }
                        return returnType;
                    };
                    var computedReturnType;
                    if (specification.type === 'serverFunction' &&
                        specification.serverSideAsync === true) {
                        computedReturnType = "".concat(context.interfaceName, ".").concat((0, helper_string_1.toPascalCase)(specification.name), ".ReturnType");
                    }
                    else {
                        computedReturnType = (0, specs_1.toTypeDeclaration)(specification.function.returnType);
                    }
                    return {
                        name: specification.name.split('.').pop(),
                        comment: getSpecificationWithFunctionComment(specification),
                        deprecated: specification.state === 'DEPRECATED',
                        arguments: specification.function.arguments.map(toArgumentDeclaration),
                        returnType: wrapInResponseType(computedReturnType),
                        synchronous: specification.type === 'serverFunction' ? false : specification.function.synchronous === true,
                    };
                };
                toVariableDeclaration = function (specification) {
                    var type = (0, specs_1.toTypeDeclaration)(specification.variable.valueType);
                    var pathUnionType = type.split('.');
                    pathUnionType[pathUnionType.length - 1] = 'PathValue';
                    return {
                        name: specification.name.split('.').pop(),
                        comment: getSpecificationWithVariableComment(specification),
                        type: type,
                        secret: specification.variable.secret,
                        isObjectType: specification.variable.valueType.kind === 'object',
                        pathUnionType: pathUnionType.join('.'),
                    };
                };
                toSchemaDeclaration = function (specification) {
                    var contextParts = specification.context.split('.').filter(function (v) { return v; });
                    return {
                        name: specification.name.split('.').pop(),
                        typeDeclaration: contextParts.length ? "".concat(specification.context.split('.').map(helper_string_1.toPascalCase).join('.'), ".").concat((0, helper_string_1.toPascalCase)(specification.name)) : "".concat((0, helper_string_1.toPascalCase)(specification.name)),
                    };
                };
                outputPath = "".concat(libPath, "/").concat(pathPrefix, "/").concat(context.fileName);
                _b = (_a = fs_1.default).writeFileSync;
                _c = [outputPath];
                return [4 /*yield*/, (0, utils_2.prettyPrint)(template({
                        interfaceName: context.interfaceName,
                        contextPaths: contextPaths,
                        typeDeclarations: typeDeclarations,
                        functionDeclarations: specifications
                            .filter(function (spec) { return 'function' in spec; })
                            .map(toFunctionDeclaration),
                        variableDeclarations: specifications
                            .filter(function (spec) { return 'variable' in spec; })
                            .map(toVariableDeclaration),
                        schemaDeclarations: specifications.filter(function (spec) { return spec.type === 'schema'; }).map(toSchemaDeclaration),
                        subContexts: subContexts,
                    }))];
            case 2:
                _b.apply(_a, _c.concat([_d.sent()]));
                return [2 /*return*/];
        }
    });
}); };
var generateTSDeclarationFilesForContext = function (libPath, context, contextData, pathPrefix, contextCollector) {
    if (contextCollector === void 0) { contextCollector = []; }
    return __awaiter(void 0, void 0, void 0, function () {
        var contextDataKeys, contextDataSpecifications, contextDataSubContexts, _a, contextDataSubContexts_1, contextDataSubContexts_1_1, subContext, e_1_1;
        var _b, e_1, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    contextDataKeys = Object.keys(contextData);
                    contextDataSpecifications = contextDataKeys
                        .map(function (key) { return contextData[key]; })
                        .filter(function (value) { return typeof value.type === 'string'; });
                    contextDataSubContexts = contextDataKeys
                        .filter(function (key) { return !contextData[key].type; })
                        .map(function (key) {
                        var path = "".concat(context.path ? "".concat(context.path, ".") : '').concat(key);
                        return {
                            name: key,
                            path: path,
                            fileName: "".concat(path, ".d.ts"),
                            interfaceName: (0, helper_string_1.toPascalCase)(path),
                            level: context.level + 1,
                        };
                    });
                    return [4 /*yield*/, generateTSContextDeclarationFile(libPath, context, contextDataSpecifications, contextDataSubContexts, pathPrefix)];
                case 1:
                    _e.sent();
                    contextCollector = __spreadArray(__spreadArray([], contextCollector, true), [context], false);
                    _e.label = 2;
                case 2:
                    _e.trys.push([2, 8, 9, 14]);
                    _a = true, contextDataSubContexts_1 = __asyncValues(contextDataSubContexts);
                    _e.label = 3;
                case 3: return [4 /*yield*/, contextDataSubContexts_1.next()];
                case 4:
                    if (!(contextDataSubContexts_1_1 = _e.sent(), _b = contextDataSubContexts_1_1.done, !_b)) return [3 /*break*/, 7];
                    _d = contextDataSubContexts_1_1.value;
                    _a = false;
                    subContext = _d;
                    return [4 /*yield*/, generateTSDeclarationFilesForContext(libPath, subContext, contextData[subContext.name], pathPrefix, contextCollector)];
                case 5:
                    contextCollector = _e.sent();
                    _e.label = 6;
                case 6:
                    _a = true;
                    return [3 /*break*/, 3];
                case 7: return [3 /*break*/, 14];
                case 8:
                    e_1_1 = _e.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 14];
                case 9:
                    _e.trys.push([9, , 12, 13]);
                    if (!(!_a && !_b && (_c = contextDataSubContexts_1.return))) return [3 /*break*/, 11];
                    return [4 /*yield*/, _c.call(contextDataSubContexts_1)];
                case 10:
                    _e.sent();
                    _e.label = 11;
                case 11: return [3 /*break*/, 13];
                case 12:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 13: return [7 /*endfinally*/];
                case 14: return [2 /*return*/, contextCollector];
            }
        });
    });
};
var assignUnresolvedRefsToPolySchemaRefObj = function (schemaDefinition, unresolvedPolySchemaRefs) {
    if (unresolvedPolySchemaRefs === void 0) { unresolvedPolySchemaRefs = []; }
    (0, index_1.iterateRefs)(schemaDefinition, function (schema) {
        var ref = schema['x-poly-ref'];
        if (ref !== null && typeof ref === 'object' && !Array.isArray(ref)) {
            var foundUnresolved = unresolvedPolySchemaRefs.find(function (unresolvedPolySchemaRef) { return unresolvedPolySchemaRef.path === ref.path && unresolvedPolySchemaRef.publicNamespace === ref.publicNamespace; });
            if (foundUnresolved) {
                schema['x-poly-ref']['x-unresolved'] = true;
            }
            schema.description = "<path>".concat(ref.publicNamespace ? "".concat(ref.publicNamespace, ".").concat(ref.path) : ref.path, "</path>");
        }
        return schema;
    }, 'x-poly-ref');
};
var generateTSDeclarationFiles = function (libPath, specs, interfaceName, pathPrefix) { return __awaiter(void 0, void 0, void 0, function () {
    var contextData, contexts;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                contextData = (0, specs_1.getContextData)(specs);
                return [4 /*yield*/, generateTSDeclarationFilesForContext(libPath, {
                        name: '',
                        path: '',
                        interfaceName: interfaceName,
                        fileName: 'default.d.ts',
                        level: 0,
                    }, contextData, pathPrefix)];
            case 1:
                contexts = _a.sent();
                return [4 /*yield*/, generateTSIndexDeclarationFile(libPath, contexts, pathPrefix)];
            case 2:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); };
var generateTSIndexDeclarationFile = function (libPath, contexts, pathPrefix) { return __awaiter(void 0, void 0, void 0, function () {
    var template, _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                template = handlebars_1.default.compile((0, utils_2.loadTemplate)("".concat(pathPrefix, "/index.d.ts.hbs")));
                _b = (_a = fs_1.default).writeFileSync;
                _c = ["".concat(libPath, "/").concat(pathPrefix, "/index.d.ts")];
                return [4 /*yield*/, (0, utils_2.prettyPrint)(template({
                        contexts: contexts.map(function (context) { return (__assign(__assign({}, context), { firstLevel: context.level === 1 })); }),
                    }))];
            case 1:
                _b.apply(_a, _c.concat([_d.sent()]));
                return [2 /*return*/];
        }
    });
}); };
var generateFunctionsTSDeclarationFile = function (libPath, specs) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, generateTSDeclarationFiles(libPath, specs.filter(function (spec) { return 'function' in spec; }).map(function (spec) {
                    for (var _i = 0, _a = spec.function.arguments; _i < _a.length; _i++) {
                        var functionArg = _a[_i];
                        if (functionArg.type.kind === 'object' && functionArg.type.schema) {
                            assignUnresolvedRefsToPolySchemaRefObj(functionArg.type.schema, functionArg.type.unresolvedPolySchemaRefs);
                        }
                        else if (functionArg.type.kind === 'object' && functionArg.type.properties) {
                            for (var _b = 0, _c = functionArg.type.properties; _b < _c.length; _b++) {
                                var property = _c[_b];
                                if (property.type.kind === 'object') {
                                    assignUnresolvedRefsToPolySchemaRefObj(property.type.schema, functionArg.type.unresolvedPolySchemaRefs);
                                }
                            }
                        }
                    }
                    if (spec.function.returnType.kind === 'object' && spec.function.returnType.schema) {
                        assignUnresolvedRefsToPolySchemaRefObj(spec.function.returnType.schema, spec.function.returnType.unresolvedPolySchemaRefs);
                    }
                    return spec;
                }), 'Poly', '.')];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); };
exports.generateFunctionsTSDeclarationFile = generateFunctionsTSDeclarationFile;
var generateVariablesTSDeclarationFile = function (libPath, specs) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, generateTSDeclarationFiles(libPath, specs.filter(function (spec) { return 'variable' in spec; }), 'Vari', 'vari')];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); };
exports.generateVariablesTSDeclarationFile = generateVariablesTSDeclarationFile;
