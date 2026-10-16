import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const sourcePath = path.resolve(testDirectory, '..', 'frontend/src/components/ui/sign-up.tsx')

test('signup confetti canvas remains click-through for form controls', () => {
  const source = fs.readFileSync(sourcePath, 'utf8')
  const canvas = source.match(/<Confetti\b[^>]*\bclassName=(['"])(.*?)\1[^>]*>/su)?.[2]

  assert.ok(canvas, 'signup must render the confetti canvas with an explicit className')
  assert.match(canvas, /(?:^|\s)pointer-events-none(?:\s|$)/u)
  assert.match(canvas, /(?:^|\s)z-\[999\](?:\s|$)/u)
})
test('signup gradient background remains click-through for form controls', () => {
  const source = fs.readFileSync(sourcePath, 'utf8')
  const gradient = source.match(/<svg\b[^>]*\bclassName=(['"])(.*?)\1[^>]*>/su)?.[2]

  assert.ok(gradient, 'signup gradient background must render an explicit className')
  assert.match(gradient, /(?:^|\s)pointer-events-none(?:\s|$)/u)
})
