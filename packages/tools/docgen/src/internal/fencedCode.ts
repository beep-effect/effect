import * as Array from "effect/Array"

/**
 * Fence metadata that excludes an example from docgen type checking.
 *
 * @internal
 */
export const SKIP_TYPE_CHECKING_FENCE_METADATA = "skip-type-checking"

/**
 * Extracts all fenced code blocks from markdown content.
 * Handles both ``` and ~~~ fences, including any metadata like language, title, and other attributes.
 *
 * @internal
 */
export const extractFencedCode = (content: string): [examples: Array<string>, warnings: Array<string>] => {
  // The regex now captures the closing fence (group 3) if present.
  // If there's no closing fence, group 3 will be undefined.
  const fenceRegex = /(?:```|~~~)(.*?)\n([\s\S]*?)(?:(```|~~~)|$)/g
  const matches = Array.fromIterable(content.matchAll(fenceRegex))

  const warnings: Array<string> = []

  // Log a warning if a code fence is not properly closed.
  for (const match of matches) {
    if (match[3] === undefined) {
      warnings.push(`Code block does not have a matching closing fence:\n${content}`)
    }
  }

  return [
    matches
      .filter((match) => {
        const meta = match[1].toLocaleLowerCase()
        const isTypeScript = meta.startsWith("ts") || meta.startsWith("typescript")
        const isSkipTypeChecking = meta.includes(SKIP_TYPE_CHECKING_FENCE_METADATA)
        return isTypeScript && !isSkipTypeChecking
      })
      .map((match) => match[2].trim()),
    warnings
  ]
}
