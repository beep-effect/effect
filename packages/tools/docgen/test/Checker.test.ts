import * as Checker from "@effect/docgen/Checker"
import * as Configuration from "@effect/docgen/Configuration"
import * as Parser from "@effect/docgen/Parser"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Predicate } from "effect"
import * as Path from "effect/Path"
import * as ast from "ts-morph"

const project = new ast.Project({
  compilerOptions: { strict: true },
  useInMemoryFileSystem: true
})

const defaultConfig: Configuration.ConfigurationShape = {
  projectName: "docgen",
  projectHomepage: "https://github.com/effect-ts/docgen",
  srcLink: "https://github.com/effect-ts/docgen/blob/main/src/",
  srcDir: "src",
  outDir: "docs",
  theme: "mikearnaldi/just-the-docs",
  enableSearch: true,
  enforceDescriptions: false,
  enforceExamples: false,
  enforceVersion: true,
  runExamples: false,
  tscExecutable: "tsc",
  exclude: [],
  parseCompilerOptions: {},
  examplesCompilerOptions: {}
}

const makeSourcefile = (source: string | ast.SourceFile) => {
  if (Predicate.isString(source)) {
    const filename = `test.ts`
    const existing = project.getSourceFile(filename)
    if (existing) {
      project.removeSourceFile(existing)
    }
    return project.createSourceFile(filename, source)
  }
  return source
}

const makeSource = (source: string | ast.SourceFile) => {
  const sourceFile = makeSourcefile(source)
  const filename = sourceFile.getBaseName()
  return Parser.Source.of({
    path: [filename],
    sourceFile
  })
}

const expectCheckResult = <A>(
  config: Partial<Configuration.ConfigurationShape>,
  sourceText: string,
  parser: Effect.Effect<A, never, Parser.Source | Configuration.Configuration | Path.Path>,
  checker: (a: A) => Effect.Effect<Array<string>, never, Configuration.Configuration | Parser.Source>,
  expected: ReadonlyArray<string>
) => {
  return Effect.gen(function*() {
    const actual = yield* Effect.exit(parser.pipe(
      Effect.flatMap(checker),
      Effect.provideService(Parser.Source, makeSource(sourceText)),
      Effect.provideService(Configuration.Configuration, { ...defaultConfig, ...config }),
      Effect.provide(Path.layer)
    ))
    assert.ok(actual._tag === "Success")
    assert.deepStrictEqual(actual.value, expected)
  })
}

describe("Checker", () => {
  describe("checkFunctions", () => {
    it.effect("should raise an error if `@since` tag is missing", () =>
      expectCheckResult(
        {},
        `
/** @since 1.0.0 */
export function a() {}

/** description */
export function b() {}
        `,
        Parser.parseFunctions,
        Checker.checkFunctions,
        [
          "Missing `@since` tag in file /test.ts:\n" +
          "\n" +
          "  4 |\n" +
          "  5 | /** description */\n" +
          "> 6 | export function b() {}\n" +
          "    |  ^\n" +
          "  7 |         "
        ]
      ))

    it.effect("accepts a TypeScript fence in the description when examples are enforced", () =>
      expectCheckResult(
        { enforceExamples: true },
        `
/**
 * Description.
 *
 * **Example** (Title)
 *
 * \`\`\`ts
 * const value = 1
 * \`\`\`
 *
 * @since 1.0.0
 */
export function a() {}
        `,
        Parser.parseFunctions,
        Checker.checkFunctions,
        []
      ))

    it.effect("requires an example when the description has no fence", () =>
      expectCheckResult(
        { enforceExamples: true },
        "/** Description.\n * @since 1.0.0\n */\nexport function a() {}",
        Parser.parseFunctions,
        Checker.checkFunctions,
        [
          "Missing examples in file /test.ts:\n" +
          "\n" +
          "  2 |  * @since 1.0.0\n" +
          "  3 |  */\n" +
          "> 4 | export function a() {}\n" +
          "    |  ^"
        ]
      ))

    it.effect("does not count a non-TypeScript fence as an example", () =>
      expectCheckResult(
        { enforceExamples: true },
        "/** Description.\n * ```json\n * {}\n * ```\n * @since 1.0.0\n */\nexport function a() {}",
        Parser.parseFunctions,
        Checker.checkFunctions,
        [
          "Missing examples in file /test.ts:\n" +
          "\n" +
          "  5 |  * @since 1.0.0\n" +
          "  6 |  */\n" +
          "> 7 | export function a() {}\n" +
          "    |  ^"
        ]
      ))
  })

  describe("checkExports", () => {
    it.effect("should raise an error if `@since` tag is missing", () =>
      expectCheckResult(
        {},
        "export { a }",
        Parser.parseExports,
        Checker.checkExports,
        [
          "Missing `@since` tag in file /test.ts:\n" +
          "\n" +
          "> 1 | export { a }\n" +
          "    |           ^"
        ]
      ))
  })

  describe("checkNamespaces", () => {
    it.effect("should raise an error if `@since` tag is missing", () =>
      expectCheckResult(
        {},
        "export namespace A {}",
        Parser.parseNamespaces,
        Checker.checkNamespaces,
        [
          "Missing `@since` tag in file /test.ts:\n" +
          "\n" +
          "> 1 | export namespace A {}\n" +
          "    |  ^"
        ]
      ))

    it.effect("should raise an error if `@since` tag is missing on a nested interface", () =>
      expectCheckResult(
        {},
        `
      /**
       * @since 1.0.0
       */
      export namespace A {
        export interface B {}
      }
      `,
        Parser.parseNamespaces,
        Checker.checkNamespaces,
        [
          "Missing `@since` tag in file /test.ts:\n" +
          "\n" +
          "  4 |        */\n" +
          "  5 |       export namespace A {\n" +
          "> 6 |         export interface B {}\n" +
          "    |          ^\n" +
          "  7 |       }\n" +
          "  8 |       "
        ]
      ))

    it.effect("should raise an error if `@since` tag is missing on a nested type alias", () =>
      expectCheckResult(
        {},
        `
      /**
       * @since 1.0.0
       */
      export namespace A {
        export type B = string
      }
      `,
        Parser.parseNamespaces,
        Checker.checkNamespaces,
        [
          "Missing `@since` tag in file /test.ts:\n" +
          "\n" +
          "  4 |        */\n" +
          "  5 |       export namespace A {\n" +
          "> 6 |         export type B = string\n" +
          "    |          ^\n" +
          "  7 |       }\n" +
          "  8 |       "
        ]
      ))

    it.effect("should raise an error if `@since` tag is missing on a nested namespace", () =>
      expectCheckResult(
        {},
        `
      /**
       * @since 1.0.0
       */
      export namespace A {
        export namespace B {}
      }
      `,
        Parser.parseNamespaces,
        Checker.checkNamespaces,
        [
          "Missing `@since` tag in file /test.ts:\n" +
          "\n" +
          "  4 |        */\n" +
          "  5 |       export namespace A {\n" +
          "> 6 |         export namespace B {}\n" +
          "    |          ^\n" +
          "  7 |       }\n" +
          "  8 |       "
        ]
      ))
  })

  describe("checkClasses", () => {
    it.effect("should raise an error if `@since` tag is missing", () =>
      expectCheckResult(
        {},
        `export class MyClass {}`,
        Parser.parseClasses,
        Checker.checkClasses,
        [
          "Missing `@since` tag in file /test.ts:\n" +
          "\n" +
          "> 1 | export class MyClass {}\n" +
          "    |  ^"
        ]
      ))
  })
})
